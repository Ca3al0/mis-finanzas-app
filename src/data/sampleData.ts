import { Transaction, CreditObligation } from '../types/finance';

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    fecha: '15 oct, 08:30',
    timestamp: Date.now() - 86400000 * 3,
    tipo: 'ganancia',
    categoria: 'Salario / Ingreso Principal',
    monto: 4800000,
    desc: 'Abono Nómina Quincenal + Bonificación',
    entidad: 'Bancolombia',
    fuente: 'notificacion',
    esEsencial: true,
  },
  {
    id: 'tx-2',
    fecha: '15 oct, 14:20',
    timestamp: Date.now() - 86400000 * 2.5,
    tipo: 'gasto',
    categoria: 'Alimentación y Supermercado',
    monto: 485000,
    desc: '📲 Compra en Éxito Wow por $485.000 con T. Débito',
    entidad: 'Bancolombia',
    fuente: 'notificacion',
    esEsencial: true,
  },
  {
    id: 'tx-3',
    fecha: '16 oct, 09:15',
    timestamp: Date.now() - 86400000 * 2,
    tipo: 'gasto',
    categoria: 'Vivienda y Servicios',
    monto: 1350000,
    desc: 'Pago Arriendo + Administración Apto',
    entidad: 'Nequi',
    fuente: 'correo',
    esEsencial: true,
  },
  {
    id: 'tx-4',
    fecha: '16 oct, 18:45',
    timestamp: Date.now() - 86400000 * 1.5,
    tipo: 'gasto',
    categoria: 'Gastos Hormiga / Café / Snacks',
    monto: 38500,
    desc: '📲 Compra Juan Valdez Café + Postre',
    entidad: 'Nequi',
    fuente: 'notificacion',
    esEsencial: false,
  },
  {
    id: 'tx-5',
    fecha: '17 oct, 11:00',
    timestamp: Date.now() - 86400000 * 1,
    tipo: 'trading',
    categoria: 'Rendimientos / Trading',
    monto: 420000,
    desc: '📈 Inversión ETF S&P 500 + Cajita Nu (12% E.A.)',
    entidad: 'Nu Colombia / Broker',
    fuente: 'manual',
    esEsencial: false,
  },
  {
    id: 'tx-6',
    fecha: '17 oct, 16:10',
    timestamp: Date.now() - 3600000 * 6,
    tipo: 'gasto',
    categoria: 'Suscripciones Digitales',
    monto: 64900,
    desc: '📧 Cobro automático Netflix + Spotify Duo',
    entidad: 'Tarjeta Nu',
    fuente: 'correo',
    esEsencial: false,
  },
  {
    id: 'tx-7',
    fecha: '17 oct, 19:20',
    timestamp: Date.now() - 3600000 * 2,
    tipo: 'deuda',
    categoria: 'Compras y Tecnología',
    monto: 245000,
    desc: '⏳ Cuota pendiente Monitor Ultrawide (3 de 6 cuotas)',
    entidad: 'Tarjeta Nu',
    cuotas: 6,
    tasaEA: 27.9,
    fuente: 'pdf',
    esEsencial: false,
  },
];

export const INITIAL_CREDITS: CreditObligation[] = [
  {
    id: 'cred-1',
    nombre: 'Tarjeta de Crédito Nu (Moradita)',
    entidad: 'Nu Colombia',
    tipo: 'tarjeta_credito',
    cupoTotal: 6000000,
    saldoActual: 2150000,
    tasaEA: 28.45,
    cuotaMinima: 280000,
    diaCorte: 15,
    diaPago: 2,
    enMora: false,
    notas: 'Sin cuota de manejo ($0). Compras diferidas a 6 cuotas generan interés alto.',
  },
  {
    id: 'cred-2',
    nombre: 'Mastercard Clásica Bancolombia',
    entidad: 'Bancolombia',
    tipo: 'tarjeta_credito',
    cupoTotal: 8000000,
    saldoActual: 1450000,
    tasaEA: 29.1,
    cuotaMinima: 210000,
    diaCorte: 20,
    diaPago: 5,
    enMora: false,
    notas: 'Cuota de manejo mensual de $29.900 + seguro de deudores $8.500.',
  },
  {
    id: 'cred-3',
    nombre: 'Crédito Libre Inversión Davivienda',
    entidad: 'Davivienda',
    tipo: 'prestamo_personal',
    cupoTotal: 10000000,
    saldoActual: 4200000,
    tasaEA: 19.8,
    cuotaMinima: 390000,
    diaCorte: 1,
    diaPago: 10,
    enMora: false,
    notas: 'Tasa fija más baja que las tarjetas de crédito.',
  },
];

export const SAMPLE_NOTIFICATIONS = [
  {
    titulo: '📲 Notificación Compra Bancolombia',
    entidad: 'Bancolombia',
    texto: 'Bancolombia le informa Compra por $148.900 en RESTAURANTE CREPES Y WAFFLES el 17/10/2026 19:45 con su T.Cred *4829 a 3 cuotas. Si no reconoce esta operacion llame al 018000912345.',
  },
  {
    titulo: '💜 Notificación Abono Nequi',
    entidad: 'Nequi',
    texto: '¡Te llegó plata! Recibiste $650.000 de CARLOS ANDRES GOMEZ en tu Nequi por concepto de Pago diseño web freelance. Tu nuevo saldo disponible está listo.',
  },
  {
    titulo: '🟣 Notificación Compra Tarjeta Nu',
    entidad: 'Nu Colombia',
    texto: 'Nu: Compra aprobada por $89.900 en MERCADOLIBRE COLOMBIA con tu Tarjeta Nu física a 1 cuota (0% interés si pagas el total antes del 02/Nov).',
  },
  {
    titulo: '❤️ Notificación Retiro / Pago Daviplata',
    entidad: 'Daviplata',
    texto: 'DaviPlata: Pagaste $112.400 en Factura Enel Codensa Energia desde tu DaviPlata el 17/10/2026. Ref: 8839201.',
  },
];

export const SAMPLE_STATEMENTS_AND_EMAILS = [
  {
    titulo: '📄 Extracto Tarjeta de Crédito (Simulación PDF)',
    tipo: 'pdf' as const,
    texto: `EXTRACTO MENSUAL TARJETA DE CRÉDITO MASTERCARD BANCOLOMBIA
Fecha de corte: 15 de Octubre 2026 | Fecha límite de pago: 02 de Noviembre 2026
Cupo Total Asignado: $8.000.000 | Cupo Utilizado: $3.840.000 | Cupo Disponible: $4.160.000
Pago Mínimo del Mes: $415.000 | Pago Total para no generar intereses: $3.840.000
Tasa Efectiva Anual (E.A.) vigente: 28.95% E.A. (Equivalente a 2.14% M.V.)

DETALLE DE MOVIMIENTOS DEL PERIODO:
1. 02/10/2026 - SUPERMERCADO CARULLA - $320.000 (Diferido a 1 cuota)
2. 05/10/2026 - ALKOSTO TECNOLOGIA AUDIFONOS - $780.000 (Diferido a 6 cuotas - Tasa 28.95% E.A.)
3. 09/10/2026 - UBER TRIPS SEMANA - $94.500 (Diferido a 3 cuotas)
4. 12/10/2026 - RAPPI PRIME + PEDIDOS - $165.000 (Diferido a 2 cuotas)
5. 15/10/2026 - CUOTA DE MANEJO TARJETA - $31.900
6. 15/10/2026 - SEGURO DEUDORES Y PROTECCIÓN - $12.400
7. 15/10/2026 - INTERESES CORRIENTES DEL MES - $78.600`,
  },
  {
    titulo: '📧 Correo de Alerta Crediticia y Servicios Públicos',
    tipo: 'correo' as const,
    texto: `Asunto: Resumen de tus obligaciones próximas a vencer y reporte de tu puntaje crediticio
Hola, te enviamos el resumen de tus pagos programados esta semana:
- Factura Internet Fibra + Móvil Claro: $145.900 (Vence el 22 de Octubre).
- Cuota Crédito Libre Inversión Davivienda: $390.000 (Vence el 25 de Octubre, Tasa 19.8% E.A.).
- Suscripción Amazon Prime + Disney+: $49.800 cargados automáticamente a tu tarjeta terminada en *9012.
Nota de tu vida crediticia: Tu utilización de cupo en tarjetas subió al 48% este mes. Recuerda mantenerla por debajo del 30% antes del día de corte para subir más de 45 puntos en tu score crediticio.`,
  },
];
