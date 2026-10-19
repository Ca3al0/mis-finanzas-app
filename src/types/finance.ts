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
  | 'Ahorro para Meta'
  | 'Otros';

export type SourceType = 'manual' | 'notificacion' | 'imagen' | 'pdf' | 'correo' | 'automatico';

export type CaptureTimeframeMode = 'desde_ahora' | 'solo_hoy' | 'fecha_personalizada' | 'ultimos_dias';

export interface NotificationCapturePolicy {
  modoPlazo: CaptureTimeframeMode;
  desdeFechaISO: string; // formato YYYY-MM-DDTHH:mm
  ultimosDias: number; // ej. 1, 3, 7, 15, 30
  timestampCorteMs: number; // sello de tiempo exacto desde el cual se permiten notificaciones
  ignorarNotificacionesAntiguas: boolean;
  evitarDuplicadosMismaCompra: boolean;
  ventanaAntiduplicadosMinutos: number; // ej. 15, 60, 360, 1440 (24h)
}

export interface ProcessedNotificationRecord {
  id: string;
  timestamp: number;
  fechaStr: string;
  fuente: SourceType;
  entidad: string;
  textoOriginal: string;
  resumen: string;
  montoTotal: number;
  tipoPrincipal: TransactionType;
  categoriaPrincipal: TransactionCategory;
  itemsCount: number;
  fingerprint?: string;
}

export interface SalaryProfile {
  salarioMensualNeto: number;
  otrosIngresosFijos: number;
  frecuenciaPago: 'mensual' | 'quincenal' | 'semanal';
  diaPago1: number;
  diaPago2?: number;
  metaAhorroPorcentaje: number; // ej. 20%
}

export interface RecurringPayment {
  id: string;
  nombre: string; // Ej: Arriendo, Internet Hogar, Luz, Gimnasio
  monto: number;
  diaVencimiento: number; // 1 - 31
  categoria: TransactionCategory;
  pagadoEsteMes: boolean;
  ultimoPagoFecha?: string;
}

export interface FinancialGoal {
  id: string;
  nombre: string; // Ej: Fondo de Emergencia, Comprar Moto, Viaje
  montoObjetivo: number;
  montoAhorrado: number;
  plazoMeses: number;
  prioridad: 'alta' | 'media' | 'baja';
}

export interface Transaction {
  id: string;
  fecha: string;
  timestamp: number;
  tipo: TransactionType;
  categoria: TransactionCategory;
  monto: number;
  desc: string;
  entidad?: string;
  cuotas?: number;
  tasaEA?: number;
  fuente: SourceType;
  esEsencial?: boolean;
  fingerprint?: string;
}

export interface CreditObligation {
  id: string;
  nombre: string;
  entidad: string;
  tipo: 'tarjeta_credito' | 'prestamo_personal' | 'credito_vehiculo' | 'hipotecario' | 'compra_cartera';
  cupoTotal: number;
  saldoActual: number;
  tasaEA: number;
  cuotaMinima: number;
  diaCorte: number;
  diaPago: number;
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

export interface AdvisorActionCommand {
  tipoAccion: 'actualizar_salario' | 'agregar_pago_fijo' | 'agregar_meta' | 'registrar_movimiento' | 'agregar_deuda';
  datos: Record<string, any>;
  descripcionConfirmacion: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actionsExecuted?: string[];
}
