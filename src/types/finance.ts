export type TransactionType = 'gasto' | 'ganancia' | 'deuda' | 'trading' | 'pago_credito';

export type TransactionCategory =
  | 'Alimentación y Supermercado'
  | 'Vivienda y Servicios'
  | 'Transporte y Gasolina'
  | 'Salud y Bienestar'
  | 'Entretenimiento y Salidas'
  | 'Compras y Tecnología'
  | 'Gastos Hormiga / Café / Snacks'
  | 'Suscripciones Digitales'
  | 'Salario / Ingreso Principal'
  | 'Ventas / Negocio / Freelance'
  | 'Rendimientos / Trading'
  | 'Cuota Tarjeta / Crédito'
  | 'Otros';

export type SourceType = 'manual' | 'notificacion' | 'imagen' | 'pdf' | 'correo';

export interface Transaction {
  id: string;
  fecha: string; // ISO date or display date
  timestamp: number;
  tipo: TransactionType;
  categoria: TransactionCategory;
  monto: number;
  desc: string;
  entidad?: string; // Ej: Nequi, Bancolombia, Nu, Daviplata, BBVA
  cuotas?: number;
  tasaEA?: number;
  fuente: SourceType;
  esEsencial?: boolean; // Para regla 50/30/20 (Necesidad vs Deseo)
}

export interface CreditObligation {
  id: string;
  nombre: string; // Ej: Tarjeta Nu, Mastercard Bancolombia, Crédito Vehículo
  entidad: string;
  tipo: 'tarjeta_credito' | 'prestamo_personal' | 'credito_vehiculo' | 'hipotecario' | 'compra_cartera';
  cupoTotal: number; // 0 si es préstamo fijo, >0 si es tarjeta rotativa
  saldoActual: number;
  tasaEA: number; // Efectiva Anual % (ej. 28.5)
  cuotaMinima: number;
  diaCorte: number; // 1 - 31
  diaPago: number; // 1 - 31
  enMora: boolean;
  notas?: string;
}

export interface ExtractedTransactionItem {
  tipo: TransactionType;
  categoria: TransactionCategory;
  monto: number;
  desc: string;
  entidad: string;
  fecha?: string;
  cuotas?: number;
  esEsencial?: boolean;
}

export interface ExtractedCreditSummary {
  entidad?: string;
  cupoTotal?: number;
  saldoActual?: number;
  pagoMinimo?: number;
  fechaLimitePago?: string;
  tasaEA?: number;
  cuotaManejo?: number;
  segurosCobrosOcultos?: number;
  alertaUsura?: boolean;
}

export interface AIAnalysisResult {
  resumenEjecutivo: string;
  tipoDocumentoDetectado: string;
  nivelRiesgo: 'bajo' | 'medio' | 'alto';
  movimientosDetectados: ExtractedTransactionItem[];
  datosExtractoCredito?: ExtractedCreditSummary;
  alertasFinancieras: string[];
  recomendacionesPrioritarias: string[];
  ejemploPracticoAhorro: string;
  calculosRealizados: {
    etiqueta: string;
    valor: string;
    explicacion: string;
  }[];
  motorUsado?: 'gemini-ai' | 'heuristica-local';
}

export interface DebtPayoffStep {
  orden: number;
  idDeuda: string;
  nombre: string;
  entidad: string;
  saldoActual: number;
  tasaEA: number;
  tasaMV: number;
  cuotaMinima: number;
  abonoSugeridoMes1: number;
  mesesEstimadosLiquidacion: number;
  interesesTotalesEstimados: number;
  razonPrioridad: string;
}

export interface PayoffComparison {
  avalancha: {
    pasos: DebtPayoffStep[];
    mesesTotales: number;
    interesesTotales: number;
    ahorroInteresesVsMinimo: number;
    mesesAhorradosVsMinimo: number;
    explicacion: string;
  };
  bolaDeNieve: {
    pasos: DebtPayoffStep[];
    mesesTotales: number;
    interesesTotales: number;
    ahorroInteresesVsMinimo: number;
    mesesAhorradosVsMinimo: number;
    explicacion: string;
  };
  soloPagosMinimos: {
    mesesTotales: number;
    interesesTotales: number;
  };
}
