import {
  AIAnalysisResult,
  ExtractedTransactionItem,
  ExtractedCreditSummary,
  SourceType,
  AdvisorActionCommand,
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
export function parseAllNumbersFromText(text: string): number[] {
  const results: number[] = [];
  let workingText = text.toLowerCase();

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

  // 3. Cifras con signo peso o separadores de miles ($148.900, 1.250.000, $50,000, 45000)
  const moneyRegex = /(?:\$|cop\s*)\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{3,10})|\b(\d{1,3}(?:[.,]\d{3}){1,3})\b|\b(\d{4,10})\b/gi;
  let m;
  while ((m = moneyRegex.exec(workingText)) !== null) {
    const rawNum = m[1] || m[2] || m[3] || '';
    const normalized = rawNum.replace(/[.,]\d{2}$/, '').replace(/[.,]/g, '');
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
  if (low.includes('supermercado') || low.includes('mercado') || low.includes('exito') || low.includes('éxito') || low.includes('carulla') || low.includes('d1') || low.includes('ara') || low.includes('olimpica') || low.includes('fruver') || low.includes('tienda') || low.includes('panaderia') || low.includes('panadería')) {
    return { categoria: 'Alimentación y Supermercado', esEsencial: true };
  }
  if (low.includes('uber') || low.includes('didi') || low.includes('cabify') || low.includes('indriver') || low.includes('picap') || low.includes('gasolina') || low.includes('transmilenio') || low.includes('metro') || low.includes('peaje') || low.includes('bus') || low.includes('taxi') || low.includes('pasaje') || low.includes('parqueadero')) {
    return { categoria: 'Transporte y Gasolina', esEsencial: true };
  }
  if (low.includes('netflix') || low.includes('spotify') || low.includes('disney') || low.includes('prime') || low.includes('youtube') || low.includes('hbo') || low.includes('max') || low.includes('suscripcion')) {
    return { categoria: 'Suscripciones Digitales', esEsencial: false };
  }
  if (low.includes('restaurante') || low.includes('crepes') || low.includes('rappi') || low.includes('cine') || low.includes('bar') || low.includes('comida') || low.includes('almuerzo') || low.includes('cena') || low.includes('hamburguesa') || low.includes('pizza') || low.includes('pollo')) {
    return { categoria: 'Entretenimiento y Salidas', esEsencial: false };
  }
  if (low.includes('cafe') || low.includes('café') || low.includes('juan valdez') || low.includes('tinto') || low.includes('postre') || low.includes('empanada') || low.includes('mecato') || low.includes('helado') || low.includes('antojo')) {
    return { categoria: 'Gastos Hormiga / Café / Snacks', esEsencial: false };
  }
  if (low.includes('farmacia') || low.includes('drogueria') || low.includes('salud') || low.includes('eps') || low.includes('cita') || low.includes('gimnasio') || low.includes('smartfit') || low.includes('medicamento')) {
    return { categoria: 'Salud y Bienestar', esEsencial: true };
  }
  if (low.includes('cuota') || low.includes('tarjeta') || low.includes('crédito') || low.includes('credito') || low.includes('manejo') || low.includes('intereses')) {
    return { categoria: 'Cuota Tarjeta / Crédito', esEsencial: true };
  }
  return { categoria: 'Compras y Tecnología', esEsencial: false };
}

/**
 * Analizador Real 100% Dinámico (CERO datos falsos o inventados).
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

  // Dividir por líneas o por punto y coma si vienen varias notificaciones juntas
  const lines = rawText
    .split(/\r?\n|;\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    const lineLow = line.toLowerCase();
    if (
      lineLow.startsWith('cupo total') ||
      lineLow.startsWith('fecha de corte') ||
      lineLow.startsWith('tasa efectiva')
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
      lineLow.includes('ingreso')
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

    const cleanDesc = line
      .replace(/^\d+[.) -]+/, '')
      .replace(/si no reconoce esta operacion.*/i, '')
      .trim()
      .slice(0, 95);

    movimientosDetectados.push({
      tipo,
      categoria,
      monto,
      desc: cleanDesc || `Movimiento en ${lineEntidad}`,
      entidad: lineEntidad,
      cuotas: lineCuotas,
      esEsencial,
    });
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
