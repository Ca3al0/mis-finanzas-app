import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Sparkles,
  Calculator,
  Bot,
  Plus,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Lock,
  Unlock,
  Search,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import {
  Transaction,
  CreditObligation,
  TransactionType,
  TransactionCategory,
} from './types/finance';
import { INITIAL_TRANSACTIONS, INITIAL_CREDITS } from './data/sampleData';
import {
  formatCurrency,
  CurrencyCode,
  calculateFinancialMetrics,
} from './utils/financeCalculations';
import {
  validateTransactionsArray,
  validateCreditsArray,
  sanitizeTextInput,
  safePositiveNumber,
  hashPin,
} from './utils/securityAndValidation';
import { ScannerCenter } from './components/ScannerCenter';
import { CreditLifeCenter } from './components/CreditLifeCenter';
import { CalculatorsCenter } from './components/CalculatorsCenter';
import { AdvisorAndMobileCenter } from './components/AdvisorAndMobileCenter';

type MainSection = 'movimientos' | 'escaner' | 'creditos' | 'calculos' | 'asesor';

const STORAGE_KEY_TX = 'finanzas_v2_transactions';
const STORAGE_KEY_CREDITS = 'finanzas_v2_credits';
const STORAGE_KEY_PIN = 'finanzas_v2_pin_hash';

const CATEGORIES_BY_TYPE: Record<TransactionType, TransactionCategory[]> = {
  gasto: [
    'Alimentación y Supermercado',
    'Vivienda y Servicios',
    'Transporte y Gasolina',
    'Entretenimiento y Salidas',
    'Gastos Hormiga / Café / Snacks',
    'Suscripciones Digitales',
    'Salud y Bienestar',
    'Compras y Tecnología',
    'Otros',
  ],
  ganancia: [
    'Salario / Ingreso Principal',
    'Ventas / Negocio / Freelance',
    'Rendimientos / Trading',
    'Otros',
  ],
  deuda: ['Cuota Tarjeta / Crédito', 'Compras y Tecnología', 'Vivienda y Servicios', 'Otros'],
  trading: ['Rendimientos / Trading', 'Otros'],
  pago_credito: ['Cuota Tarjeta / Crédito', 'Otros'],
};

export function App() {
  const [activeSection, setActiveSection] = useState<MainSection>('movimientos');
  const [currency, setCurrency] = useState<CurrencyCode>('COP');

  // Inicialización segura con validación anti-corrupción y migración compatible con 'finanzas_v2' original
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const savedV2 = localStorage.getItem(STORAGE_KEY_TX);
      if (savedV2) {
        const validated = validateTransactionsArray(JSON.parse(savedV2));
        if (validated.length > 0) return validated;
      }
      // Compatibilidad con la llave original 'finanzas_v2' del index.html previo del usuario
      const legacy = localStorage.getItem('finanzas_v2');
      if (legacy) {
        const validatedLegacy = validateTransactionsArray(JSON.parse(legacy));
        if (validatedLegacy.length > 0) return validatedLegacy;
      }
    } catch {
      // Si hay corrupción en localStorage, restaurar base limpia
    }
    return INITIAL_TRANSACTIONS;
  });

  const [credits, setCredits] = useState<CreditObligation[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CREDITS);
      if (saved) {
        const validated = validateCreditsArray(JSON.parse(saved));
        if (validated.length > 0) return validated;
      }
    } catch {
      // Fallback seguro
    }
    return INITIAL_CREDITS;
  });

  // Formulario de registro manual rápido
  const [manTipo, setManTipo] = useState<TransactionType>('gasto');
  const [manCategoria, setManCategoria] = useState<TransactionCategory>('Alimentación y Supermercado');
  const [manMonto, setManMonto] = useState('');
  const [manDesc, setManDesc] = useState('');
  const [manEntidad, setManEntidad] = useState('Nequi');
  const [manEsEsencial, setManEsEsencial] = useState(true);

  // Filtros de movimientos
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState<string>('');

  // Bloqueo opcional por PIN de 4 dígitos para privacidad en el Samsung A36 5G
  const [pinHash, setPinHash] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY_PIN));
  const [isLocked, setIsLocked] = useState<boolean>(() => Boolean(localStorage.getItem(STORAGE_KEY_PIN)));
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPin, setNewPin] = useState('');

  // Evento de instalación nativa Android PWA
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TX, JSON.stringify(transactions));
    } catch {
      // Ignorar si almacenamiento lleno
    }
  }, [transactions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CREDITS, JSON.stringify(credits));
    } catch {
      // Ignorar si almacenamiento lleno
    }
  }, [credits]);

  const metrics = useMemo(
    () => calculateFinancialMetrics(transactions, credits),
    [transactions, credits]
  );

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = safePositiveNumber(manMonto.replace(/[.,]/g, ''), 0);
    const cleanDesc = sanitizeTextInput(manDesc, 140);
    if (montoNum <= 0 || !cleanDesc) return;

    const nuevo: Transaction = {
      id: `tx-${Date.now()}`,
      fecha: new Date().toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      timestamp: Date.now(),
      tipo: manTipo,
      categoria: manCategoria,
      monto: montoNum,
      desc: cleanDesc,
      entidad: sanitizeTextInput(manEntidad, 40) || 'Efectivo / Banco',
      fuente: 'manual',
      esEsencial: manEsEsencial,
    };

    setTransactions((prev) => [nuevo, ...prev]);
    setManMonto('');
    setManDesc('');
  };

  const handleAddMultipleTransactions = (
    items: Omit<Transaction, 'id' | 'fecha' | 'timestamp'>[]
  ) => {
    const nowStr = new Date().toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    const created: Transaction[] = items
      .filter((i) => safePositiveNumber(i.monto, 0) > 0)
      .map((item, idx) => ({
        ...item,
        id: `tx-${Date.now()}-${idx}`,
        fecha: nowStr,
        timestamp: Date.now() + idx,
        monto: safePositiveNumber(item.monto, 0),
        desc: sanitizeTextInput(item.desc, 140),
        entidad: sanitizeTextInput(item.entidad || 'Banco', 40),
      }));

    if (created.length > 0) {
      setTransactions((prev) => [...created, ...prev]);
    }
  };

  const handleMarkDebtPaid = (id: string) => {
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              tipo: 'gasto',
              desc: t.desc.startsWith('✅') ? t.desc : `✅ Pagado: ${t.desc}`,
            }
          : t
      )
    );
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const handleAddOrUpdateCredit = (newCred: Omit<CreditObligation, 'id'>) => {
    setCredits((prev) => {
      const existingIdx = prev.findIndex(
        (c) => c.entidad.toLowerCase() === newCred.entidad.toLowerCase() && c.tipo === newCred.tipo
      );
      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...newCred };
        return updated;
      }
      return [{ ...newCred, id: `cred-${Date.now()}` }, ...prev];
    });
  };

  const handlePayCreditAmount = (id: string, amount: number, nombre: string) => {
    const validAmount = safePositiveNumber(amount, 0);
    if (validAmount <= 0) return;

    setCredits((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, saldoActual: Math.max(0, c.saldoActual - validAmount) }
          : c
      )
    );

    const pagoTx: Transaction = {
      id: `tx-pay-${Date.now()}`,
      fecha: new Date().toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      timestamp: Date.now(),
      tipo: 'pago_credito',
      categoria: 'Cuota Tarjeta / Crédito',
      monto: validAmount,
      desc: `💳 Abono a obligación: ${sanitizeTextInput(nombre, 80)}`,
      entidad: nombre,
      fuente: 'manual',
      esEsencial: true,
    };
    setTransactions((prev) => [pagoTx, ...prev]);
  };

  const handleDeleteCredit = (id: string) => {
    setCredits((prev) => prev.filter((c) => c.id !== id));
  };

  const handleResetOrLoadExample = () => {
    setTransactions(INITIAL_TRANSACTIONS);
    setCredits(INITIAL_CREDITS);
  };

  const handleClearAll = () => {
    if (window.confirm('¿Deseas dejar todos los registros en cero para empezar desde cero?')) {
      setTransactions([]);
      setCredits([]);
    }
  };

  const handleTriggerInstallPrompt = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesType =
        filtroTipo === 'todos' ||
        t.tipo === filtroTipo ||
        (filtroTipo === 'gasto' && t.tipo === 'pago_credito');
      const q = busqueda.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.desc.toLowerCase().includes(q) ||
        t.categoria.toLowerCase().includes(q) ||
        (t.entidad && t.entidad.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [transactions, filtroTipo, busqueda]);

  // Pantalla de desbloqueo por PIN si el usuario activó el candado de privacidad en su Samsung A36 5G
  if (isLocked && pinHash) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 text-indigo-400" />
          </div>
          <h1 className="text-lg font-bold text-white">Mis Finanzas Protegidas</h1>
          <p className="text-xs text-slate-400">
            Ingresa tu PIN de 4 dígitos para desbloquear tu información financiera en tu Samsung A36 5G
          </p>
          <input
            type="password"
            maxLength={4}
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value);
              setPinError('');
            }}
            placeholder="••••"
            className="w-full text-center tracking-[0.6em] text-xl font-bold bg-slate-950 border border-slate-700 rounded-xl py-3 text-white"
          />
          {pinError && <p className="text-xs text-rose-400">{pinError}</p>}
          <button
            type="button"
            onClick={() => {
              if (hashPin(pinInput) === pinHash) {
                setIsLocked(false);
                setPinInput('');
              } else {
                setPinError('PIN incorrecto. Intenta nuevamente.');
              }
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-sm transition"
          >
            Desbloquear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 pb-24">
      {/* Cabecera Superior */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-600 flex items-center justify-center shadow-md">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Mis Finanzas y Vida Crediticia
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                  <Smartphone className="w-3 h-3" /> Samsung A36 5G Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Control personal de compras, notificaciones, extractos PDF, cálculos y deudas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              aria-label="Moneda"
              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 font-semibold"
            >
              <option value="COP">🇨🇴 COP ($)</option>
              <option value="USD">🇺🇸 USD ($)</option>
              <option value="MXN">🇲🇽 MXN ($)</option>
              <option value="EUR">🇪🇺 EUR (€)</option>
            </select>

            <button
              type="button"
              onClick={() => setShowPinSetup(!showPinSetup)}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs flex items-center gap-1"
              title="Configurar PIN de privacidad"
            >
              {pinHash ? <Lock className="w-3.5 h-3.5 text-emerald-400" /> : <Unlock className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{pinHash ? 'PIN Activo' : 'PIN'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetOrLoadExample}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/70 border border-indigo-700/50 text-indigo-300 text-xs font-semibold flex items-center gap-1"
              title="Cargar datos de ejemplo"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Datos Ejemplo</span>
            </button>

            <button
              type="button"
              onClick={handleClearAll}
              className="px-2.5 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 border border-rose-800/60 text-rose-300 text-xs font-semibold"
            >
              En Cero
            </button>
          </div>
        </div>

        {/* Configuración rápida de PIN local */}
        {showPinSetup && (
          <div className="max-w-5xl mx-auto mt-2 p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-300">
              🔒 Protege la app en tu Samsung A36 5G con un PIN local de 4 dígitos:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="password"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4 dígitos"
                className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-center text-white font-bold"
              />
              <button
                type="button"
                onClick={() => {
                  if (newPin.length === 4) {
                    const h = hashPin(newPin);
                    localStorage.setItem(STORAGE_KEY_PIN, h);
                    setPinHash(h);
                    setNewPin('');
                    setShowPinSetup(false);
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded-lg"
              >
                Guardar PIN
              </button>
              {pinHash && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(STORAGE_KEY_PIN);
                    setPinHash(null);
                    setShowPinSetup(false);
                  }}
                  className="bg-rose-950 text-rose-300 border border-rose-800 px-2.5 py-1 rounded-lg"
                >
                  Quitar PIN
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-4 space-y-4">
        {/* Tarjetas Principales de Resumen Financiero y Crediticio */}
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Balance Disponible
            </span>
            <div
              className={`text-lg sm:text-xl font-extrabold mt-1 ${
                metrics.balanceDisponible >= 0 ? 'text-white' : 'text-rose-400'
              }`}
            >
              {formatCurrency(metrics.balanceDisponible, currency)}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">Flujo neto libre</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" /> Ganancias / Ingresos
            </span>
            <div className="text-lg sm:text-xl font-extrabold text-emerald-400 mt-1">
              {formatCurrency(metrics.totalGanancias, currency)}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">Abonos y nómina</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-rose-400" /> Compras / Gastos
            </span>
            <div className="text-lg sm:text-xl font-extrabold text-rose-400 mt-1">
              {formatCurrency(metrics.totalGastos, currency)}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Prom: {formatCurrency(metrics.promedioGastoDiario, currency)}/día
            </span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-amber-400" /> Deuda Total Activa
            </span>
            <div className="text-lg sm:text-xl font-extrabold text-amber-400 mt-1">
              {formatCurrency(metrics.deudaTotalObligaciones, currency)}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Uso cupo: {metrics.porcentajeUtilizacionCupo.toFixed(0)}%
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-3.5 flex sm:block items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-indigo-400" /> Score Crediticio
              </span>
              <div className="text-lg sm:text-xl font-extrabold text-indigo-400 mt-1">
                {metrics.scoreEstimado} <span className="text-xs font-normal text-slate-400">pts</span>
              </div>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Trading: {formatCurrency(metrics.totalTrading, currency)}
            </span>
          </div>
        </section>

        {/* Navegación Principal de Módulos */}
        <nav className="flex overflow-x-auto gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800">
          {[
            { id: 'movimientos', label: 'Movimientos y Registro', icon: Wallet },
            { id: 'escaner', label: 'Escáner Notif / PDF / Fotos', icon: Sparkles },
            { id: 'creditos', label: 'Vida Crediticia y Prioridades', icon: CreditCard },
            { id: 'calculos', label: 'Cálculos, Promedios y Cuotas', icon: Calculator },
            { id: 'asesor', label: 'Asesor, Ejemplos y Descarga A36', icon: Bot },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id as MainSection)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* SECCIÓN 1: MOVIMIENTOS Y REGISTRO RÁPIDO */}
        {activeSection === 'movimientos' && (
          <div className="space-y-4">
            {/* Acceso directo al escáner */}
            <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-emerald-950/60 border border-indigo-500/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  ¿Tienes una notificación de Nequi/Bancolombia, un recibo en foto o un extracto en PDF?
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Analízalo automáticamente para extraer compras, pagos, tasas E.A., promedios y ejemplos de ahorro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('escaner')}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow transition shrink-0"
              >
                Abrir Escáner Inteligente →
              </button>
            </div>

            {/* Formulario de Registro Manual */}
            <form
              onSubmit={handleManualSubmit}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3"
            >
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-400" />
                Registro Manual de Movimiento
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Tipo</label>
                  <select
                    value={manTipo}
                    onChange={(e) => {
                      const t = e.target.value as TransactionType;
                      setManTipo(t);
                      setManCategoria(CATEGORIES_BY_TYPE[t][0]);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="gasto">🛒 Compra / Gasto</option>
                    <option value="ganancia">💰 Ganancia / Ingreso</option>
                    <option value="deuda">⏳ Deuda / Crédito</option>
                    <option value="trading">📈 Trading / Inversión</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Categoría</label>
                  <select
                    value={manCategoria}
                    onChange={(e) => setManCategoria(e.target.value as TransactionCategory)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {CATEGORIES_BY_TYPE[manTipo].map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Monto ($)</label>
                  <input
                    type="number"
                    required
                    value={manMonto}
                    onChange={(e) => setManMonto(e.target.value)}
                    placeholder="Ej: 50000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Banco / Medio</label>
                  <input
                    type="text"
                    value={manEntidad}
                    onChange={(e) => setManEntidad(e.target.value)}
                    placeholder="Nequi, Bancolombia, Nu..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  required
                  value={manDesc}
                  onChange={(e) => setManDesc(e.target.value)}
                  placeholder="Descripción (ej. Supermercado Éxito, Pago factura luz, Venta producto)"
                  className="flex-1 min-w-[220px] bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />

                {manTipo === 'gasto' && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manEsEsencial}
                      onChange={(e) => setManEsEsencial(e.target.checked)}
                      className="accent-indigo-500"
                    />
                    Gasto esencial (Necesidad)
                  </label>
                )}

                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition"
                >
                  Guardar Movimiento
                </button>
              </div>
            </form>

            {/* Listado y Filtro de Movimientos */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex overflow-x-auto gap-1">
                  {[
                    { id: 'todos', label: 'Todos' },
                    { id: 'gasto', label: '🛒 Compras' },
                    { id: 'ganancia', label: '💰 Ganancias' },
                    { id: 'deuda', label: '⏳ Deudas' },
                    { id: 'trading', label: '📈 Trading' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFiltroTipo(t.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        filtroTipo === t.id
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white bg-slate-950'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar comercio, banco o categoría..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              {filteredTransactions.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-8">
                  No hay movimientos en esta vista. Usa el formulario o el Escáner Inteligente para registrar.
                </p>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {filteredTransactions.map((m) => (
                    <div
                      key={m.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <strong className="text-white text-sm">{m.desc}</strong>
                          {m.entidad && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                              {m.entidad}
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300">
                            {m.categoria}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                          <span>{m.fecha}</span>
                          <span>•</span>
                          <span className="uppercase">{m.fuente}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <strong
                          className={`text-sm font-extrabold ${
                            m.tipo === 'ganancia'
                              ? 'text-emerald-400'
                              : m.tipo === 'deuda'
                              ? 'text-amber-400'
                              : m.tipo === 'trading'
                              ? 'text-indigo-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {m.tipo === 'ganancia' ? '+' : '-'}
                          {formatCurrency(m.monto, currency)}
                        </strong>

                        {m.tipo === 'deuda' && (
                          <button
                            type="button"
                            onClick={() => handleMarkDebtPaid(m.id)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Pagar
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteTransaction(m.id)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                          title="Eliminar registro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECCIÓN 2: ESCÁNER MULTIMODAL (NOTIFICACIONES, IMÁGENES, PDF, CORREOS) */}
        {activeSection === 'escaner' && (
          <ScannerCenter
            currency={currency}
            onAddTransactions={(items) => {
              handleAddMultipleTransactions(items);
            }}
            onAddOrUpdateCredit={handleAddOrUpdateCredit}
          />
        )}

        {/* SECCIÓN 3: VIDA CREDITICIA, TARJETAS Y PRIORIZADOR DE DEUDAS */}
        {activeSection === 'creditos' && (
          <CreditLifeCenter
            currency={currency}
            credits={credits}
            scoreEstimado={metrics.scoreEstimado}
            porcentajeUtilizacionCupo={metrics.porcentajeUtilizacionCupo}
            cupoTotalTarjetas={metrics.cupoTotalTarjetas}
            saldoTotalTarjetas={metrics.saldoTotalTarjetas}
            indiceEndeudamientoMensual={metrics.indiceEndeudamientoMensual}
            interesesMensualesEstimados={metrics.interesesMensualesEstimados}
            onAddCredit={handleAddOrUpdateCredit}
            onPayCreditAmount={handlePayCreditAmount}
            onDeleteCredit={handleDeleteCredit}
          />
        )}

        {/* SECCIÓN 4: CÁLCULOS, PROMEDIOS, REGLA 50/30/20 Y SIMULADOR DE CUOTAS */}
        {activeSection === 'calculos' && (
          <CalculatorsCenter
            currency={currency}
            totalGanancias={metrics.totalGanancias}
            totalGastos={metrics.totalGastos}
            gastosEsenciales={metrics.gastosEsenciales}
            gastosDeseos={metrics.gastosDeseos}
            gastosHormiga={metrics.gastosHormiga}
            totalTrading={metrics.totalTrading}
            promedioPorCompra={metrics.promedioPorCompra}
            promedioGastoDiario={metrics.promedioGastoDiario}
            promedioGastoSemanal={metrics.promedioGastoSemanal}
            categoriasOrdenadas={metrics.categoriasOrdenadas}
          />
        )}

        {/* SECCIÓN 5: ASESOR, EJEMPLOS Y CENTRO NATIVO SAMSUNG GALAXY A36 5G */}
        {activeSection === 'asesor' && (
          <AdvisorAndMobileCenter
            currency={currency}
            transactions={transactions}
            credits={credits}
            financialSnapshot={metrics}
            onImportBackup={({ transactions: tx, credits: cr }) => {
              setTransactions(tx);
              setCredits(cr);
            }}
            installPromptEvent={installPromptEvent}
            onTriggerInstallPrompt={handleTriggerInstallPrompt}
          />
        )}
      </main>
    </div>
  );
}
export default App;
