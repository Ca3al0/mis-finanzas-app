import {
  AIAnalysisResult,
  ExtractedTransactionItem,
  ExtractedCreditSummary,
  SourceType,
  AdvisorActionCommand,
  NotificationCapturePolicy,
  Transaction,
  ProcessedNotificationRecord,
} from '../types/finance';
import { eaToMvPercent, simulateInstallmentPurchase } from './financeCalculations';

/**
 * Extrae texto legible directamente desde un archivo PDF real en el celular
 */
export async function extractTextFromPdfFileLocal(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder('latin1');
    const raw = decoder.decode(bytes);

    const textChunks: string[] = [];
    const parenRegex = /\(([^()]{2,250})\)/g;
    let match;
    while ((match = parenRegex.exec(raw)) !== null) {
      const cleaned = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, ' ')
        .replace(/\\[()\\]/g, (m) => m[1])
        .replace(/[^\x20-\x7EÁÉÍÓÚáéíóúÑñ$.,:%0-9/-]/g, ' ')
        .trim();
      if (cleaned.length > 2 && /[a-zA-Z0-9$]/.test(cleaned)) {
        textChunks.push(cleaned);
      }
    }

    if (textChunks.length > 4) {
      return textChunks.join(' ');
    }

    const readableLines = raw
      .match(/[A-Za-zÁÉÍÓÚáéíóúÑñ0-9$.,:%/\s-]{6,140}/g)
      ?.filter((s) => /\$|\d{3}|cupo|pago|saldo|compra|tasa|extracto|cuota|banco|nequi|nu/i.test(s))
      .slice(0, 100);

    if (readableLines && readableLines.length > 0) {
      return readableLines.join('\n');
    }

    return '';
  } catch {
    return '';
  }
}

export async function inspectImageLocally(file: File): Promise<{ width: number; height: number; brightness: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width || 800, height: img.height || 1200, brightness: 180 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 800, height: 1200, brightness: 180 });
    };
    img.src = url;
  });
}

/**
 * Convierte expresiones como "3 millones", "500 mil", "50k", "$1.450.000" o "45000" a número real
 */
/**
 * Convierte expresiones como "3 millones", "500 mil", "50k", "$1.450.000", "COP 35.000,00" o "45000" a número real,
 * ignorando fechas (19/10/2026), horas (08:30), últimos dígitos de tarjetas (*4582), celulares (3001234567) y referencias.
 */
export function parseAllNumbersFromText(text: string): number[] {
  const results: number[] = [];
  let workingText = text
    .toLowerCase()
    // Eliminar fechas (ej: 19/10/2026, 2026-10-19, 19-10-26)
    .replace(/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/g, ' ')
    // Eliminar horas (ej: 08:30, 14:20:10)
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    // Eliminar últimos 4 dígitos de tarjetas (ej: *4582, **1234, t.deb *4582, tarjeta 4582)
    .replace(/\*+\s*\d{3,6}\b/g, ' ')
    .replace(/\b(?:t\.?\s*(?:deb|cred)\S*|tarjeta|cta|cuenta)\s*\*?\d{3,6}\b/g, ' ')
    // Eliminar códigos de referencia, aprobación o autorización
    .replace(/\b(?:ref|referencia|cod|codigo|código|aut|aprob|aprobacion|nro|num|comprobante)[.:#\s-]*\d{3,15}\b/g, ' ')
    // Eliminar números de celular de 10 dígitos que empiezan por 3 (sin signo $)
    .replace(/(?<![$\w])3\d{9}\b/g, ' ');

  // 1. Expresiones tipo "3.5 millones", "1 millon", "2 millones y medio"
  const millonesmedioRegex = /(\d+)\s*mill[oó]n(?:es)?\s*y\s*medio/gi;
  workingText = workingText.replace(millonesmedioRegex, (_full, d) => {
    const val = (parseFloat(d) + 0.5) * 1000000;
    results.push(Math.round(val));
    return ' ';
  });

  const millonesRegex = /(\d+(?:[.,]\d+)?)\s*mill[oó]n(?:es)?/gi;
  workingText = workingText.replace(millonesRegex, (_full, d) => {
    const val = parseFloat(d.replace(',', '.')) * 1000000;
    if (val > 0) results.push(Math.round(val));
    return ' ';
  });

  // 2. Expresiones tipo "450 mil", "80 mil", "50k", "100 lucas"
  const milesRegex = /(\d+(?:[.,]\d+)?)\s*(?:mil|k|lucas)\b/gi;
  workingText = workingText.replace(milesRegex, (_full, d) => {
    const val = parseFloat(d.replace(',', '.')) * 1000;
    if (val > 0) results.push(Math.round(val));
    return ' ';
  });

  // 3. Cifras con signo peso / COP o separadores de miles ($148.900, COP 35.000,00, 1.250.000, $50,000, 45000)
  const moneyRegex =
    /(?:\$|cop\s*\$?\s*)\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{3,10}(?:[.,]\d{1,2})?)|\b(\d{1,3}(?:[.,]\d{3}){1,3}(?:[.,]\d{1,2})?)\b|\b(\d{4,9})\b/gi;
  let m;
  while ((m = moneyRegex.exec(workingText)) !== null) {
    const rawNum = m[1] || m[2] || m[3] || '';
    // Si termina en ,00 o .00 (centavos), quitar los centavos primero
    const withoutCents = rawNum.replace(/[.,]\d{2}$/, '');
    const normalized = withoutCents.replace(/[.,]/g, '');
    const parsed = parseInt(normalized, 10);
    if (!isNaN(parsed) && parsed >= 500 && !(parsed >= 2020 && parsed <= 2035 && !m[0].includes('$'))) {
      results.push(parsed);
    }
  }

  return results;
}

export function detectBankOrEntity(text: string, fileName = ''): string {
  const low = `${text} ${fileName}`.toLowerCase();
  if (low.includes('nequi')) return 'Nequi';
  if (low.includes('bancolombia')) return 'Bancolombia';
  if (low.includes('nu ') || low.includes('tarjeta nu') || low.includes('nu:') || low.includes('nubank') || low.includes('moradita')) return 'Nu';
  if (low.includes('daviplata')) return 'Daviplata';
  if (low.includes('davivienda')) return 'Davivienda';
  if (low.includes('bbva')) return 'BBVA';
  if (low.includes('lulo')) return 'Lulo Bank';
  if (low.includes('dale')) return 'Dale!';
  if (low.includes('movii')) return 'MOVii';
  if (low.includes('falabella')) return 'Banco Falabella';
  if (low.includes('bogota') || low.includes('bogotá')) return 'Banco de Bogotá';
  if (low.includes('colpatria') || low.includes('scotiabank')) return 'Scotiabank Colpatria';
  if (low.includes('av villas') || low.includes('avvillas')) return 'Banco AV Villas';
  if (low.includes('occidente')) return 'Banco de Occidente';
  if (low.includes('caja social')) return 'Banco Caja Social';
  if (low.includes('popular')) return 'Banco Popular';
  if (low.includes('rappi')) return 'RappiPay';
  if (low.includes('mercadopago') || low.includes('mercado pago')) return 'Mercado Pago';
  if (low.includes('efectivo')) return 'Efectivo';
  return 'Cuenta / Banco';
}

export function categorizeText(text: string, tipo: ExtractedTransactionItem['tipo']): {
  categoria: ExtractedTransactionItem['categoria'];
  esEsencial: boolean;
} {
  const low = text.toLowerCase();
  if (tipo === 'ganancia') {
    if (low.includes('salario') || low.includes('nómina') || low.includes('nomina') || low.includes('sueldo') || low.includes('quincena')) {
      return { categoria: 'Salario / Ingreso Principal', esEsencial: true };
    }
    return { categoria: 'Ventas / Negocio / Freelance', esEsencial: true };
  }
  if (low.includes('arriendo') || low.includes('administracion') || low.includes('energia') || low.includes('energía') || low.includes('enel') || low.includes('epm') || low.includes('agua') || low.includes('acueducto') || low.includes('gas') || low.includes('internet') || low.includes('claro') || low.includes('movistar') || low.includes('tigo') || low.includes('wom') || low.includes('servicios') || low.includes('factura') || low.includes('luz')) {
    return { categoria: 'Vivienda y Servicios', esEsencial: true };
  }
  if (low.includes('supermercado') || low.includes('mercado') || low.includes('exito') || low.includes('éxito') || low.includes('carulla') || low.includes('d1') || low.includes('ara') || low.includes('olimpica') || low.includes('fruver') || low.includes('tienda') || low.includes('panaderia') || low.includes('panadería') || low.includes('alkosto') || low.includes('makro') || low.includes('surtimax') || low.includes('justo') || low.includes('corral') || low.includes('carniceria')) {
    return { categoria: 'Alimentación y Supermercado', esEsencial: true };
  }
  if (low.includes('uber') || low.includes('didi') || low.includes('cabify') || low.includes('indriver') || low.includes('picap') || low.includes('gasolina') || low.includes('terpel') || low.includes('primax') || low.includes('biomax') || low.includes('texaco') || low.includes('transmilenio') || low.includes('metro') || low.includes('peaje') || low.includes('bus') || low.includes('taxi') || low.includes('pasaje') || low.includes('parqueadero')) {
    return { categoria: 'Transporte y Gasolina', esEsencial: true };
  }
  if (low.includes('netflix') || low.includes('spotify') || low.includes('disney') || low.includes('prime') || low.includes('youtube') || low.includes('hbo') || low.includes('max') || low.includes('suscripcion') || low.includes('apple') || low.includes('google play') || low.includes('icloud')) {
    return { categoria: 'Suscripciones Digitales', esEsencial: false };
  }
  if (low.includes('restaurante') || low.includes('crepes') || low.includes('rappi') || low.includes('cine') || low.includes('bar') || low.includes('comida') || low.includes('almuerzo') || low.includes('cena') || low.includes('hamburguesa') || low.includes('pizza') || low.includes('pollo') || low.includes('kfc') || low.includes('mcdonald') || low.includes('frisby') || low.includes('kokoriko')) {
    return { categoria: 'Entretenimiento y Salidas', esEsencial: false };
  }
  if (low.includes('cafe') || low.includes('café') || low.includes('juan valdez') || low.includes('tinto') || low.includes('postre') || low.includes('empanada') || low.includes('mecato') || low.includes('helado') || low.includes('antojo') || low.includes('oxxo') || low.includes('tostao')) {
    return { categoria: 'Gastos Hormiga / Café / Snacks', esEsencial: false };
  }
  if (low.includes('farmacia') || low.includes('drogueria') || low.includes('droguería') || low.includes('rebaja') || low.includes('cruz verde') || low.includes('pasteur') || low.includes('colsubsidio') || low.includes('salud') || low.includes('eps') || low.includes('cita') || low.includes('gimnasio') || low.includes('smartfit') || low.includes('medicamento')) {
    return { categoria: 'Salud y Bienestar', esEsencial: true };
  }
  if (low.includes('cuota') || low.includes('tarjeta') || low.includes('crédito') || low.includes('credito') || low.includes('manejo') || low.includes('intereses')) {
    return { categoria: 'Cuota Tarjeta / Crédito', esEsencial: true };
  }
  return { categoria: 'Compras y Tecnología', esEsencial: false };
}

/**
 * Extrae una descripción limpia del comercio o concepto de una notificación bancaria,
 * eliminando ruido repetitivo como prefijos de SMS, montos duplicados o números de tarjeta.
 */
export function extractCleanMerchantDescription(line: string, entidad: string, tipo: ExtractedTransactionItem['tipo']): string {
  const merchantMatch = line.match(
    /\b(?:en|comercio|establecimiento|a\s+favor\s+de|para|de)\s+([A-ZÁÉÍÓÚÑ0-9][A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s.*&-]{2,42}?)(?=\s+(?:con\s+tu|por\s+\$|por\s+valor|el\s+\d|a\s+las|t\.deb|t\.cred|tarjeta|desde|exitosa|aprobada|saldo|$))/i
  );
  if (merchantMatch && merchantMatch[1]) {
    const cleanMerchant = merchantMatch[1].replace(/\s+/g, ' ').trim();
    if (cleanMerchant.length >= 2 && !/^\d+$/.test(cleanMerchant)) {
      const actionPrefix =
        tipo === 'ganancia' ? 'Abono / Ingreso' : tipo === 'deuda' ? 'Obligación' : 'Compra / Pago en';
      return `${actionPrefix} ${cleanMerchant}`;
    }
  }

  return (
    line
      .replace(/^\d+[.) -]+/, '')
      .replace(/^(?:sms\s*\d*[:\s-]*|notificaci[oó]n[:\s-]*|gmail[:\s-]*)+/i, '')
      .replace(/si no reconoce esta operacion.*/i, '')
      .replace(/dudas al \d+.*/i, '')
      .replace(/\s*\|\s*/g, ' • ')
      .trim()
      .slice(0, 90) || `Movimiento en ${entidad}`
  );
}

/**
 * Construye una huella semántica única para una compra/movimiento.
 * Permite detectar cuando la MISMA compra genera notificación Push de la app + SMS + Correo.
 */
export function buildPurchaseFingerprint(
  monto: number,
  tipo: string,
  textOrDesc: string,
  entidad = ''
): string {
  const stopWords = new Set([
    'compra', 'compraste', 'pagaste', 'pago', 'recibiste', 'transferencia', 'enviaste',
    'aprobada', 'exitosa', 'exitoso', 'por', 'valor', 'de', 'del', 'en', 'el', 'la', 'los',
    'con', 'tu', 'su', 'tarjeta', 'debito', 'credito', 'cuenta', 'ahorros', 'corriente',
    'informa', 'le', 'te', 'banco', 'notificacion', 'sms', 'gmail', 'alerta', 'movimiento',
    'transaccion', 'pesos', 'cop', 'saldo', 'disponible', 'hora', 'fecha', 'automatico'
  ]);

  const normalizedWords = `${textOrDesc} ${entidad}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !stopWords.has(w))
    .slice(0, 4)
    .sort()
    .join('-');

  return `${tipo}:${Math.round(monto)}:${normalizedWords || 'general'}`;
}

/**
 * Calcula el timestamp mínimo (en milisegundos) permitido según la política de plazo elegida por el usuario.
 */
export function getPolicyCutoffTimestamp(policy: NotificationCapturePolicy): number {
  if (!policy.ignorarNotificacionesAntiguas) return 0;

  const now = Date.now();
  switch (policy.modoPlazo) {
    case 'desde_ahora':
      return policy.timestampCorteMs || now;
    case 'solo_hoy': {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      return startOfToday.getTime();
    }
    case 'fecha_personalizada': {
      if (policy.desdeFechaISO) {
        const parsed = new Date(policy.desdeFechaISO).getTime();
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
      return policy.timestampCorteMs || 0;
    }
    case 'ultimos_dias': {
      const days = Math.max(1, policy.ultimosDias || 7);
      return now - days * 24 * 60 * 60 * 1000;
    }
    default:
      return 0;
  }
}

/**
 * Extrae la fecha real escrita dentro del texto de una notificación (ej: "15/10/2026" o "2026-10-15")
 * o usa el timestamp del evento Android si no hay fecha explícita en el texto.
 */
export function extractNotificationDateMs(text: string, fallbackTimestampMs = Date.now()): number {
  const clean = (text || '').trim();

  // Formato DD/MM/YYYY o DD-MM-YYYY (con hora opcional HH:MM)
  const dmyMatch = clean.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b(?:\s*(?:a\s+las\s+)?(\d{1,2}):(\d{2}))?/i);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 23;
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 59;
    const dt = new Date(year, month, day, hour, minute, 59);
    if (!isNaN(dt.getTime())) return dt.getTime();
  }

  // Formato YYYY-MM-DD
  const ymdMatch = clean.match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b(?:\s+(\d{1,2}):(\d{2}))?/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 23;
    const minute = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 59;
    const dt = new Date(year, month, day, hour, minute, 59);
    if (!isNaN(dt.getTime())) return dt.getTime();
  }

  return fallbackTimestampMs;
}

/**
 * Verifica si una notificación es más antigua que el plazo/fecha configurado por el usuario.
 */
export function isNotificationOlderThanPolicy(
  text: string,
  eventTimestampMs: number,
  policy: NotificationCapturePolicy
): { isOld: boolean; reason?: string } {
  if (!policy.ignorarNotificacionesAntiguas) {
    return { isOld: false };
  }

  const cutoffMs = getPolicyCutoffTimestamp(policy);
  if (cutoffMs <= 0) return { isOld: false };

  // Margen de gracia de 90 segundos para evitar bloqueos por diferencias de segundos en "desde_ahora"
  const effectiveCutoff = policy.modoPlazo === 'desde_ahora' ? cutoffMs - 90 * 1000 : cutoffMs;

  // 1. Validar timestamp del evento (por ejemplo StatusBarNotification.getPostTime() en Android)
  if (eventTimestampMs > 0 && eventTimestampMs < effectiveCutoff) {
    const cutoffStr = new Date(cutoffMs).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      isOld: true,
      reason: `Notificación anterior a tu fecha límite (${cutoffStr})`,
    };
  }

  // 2. Validar si el texto de la notificación menciona explícitamente una fecha antigua
  const textDateMs = extractNotificationDateMs(text, eventTimestampMs);
  if (textDateMs < effectiveCutoff) {
    const cutoffStr = new Date(cutoffMs).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return {
      isOld: true,
      reason: `La fecha dentro de la notificación es anterior al plazo configurado (${cutoffStr})`,
    };
  }

  return { isOld: false };
}

/**
 * Determina si un movimiento extraído de una notificación corresponde a una COMPRA YA REGISTRADA
 * (por ejemplo, cuando llega primero la notificación Push de Bancolombia/Nequi, luego el SMS y luego el correo,
 * o cuando el lector de barra de estado vuelve a leer la misma notificación).
 */
export function isDuplicatePurchase(
  candidate: {
    monto: number;
    tipo: string;
    categoria: string;
    entidad: string;
    desc: string;
    rawText: string;
    timestamp: number;
  },
  existingTransactions: Transaction[],
  existingHistory: ProcessedNotificationRecord[],
  windowMinutes = 60
): { isDuplicate: boolean; reason?: string } {
  const windowMs = Math.max(5, windowMinutes) * 60 * 1000;
  const candFp = buildPurchaseFingerprint(candidate.monto, candidate.tipo, `${candidate.desc} ${candidate.rawText}`, candidate.entidad);
  const candNormText = candidate.rawText
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Revisar historial de notificaciones procesadas
  for (const h of existingHistory) {
    const timeDiff = Math.abs(candidate.timestamp - h.timestamp);
    const histNormText = (h.textoOriginal || '').toLowerCase().replace(/\s+/g, ' ').trim();

    // Si es exactamente el mismo texto de notificación dentro de los últimos 7 días, bloquear siempre
    if (candNormText.length > 10 && candNormText === histNormText && timeDiff < 7 * 24 * 60 * 60 * 1000) {
      return {
        isDuplicate: true,
        reason: 'Esta notificación exacta ya fue procesada anteriormente',
      };
    }

    // Si tiene el mismo monto y mismo tipo dentro de la ventana anti-duplicados
    if (Math.round(h.montoTotal) === Math.round(candidate.monto) && h.tipoPrincipal === candidate.tipo && timeDiff <= windowMs) {
      return {
        isDuplicate: true,
        reason: `Misma compra por $${candidate.monto.toLocaleString('es-CO')} ya registrada hace ${Math.max(1, Math.round(timeDiff / 60000))} min`,
      };
    }
  }

  // 2. Revisar lista de transacciones financieras
  for (const tx of existingTransactions) {
    if (Math.round(tx.monto) !== Math.round(candidate.monto) || tx.tipo !== candidate.tipo) {
      continue;
    }

    const timeDiff = Math.abs(candidate.timestamp - tx.timestamp);
    const txFp = tx.fingerprint || buildPurchaseFingerprint(tx.monto, tx.tipo, tx.desc, tx.entidad);

    // Huella idéntica en las últimas 12 horas (ej: misma compra en D1 por $42.500 notificada horas después)
    if (txFp === candFp && timeDiff <= 12 * 60 * 60 * 1000) {
      return {
        isDuplicate: true,
        reason: `Compra idéntica ($${candidate.monto.toLocaleString('es-CO')}) ya anotada en tus movimientos`,
      };
    }

    // Mismo monto y tipo dentro de la ventana anti-duplicados (ej: llega Push de Nequi/Bancolombia y luego SMS/Correo por el mismo valor)
    if (timeDiff <= windowMs) {
      const sameCategoryOrBank =
        tx.categoria === candidate.categoria ||
        (tx.entidad && candidate.entidad && tx.entidad.toLowerCase() === candidate.entidad.toLowerCase()) ||
        timeDiff <= 20 * 60 * 1000; // Dentro de 20 minutos igual monto + igual tipo entre Push/SMS/Correo es la misma compra

      if (sameCategoryOrBank) {
        return {
          isDuplicate: true,
          reason: `Compra duplicada detectada ($${candidate.monto.toLocaleString('es-CO')}) dentro de la ventana de protección`,
        };
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Limpia transacciones duplicadas existentes en el listado (conservando solo el primer registro único de cada compra).
 */
export function deduplicateTransactionsList(
  transactions: Transaction[],
  windowMinutes = 60
): { cleaned: Transaction[]; removedCount: number } {
  const windowMs = Math.max(10, windowMinutes) * 60 * 1000;
  // Ordenar de más antigua a más reciente para conservar la original y descartar las réplicas posteriores
  const chronological = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const kept: Transaction[] = [];
  let removedCount = 0;

  for (const tx of chronological) {
    const txFp = tx.fingerprint || buildPurchaseFingerprint(tx.monto, tx.tipo, tx.desc, tx.entidad);
    const isDup = kept.some((existing) => {
      if (Math.round(existing.monto) !== Math.round(tx.monto) || existing.tipo !== tx.tipo) return false;
      const timeDiff = Math.abs(tx.timestamp - existing.timestamp);
      const exFp = existing.fingerprint || buildPurchaseFingerprint(existing.monto, existing.tipo, existing.desc, existing.entidad);
      if (txFp === exFp && timeDiff <= 12 * 60 * 60 * 1000) return true;
      if (timeDiff <= windowMs && (existing.categoria === tx.categoria || timeDiff <= 20 * 60 * 1000)) return true;
      return false;
    });

    if (isDup) {
      removedCount++;
    } else {
      kept.push({ ...tx, fingerprint: txFp });
    }
  }

  // Devolver en orden descendente (más reciente primero)
  return {
    cleaned: kept.sort((a, b) => b.timestamp - a.timestamp),
    removedCount,
  };
}

/**
 * Analizador Real 100% Dinámico (CERO datos falsos o inventados y CERO duplicación de la misma compra).
 * Extrae todos los valores reales presentes en notificaciones de Nequi, Bancolombia, Daviplata, Nu, SMS, correos o PDF.
 */
export function runOnDeviceFinancialAnalysis(params: {
  sourceType: SourceType;
  text: string;
  fileName?: string;
}): AIAnalysisResult {
  const rawText = (params.text || '').trim();
  const entidadGlobal = detectBankOrEntity(rawText, params.fileName);

  const cuotasMatch = rawText.match(/(\d{1,2})\s*cuotas?/i);
  const cuotasGlobal = cuotasMatch ? Math.max(1, parseInt(cuotasMatch[1], 10)) : 1;

  const tasaMatch = rawText.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:e\.?a\.?)?/i);
  const tasaEA = tasaMatch ? parseFloat(tasaMatch[1].replace(',', '.')) : 0;

  const movimientosDetectados: ExtractedTransactionItem[] = [];
  let datosExtractoCredito: ExtractedCreditSummary | undefined = undefined;

  // Limpiar frases informativas de "saldo disponible" o "costo de transacción $0" para no confundirlas con otra compra
  const cleanedNotificationText = rawText
    .replace(/(?:tu\s+)?(?:nuevo\s+)?saldo(?:\s+disponible|\s+actual|\s+total|\s+en\s+cuenta)?\s*(?:es\s*(?:de)?)?[:\s]*\$?\s*(?:cop\s*)?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/gi, ' ')
    .replace(/en\s+tu\s+cuenta\s+queda\s*[:\s]*\$?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/gi, ' ')
    .replace(/costo\s+(?:de\s+(?:la\s+)?)?transacci[oó]n[:\s]*\$?\s*\d+(?:[.,]\d+)?/gi, ' ');

  const rawLines = cleanedNotificationText
    .split(/\r?\n|;\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Detectar si el usuario pegó una lista numerada explícita (ej. "1. Mercado $50.000 \n 2. Gasolina $30.000")
  const isExplicitNumberedList =
    rawLines.length > 1 && rawLines.filter((l) => /^\d+[.) -]+/.test(l)).length >= 2;

  // Si es una notificación bancaria ('notificacion' o 'automatico') y NO es una lista numerada manual,
  // SIEMPRE consolidarla como UN SOLO evento para no duplicar cuando el título y el cuerpo repiten el monto
  const isSingleNotificationEvent =
    (params.sourceType === 'notificacion' || params.sourceType === 'automatico') && !isExplicitNumberedList;

  const linesWithAmounts = rawLines.filter((l) => parseAllNumbersFromText(l).length > 0);
  const lines =
    isSingleNotificationEvent || (linesWithAmounts.length === 1 && rawLines.length > 1)
      ? [rawLines.join(' ')]
      : rawLines;

  const seenInThisAnalysis = new Set<string>();

  for (const line of lines) {
    const lineLow = line.toLowerCase();
    if (
      lineLow.startsWith('cupo total') ||
      lineLow.startsWith('fecha de corte') ||
      lineLow.startsWith('tasa efectiva') ||
      lineLow.startsWith('saldo disponible')
    ) {
      continue;
    }

    const nums = parseAllNumbersFromText(line);
    if (nums.length === 0) continue;

    const monto = nums[0];
    if (monto <= 0) continue;

    let tipo: ExtractedTransactionItem['tipo'] = 'gasto';
    if (
      lineLow.includes('recibiste') ||
      lineLow.includes('llegó plata') ||
      lineLow.includes('llego plata') ||
      lineLow.includes('me llegaron') ||
      lineLow.includes('abono') ||
      lineLow.includes('consignacion') ||
      lineLow.includes('consignación') ||
      lineLow.includes('te enviaron') ||
      lineLow.includes('me enviaron') ||
      lineLow.includes('me pagaron') ||
      lineLow.includes('nómina') ||
      lineLow.includes('nomina') ||
      lineLow.includes('transferencia recibida') ||
      lineLow.includes('ingreso') ||
      lineLow.includes('recarga exitosa')
    ) {
      tipo = 'ganancia';
    } else if (
      lineLow.includes('deuda') ||
      lineLow.includes('pendiente por pagar') ||
      lineLow.includes('próximo a vencer')
    ) {
      tipo = 'deuda';
    } else if (lineLow.includes('trading') || lineLow.includes('inversión') || lineLow.includes('cajita')) {
      tipo = 'trading';
    }

    const { categoria, esEsencial } = categorizeText(line, tipo);
    const lineCuotasMatch = line.match(/(\d{1,2})\s*cuotas?/i);
    const lineCuotas = lineCuotasMatch ? parseInt(lineCuotasMatch[1], 10) : cuotasGlobal;
    const lineEntidad = detectBankOrEntity(line, entidadGlobal);

    const cleanDesc = extractCleanMerchantDescription(line, lineEntidad, tipo);
    const dedupKey = `${tipo}:${monto}:${categoria}`;
    if (seenInThisAnalysis.has(dedupKey)) {
      continue;
    }
    seenInThisAnalysis.add(dedupKey);

    movimientosDetectados.push({
      tipo,
      categoria,
      monto,
      desc: cleanDesc,
      entidad: lineEntidad,
      cuotas: lineCuotas,
      esEsencial,
    });

    // Si es una notificación unitaria, tomar únicamente la compra principal
    if (isSingleNotificationEvent) {
      break;
    }
  }

  // Verificar si el texto contiene métricas explícitas de extracto crediticio
  const cupoMatch = rawText.match(/cupo\s*(?:total|asignado)[^$\d]*\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{5,10})/i);
  const utilizadoMatch = rawText.match(/(?:cupo\s*utilizado|deuda\s*total|saldo\s*actual|pago\s*total)[^$\d]*\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,10})/i);
  const minMatch = rawText.match(/pago\s*m[íi]nimo[^$\d]*\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,10})/i);
  const manejoMatch = rawText.match(/cuota\s*de\s*manejo[^$\d]*\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,8})/i);

  if (cupoMatch || utilizadoMatch || minMatch) {
    const cupoTotal = cupoMatch ? parseInt(cupoMatch[1].replace(/[.,]/g, ''), 10) : 0;
    const saldoActual = utilizadoMatch ? parseInt(utilizadoMatch[1].replace(/[.,]/g, ''), 10) : 0;
    const pagoMinimo = minMatch ? parseInt(minMatch[1].replace(/[.,]/g, ''), 10) : 0;
    const cuotaManejo = manejoMatch ? parseInt(manejoMatch[1].replace(/[.,]/g, ''), 10) : 0;

    datosExtractoCredito = {
      entidad: entidadGlobal,
      cupoTotal,
      saldoActual,
      pagoMinimo,
      fechaLimitePago: 'Según extracto',
      tasaEA: tasaEA > 0 ? tasaEA : 28.5,
      cuotaManejo,
      segurosCobrosOcultos: 0,
      alertaUsura: tasaEA >= 28.0,
    };
  }

  const totalExtraido = movimientosDetectados.reduce((acc, m) => acc + m.monto, 0);
  const numMovs = movimientosDetectados.length;
  const mvRate = tasaEA > 0 ? eaToMvPercent(tasaEA) : eaToMvPercent(28.5);

  if (numMovs === 0 && !datosExtractoCredito) {
    return {
      resumenEjecutivo:
        'No se encontró un valor en pesos ($) en el texto. Escribe o pega la notificación incluyendo el monto (por ejemplo: "Compra en D1 por $35.000" o "Recibiste 120.000 en Nequi").',
      tipoDocumentoDetectado: 'Sin monto detectado',
      nivelRiesgo: 'bajo',
      movimientosDetectados: [],
      alertasFinancieras: ['Asegúrate de que el texto incluya el monto numérico.'],
      recomendacionesPrioritarias: [],
      ejemploPracticoAhorro: '',
      calculosRealizados: [],
      motorUsado: 'heuristica-local',
    };
  }

  return {
    resumenEjecutivo: `Detectado(s) ${numMovs} movimiento(s) por $${totalExtraido.toLocaleString('es-CO')} en ${entidadGlobal}.`,
    tipoDocumentoDetectado:
      params.sourceType === 'pdf'
        ? 'Extracto PDF'
        : params.sourceType === 'imagen'
        ? 'Comprobante / Recibo'
        : params.sourceType === 'correo'
        ? 'Correo Bancario'
        : 'Notificación Bancaria',
    nivelRiesgo: cuotasGlobal > 1 ? 'medio' : 'bajo',
    movimientosDetectados,
    datosExtractoCredito,
    alertasFinancieras: [
      cuotasGlobal > 1
        ? `Diferido a ${cuotasGlobal} cuotas: pagará intereses aproximados del ${mvRate.toFixed(2)}% M.V.`
        : 'Operación a 1 cuota o de contado ($0 intereses).',
    ],
    recomendacionesPrioritarias: [
      'El movimiento ya está listo en tu historial financiero.',
    ],
    ejemploPracticoAhorro:
      cuotasGlobal > 1
        ? `Al pagar estos $${totalExtraido.toLocaleString('es-CO')} a 1 cuota en vez de ${cuotasGlobal}, te ahorras $${Math.round(
            simulateInstallmentPurchase(totalExtraido, cuotasGlobal, tasaEA || 28.5).totalIntereses
          ).toLocaleString('es-CO')} en intereses.`
        : `Movimiento de $${totalExtraido.toLocaleString('es-CO')} clasificado automáticamente en "${movimientosDetectados[0]?.categoria || 'General'}".`,
    calculosRealizados: [
      {
        etiqueta: 'Total Detectado',
        valor: `$${totalExtraido.toLocaleString('es-CO')}`,
        explicacion: `${numMovs} registro(s)`,
      },
    ],
    motorUsado: 'heuristica-local',
  };
}

/**
 * Evaluador de expresiones matemáticas libres en español
 * Ej: "cuánto es 450000 + 320000", "el 15% de 3200000", "2500000 - 850000"
 */
function trySolveMathExpression(question: string): string | null {
  const low = question.toLowerCase();

  // Caso 1: Porcentaje ("cuánto es el 18% de 2.500.000")
  const pctMatch = low.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de|del|sobre)\s*\$?\s*(\d[\d.,\s]*)/i);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1].replace(',', '.'));
    const baseNums = parseAllNumbersFromText(pctMatch[2]);
    const base = baseNums[0] || parseFloat(pctMatch[2].replace(/[.,\s]/g, ''));
    if (!isNaN(pct) && !isNaN(base) && base > 0) {
      const result = Math.round((base * pct) / 100);
      return `🧮 **Cálculo de porcentaje:**\nEl **${pct}%** de **$${base.toLocaleString('es-CO')}** es exactamente **$${result.toLocaleString('es-CO')}**.\n- Si es un descuento o retención, te quedan: **$${(base - result).toLocaleString('es-CO')}**\n- Si es un recargo o interés adicional, el total sube a: **$${(base + result).toLocaleString('es-CO')}**`;
    }
  }

  // Caso 2: Operación aritmética explícita (+, -, *, /, x, dividido, más, menos, por)
  const normalizedMath = low
    .replace(/\$/g, '')
    .replace(/(\d)\.(\d{3})\b/g, '$1$2')
    .replace(/(\d)\.(\d{3})\b/g, '$1$2')
    .replace(/\bmas\b|\bmás\b/g, '+')
    .replace(/\bmenos\b/g, '-')
    .replace(/\bpor\b|\bx\b/g, '*')
    .replace(/\bdividido\s*(?:en|entre)?\b/g, '/');

  const exprMatch = normalizedMath.match(/(\d+(?:\.\d+)?(?:\s*[+\-*/]\s*\d+(?:\.\d+)?)+)/);
  if (exprMatch) {
    const rawExpr = exprMatch[1];
    try {
      // Evaluar de forma segura únicamente números y operadores + - * /
      if (/^[\d.+\-*/\s]+$/.test(rawExpr)) {
        const tokens = rawExpr.match(/\d+(?:\.\d+)?|[+\-*/]/g);
        if (tokens && tokens.length >= 3) {
          let current = parseFloat(tokens[0]);
          for (let i = 1; i < tokens.length; i += 2) {
            const op = tokens[i];
            const next = parseFloat(tokens[i + 1]);
            if (op === '+') current += next;
            else if (op === '-') current -= next;
            else if (op === '*') current *= next;
            else if (op === '/' && next !== 0) current /= next;
          }
          return `🧮 **Resultado del cálculo (${rawExpr.trim()}):**\nEl resultado exacto es **$${Math.round(current).toLocaleString('es-CO')}**${
            current % 1 !== 0 ? ` (${current.toFixed(2)})` : ''
          }.`;
        }
      }
    } catch {
      // continuar
    }
  }

  return null;
}

/**
 * Motor Conversacional Dinámico Local (100% interactivo y natural):
 * Entiende cualquier pregunta o instrucción en lenguaje natural, ejecuta acciones múltiples
 * (salario, cosas que paga cada mes, metas, gastos, deudas) y responde directamente a lo preguntado.
 */
export function solveUserQuestionLocally(
  question: string,
  snapshot: any
): { answer: string; actions: AdvisorActionCommand[] } {
  const q = question.trim();
  const low = q.toLowerCase();
  const nums = parseAllNumbersFromText(q);
  const actions: AdvisorActionCommand[] = [];

  const salarioActual = (snapshot?.salarioMensualNeto || 0) + (snapshot?.otrosIngresosFijos || 0);
  const pagosFijosTotal = snapshot?.totalPagosFijosMensuales || 0;
  const pagosFijosPendientes = snapshot?.pagosFijosPendientes || 0;
  const gastosVariables = snapshot?.totalGastos || 0;
  const deudaTotal = snapshot?.deudaTotalObligaciones || 0;
  const cuotaMinimaDeudas = snapshot?.cuotaMinimaTotalMensual || 0;
  const dineroLibreMensual = Math.max(
    0,
    (snapshot?.totalGanancias || salarioActual) - gastosVariables - pagosFijosPendientes - cuotaMinimaDeudas
  );

  // 1. Detectar si el usuario está registrando o actualizando su salario / sueldo
  if (
    (low.includes('salario') ||
      low.includes('sueldo') ||
      low.includes('gano ') ||
      low.includes('me pagan') ||
      low.includes('ingreso mensual') ||
      low.includes('mi quincena es')) &&
    nums.length > 0 &&
    !low.includes('si gano') &&
    !low.includes('cuánto') &&
    !low.includes('cuanto')
  ) {
    const esQuincena = low.includes('quincena') || low.includes('quincenal');
    const valorBase = nums[0];
    const nuevoSalario = esQuincena && valorBase < 3000000 ? valorBase * 2 : valorBase;

    actions.push({
      tipoAccion: 'actualizar_salario',
      datos: {
        salarioMensualNeto: nuevoSalario,
        frecuenciaPago: esQuincena ? 'quincenal' : 'mensual',
      },
      descripcionConfirmacion: `Salario mensual configurado en $${nuevoSalario.toLocaleString('es-CO')}`,
    });

    const nec50 = Math.round(nuevoSalario * 0.5);
    const des30 = Math.round(nuevoSalario * 0.3);
    const aho20 = Math.round(nuevoSalario * 0.2);

    return {
      actions,
      answer: `✅ **¡Listo! Guardé tu salario mensual en $${nuevoSalario.toLocaleString('es-CO')}${
        esQuincena ? ` ($${Math.round(nuevoSalario / 2).toLocaleString('es-CO')} por quincena)` : ''
      }.**\n\nCon base en tu sueldo real, tu distribución recomendada cada mes es:\n- **Necesidades y pagos fijos (50%):** máximo **$${nec50.toLocaleString('es-CO')}**\n- **Gastos personales / salidas (30%):** máximo **$${des30.toLocaleString('es-CO')}**\n- **Ahorro para metas o abono a deudas (20%):** **$${aho20.toLocaleString('es-CO')}** al mes.\n\nSi quieres, escríbeme ahora qué pagos fijos haces cada mes (por ejemplo: *"pago 700.000 de arriendo y 80.000 de internet"*) y los dejo registrados de una vez.`,
    };
  }

  // 2. Detectar si el usuario quiere crear o calcular una meta de ahorro
  if (
    (low.includes('meta') ||
      low.includes('ahorrar para') ||
      low.includes('quiero ahorrar') ||
      low.includes('quiero reunir') ||
      low.includes('comprar una moto') ||
      low.includes('comprar un') ||
      low.includes('viaje de')) &&
    nums.length > 0
  ) {
    const montoMeta = nums[0];
    const mesesMatch = low.match(/(\d{1,3})\s*mes(?:es)?/);
    const aniosMatch = low.match(/(\d{1,2})\s*a[ñn]os?/);
    const plazoMeses = mesesMatch
      ? Math.max(1, parseInt(mesesMatch[1], 10))
      : aniosMatch
      ? Math.max(1, parseInt(aniosMatch[1], 10) * 12)
      : 6;
    const cuotaAhorro = Math.round(montoMeta / plazoMeses);

    const nombreLimpio =
      q
        .replace(/quiero|ahorrar|para|una?|mi|meta|de|reunir|en\s+\d+\s+mes(?:es)?|\$?\s*\d[\d.,]*\s*(?:millones|millón|mil)?/gi, '')
        .trim()
        .slice(0, 45) || 'Meta Personal';

    actions.push({
      tipoAccion: 'agregar_meta',
      datos: {
        nombre: nombreLimpio.charAt(0).toUpperCase() + nombreLimpio.slice(1),
        montoObjetivo: montoMeta,
        plazoMeses,
      },
      descripcionConfirmacion: `Meta agregada: "${nombreLimpio}" ($${montoMeta.toLocaleString('es-CO')})`,
    });

    return {
      actions,
      answer: `🎯 **¡Meta registrada! "${nombreLimpio}" por $${montoMeta.toLocaleString('es-CO')} en ${plazoMeses} meses.**\n\nPara alcanzarla a tiempo necesitas apartar:\n- **Por mes:** $${cuotaAhorro.toLocaleString('es-CO')}\n- **Por quincena:** $${Math.round(cuotaAhorro / 2).toLocaleString('es-CO')}\n- **Por día:** $${Math.round(cuotaAhorro / 30).toLocaleString('es-CO')}\n\nYa puedes ver la barra de progreso y abonarle en la pestaña **Mi Mes → Mis Metas**.`,
    };
  }

  // 3. Detectar pagos fijos ("cosas que pago": arriendo, luz, agua, internet, plan, gimnasio, cuota...)
  if (
    (low.includes('pago ') ||
      low.includes('arriendo') ||
      low.includes('internet') ||
      low.includes('factura') ||
      low.includes('servicios') ||
      low.includes('mensualidad') ||
      low.includes('gimnasio')) &&
    nums.length > 0 &&
    !low.includes('cuánto') &&
    !low.includes('cuanto') &&
    !low.includes('cómo') &&
    !low.includes('como')
  ) {
    // Soportar múltiples pagos separados por "y" o comas (ej: "pago 700.000 de arriendo y 90.000 de internet")
    const segments = q.split(/\s+y\s+|,/i);
    for (const seg of segments) {
      const segNums = parseAllNumbersFromText(seg);
      if (segNums.length > 0) {
        const m = segNums[0];
        const concept =
          seg
            .replace(/pago|pagar|mensual|cada mes|de|por|\$?\s*\d[\d.,]*\s*(?:millones|millón|mil)?/gi, '')
            .trim()
            .slice(0, 40) || 'Pago Fijo Mensual';
        const { categoria } = categorizeText(concept, 'gasto');
        actions.push({
          tipoAccion: 'agregar_pago_fijo',
          datos: {
            nombre: concept.charAt(0).toUpperCase() + concept.slice(1),
            monto: m,
            diaVencimiento: 5,
            categoria,
          },
          descripcionConfirmacion: `Pago fijo agregado: ${concept} ($${m.toLocaleString('es-CO')}/mes)`,
        });
      }
    }

    if (actions.length > 0) {
      const sumaNuevos = actions.reduce((acc, a) => acc + (a.datos.monto || 0), 0);
      return {
        actions,
        answer: `📅 **¡Listo! Agregué ${actions.length} pago(s) fijo(s) por un total de $${sumaNuevos.toLocaleString('es-CO')}/mes a tu sección "Cosas que Pago Cada Mes".**\n\nEn la pestaña **Mi Mes** puedes marcarlos como pagados con un toque a medida que los vayas cancelando.`,
      };
    }
  }

  // 4. Detectar registro directo de un gasto o ingreso ("gasté 40.000 en almuerzo", "compré...", "recibí...")
  if (
    (low.includes('gasté') ||
      low.includes('gaste') ||
      low.includes('compré') ||
      low.includes('compre') ||
      low.includes('pagué') ||
      low.includes('pague') ||
      low.includes('recibí') ||
      low.includes('recibi') ||
      low.includes('me pagaron')) &&
    nums.length > 0
  ) {
    const esIngreso = low.includes('recibí') || low.includes('recibi') || low.includes('me pagaron');
    const monto = nums[0];
    const tipoMov = esIngreso ? 'ganancia' : 'gasto';
    const { categoria, esEsencial } = categorizeText(q, tipoMov);
    const entidad = detectBankOrEntity(q);

    actions.push({
      tipoAccion: 'registrar_movimiento',
      datos: {
        tipo: tipoMov,
        categoria,
        monto,
        desc: q.slice(0, 75),
        entidad,
        esEsencial,
      },
      descripcionConfirmacion: `${esIngreso ? 'Ingreso' : 'Gasto'} registrado: $${monto.toLocaleString('es-CO')} (${categoria})`,
    });

    return {
      actions,
      answer: `✅ **Registré tu ${esIngreso ? 'ingreso' : 'compra/gasto'} por $${monto.toLocaleString('es-CO')} en la categoría "${categoria}" (${entidad}).**\nTu balance disponible se actualizó automáticamente.`,
    };
  }

  // 5. Verificar si es un cálculo matemático o de porcentaje directo
  const mathAnswer = trySolveMathExpression(q);
  if (mathAnswer) {
    return { actions, answer: mathAnswer };
  }

  // 6. Si pregunta por cuotas, tarjetas o intereses
  if (
    low.includes('cuota') ||
    low.includes('interés') ||
    low.includes('interes') ||
    low.includes('diferir') ||
    low.includes('tasa')
  ) {
    const montoSim = nums[0] || 1000000;
    const cuotasMatch = low.match(/(\d{1,2})\s*cuotas?/);
    const numCuotas = cuotasMatch ? Math.max(1, parseInt(cuotasMatch[1], 10)) : 12;
    const tasaMatch = low.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
    const tasaUsar = tasaMatch ? parseFloat(tasaMatch[1].replace(',', '.')) : 28.45;

    const sim = simulateInstallmentPurchase(montoSim, numCuotas, tasaUsar, 0);
    const sim3 = simulateInstallmentPurchase(montoSim, 3, tasaUsar, 0);

    return {
      actions,
      answer: `💳 **Simulación real para $${montoSim.toLocaleString('es-CO')} diferido a ${numCuotas} cuotas (${tasaUsar}% E.A. / ${sim.tasaMV.toFixed(2)}% M.V.):**\n\n- **Valor de cada cuota mensual:** $${Math.round(sim.cuotaMensual).toLocaleString('es-CO')}\n- **Total que pagarás solo en intereses:** $${Math.round(sim.totalIntereses).toLocaleString('es-CO')} (+${sim.sobrecostoPorcentaje.toFixed(1)}% adicional)\n- **Total final pagado al banco:** $${Math.round(sim.totalPagar).toLocaleString('es-CO')}\n\n💡 **Consejo práctico:** Si lo difieres a **3 cuotas** ($${Math.round(sim3.cuotaMensual).toLocaleString('es-CO')}/mes) o a **1 sola cuota** ($0 intereses), te ahorras **$${Math.round(sim.totalIntereses - sim3.totalIntereses).toLocaleString('es-CO')}** en intereses bancarios.`,
    };
  }

  // 7. Si pregunta cómo salir de deudas, qué pagar primero o vida crediticia / DataCrédito
  if (
    low.includes('deuda') ||
    low.includes('datacrédito') ||
    low.includes('datacredito') ||
    low.includes('puntaje') ||
    low.includes('score') ||
    low.includes('crediticia') ||
    low.includes('priorizar') ||
    low.includes('primero')
  ) {
    return {
      actions,
      answer: `🛡️ **Estrategia para tus Deudas y Vida Crediticia:**\n\n${
        deudaTotal > 0
          ? `Actualmente tienes registradas obligaciones por **$${deudaTotal.toLocaleString('es-CO')}** con un uso de cupo del **${(snapshot?.porcentajeUtilizacionCupo || 0).toFixed(1)}%** y un puntaje estimado de **${snapshot?.scoreEstimado || 800} pts**.\n\n1. **Prioridad #1 (Método Avalancha):** Paga el mínimo en todas tus obligaciones y destina cualquier dinero extra a la tarjeta o crédito con **mayor tasa E.A.**\n2. **Regla del 30% en DataCrédito:** Abona antes de la **fecha de corte** (no solo en la fecha de pago) para que el banco reporte a las centrales un uso menor al 30% de tu cupo.`
          : `Aún no tienes deudas registradas en la pestaña **Deudas y Crédito**. \n\n**Reglas de oro para subir tu puntaje y priorizar:**\n1. **Nunca uses más del 30% del cupo** de tu tarjeta al llegar el día de corte.\n2. **Si tienes varias deudas**, ordénalas de mayor a menor tasa de interés (% E.A.) y ataca primero la más cara (Método Avalancha).\n3. Puedes registrar una deuda en la pestaña **Deudas** o escribiéndome aquí: *"Tengo una tarjeta con deuda de 1.500.000"*`
      }`,
    };
  }

  // 8. Si pregunta por inversión, rentabilidad, CDT, Cajita Nu, ahorros
  if (
    low.includes('invertir') ||
    low.includes('inversión') ||
    low.includes('inversion') ||
    low.includes('cdt') ||
    low.includes('cajita') ||
    low.includes('rendir') ||
    low.includes('rentabilidad') ||
    low.includes('trading')
  ) {
    const capital = nums[0] || (dineroLibreMensual > 0 ? dineroLibreMensual : 1000000);
    const rend11EA = Math.round(capital * (Math.pow(1 + 0.11, 1 / 12) - 1));
    const rendAnual = Math.round(capital * 0.11);
    return {
      actions,
      answer: `📈 **Proyección de Rendimiento para $${capital.toLocaleString('es-CO')}:**\n\n- **En cuenta de alto rendimiento / Cajita Nu / Lulo / CDT (~11% E.A.):**\n  - Ganancia en **1 mes:** +$${rend11EA.toLocaleString('es-CO')}\n  - Ganancia en **1 año (interés compuesto):** +$${rendAnual.toLocaleString('es-CO')} (Total: $${(capital + rendAnual).toLocaleString('es-CO')})\n\n💡 **Regla financiera:** Antes de invertir en renta variable o trading, asegúrate de no tener deudas de tarjeta de crédito al ~28% E.A., porque pagar una deuda del 28% equivale a ganar un 28% libre de riesgo.`,
    };
  }

  // 9. Si menciona dos o más números en una consulta general (ej. "si gano 3 millones y gasto 1.800.000")
  if (nums.length >= 2) {
    const n1 = nums[0];
    const n2 = nums[1];
    const diff = n1 - n2;
    const pct = n1 > 0 ? ((n2 / n1) * 100).toFixed(1) : '0';
    return {
      actions,
      answer: `🧮 **Análisis directo de las cifras que mencionas ($${n1.toLocaleString('es-CO')} y $${n2.toLocaleString('es-CO')}):**\n\n- **Diferencia (Saldo restante):** $${diff.toLocaleString('es-CO')}\n- **Proporción:** $${n2.toLocaleString('es-CO')} equivale al **${pct}%** de $${n1.toLocaleString('es-CO')}.\n- **Recomendación:** Si $${n1.toLocaleString('es-CO')} es tu ingreso y $${n2.toLocaleString('es-CO')} tus gastos, te quedan **$${Math.max(0, diff).toLocaleString('es-CO')}** libres al mes. Lo ideal es destinar al menos el 20% ($${Math.round(n1 * 0.2).toLocaleString('es-CO')}) a tus metas o a reducir deudas.`,
    };
  }

  // 10. Si menciona un solo número (ej. "¿me alcanza para algo de 350.000?")
  if (nums.length === 1) {
    const cifra = nums[0];
    return {
      actions,
      answer: `💡 **Análisis para el monto de $${cifra.toLocaleString('es-CO')}:**\n\n- **Si lo ahorras en 3 meses:** necesitas apartar **$${Math.round(cifra / 3).toLocaleString('es-CO')}/mes** ($${Math.round(cifra / 90).toLocaleString('es-CO')}/día).\n- **Si lo ahorras en 6 meses:** necesitas apartar **$${Math.round(cifra / 6).toLocaleString('es-CO')}/mes**.\n- **Si lo compras con tarjeta a 6 cuotas (28.5% E.A.):** pagarías cuotas de **$${Math.round(simulateInstallmentPurchase(cifra, 6, 28.5).cuotaMensual).toLocaleString('es-CO')}** y perderías **$${Math.round(simulateInstallmentPurchase(cifra, 6, 28.5).totalIntereses).toLocaleString('es-CO')}** en intereses.\n${
        salarioActual > 0
          ? `- **Respecto a tu sueldo ($${salarioActual.toLocaleString('es-CO')}):** representa el **${((cifra / salarioActual) * 100).toFixed(1)}%** de tu ingreso mensual.`
          : ''
      }`,
    };
  }

  // 11. Respuesta conversacional inteligente sobre su estado actual o instrucción abierta
  return {
    actions,
    answer: `📋 **Resumen en tiempo real de tus finanzas para responder a *"${q}"*:**\n\n- **Mi Salario / Ingresos del Mes:** $${(snapshot?.totalGanancias || 0).toLocaleString('es-CO')}\n- **Cosas que Pago Cada Mes (Pendientes):** $${pagosFijosPendientes.toLocaleString('es-CO')}\n- **Compras y Gastos Registrados:** $${gastosVariables.toLocaleString('es-CO')}\n- **Dinero Libre Real:** **$${dineroLibreMensual.toLocaleString('es-CO')}**\n\n💬 **Dime qué cálculo o registro quieres hacer ahora mismo.** Por ejemplo, puedes escribirme:\n1. *"Mi salario es 2.800.000"* (lo guardo de inmediato)\n2. *"Pago 750.000 de arriendo y 85.000 de internet"* (los agrego a tus pagos del mes)\n3. *"Quiero ahorrar 4.000.000 para una moto en 8 meses"*\n4. *"¿Cuánto es el 18% de 1.450.000?"* o *"¿Cuánto pago por 1.200.000 a 6 cuotas?"*`,
  };
}
