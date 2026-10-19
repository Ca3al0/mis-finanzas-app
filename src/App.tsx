import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Lock,
  Unlock,
  Search,
  Smartphone,
  Target,
  Bell,
  ShieldCheck,
  Calendar,
  SlidersHorizontal,
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

  // Contadores de protección en vivo
  const [blockedDuplicatesCount, setBlockedDuplicatesCount] = useState<number>(0);
  const [blockedOldCount, setBlockedOldCount] = useState<number>(0);

  // 1. Transacciones reales del usuario (con limpieza inicial automática de duplicados)
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

  // 2. Obligaciones crediticias reales del usuario
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

  // 3. Salario e ingreso fijo mensual del usuario
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

  // 4. Pagos fijos mensuales ("Cosas que pago cada mes")
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

  // 5. Metas financieras y propósitos de ahorro
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

  // 6. Historial de notificaciones procesadas con éxito (últimos 30 días)
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

  // Referencias en tiempo real para el motor anti-duplicados
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

  // Bandeja de notificaciones capturadas en tiempo real
  const [autoCapturedNotifs, setAutoCapturedNotifs] = useState<
    { id: string; app: string; text: string; time: string }[]
  >([]);
  const [liveToast, setLiveToast] = useState<string | null>(null);

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

  // Bloqueo opcional por PIN de 4 dígitos
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

  // Persistencia automática en localStorage
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
    }, 4500);
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
      showToast(`🛡️ Se eliminaron ${removedCount} registro(s) duplicados de la misma compra.`);
    } else {
      showToast('🛡️ Tus movimientos están impecables: 0 compras duplicadas encontradas.');
    }
  }, [showToast]);

  // Motor central de lectura de notificaciones (con filtro de fecha/plazo y bloqueo anti-duplicados de misma compra)
  const processIncomingNotification = useCallback(
    (app: string, text: string, eventTimestampMs?: number) => {
      const cleanText = sanitizeTextInput(text, 600);
      if (!cleanText) return;

      const notifTime = eventTimestampMs && eventTimestampMs > 0 ? eventTimestampMs : Date.now();
      const currentPolicy = policyRef.current;

      // 1. Verificar si la notificación es más antigua que el plazo/fecha configurado por el usuario
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
        // 2. Verificar que esta compra no haya sido registrada ya por otra notificación (ej: App Push + SMS + Correo)
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
          return; // Compra repetida bloqueada silenciosamente para no alterar los cálculos de gastos
        }

        const first = uniqueMovements[0];
        const total = uniqueMovements.reduce((acc, m) => acc + m.monto, 0);

        handleAddMultipleTransactions(
          uniqueMovements.map((m) => ({
            tipo: m.tipo,
            categoria: m.categoria,
            monto: m.monto,
            desc: m.desc.startsWith('📲') ? m.desc : `📲 ${m.desc}`,
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
          `📲 Compra única registrada: ${first.tipo === 'ganancia' ? '+' : '-'}${formatCurrency(
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

  const [showPermissionsBanner, setShowPermissionsBanner] = useState<boolean>(false);
  const [permissionStatusText, setPermissionStatusText] = useState<string>('');

  const handleGlobalRequestPermissions = async () => {
    const results: string[] = [];

    if (window.AndroidNativeBridge?.requestAllRuntimePermissions) {
      try {
        window.AndroidNativeBridge.requestAllRuntimePermissions();
        results.push('Diálogo de permisos Android abierto');
      } catch {
        // ignore
      }
    }

    if (typeof Notification !== 'undefined' && Notification.requestPermission) {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          results.push('Notificaciones activadas ✓');
        }
      } catch {
        // ignore
      }
    }

    if (navigator.clipboard?.readText) {
      try {
        const clip = (await navigator.clipboard.readText())?.trim();
        results.push('Portapapeles autorizado ✓');
        if (
          clip &&
          clip.length >= 8 &&
          /\$|cop|compra|recibiste|pagaste|abono|nequi|bancolombia|daviplata|nu|transferencia|factura|cuota|retiro/i.test(clip)
        ) {
          processIncomingNotification('Portapapeles', clip, Date.now());
        }
      } catch {
        // ignore
      }
    }

    if (window.AndroidNativeBridge?.scanActiveNotificationsNow) {
      try {
        window.AndroidNativeBridge.scanActiveNotificationsNow();
      } catch {
        // ignore
      }
    }

    const msg =
      results.length > 0
        ? `🔔 ${results.join(' • ')}`
        : '🔔 Solicitud enviada. Si usas Samsung A36, toca también "Activar Acceso Notificaciones".';
    setPermissionStatusText(msg);
    showToast(msg);
  };

  const handleGlobalOpenNotificationSettings = () => {
    if (window.AndroidNativeBridge?.openNotificationSettings) {
      window.AndroidNativeBridge.openNotificationSettings();
      return;
    }
    if (/android/i.test(navigator.userAgent)) {
      window.location.href = 'intent:#Intent;action=android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS;end';
    } else {
      setActiveSection('escaner');
      showToast('En tu Samsung A36 ve a: Ajustes → Notificaciones → Ajustes avanzados → Acceso a notificaciones.');
    }
  };

  const handleGlobalOpenAppDetails = () => {
    if (window.AndroidNativeBridge?.openAppDetailsSettings) {
      window.AndroidNativeBridge.openAppDetailsSettings();
      return;
    }
    if (/android/i.test(navigator.userAgent)) {
      window.location.href =
        'intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:com.misfinanzas.personal.a36;end';
    } else {
      setActiveSection('escaner');
      showToast('En tu Samsung A36 ve a: Ajustes → Aplicaciones → Mis Finanzas → 3 puntos (⋮) → Permitir ajustes restringidos.');
    }
  };

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
    showToast(`✅ Movimiento guardado: ${formatCurrency(montoNum, currency)}`);
  };

  const handleDepositSalaryNow = (amount: number, label: string) => {
    handleAddMultipleTransactions([
      {
        tipo: 'ganancia',
        categoria: 'Salario / Ingreso Principal',
        monto: amount,
        desc: `💰 ${label}`,
        entidad: 'Nómina / Salario',
        fuente: 'manual',
        esEsencial: true,
      },
    ]);
    showToast(`💰 ¡Ingreso de ${formatCurrency(amount, currency)} sumado a tu historial!`);
  };

  const handleAddRecurringPayment = (item: Omit<RecurringPayment, 'id' | 'pagadoEsteMes'>) => {
    const nuevo: RecurringPayment = {
      ...item,
      id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pagadoEsteMes: false,
    };
    setRecurringPayments((prev) => [...prev, nuevo]);
    showToast(`📅 Pago fijo "${item.nombre}" agregado a tu mes.`);
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
          desc: `✅ Pago mensual: ${target.nombre}`,
          entidad: 'Pago Fijo',
          fuente: 'manual',
          esEsencial: true,
        },
      ]);
      showToast(`✅ "${target.nombre}" marcado como pagado y registrado en tus gastos.`);
    }
  };

  const handleResetMonthlyPayments = () => {
    setRecurringPayments((prev) => prev.map((p) => ({ ...p, pagadoEsteMes: false })));
    showToast('🔄 Todos tus pagos fijos quedaron listos para el nuevo mes.');
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
    showToast(`🎯 Meta "${goal.nombre}" creada.`);
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
        desc: `🎯 Ahorro abonado a meta: ${target.nombre}`,
        entidad: 'Ahorro Personal',
        fuente: 'manual',
        esEsencial: true,
      },
    ]);
    showToast(`🎯 ¡Abonaste ${formatCurrency(amount, currency)} a tu meta "${target.nombre}"!`);
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
              desc: sanitizeTextInput(d.desc || d.nombre || 'Movimiento desde Asesor', 90),
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
      desc: `💳 Abono a deuda: ${sanitizeTextInput(nombre, 80)}`,
      entidad: nombre,
      fuente: 'manual',
      esEsencial: true,
      fingerprint: buildPurchaseFingerprint(validAmount, 'pago_credito', nombre, nombre),
    };
    setTransactions((prev) => [pagoTx, ...prev]);
    showToast(`💳 Abono de ${formatCurrency(validAmount, currency)} aplicado a ${nombre}.`);
  };

  const handleDeleteCredit = (id: string) => {
    setCredits((prev) => prev.filter((c) => c.id !== id));
  };

  const handleClearAll = () => {
    if (window.confirm('¿Deseas borrar todos los datos registrados y dejar la aplicación completamente en cero?')) {
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
      showToast('🧹 Todos los registros quedaron limpios en $0.');
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
      <div className="min-h-screen bg-[#050811] flex items-center justify-center p-4">
        <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 text-indigo-400" />
          </div>
          <h1 className="text-lg font-bold text-white">Mis Finanzas Protegidas</h1>
          <p className="text-xs text-slate-400">
            Ingresa tu PIN de 4 dígitos para desbloquear tu información financiera
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
            className="w-full text-center tracking-[0.6em] text-xl font-bold bg-slate-950 border border-slate-700 rounded-2xl py-3 text-white"
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
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-2xl text-sm transition"
          >
            Desbloquear
          </button>
        </div>
      </div>
    );
  }

  const navItems: { id: MainSection; label: string; shortLabel: string; icon: any }[] = [
    { id: 'mimes', label: 'Mi Mes y Movimientos', shortLabel: 'Mi Mes', icon: Wallet },
    { id: 'escaner', label: 'Notificaciones y Plazo', shortLabel: 'Escáner', icon: Bell },
    { id: 'calculos', label: 'Anillos, Promedios y Cuotas', shortLabel: 'Cálculos', icon: Calculator },
    { id: 'creditos', label: 'Deudas y Vida Crediticia', shortLabel: 'Deudas', icon: CreditCard },
    { id: 'asesor', label: 'Asesor IA y App A36', shortLabel: 'Asesor IA', icon: Bot },
  ];

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 pb-24 selection:bg-indigo-500 selection:text-white">
      {/* Notificación flotante en vivo */}
      {liveToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] bg-slate-900/95 backdrop-blur-xl border border-emerald-500/60 text-emerald-100 px-4 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{liveToast}</span>
        </div>
      )}

      {/* Cabecera Ejecutiva Rediseñada */}
      <header className="sticky top-0 z-30 bg-[#060913]/85 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Mis Finanzas
                </h1>
                <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> Anti-Duplicados Activo
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Samsung Galaxy A36 5G • Corte notificaciones: <strong className="text-indigo-300">{cutoffLabel}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowPermissionsBanner((v) => !v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
                showPermissionsBanner
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 text-indigo-300'
              }`}
              title="Permisos de lectura automática"
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Permisos</span>
            </button>

            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              aria-label="Moneda"
              className="bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-bold"
            >
              <option value="COP">🇨🇴 COP</option>
              <option value="USD">🇺🇸 USD</option>
              <option value="MXN">🇲🇽 MXN</option>
              <option value="EUR">🇪🇺 EUR</option>
            </select>

            <button
              type="button"
              onClick={() => setShowPinSetup(!showPinSetup)}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs"
              title="PIN de seguridad"
            >
              {pinHash ? <Lock className="w-3.5 h-3.5 text-emerald-400" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={handleClearAll}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-rose-950/80 border border-slate-800 hover:border-rose-700 text-slate-400 hover:text-rose-200 text-xs font-semibold transition"
              title="Reiniciar todos los datos en cero"
            >
              Reiniciar
            </button>
          </div>
        </div>

        {showPinSetup && (
          <div className="max-w-5xl mx-auto mt-2.5 p-3 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-300">🔒 Configura un PIN local de 4 dígitos:</span>
            <div className="flex items-center gap-2">
              <input
                type="password"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4 dígitos"
                className="w-24 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-center text-white font-bold"
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
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded-xl"
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
                  className="bg-rose-950 text-rose-300 border border-rose-800 px-2.5 py-1 rounded-xl"
                >
                  Quitar PIN
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-4 space-y-5">
        {/* Panel Desplegable de Permisos Rápidos (Oculto por defecto para mantener el diseño limpio) */}
        {showPermissionsBanner && (
          <section className="bg-slate-900/95 border border-indigo-500/40 rounded-3xl p-4 space-y-3 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-xs font-bold text-white">
                  Configuración Rápida de Permisos en Samsung Galaxy A36 5G
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPermissionsBanner(false)}
                className="text-[11px] text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-950"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleGlobalRequestPermissions}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow transition"
              >
                <Bell className="w-3.5 h-3.5 shrink-0" />
                <span>1. Autorizar Permisos</span>
              </button>

              <button
                type="button"
                onClick={handleGlobalOpenAppDetails}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow transition"
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span>2. Ajustes Restringidos</span>
              </button>

              <button
                type="button"
                onClick={handleGlobalOpenNotificationSettings}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>3. Acceso a Notificaciones</span>
              </button>
            </div>

            {permissionStatusText && (
              <div className="text-[11px] text-emerald-300 font-semibold bg-slate-950 border border-emerald-500/30 rounded-xl px-3 py-2">
                {permissionStatusText}
              </div>
            )}
          </section>
        )}

        {/* HERO DASHBOARD REDISEÑADO: Bóveda Financiera + Indicadores Ejecutivos */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          {/* Tarjeta Principal: Disponible Real y Estado del Filtro de Notificaciones */}
          <div className="lg:col-span-5 bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-950 border border-indigo-500/30 rounded-3xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-300">
                  Saldo Disponible Real
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSection('escaner')}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-950/90 hover:bg-indigo-950 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 transition"
                  title="Configurar desde qué fecha leer notificaciones y filtro anti-duplicados"
                >
                  <Calendar className="w-3 h-3 text-indigo-400" />
                  <span>Desde: {cutoffLabel}</span>
                </button>
              </div>

              <div
                className={`text-2xl sm:text-3xl font-black tracking-tight pt-1 ${
                  metrics.disponibleDespuesDePagosFijos >= 0 ? 'text-white' : 'text-rose-400'
                }`}
              >
                {formatCurrency(metrics.disponibleDespuesDePagosFijos, currency)}
              </div>
              <p className="text-[11px] text-slate-400">
                Libre después de descontar tus compras únicas ({formatCurrency(metrics.totalGastos, currency)}) y pagos fijos pendientes ({formatCurrency(metrics.pagosFijosPendientes, currency)})
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Uso de tus ingresos del mes</span>
                <span className="font-bold text-slate-200">{gastoRatioPct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden p-0.5 border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    gastoRatioPct > 85
                      ? 'bg-rose-500'
                      : gastoRatioPct > 65
                      ? 'bg-amber-400'
                      : 'bg-gradient-to-r from-indigo-500 to-emerald-400'
                  }`}
                  style={{ width: `${Math.max(4, gastoRatioPct)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {blockedDuplicatesCount} duplicadas bloqueadas
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSection('escaner')}
                  className="text-indigo-300 hover:text-white underline font-semibold"
                >
                  Cambiar fecha límite →
                </button>
              </div>
            </div>
          </div>

          {/* 4 Tarjetas Ejecutivas de Métricas */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-2 gap-3">
            <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Salario / Ingresos
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
              <div className="my-1">
                <div className="text-lg sm:text-xl font-extrabold text-emerald-400">
                  {formatCurrency(metrics.totalGanancias, currency)}
                </div>
                <span className="text-[11px] text-slate-500">
                  {salaryProfile.salarioMensualNeto > 0
                    ? `Sueldo base: ${formatCurrency(salaryProfile.salarioMensualNeto, currency)}`
                    : 'Configura tu sueldo en Mi Mes'}
                </span>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Compras y Gastos
                </span>
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                </div>
              </div>
              <div className="my-1">
                <div className="text-lg sm:text-xl font-extrabold text-rose-400">
                  {formatCurrency(metrics.totalGastos, currency)}
                </div>
                <span className="text-[11px] text-slate-500">
                  Pagos fijos pend: {formatCurrency(metrics.pagosFijosPendientes, currency)}
                </span>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Deudas y Cupos
                </span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-amber-400" />
                </div>
              </div>
              <div className="my-1">
                <div className="text-lg sm:text-xl font-extrabold text-amber-400">
                  {formatCurrency(metrics.deudaTotalObligaciones, currency)}
                </div>
                <span className="text-[11px] text-slate-500">
                  Score crediticio: <strong className="text-slate-300">{metrics.scoreEstimado} pts</strong>
                </span>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Metas de Ahorro
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
                  <Target className="w-4 h-4 text-indigo-400" />
                </div>
              </div>
              <div className="my-1">
                <div className="text-lg sm:text-xl font-extrabold text-indigo-300">
                  {formatCurrency(metrics.totalMetasAhorrado, currency)}
                </div>
                <span className="text-[11px] text-slate-500">
                  Meta total: {formatCurrency(metrics.totalMetasObjetivo, currency)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Barra de Navegación Superior (Escritorio / Tablet) */}
        <nav className="hidden sm:flex overflow-x-auto gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800/90 shadow-inner">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  active
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* PESTAÑA 1: MI MES (SALARIO, COSAS QUE PAGO, METAS Y MOVIMIENTOS) */}
        {activeSection === 'mimes' && (
          <div className="space-y-5">
            <SalaryBillsGoalsCenter
              currency={currency}
              salaryProfile={salaryProfile}
              onUpdateSalary={(profile) => {
                setSalaryProfile(profile);
                showToast(`✅ Salario mensual guardado: ${formatCurrency(profile.salarioMensualNeto, currency)}`);
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
            />

            {/* Registro Manual de Compras, Ingresos o Gastos Diarios */}
            <form
              onSubmit={handleManualSubmit}
              className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-lg"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  Anexar Compra o Movimiento Manual
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveSection('escaner')}
                  className="text-xs text-indigo-300 hover:text-indigo-200 font-semibold flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Configurar lectura de notificaciones y fecha límite →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1 font-medium">Tipo</label>
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
                    <option value="ganancia">💰 Ganancia / Ingreso Extra</option>
                    <option value="deuda">⏳ Deuda / Cuota Pendiente</option>
                    <option value="trading">📈 Trading / Inversión</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1 font-medium">Categoría</label>
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
                  <label className="text-[11px] text-slate-400 block mb-1 font-medium">Monto ($)</label>
                  <input
                    type="number"
                    required
                    value={manMonto}
                    onChange={(e) => setManMonto(e.target.value)}
                    placeholder="Ej: 45000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1 font-medium">Banco / Medio</label>
                  <input
                    type="text"
                    value={manEntidad}
                    onChange={(e) => setManEntidad(e.target.value)}
                    placeholder="Nequi, Bancolombia, Efectivo..."
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
                  placeholder="Descripción del comercio o compra (ej. Supermercado D1, Restaurante, Gasolina)"
                  className="flex-1 min-w-[220px] bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white"
                />

                {manTipo === 'gasto' && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manEsEsencial}
                      onChange={(e) => setManEsEsencial(e.target.checked)}
                      className="accent-indigo-500"
                    />
                    Gasto Esencial
                  </label>
                )}

                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow transition"
                >
                  Guardar Movimiento
                </button>
              </div>
            </form>

            {/* Historial de Movimientos Registrados (Sin duplicados) */}
            <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex overflow-x-auto gap-1.5">
                  {[
                    { id: 'todos', label: `Todos (${transactions.length})` },
                    { id: 'gasto', label: '🛒 Compras' },
                    { id: 'ganancia', label: '💰 Ingresos' },
                    { id: 'deuda', label: '⏳ Deudas' },
                    { id: 'trading', label: '📈 Inversiones' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFiltroTipo(t.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        filtroTipo === t.id
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-400 hover:text-white bg-slate-950 border border-slate-800'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar comercio o banco..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white"
                    />
                  </div>

                  {transactions.length > 1 && (
                    <button
                      type="button"
                      onClick={handleCleanDuplicatesNow}
                      className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-indigo-950 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 shrink-0 transition"
                      title="Revisar y eliminar cualquier compra anotada más de una vez"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Depurar Duplicados</span>
                    </button>
                  )}
                </div>
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    No hay movimientos registrados con este filtro. Registra tu salario arriba o configura el lector automático con fecha límite en la pestaña <strong>Escáner</strong>.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTransactions.map((m) => (
                    <div
                      key={m.id}
                      className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800/80 hover:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs transition"
                    >
                      <div className="space-y-1 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-white text-sm font-bold">{m.desc}</strong>
                          {m.entidad && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-800">
                              {m.entidad}
                            </span>
                          )}
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-500/20">
                            {m.categoria}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                          <span>{m.fecha}</span>
                          <span>•</span>
                          <span className="uppercase font-semibold">{m.fuente}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
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
                          className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/40 transition"
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

        {/* PESTAÑA 2: ESCÁNER MULTIMODAL, PLAZO DE FECHA Y FILTRO ANTI-DUPLICADOS */}
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

        {/* PESTAÑA 3: CÁLCULOS, GRÁFICO DE ANILLOS RECHARTS, PROMEDIOS Y SIMULADOR */}
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

        {/* PESTAÑA 4: DEUDAS, TARJETAS Y VIDA CREDITICIA */}
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

        {/* PESTAÑA 5: ASESOR IA CONVERSACIONAL Y DESCARGA SAMSUNG A36 5G */}
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

      {/* Barra de Navegación Inferior Fija para uso cómodo en el Samsung Galaxy A36 5G */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-[#060913]/95 backdrop-blur-xl border-t border-slate-800/90 px-2 py-1.5 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl text-[10px] font-bold transition ${
                active ? 'text-white bg-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
export default App;
