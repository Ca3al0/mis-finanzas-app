import { Transaction, CreditObligation, TransactionType, TransactionCategory, SourceType } from '../types/finance';

/**
 * Escapa caracteres HTML peligrosos para prevenir ataques XSS (Cross-Site Scripting)
 * al exportar reportes o renderizar textos provenientes de notificaciones/correos externos.
 */
export function escapeHtml(unsafe: string): string {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Limpia texto de entrada eliminando caracteres de control invisibles o scripts inyectados
 */
export function sanitizeTextInput(input: string, maxLength = 8000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Valida un número financiero asegurando que sea finito, positivo y dentro de un rango seguro
 */
export function safePositiveNumber(val: unknown, fallback = 0, max = 99999999999): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || isNaN(num) || num < 0) return fallback;
  return Math.min(num, max);
}

const VALID_TYPES: TransactionType[] = ['gasto', 'ganancia', 'deuda', 'trading', 'pago_credito'];
const VALID_SOURCES: SourceType[] = ['manual', 'notificacion', 'imagen', 'pdf', 'correo'];

/**
 * Valida y repara cualquier registro de movimiento corrupto en localStorage o archivo JSON importado
 */
export function validateTransactionsArray(raw: unknown): Transaction[] {
  if (!Array.isArray(raw)) return [];
  const valid: Transaction[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const monto = safePositiveNumber(obj.monto, 0);
    if (monto <= 0) continue;

    const tipo = VALID_TYPES.includes(obj.tipo as TransactionType)
      ? (obj.tipo as TransactionType)
      : 'gasto';

    const fuente = VALID_SOURCES.includes(obj.fuente as SourceType)
      ? (obj.fuente as SourceType)
      : 'manual';

    valid.push({
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.slice(0, 64) : `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fecha: sanitizeTextInput(String(obj.fecha || 'Hoy'), 40),
      timestamp: safePositiveNumber(obj.timestamp, Date.now()),
      tipo,
      categoria: (sanitizeTextInput(String(obj.categoria || 'Otros'), 60) as TransactionCategory) || 'Otros',
      monto,
      desc: sanitizeTextInput(String(obj.desc || 'Movimiento financiero'), 160),
      entidad: sanitizeTextInput(String(obj.entidad || 'General'), 50),
      cuotas: Math.max(1, Math.min(120, Math.round(safePositiveNumber(obj.cuotas, 1)))),
      tasaEA: Math.min(100, safePositiveNumber(obj.tasaEA, 0)),
      fuente,
      esEsencial: Boolean(obj.esEsencial),
    });
  }

  return valid;
}

/**
 * Valida y repara obligaciones crediticias evitando divisiones por cero o tasas inválidas
 */
export function validateCreditsArray(raw: unknown): CreditObligation[] {
  if (!Array.isArray(raw)) return [];
  const valid: CreditObligation[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const nombre = sanitizeTextInput(String(obj.nombre || ''), 80);
    if (!nombre) continue;

    valid.push({
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.slice(0, 64) : `cred-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nombre,
      entidad: sanitizeTextInput(String(obj.entidad || 'Banco'), 50),
      tipo: ['tarjeta_credito', 'prestamo_personal', 'credito_vehiculo', 'hipotecario', 'compra_cartera'].includes(String(obj.tipo))
        ? (obj.tipo as CreditObligation['tipo'])
        : 'tarjeta_credito',
      cupoTotal: safePositiveNumber(obj.cupoTotal, 0),
      saldoActual: safePositiveNumber(obj.saldoActual, 0),
      tasaEA: Math.max(0, Math.min(120, safePositiveNumber(obj.tasaEA, 28.0))),
      cuotaMinima: safePositiveNumber(obj.cuotaMinima, 50000),
      diaCorte: Math.max(1, Math.min(31, Math.round(safePositiveNumber(obj.diaCorte, 15)))),
      diaPago: Math.max(1, Math.min(31, Math.round(safePositiveNumber(obj.diaPago, 2)))),
      enMora: Boolean(obj.enMora),
      notas: obj.notas ? sanitizeTextInput(String(obj.notas), 200) : undefined,
    });
  }

  return valid;
}

/**
 * Hash ligero de PIN de 4 dígitos para bloqueo de privacidad local en el Samsung Galaxy A36 5G
 */
export function hashPin(pin: string): string {
  let h = 2166136261;
  const salted = `a36-finanzas-salt-${pin.trim()}`;
  for (let i = 0; i < salted.length; i++) {
    h ^= salted.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
