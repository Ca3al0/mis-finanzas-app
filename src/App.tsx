import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Calculator,
  Bot,
  Plus,
  Trash2,
  CheckCircle2,
  Lock,
  Unlock,
  Search,
  Bell,
  ShieldCheck,
  Calendar,
  SlidersHorizontal,
  X,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  Transaction,
  CreditObligation,
  TransactionType,
  TransactionCategory,
  SalaryProfile,
  RecurringPayment,
  FinancialGoal,
  AdvisorActionCommand,
  ProcessedNotificationRecord,
  NotificationCapturePolicy,
} from './types/finance';
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
import {
  runOnDeviceFinancialAnalysis,
  isNotificationOlderThanPolicy,
  isDuplicatePurchase,
  deduplicateTransactionsList,
  getPolicyCutoffTimestamp,
  buildPurchaseFingerprint,
} from './utils/localAnalyzer';
import { SalaryBillsGoalsCenter } from './components/SalaryBillsGoalsCenter';
import { ScannerCenter } from './components/ScannerCenter';
import { CreditLifeCenter } from './components/CreditLifeCenter';
import { CalculatorsCenter } from './components/CalculatorsCenter';
import { AdvisorAndMobileCenter } from './components/AdvisorAndMobileCenter';

type MainSection = 'mimes' | 'escaner' | 'calculos' | 'creditos' | 'asesor';
type HomeSubTab = 'movimientos' | 'pagos' | 'salario' | 'metas';

const STORAGE_KEY_TX = 'mis_finanzas_real_tx_v3';
const STORAGE_KEY_CREDITS = 'mis_finanzas_real_credits_v3';
const STORAGE_KEY_SALARY = 'mis_finanzas_real_salary_v3';
const STORAGE_KEY_BILLS = 'mis_finanzas_real_bills_v3';
const STORAGE_KEY_GOALS = 'mis_finanzas_real_goals_v3';
const STORAGE_KEY_SCAN_HISTORY = 'mis_finanzas_scanner_history_v3';
const STORAGE_KEY_CAPTURE_POLICY = 'mis_finanzas_capture_policy_v3';
const STORAGE_KEY_PIN = 'finanzas_v2_pin_hash';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_SALARY: SalaryProfile = {
  salarioMensualNeto: 0,
  otrosIngresosFijos: 0,
  frecuenciaPago: 'mensual',
  diaPago1: 15,
  diaPago2: 30,
  metaAhorroPorcentaje: 20,
};

function createDefaultCapturePolicy(): NotificationCapturePolicy {
  const now = Date.now();
  const tzOffsetMs = new Date().getTimezoneOffset() * 60000;
  const localIso = new Date(now - tzOffsetMs).toISOString().slice(0, 16);
  return {
    ignorarNotificacionesAntiguas: true,
    modoPlazo: 'solo_hoy',
    desdeFechaISO: localIso,
    ultimosDias: 7,
    timestampCorteMs: now,
    evitarDuplicadosMismaCompra: true,
    ventanaAntiduplicadosMinutos: 60,
  };
}

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
  const [activeSection, setActiveSection] = useState<MainSection>('mimes');
  const [homeSubTab, setHomeSubTab] = useState<HomeSubTab>('movimientos');
  const [showAddTxModal, setShowAddTxModal] = useState<boolean>(false);
  const [currency, setCurrency] = useState<CurrencyCode>('COP');

  // Política de plazo de fecha y anti-duplicados de notificaciones
  const [capturePolicy, setCapturePolicy] = useState<NotificationCapturePolicy>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CAPTURE_POLICY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...createDefaultCapturePolicy(),
          ...parsed,
        };
      }
    } catch {
      // ignore
    }
    return createDefaultCapturePolicy();
  });

  const [blockedDuplicatesCount, setBlockedDuplicatesCount] = useState<number>(0);
  const [blockedOldCount, setBlockedOldCount] = useState<number>(0);

  // 1. Transacciones reales del usuario (con limpieza inicial de duplicados)
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const savedV3 = localStorage.getItem(STORAGE_KEY_TX);
      if (savedV3) {
        const validated = validateTransactionsArray(JSON.parse(savedV3), true);
        return deduplicateTransactionsList(validated, 60).cleaned;
      }
      const savedV2 = localStorage.getItem('finanzas_v2_transactions');
      if (savedV2) {
        const validated = validateTransactionsArray(JSON.parse(savedV2), true);
        return deduplicateTransactionsList(validated, 60).cleaned;
      }
    } catch {
      // Base limpia
    }
    return [];
  });

  // 2. Obligaciones crediticias reales
  const [credits, setCredits] = useState<CreditObligation[]>(() => {
    try {
      const savedV3 = localStorage.getItem(STORAGE_KEY_CREDITS);
      if (savedV3) {
        return validateCreditsArray(JSON.parse(savedV3), true);
      }
      const savedV2 = localStorage.getItem('finanzas_v2_credits');
      if (savedV2) {
        return validateCreditsArray(JSON.parse(savedV2), true);
      }
    } catch {
      // Base limpia
    }
    return [];
  });

  // 3. Salario mensual
  const [salaryProfile, setSalaryProfile] = useState<SalaryProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SALARY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          salarioMensualNeto: safePositiveNumber(parsed.salarioMensualNeto, 0),
          otrosIngresosFijos: safePositiveNumber(parsed.otrosIngresosFijos, 0),
          frecuenciaPago: parsed.frecuenciaPago || 'mensual',
          diaPago1: parsed.diaPago1 || 15,
          diaPago2: parsed.diaPago2 || 30,
          metaAhorroPorcentaje: parsed.metaAhorroPorcentaje || 20,
        };
      }
    } catch {
      // ignore
    }
    return DEFAULT_SALARY;
  });

  // 4. Pagos fijos mensuales
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_BILLS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  // 5. Metas financieras
  const [goals, setGoals] = useState<FinancialGoal[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_GOALS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  // 6. Historial de notificaciones (30 días)
  const [processedNotificationsHistory, setProcessedNotificationsHistory] = useState<
    ProcessedNotificationRecord[]
  >(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SCAN_HISTORY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const cutoff = Date.now() - THIRTY_DAYS_MS;
          return parsed.filter((item) => item && typeof item.timestamp === 'number' && item.timestamp >= cutoff);
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  const transactionsRef = useRef<Transaction[]>(transactions);
  const historyRef = useRef<ProcessedNotificationRecord[]>(processedNotificationsHistory);
  const policyRef = useRef<NotificationCapturePolicy>(capturePolicy);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  useEffect(() => {
    historyRef.current = processedNotificationsHistory;
  }, [processedNotificationsHistory]);

  useEffect(() => {
    policyRef.current = capturePolicy;
    try {
      localStorage.setItem(STORAGE_KEY_CAPTURE_POLICY, JSON.stringify(capturePolicy));
      const cutoff = getPolicyCutoffTimestamp(capturePolicy);
      window.AndroidNativeBridge?.setMinCaptureTimestamp?.(cutoff);
    } catch {
      // ignore
    }
  }, [capturePolicy]);

  const [autoCapturedNotifs, setAutoCapturedNotifs] = useState<
    { id: string; app: string; text: string; time: string }[]
  >([]);
  const [liveToast, setLiveToast] = useState<string | null>(null);

  // Estado del modal de nuevo movimiento manual
  const [manTipo, setManTipo] = useState<TransactionType>('gasto');
  const [manCategoria, setManCategoria] = useState<TransactionCategory>('Alimentación y Supermercado');
  const [manMonto, setManMonto] = useState('');
  const [manDesc, setManDesc] = useState('');
  const [manEntidad, setManEntidad] = useState('Nequi');
  const [manEsEsencial, setManEsEsencial] = useState(true);

  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState<string>('');

  const [pinHash, setPinHash] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY_PIN));
  const [isLocked, setIsLocked] = useState<boolean>(() => Boolean(localStorage.getItem(STORAGE_KEY_PIN)));
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPin, setNewPin] = useState('');

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
      // ignore
    }
  }, [transactions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CREDITS, JSON.stringify(credits));
    } catch {
      // ignore
    }
  }, [credits]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SALARY, JSON.stringify(salaryProfile));
    } catch {
      // ignore
    }
  }, [salaryProfile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(recurringPayments));
    } catch {
      // ignore
    }
  }, [recurringPayments]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
    } catch {
      // ignore
    }
  }, [goals]);

  useEffect(() => {
    try {
      const cutoff = Date.now() - THIRTY_DAYS_MS;
      const pruned = processedNotificationsHistory.filter((item) => item.timestamp >= cutoff);
      localStorage.setItem(STORAGE_KEY_SCAN_HISTORY, JSON.stringify(pruned));
    } catch {
      // ignore
    }
  }, [processedNotificationsHistory]);

  const showToast = useCallback((msg: string) => {
    setLiveToast(msg);
    setTimeout(() => {
      setLiveToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const handleRecordProcessedNotification = useCallback(
    (record: Omit<ProcessedNotificationRecord, 'id' | 'timestamp' | 'fechaStr'>) => {
      const now = Date.now();
      const fechaStr = new Date(now).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
      const newEntry: ProcessedNotificationRecord = {
        ...record,
        id: `scan-hist-${now}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        fechaStr,
      };
      setProcessedNotificationsHistory((prev) => {
        const cutoff = now - THIRTY_DAYS_MS;
        const updated = [newEntry, ...prev.filter((item) => item.timestamp >= cutoff)];
        historyRef.current = updated;
        return updated;
      });
    },
    []
  );

  const handleDeleteProcessedRecord = useCallback((id: string) => {
    setProcessedNotificationsHistory((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleClearProcessedHistory = useCallback(() => {
    setProcessedNotificationsHistory([]);
  }, []);

  const handleAddMultipleTransactions = useCallback(
    (items: Omit<Transaction, 'id' | 'fecha' | 'timestamp'>[]) => {
      const now = Date.now();
      const nowStr = new Date(now).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
      const created: Transaction[] = items
        .filter((i) => safePositiveNumber(i.monto, 0) > 0)
        .map((item, idx) => {
          const cleanDesc = sanitizeTextInput(item.desc, 140);
          const cleanEntidad = sanitizeTextInput(item.entidad || 'Banco', 40);
          const montoVal = safePositiveNumber(item.monto, 0);
          return {
            ...item,
            id: `tx-${now}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
            fecha: nowStr,
            timestamp: now + idx,
            monto: montoVal,
            desc: cleanDesc,
            entidad: cleanEntidad,
            fingerprint:
              item.fingerprint || buildPurchaseFingerprint(montoVal, item.tipo, cleanDesc, cleanEntidad),
          };
        });

      if (created.length > 0) {
        setTransactions((prev) => {
          const next = [...created, ...prev];
          transactionsRef.current = next;
          return next;
        });
      }
    },
    []
  );

  const handleCleanDuplicatesNow = useCallback(() => {
    const { cleaned, removedCount } = deduplicateTransactionsList(
      transactionsRef.current,
      policyRef.current.ventanaAntiduplicadosMinutos
    );
    if (removedCount > 0) {
      setTransactions(cleaned);
      transactionsRef.current = cleaned;
      setBlockedDuplicatesCount((c) => c + removedCount);
      showToast(`Se eliminaron ${removedCount} registro(s) duplicados.`);
    } else {
      showToast('Sin duplicados: Todos tus registros son únicos.');
    }
  }, [showToast]);

  const processIncomingNotification = useCallback(
    (app: string, text: string, eventTimestampMs?: number) => {
      const cleanText = sanitizeTextInput(text, 600);
      if (!cleanText) return;

      const notifTime = eventTimestampMs && eventTimestampMs > 0 ? eventTimestampMs : Date.now();
      const currentPolicy = policyRef.current;

      if (currentPolicy.ignorarNotificacionesAntiguas) {
        const oldCheck = isNotificationOlderThanPolicy(cleanText, notifTime, currentPolicy);
        if (oldCheck.isOld) {
          setBlockedOldCount((c) => c + 1);
          return;
        }
      }

      const fullRawText = `${app}: ${cleanText}`;
      const parsed = runOnDeviceFinancialAnalysis({
        sourceType: 'notificacion',
        text: fullRawText,
      });

      if (parsed.movimientosDetectados.length > 0) {
        const uniqueMovements = parsed.movimientosDetectados.filter((m) => {
          if (!currentPolicy.evitarDuplicadosMismaCompra) return true;
          const dupCheck = isDuplicatePurchase(
            {
              monto: m.monto,
              tipo: m.tipo,
              categoria: m.categoria,
              entidad: m.entidad || app,
              desc: m.desc,
              rawText: cleanText,
              timestamp: notifTime,
            },
            transactionsRef.current,
            historyRef.current,
            currentPolicy.ventanaAntiduplicadosMinutos
          );
          if (dupCheck.isDuplicate) {
            setBlockedDuplicatesCount((c) => c + 1);
            return false;
          }
          return true;
        });

        if (uniqueMovements.length === 0) {
          return;
        }

        const first = uniqueMovements[0];
        const total = uniqueMovements.reduce((acc, m) => acc + m.monto, 0);

        handleAddMultipleTransactions(
          uniqueMovements.map((m) => ({
            tipo: m.tipo,
            categoria: m.categoria,
            monto: m.monto,
            desc: m.desc,
            entidad: m.entidad || app,
            cuotas: m.cuotas || 1,
            fuente: 'notificacion',
            esEsencial: m.esEsencial ?? true,
            fingerprint: buildPurchaseFingerprint(
              m.monto,
              m.tipo,
              `${m.desc} ${cleanText}`,
              m.entidad || app
            ),
          }))
        );

        handleRecordProcessedNotification({
          fuente: 'notificacion',
          entidad: first.entidad || app,
          textoOriginal: cleanText,
          resumen: first.desc,
          montoTotal: total,
          tipoPrincipal: first.tipo,
          categoriaPrincipal: first.categoria,
          itemsCount: uniqueMovements.length,
          fingerprint: buildPurchaseFingerprint(
            first.monto,
            first.tipo,
            `${first.desc} ${cleanText}`,
            first.entidad || app
          ),
        });

        showToast(
          `Compra registrada: ${first.tipo === 'ganancia' ? '+' : '-'}${formatCurrency(
            first.monto,
            currency
          )} (${first.entidad || app})`
        );
      } else {
        setAutoCapturedNotifs((prev) => {
          if (prev.some((n) => n.text === cleanText)) return prev;
          return [
            {
              id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              app: app || 'Notificación',
              text: cleanText,
              time: new Date(notifTime).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
            },
            ...prev,
          ];
        });
      }
    },
    [currency, handleAddMultipleTransactions, handleRecordProcessedNotification, showToast]
  );

  useEffect(() => {
    window.__onAndroidNotificationsBatch = (items) => {
      if (Array.isArray(items)) {
        items.forEach((item) => {
          if (item?.text) {
            processIncomingNotification(item.app || 'Banco Android', item.text, item.time);
          }
        });
      }
    };

    try {
      const params = new URLSearchParams(window.location.search);
      const sharedText = params.get('text') || params.get('notificacion') || params.get('title');
      if (sharedText && sharedText.trim().length > 4) {
        processIncomingNotification('Compartido Android', sharedText.trim(), Date.now());
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch {
      // ignore
    }

    const onNativeEvent = (e: Event) => {
      const custom = e as CustomEvent<{ app?: string; text?: string; time?: number }>;
      if (custom.detail?.text) {
        processIncomingNotification(custom.detail.app || 'Banco Android', custom.detail.text, custom.detail.time);
      }
    };

    window.addEventListener('native-notification', onNativeEvent);

    const syncNativeBridgeQueue = async () => {
      try {
        if (window.AndroidNativeBridge?.getCapturedNotificationsJson) {
          const rawJson = window.AndroidNativeBridge.getCapturedNotificationsJson();
          if (rawJson && rawJson !== '[]') {
            const list = JSON.parse(rawJson);
            if (Array.isArray(list) && list.length > 0) {
              list.forEach((item: any) => {
                if (item?.text) {
                  processIncomingNotification(item.app || 'Android', item.text, item.time);
                }
              });
              window.AndroidNativeBridge.clearCapturedNotifications?.();
            }
          }
        }
      } catch {
        // ignore
      }

      try {
        const res = await fetch('/api/webhook/pendientes');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.items) && data.items.length > 0) {
            data.items.forEach((item: any) => {
              if (item?.text) {
                processIncomingNotification(item.app || 'Notificación Automática', item.text, item.time);
              }
            });
          }
        }
      } catch {
        // ignore offline
      }
    };

    syncNativeBridgeQueue();
    const interval = setInterval(syncNativeBridgeQueue, 3000);
    return () => {
      window.removeEventListener('native-notification', onNativeEvent);
      clearInterval(interval);
    };
  }, [processIncomingNotification]);

  const metrics = useMemo(
    () => calculateFinancialMetrics(transactions, credits, salaryProfile, recurringPayments, goals),
    [transactions, credits, salaryProfile, recurringPayments, goals]
  );

  useEffect(() => {
    try {
      const lastPurchase = transactions.find((t) => t.tipo === 'gasto') || transactions[0];
      const payload = {
        disponibleFormatted: formatCurrency(metrics.disponibleDespuesDePagosFijos || 0, currency),
        gastosMesFormatted: formatCurrency(metrics.totalGastos || 0, currency),
        fijosPendientesFormatted: formatCurrency(metrics.pagosFijosPendientes || 0, currency),
        lastPurchaseTitle: lastPurchase
          ? `${lastPurchase.desc} • ${formatCurrency(lastPurchase.monto, currency)}`
          : 'Sin compras registradas hoy',
        lastPurchaseMeta: lastPurchase
          ? `${lastPurchase.entidad || 'Banco'} • ${lastPurchase.fecha} • ${lastPurchase.categoria}`
          : 'Escáner 24/7 activo esperando notificaciones',
        lastPurchaseRawDesc: lastPurchase ? lastPurchase.desc : '',
        lastPurchaseRawAmount: lastPurchase ? formatCurrency(lastPurchase.monto, currency) : '$0',
        lastPurchaseRawBank: lastPurchase ? lastPurchase.entidad || 'Banco' : '',
        lastPurchaseRawTime: lastPurchase ? lastPurchase.fecha : '',
      };
      window.AndroidNativeBridge?.syncWidgetSummary?.(JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [metrics, transactions, currency]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = safePositiveNumber(manMonto.replace(/[.,]/g, ''), 0);
    const cleanDesc = sanitizeTextInput(manDesc, 140);
    if (montoNum <= 0 || !cleanDesc) return;

    const cleanEntidad = sanitizeTextInput(manEntidad, 40) || 'Efectivo / Banco';
    const now = Date.now();
    const nuevo: Transaction = {
      id: `tx-${now}`,
      fecha: new Date(now).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      timestamp: now,
      tipo: manTipo,
      categoria: manCategoria,
      monto: montoNum,
      desc: cleanDesc,
      entidad: cleanEntidad,
      fuente: 'manual',
      esEsencial: manEsEsencial,
      fingerprint: buildPurchaseFingerprint(montoNum, manTipo, cleanDesc, cleanEntidad),
    };

    setTransactions((prev) => [nuevo, ...prev]);
    setManMonto('');
    setManDesc('');
    setShowAddTxModal(false);
    showToast(`Movimiento registrado: ${formatCurrency(montoNum, currency)}`);
  };

  const handleDepositSalaryNow = (amount: number, label: string) => {
    handleAddMultipleTransactions([
      {
        tipo: 'ganancia',
        categoria: 'Salario / Ingreso Principal',
        monto: amount,
        desc: label,
        entidad: 'Nómina',
        fuente: 'manual',
        esEsencial: true,
      },
    ]);
    showToast(`Ingreso de ${formatCurrency(amount, currency)} registrado.`);
  };

  const handleAddRecurringPayment = (item: Omit<RecurringPayment, 'id' | 'pagadoEsteMes'>) => {
    const nuevo: RecurringPayment = {
      ...item,
      id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pagadoEsteMes: false,
    };
    setRecurringPayments((prev) => [...prev, nuevo]);
    showToast(`Pago fijo "${item.nombre}" agregado.`);
  };

  const handleTogglePayRecurring = (id: string) => {
    const target = recurringPayments.find((p) => p.id === id);
    if (!target) return;

    const willBePaid = !target.pagadoEsteMes;
    setRecurringPayments((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              pagadoEsteMes: willBePaid,
              ultimoPagoFecha: willBePaid ? new Date().toLocaleDateString('es-CO') : undefined,
            }
          : p
      )
    );

    if (willBePaid) {
      handleAddMultipleTransactions([
        {
          tipo: 'gasto',
          categoria: target.categoria,
          monto: target.monto,
          desc: `Pago mensual: ${target.nombre}`,
          entidad: 'Pago Fijo',
          fuente: 'manual',
          esEsencial: true,
        },
      ]);
      showToast(`"${target.nombre}" marcado como pagado.`);
    }
  };

  const handleResetMonthlyPayments = () => {
    setRecurringPayments((prev) => prev.map((p) => ({ ...p, pagadoEsteMes: false })));
    showToast('Pagos fijos reiniciados para el nuevo mes.');
  };

  const handleDeleteRecurringPayment = (id: string) => {
    setRecurringPayments((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAddGoal = (goal: Omit<FinancialGoal, 'id' | 'montoAhorrado'>) => {
    const nueva: FinancialGoal = {
      ...goal,
      id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      montoAhorrado: 0,
    };
    setGoals((prev) => [...prev, nueva]);
    showToast(`Meta "${goal.nombre}" creada.`);
  };

  const handleContributeGoal = (id: string, amount: number) => {
    const target = goals.find((g) => g.id === id);
    if (!target || amount <= 0) return;

    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, montoAhorrado: g.montoAhorrado + amount } : g))
    );

    handleAddMultipleTransactions([
      {
        tipo: 'gasto',
        categoria: 'Ahorro para Meta',
        monto: amount,
        desc: `Abono a meta: ${target.nombre}`,
        entidad: 'Ahorro',
        fuente: 'manual',
        esEsencial: true,
      },
    ]);
    showToast(`Abonaste ${formatCurrency(amount, currency)} a "${target.nombre}".`);
  };

  const handleDeleteGoal = (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const handleExecuteAdvisorActions = (actions: AdvisorActionCommand[]) => {
    for (const act of actions) {
      const d = act.datos || {};
      if (act.tipoAccion === 'actualizar_salario') {
        const monto = safePositiveNumber(d.salarioMensualNeto ?? d.monto, 0);
        if (monto > 0) {
          setSalaryProfile((prev) => ({
            ...prev,
            salarioMensualNeto: monto,
            frecuenciaPago: d.frecuenciaPago || prev.frecuenciaPago,
          }));
        }
      } else if (act.tipoAccion === 'agregar_pago_fijo') {
        const monto = safePositiveNumber(d.monto, 0);
        if (monto > 0) {
          handleAddRecurringPayment({
            nombre: sanitizeTextInput(d.nombre || 'Pago Mensual', 50),
            monto,
            diaVencimiento: Math.max(1, Math.min(31, Number(d.diaVencimiento) || 5)),
            categoria: (d.categoria as TransactionCategory) || 'Vivienda y Servicios',
          });
        }
      } else if (act.tipoAccion === 'agregar_meta') {
        const monto = safePositiveNumber(d.montoObjetivo ?? d.monto, 0);
        if (monto > 0) {
          handleAddGoal({
            nombre: sanitizeTextInput(d.nombre || 'Meta de Ahorro', 50),
            montoObjetivo: monto,
            plazoMeses: Math.max(1, Number(d.plazoMeses) || 6),
            prioridad: 'alta',
          });
        }
      } else if (act.tipoAccion === 'registrar_movimiento') {
        const monto = safePositiveNumber(d.monto, 0);
        if (monto > 0) {
          handleAddMultipleTransactions([
            {
              tipo: (d.tipoMovimiento || d.tipo || 'gasto') as TransactionType,
              categoria: (d.categoria as TransactionCategory) || 'Otros',
              monto,
              desc: sanitizeTextInput(d.desc || d.nombre || 'Movimiento', 90),
              entidad: sanitizeTextInput(d.entidad || 'General', 40),
              fuente: 'manual',
              esEsencial: Boolean(d.esEsencial ?? true),
            },
          ]);
        }
      } else if (act.tipoAccion === 'agregar_deuda') {
        const saldo = safePositiveNumber(d.monto, 0);
        if (saldo > 0) {
          handleAddOrUpdateCredit({
            nombre: sanitizeTextInput(d.nombre || 'Obligación Crediticia', 60),
            entidad: sanitizeTextInput(d.entidad || 'Banco', 40),
            tipo: 'tarjeta_credito',
            cupoTotal: safePositiveNumber(d.cupoTotal, saldo),
            saldoActual: saldo,
            tasaEA: safePositiveNumber(d.tasaEA, 28.5),
            cuotaMinima: Math.max(50000, Math.round(saldo * 0.08)),
            diaCorte: 15,
            diaPago: 2,
            enMora: false,
          });
        }
      }
    }
  };

  const handleMarkDebtPaid = (id: string) => {
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              tipo: 'gasto',
              desc: t.desc.startsWith('Pagado:') ? t.desc : `Pagado: ${t.desc}`,
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

    const now = Date.now();
    const pagoTx: Transaction = {
      id: `tx-pay-${now}`,
      fecha: new Date(now).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      timestamp: now,
      tipo: 'pago_credito',
      categoria: 'Cuota Tarjeta / Crédito',
      monto: validAmount,
      desc: `Abono a deuda: ${sanitizeTextInput(nombre, 80)}`,
      entidad: nombre,
      fuente: 'manual',
      esEsencial: true,
      fingerprint: buildPurchaseFingerprint(validAmount, 'pago_credito', nombre, nombre),
    };
    setTransactions((prev) => [pagoTx, ...prev]);
    showToast(`Abono de ${formatCurrency(validAmount, currency)} aplicado a ${nombre}.`);
  };

  const handleDeleteCredit = (id: string) => {
    setCredits((prev) => prev.filter((c) => c.id !== id));
  };

  const handleClearAll = () => {
    if (window.confirm('¿Deseas borrar todos los datos registrados y dejar la aplicación en cero?')) {
      setTransactions([]);
      setCredits([]);
      setSalaryProfile(DEFAULT_SALARY);
      setRecurringPayments([]);
      setGoals([]);
      setProcessedNotificationsHistory([]);
      setBlockedDuplicatesCount(0);
      setBlockedOldCount(0);
      localStorage.removeItem('finanzas_v2_transactions');
      localStorage.removeItem('finanzas_v2_credits');
      showToast('Todos los registros quedaron en $0.');
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

  const cutoffTimestamp = getPolicyCutoffTimestamp(capturePolicy);
  const cutoffLabel = cutoffTimestamp
    ? new Date(cutoffTimestamp).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Sin límite';

  const gastoRatioPct = useMemo(() => {
    if (metrics.totalGanancias <= 0) return 0;
    return Math.min(100, Math.round(((metrics.totalGastos + metrics.pagosFijosPendientes) / metrics.totalGanancias) * 100));
  }, [metrics.totalGanancias, metrics.totalGastos, metrics.pagosFijosPendientes]);

  if (isLocked && pinHash) {
    return (
      <div className="min-h-screen bg-[#090b10] flex items-center justify-center p-4">
        <div className="bg-[#111520] border border-white/10 rounded-3xl p-7 max-w-sm w-full text-center space-y-5 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Mis Finanzas</h1>
            <p className="text-xs text-slate-400 mt-1">Ingresa tu PIN de 4 dígitos</p>
          </div>
          <input
            type="password"
            maxLength={4}
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value);
              setPinError('');
            }}
            placeholder="••••"
            className="w-full text-center tracking-[0.6em] text-xl font-semibold bg-[#090b10] border border-white/15 rounded-2xl py-3 text-white focus:outline-none focus:border-indigo-500"
          />
          {pinError && <p className="text-xs text-rose-400">{pinError}</p>}
          <button
            type="button"
            onClick={() => {
              if (hashPin(pinInput) === pinHash) {
                setIsLocked(false);
                setPinInput('');
              } else {
                setPinError('PIN incorrecto.');
              }
            }}
            className="w-full bg-white hover:bg-slate-200 text-slate-950 font-semibold py-3 rounded-2xl text-sm transition"
          >
            Desbloquear
          </button>
        </div>
      </div>
    );
  }

  const navItems: { id: MainSection; label: string; shortLabel: string; icon: any }[] = [
    { id: 'mimes', label: 'Resumen', shortLabel: 'Inicio', icon: Wallet },
    { id: 'escaner', label: 'Notificaciones', shortLabel: 'Escáner', icon: Bell },
    { id: 'calculos', label: 'Analítica', shortLabel: 'Analítica', icon: Calculator },
    { id: 'creditos', label: 'Créditos', shortLabel: 'Créditos', icon: CreditCard },
    { id: 'asesor', label: 'Asesor y App', shortLabel: 'Asesor', icon: Bot },
  ];

  return (
    <div className="min-h-screen bg-[#090b10] text-slate-100 pb-24">
      {/* Toast minimalista */}
      {liveToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-[90%] bg-[#161b28] border border-white/15 text-slate-100 px-4 py-3 rounded-2xl shadow-2xl text-xs font-medium flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{liveToast}</span>
        </div>
      )}

      {/* BARRA SUPERIOR MINIMALISTA */}
      <header className="sticky top-0 z-30 bg-[#090b10]/85 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
              <Wallet className="w-4 h-4 text-slate-950" />
            </div>
            <div>
              <span className="text-sm font-semibold text-white tracking-tight block">Mis Finanzas</span>
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Corte: {cutoffLabel}
              </span>
            </div>
          </div>

          {/* Navegación Central en Escritorio */}
          <nav className="hidden md:flex items-center gap-1 bg-[#111520] p-1 rounded-2xl border border-white/[0.06]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition ${
                    active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Controles derechos limpios */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddTxModal(true)}
              className="bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Registrar</span>
            </button>

            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              aria-label="Moneda"
              className="bg-[#111520] border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-xs text-slate-300 font-medium focus:outline-none"
            >
              <option value="COP">COP</option>
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
              <option value="EUR">EUR</option>
            </select>

            <button
              type="button"
              onClick={() => setShowPinSetup(!showPinSetup)}
              className="p-2 rounded-xl bg-[#111520] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-white transition"
              title="PIN de privacidad"
            >
              {pinHash ? <Lock className="w-3.5 h-3.5 text-emerald-400" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {showPinSetup && (
          <div className="max-w-5xl mx-auto px-4 pb-3">
            <div className="p-3 bg-[#111520] border border-white/10 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-300">Configurar PIN de 4 dígitos:</span>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4 dígitos"
                  className="w-24 bg-[#090b10] border border-white/15 rounded-xl px-2.5 py-1.5 text-center text-white font-semibold"
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
                  className="bg-white text-slate-950 font-semibold px-3 py-1.5 rounded-xl"
                >
                  Guardar
                </button>
                {pinHash && (
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem(STORAGE_KEY_PIN);
                      setPinHash(null);
                      setShowPinSetup(false);
                    }}
                    className="text-rose-400 px-2.5 py-1.5"
                  >
                    Quitar PIN
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-slate-400 hover:text-rose-400 px-2.5 py-1.5 border-l border-white/10"
                >
                  Borrar datos
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-5 space-y-6">
        {/* PESTAÑA 1: INICIO / MI MES */}
        {activeSection === 'mimes' && (
          <div className="space-y-6">
            {/* TARJETA UNIFICADA DE BALANCE (Estilo Neobanco Limpio) */}
            <section className="bg-[#111520] border border-white/[0.07] rounded-3xl p-6 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-medium text-slate-400 block">Disponible Real</span>
                  <div
                    className={`text-3xl sm:text-4xl font-bold tracking-tight tabular-nums mt-1 ${
                      metrics.disponibleDespuesDePagosFijos >= 0 ? 'text-white' : 'text-rose-400'
                    }`}
                  >
                    {formatCurrency(metrics.disponibleDespuesDePagosFijos, currency)}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Libre tras descontar compras registradas y pagos fijos del mes
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSection('escaner')}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 border border-white/[0.07] transition"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sin duplicados ({blockedDuplicatesCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection('escaner')}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 border border-white/[0.07] transition"
                  >
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Desde: {cutoffLabel}</span>
                  </button>
                </div>
              </div>

              {/* Barra sutil de consumo mensual */}
              <div className="mt-5">
                <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      gastoRatioPct > 85 ? 'bg-rose-500' : gastoRatioPct > 65 ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.max(2, gastoRatioPct)}%` }}
                  />
                </div>
              </div>

              {/* Resumen en 4 columnas limpias dentro de la misma tarjeta */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-white/[0.06]">
                <div>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Ingresos
                  </span>
                  <strong className="text-base sm:text-lg font-semibold text-white tabular-nums mt-0.5 block">
                    {formatCurrency(metrics.totalGanancias, currency)}
                  </strong>
                </div>

                <div>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5 text-rose-400" /> Compras
                  </span>
                  <strong className="text-base sm:text-lg font-semibold text-white tabular-nums mt-0.5 block">
                    {formatCurrency(metrics.totalGastos, currency)}
                  </strong>
                </div>

                <div>
                  <span className="text-xs text-slate-400">Pagos Fijos Pend.</span>
                  <strong className="text-base sm:text-lg font-semibold text-slate-200 tabular-nums mt-0.5 block">
                    {formatCurrency(metrics.pagosFijosPendientes, currency)}
                  </strong>
                </div>

                <div>
                  <span className="text-xs text-slate-400">Deuda Total</span>
                  <strong className="text-base sm:text-lg font-semibold text-amber-400 tabular-nums mt-0.5 block">
                    {formatCurrency(metrics.deudaTotalObligaciones, currency)}
                  </strong>
                </div>
              </div>
            </section>

            {/* SELECTOR DE SUB-SECCIÓN (Evita amontonar todo en una sola pantalla) */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex p-1 rounded-2xl bg-[#111520] border border-white/[0.06] overflow-x-auto max-w-full">
                {[
                  { id: 'movimientos', label: `Movimientos (${transactions.length})` },
                  { id: 'pagos', label: `Pagos Fijos (${recurringPayments.length})` },
                  { id: 'salario', label: 'Mi Salario' },
                  { id: 'metas', label: `Metas (${goals.length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setHomeSubTab(tab.id as HomeSubTab)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                      homeSubTab === tab.id
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {homeSubTab === 'movimientos' && (
                <div className="flex items-center gap-2">
                  {transactions.length > 1 && (
                    <button
                      type="button"
                      onClick={handleCleanDuplicatesNow}
                      className="px-3 py-2 rounded-xl bg-[#111520] hover:bg-white/[0.08] text-slate-300 border border-white/[0.07] text-xs font-medium flex items-center gap-1.5 transition"
                      title="Eliminar compras duplicadas"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Depurar duplicados</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAddTxModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-200 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nuevo Movimiento</span>
                  </button>
                </div>
              )}
            </div>

            {/* SUB-VISTA 1: LISTA LIMPIA DE MOVIMIENTOS */}
            {homeSubTab === 'movimientos' && (
              <div className="bg-[#111520] border border-white/[0.07] rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex overflow-x-auto gap-1.5">
                    {[
                      { id: 'todos', label: 'Todos' },
                      { id: 'gasto', label: 'Compras' },
                      { id: 'ganancia', label: 'Ingresos' },
                      { id: 'deuda', label: 'Deudas' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setFiltroTipo(t.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                          filtroTipo === t.id
                            ? 'bg-indigo-500 text-white'
                            : 'text-slate-400 hover:text-white bg-[#0b0e17]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar comercio o banco..."
                      className="w-full bg-[#0b0e17] border border-white/[0.07] focus:border-indigo-500 focus:outline-none rounded-xl pl-9 pr-3 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>

                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Aún no hay movimientos registrados. Tus notificaciones bancarias nuevas aparecerán aquí automáticamente sin duplicarse.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAddTxModal(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                    >
                      <Plus className="w-3.5 h-3.5" /> Registrar primer movimiento
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {filteredTransactions.map((m) => {
                      const isIncome = m.tipo === 'ganancia';
                      return (
                        <div
                          key={m.id}
                          className="py-3.5 flex items-center justify-between gap-3 text-xs first:pt-1 last:pb-1"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                                isIncome
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-white/[0.05] text-slate-300'
                              }`}
                            >
                              {isIncome ? (
                                <ArrowUpRight className="w-4 h-4" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <strong className="text-white text-sm font-medium truncate">
                                  {m.desc}
                                </strong>
                                {m.entidad && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/[0.05] text-slate-400 shrink-0">
                                    {m.entidad}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <span>{m.categoria}</span>
                                <span>•</span>
                                <span>{m.fecha}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <strong
                              className={`text-sm font-semibold tabular-nums ${
                                isIncome ? 'text-emerald-400' : 'text-white'
                              }`}
                            >
                              {isIncome ? '+' : '-'}
                              {formatCurrency(m.monto, currency)}
                            </strong>

                            {m.tipo === 'deuda' && (
                              <button
                                type="button"
                                onClick={() => handleMarkDebtPaid(m.id)}
                                className="bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                              >
                                Pagar
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteTransaction(m.id)}
                              className="text-slate-600 hover:text-rose-400 p-1 transition"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SUB-VISTAS 2, 3 Y 4: PAGOS FIJOS, SALARIO O METAS */}
            {homeSubTab !== 'movimientos' && (
              <SalaryBillsGoalsCenter
                currency={currency}
                salaryProfile={salaryProfile}
                onUpdateSalary={(profile) => {
                  setSalaryProfile(profile);
                  showToast(`Salario actualizado: ${formatCurrency(profile.salarioMensualNeto, currency)}`);
                }}
                onDepositSalaryNow={handleDepositSalaryNow}
                recurringPayments={recurringPayments}
                onAddRecurringPayment={handleAddRecurringPayment}
                onTogglePayRecurring={handleTogglePayRecurring}
                onResetMonthlyPayments={handleResetMonthlyPayments}
                onDeleteRecurringPayment={handleDeleteRecurringPayment}
                goals={goals}
                onAddGoal={handleAddGoal}
                onContributeGoal={handleContributeGoal}
                onDeleteGoal={handleDeleteGoal}
                forcedView={homeSubTab}
              />
            )}
          </div>
        )}

        {/* PESTAÑA 2: ESCÁNER Y CONTROL DE NOTIFICACIONES */}
        {activeSection === 'escaner' && (
          <ScannerCenter
            currency={currency}
            onAddTransactions={handleAddMultipleTransactions}
            onAddOrUpdateCredit={handleAddOrUpdateCredit}
            autoCapturedNotifs={autoCapturedNotifs}
            onDismissCapturedNotif={(id) =>
              setAutoCapturedNotifs((prev) => prev.filter((n) => n.id !== id))
            }
            onSimulateIncomingNotif={(app, text) => processIncomingNotification(app, text, Date.now())}
            processedHistory={processedNotificationsHistory}
            onRecordProcessedNotification={handleRecordProcessedNotification}
            onDeleteProcessedRecord={handleDeleteProcessedRecord}
            onClearProcessedHistory={handleClearProcessedHistory}
            capturePolicy={capturePolicy}
            onUpdateCapturePolicy={setCapturePolicy}
            existingTransactions={transactions}
            blockedDuplicatesCount={blockedDuplicatesCount}
            blockedOldCount={blockedOldCount}
            onCleanDuplicatesNow={handleCleanDuplicatesNow}
          />
        )}

        {/* PESTAÑA 3: ANALÍTICA Y SIMULADOR */}
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

        {/* PESTAÑA 4: DEUDAS Y VIDA CREDITICIA */}
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

        {/* PESTAÑA 5: ASESOR IA Y DESCARGA */}
        {activeSection === 'asesor' && (
          <AdvisorAndMobileCenter
            currency={currency}
            transactions={transactions}
            credits={credits}
            financialSnapshot={metrics}
            onExecuteAdvisorActions={handleExecuteAdvisorActions}
            onImportBackup={({ transactions: tx, credits: cr }) => {
              setTransactions(deduplicateTransactionsList(tx, capturePolicy.ventanaAntiduplicadosMinutos).cleaned);
              setCredits(cr);
            }}
            installPromptEvent={installPromptEvent}
            onTriggerInstallPrompt={handleTriggerInstallPrompt}
          />
        )}
      </main>

      {/* MODAL LIMPIO PARA REGISTRAR MOVIMIENTO MANUAL */}
      {showAddTxModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleManualSubmit}
            className="bg-[#111520] border border-white/10 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Nuevo Movimiento</h2>
              <button
                type="button"
                onClick={() => setShowAddTxModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-white/[0.05]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tipo</label>
                <select
                  value={manTipo}
                  onChange={(e) => {
                    const t = e.target.value as TransactionType;
                    setManTipo(t);
                    setManCategoria(CATEGORIES_BY_TYPE[t][0]);
                  }}
                  className="w-full bg-[#090b10] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white"
                >
                  <option value="gasto">Compra / Gasto</option>
                  <option value="ganancia">Ingreso</option>
                  <option value="deuda">Deuda</option>
                  <option value="trading">Inversión</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Monto</label>
                <input
                  type="number"
                  required
                  value={manMonto}
                  onChange={(e) => setManMonto(e.target.value)}
                  placeholder="45000"
                  className="w-full bg-[#090b10] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-semibold tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Descripción o Comercio</label>
              <input
                type="text"
                required
                value={manDesc}
                onChange={(e) => setManDesc(e.target.value)}
                placeholder="Ej: Supermercado D1, Almuerzo, Uber"
                className="w-full bg-[#090b10] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Categoría</label>
                <select
                  value={manCategoria}
                  onChange={(e) => setManCategoria(e.target.value as TransactionCategory)}
                  className="w-full bg-[#090b10] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white"
                >
                  {CATEGORIES_BY_TYPE[manTipo].map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Banco / Medio</label>
                <input
                  type="text"
                  value={manEntidad}
                  onChange={(e) => setManEntidad(e.target.value)}
                  placeholder="Nequi, Bancolombia..."
                  className="w-full bg-[#090b10] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white"
                />
              </div>
            </div>

            {manTipo === 'gasto' && (
              <label className="flex items-center gap-2 text-xs text-slate-300 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manEsEsencial}
                  onChange={(e) => setManEsEsencial(e.target.checked)}
                  className="accent-indigo-500"
                />
                Es un gasto esencial (Necesidad)
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddTxModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="bg-white hover:bg-slate-200 text-slate-950 font-semibold text-xs px-5 py-2.5 rounded-xl transition"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* BARRA INFERIOR MÓVIL LIMPIA */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#090b10]/95 backdrop-blur-xl border-t border-white/[0.07] px-2 py-2 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl text-[10px] font-medium transition ${
                active ? 'text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className={`w-4 h-4 mb-1 ${active ? 'text-indigo-400' : ''}`} />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
export default App;
