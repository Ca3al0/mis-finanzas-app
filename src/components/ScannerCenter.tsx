import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bell,
  Image as ImageIcon,
  FileText,
  Mail,
  Sparkles,
  Upload,
  Camera,
  CheckCircle2,
  PlusCircle,
  ClipboardPaste,
  Lightbulb,
  CreditCard,
  Trash2,
  Radio,
  Settings,
  Zap,
  History,
  Search,
  X,
  Filter,
  Clock,
  RotateCcw,
  ShieldCheck,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AIAnalysisResult,
  SourceType,
  Transaction,
  CreditObligation,
  ExtractedTransactionItem,
  ProcessedNotificationRecord,
  NotificationCapturePolicy,
  CaptureTimeframeMode,
} from '../types/finance';
import { formatCurrency, CurrencyCode } from '../utils/financeCalculations';
import {
  extractTextFromPdfFileLocal,
  inspectImageLocally,
  runOnDeviceFinancialAnalysis,
  parseAllNumbersFromText,
  isNotificationOlderThanPolicy,
  isDuplicatePurchase,
  getPolicyCutoffTimestamp,
  buildPurchaseFingerprint,
} from '../utils/localAnalyzer';
import { callBackendApi } from '../utils/apiClient';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface ScannerCenterProps {
  currency: CurrencyCode;
  onAddTransactions: (items: Omit<Transaction, 'id' | 'fecha' | 'timestamp'>[]) => void;
  onAddOrUpdateCredit: (credit: Omit<CreditObligation, 'id'>) => void;
  autoCapturedNotifs: { id: string; app: string; text: string; time: string }[];
  onDismissCapturedNotif: (id: string) => void;
  onSimulateIncomingNotif: (app: string, text: string) => void;
  processedHistory: ProcessedNotificationRecord[];
  onRecordProcessedNotification: (record: Omit<ProcessedNotificationRecord, 'id' | 'timestamp' | 'fechaStr'>) => void;
  onDeleteProcessedRecord: (id: string) => void;
  onClearProcessedHistory: () => void;
  capturePolicy: NotificationCapturePolicy;
  onUpdateCapturePolicy: (policy: NotificationCapturePolicy) => void;
  existingTransactions: Transaction[];
  blockedDuplicatesCount: number;
  blockedOldCount: number;
  onCleanDuplicatesNow: () => void;
}

declare global {
  interface Window {
    __nativeListenerGranted?: boolean;
    __onAndroidNotificationsBatch?: (items: { app?: string; text?: string; time?: number }[]) => void;
    AndroidNativeBridge?: {
      openNotificationSettings?: () => void;
      openAppDetailsSettings?: () => void;
      requestAllRuntimePermissions?: () => void;
      scanActiveNotificationsNow?: () => void;
      isNotificationListenerEnabled?: () => boolean;
      getCapturedNotificationsJson?: () => string;
      clearCapturedNotifications?: () => void;
      setMinCaptureTimestamp?: (timestampMs: number) => void;
    };
  }
}

export const ScannerCenter: React.FC<ScannerCenterProps> = ({
  currency,
  onAddTransactions,
  onAddOrUpdateCredit,
  autoCapturedNotifs,
  onDismissCapturedNotif,
  onSimulateIncomingNotif,
  processedHistory,
  onRecordProcessedNotification,
  onDeleteProcessedRecord,
  onClearProcessedHistory,
  capturePolicy,
  onUpdateCapturePolicy,
  existingTransactions,
  blockedDuplicatesCount,
  blockedOldCount,
  onCleanDuplicatesNow,
}) => {
  const [activeMode, setActiveMode] = useState<SourceType>('notificacion');
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);
  const [autoSaveOnDetect, setAutoSaveOnDetect] = useState<boolean>(true);
  const [autoClipboardEnabled] = useState<boolean>(true);
  const [hasNativeAndroidBridge, setHasNativeAndroidBridge] = useState<boolean>(false);
  const [nativePermissionGranted, setNativePermissionGranted] = useState<boolean>(false);
  const [webNotifPerm, setWebNotifPerm] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [clipboardPermGranted, setClipboardPermGranted] = useState<boolean>(false);
  const [showPermissionsPanel, setShowPermissionsPanel] = useState<boolean>(false);

  // Estado del Modal de Historial de los últimos 30 días
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('todos');
  const [historyBankFilter, setHistoryBankFilter] = useState<string>('todos');
  const [historyDaysFilter, setHistoryDaysFilter] = useState<number>(30);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const lastClipboardRef = useRef<string>('');

  useEffect(() => {
    const checkBridge = () => {
      if (typeof Notification !== 'undefined') {
        setWebNotifPerm(Notification.permission);
      }
      if (window.AndroidNativeBridge) {
        setHasNativeAndroidBridge(true);
        try {
          setNativePermissionGranted(
            Boolean(window.AndroidNativeBridge.isNotificationListenerEnabled?.() || window.__nativeListenerGranted)
          );
        } catch {
          // ignore
        }
      } else if (window.__nativeListenerGranted) {
        setNativePermissionGranted(true);
      }
    };
    checkBridge();
    const interval = setInterval(checkBridge, 2500);
    window.addEventListener('focus', checkBridge);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkBridge);
    };
  }, []);

  // Sincronizar fecha límite con el puente nativo Android cada vez que cambie la política
  useEffect(() => {
    const cutoff = getPolicyCutoffTimestamp(capturePolicy);
    try {
      window.AndroidNativeBridge?.setMinCaptureTimestamp?.(cutoff);
    } catch {
      // ignore
    }
  }, [capturePolicy]);

  // Filtrar registros de los últimos 30 días
  const recent30DaysHistory = useMemo(() => {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    return processedHistory
      .filter((item) => item.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [processedHistory]);

  const availableBanksInHistory = useMemo(() => {
    const set = new Set<string>();
    recent30DaysHistory.forEach((h) => {
      if (h.entidad) set.add(h.entidad);
    });
    return Array.from(set);
  }, [recent30DaysHistory]);

  const filteredHistoryRecords = useMemo(() => {
    const now = Date.now();
    const maxAgeMs = historyDaysFilter * 24 * 60 * 60 * 1000;
    const q = historySearch.trim().toLowerCase();

    return recent30DaysHistory.filter((item) => {
      if (now - item.timestamp > maxAgeMs) return false;
      if (historyTypeFilter !== 'todos' && item.tipoPrincipal !== historyTypeFilter) return false;
      if (historyBankFilter !== 'todos' && item.entidad !== historyBankFilter) return false;
      if (q) {
        const haystack = `${item.textoOriginal} ${item.resumen} ${item.entidad} ${item.categoriaPrincipal} ${item.fechaStr}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [recent30DaysHistory, historySearch, historyTypeFilter, historyBankFilter, historyDaysFilter]);

  const historySummary = useMemo(() => {
    let gastos = 0;
    let ingresos = 0;
    filteredHistoryRecords.forEach((r) => {
      if (r.tipoPrincipal === 'ganancia') ingresos += r.montoTotal;
      else gastos += r.montoTotal;
    });
    return { gastos, ingresos, count: filteredHistoryRecords.length };
  }, [filteredHistoryRecords]);

  // Valida plazo y anti-duplicados antes de guardar movimientos extraídos
  const validateAndSaveExtractedResult = (
    res: AIAnalysisResult,
    rawText: string,
    source: SourceType,
    eventTimestampMs = Date.now()
  ): { savedCount: number; blockedReason?: string } => {
    setWarningBanner(null);

    if (!res || (res.movimientosDetectados.length === 0 && !res.datosExtractoCredito)) {
      return { savedCount: 0 };
    }

    // 1. Validar si la notificación es más antigua que la fecha/plazo configurado por el usuario
    if (capturePolicy.ignorarNotificacionesAntiguas && (source === 'notificacion' || source === 'automatico')) {
      const oldCheck = isNotificationOlderThanPolicy(rawText, eventTimestampMs, capturePolicy);
      if (oldCheck.isOld) {
        setWarningBanner(`⏳ Ignorada por antigüedad: ${oldCheck.reason}. No se sumó a tus gastos.`);
        return { savedCount: 0, blockedReason: oldCheck.reason };
      }
    }

    // 2. Filtrar movimientos que ya hayan sido registrados por otra notificación de la misma compra
    const uniqueMovements: ExtractedTransactionItem[] = [];
    let duplicateReason = '';

    for (const item of res.movimientosDetectados) {
      if (capturePolicy.evitarDuplicadosMismaCompra) {
        const dupCheck = isDuplicatePurchase(
          {
            monto: item.monto,
            tipo: item.tipo,
            categoria: item.categoria,
            entidad: item.entidad,
            desc: item.desc,
            rawText,
            timestamp: eventTimestampMs,
          },
          existingTransactions,
          processedHistory,
          capturePolicy.ventanaAntiduplicadosMinutos
        );
        if (dupCheck.isDuplicate) {
          duplicateReason = dupCheck.reason || 'Compra ya registrada anteriormente';
          continue;
        }
      }
      uniqueMovements.push(item);
    }

    if (res.movimientosDetectados.length > 0 && uniqueMovements.length === 0) {
      setWarningBanner(`🛡️ Compra repetida bloqueada: ${duplicateReason}. No se volvió a descontar.`);
      return { savedCount: 0, blockedReason: duplicateReason };
    }

    // 3. Registrar en el historial de 30 días y en transacciones
    const firstMov = uniqueMovements[0];
    const total =
      uniqueMovements.reduce((acc, m) => acc + m.monto, 0) || res.datosExtractoCredito?.saldoActual || 0;

    onRecordProcessedNotification({
      fuente: source,
      entidad: firstMov?.entidad || res.datosExtractoCredito?.entidad || 'Banco',
      textoOriginal: rawText.trim() || res.resumenEjecutivo,
      resumen: firstMov ? `${firstMov.desc}` : res.resumenEjecutivo,
      montoTotal: total,
      tipoPrincipal: firstMov?.tipo || 'gasto',
      categoriaPrincipal: firstMov?.categoria || 'Otros',
      itemsCount: Math.max(1, uniqueMovements.length),
      fingerprint: firstMov
        ? buildPurchaseFingerprint(firstMov.monto, firstMov.tipo, `${firstMov.desc} ${rawText}`, firstMov.entidad)
        : undefined,
    });

    if (autoSaveOnDetect && uniqueMovements.length > 0) {
      onAddTransactions(
        uniqueMovements.map((item) => ({
          tipo: item.tipo,
          categoria: item.categoria,
          monto: item.monto,
          desc: item.desc,
          entidad: item.entidad,
          cuotas: item.cuotas || 1,
          fuente: source,
          esEsencial: item.esEsencial ?? false,
          fingerprint: buildPurchaseFingerprint(item.monto, item.tipo, `${item.desc} ${rawText}`, item.entidad),
        }))
      );
      return { savedCount: uniqueMovements.length };
    }

    return { savedCount: 0 };
  };

  // Auto-lectura de notificación copiada al abrir o tocar la aplicación (con filtro de fecha y anti-duplicados)
  useEffect(() => {
    if (!autoClipboardEnabled) return;
    const handleVisibilityOrFocus = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const clip = (await navigator.clipboard.readText())?.trim();
        if (
          clip &&
          clip !== lastClipboardRef.current &&
          clip.length >= 10 &&
          clip.length <= 1500 &&
          parseAllNumbersFromText(clip).length > 0 &&
          /\$|cop|compra|recibiste|pagaste|abono|nequi|bancolombia|daviplata|nu|transferencia|factura|cuota|retiro/i.test(clip)
        ) {
          lastClipboardRef.current = clip;
          setInputText(clip);
          setActiveMode('notificacion');
          const res = runOnDeviceFinancialAnalysis({
            sourceType: 'notificacion',
            text: clip,
          });
          setAnalysisResult(res);
          if (res.movimientosDetectados.length > 0) {
            const outcome = validateAndSaveExtractedResult(res, clip, 'notificacion', Date.now());
            if (outcome.savedCount > 0) {
              setSavedBanner(
                `📲 Compra detectada y registrada (${formatCurrency(
                  res.movimientosDetectados[0].monto,
                  currency
                )})`
              );
            }
          }
        }
      } catch {
        // Requiere gesto táctil en Android Chrome
      }
    };

    const handleFirstTouchAfterFocus = () => {
      handleVisibilityOrFocus();
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('pointerdown', handleFirstTouchAfterFocus, { passive: true });
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('pointerdown', handleFirstTouchAfterFocus);
    };
  }, [autoClipboardEnabled, autoSaveOnDetect, currency, capturePolicy, existingTransactions, processedHistory]);

  const handleRequestAllPermissions = async () => {
    const statusMessages: string[] = [];

    if (window.AndroidNativeBridge?.requestAllRuntimePermissions) {
      try {
        window.AndroidNativeBridge.requestAllRuntimePermissions();
        statusMessages.push('Diálogo Android abierto');
      } catch {
        // ignore
      }
    }

    if (typeof Notification !== 'undefined' && Notification.requestPermission) {
      try {
        const perm = await Notification.requestPermission();
        setWebNotifPerm(perm);
        if (perm === 'granted') {
          statusMessages.push('Notificaciones concedidas ✓');
        }
      } catch {
        // ignore
      }
    }

    if (navigator.clipboard?.readText) {
      try {
        const clip = (await navigator.clipboard.readText())?.trim();
        setClipboardPermGranted(true);
        statusMessages.push('Portapapeles activo ✓');
        if (
          clip &&
          clip.length >= 8 &&
          parseAllNumbersFromText(clip).length > 0 &&
          /\$|cop|compra|recibiste|pagaste|abono|nequi|bancolombia|daviplata|nu|transferencia|factura|cuota|retiro/i.test(clip)
        ) {
          lastClipboardRef.current = clip;
          onSimulateIncomingNotif('Portapapeles', clip);
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

    setSavedBanner(
      statusMessages.length > 0
        ? `🔔 Permisos verificados: ${statusMessages.join(' • ')}`
        : '🔔 Solicitud enviada. Activa también "3. Abrir Acceso a Notificaciones".'
    );
  };

  const handleOpenAppDetailsSettings = () => {
    if (window.AndroidNativeBridge?.openAppDetailsSettings) {
      window.AndroidNativeBridge.openAppDetailsSettings();
      return;
    }
    if (/android/i.test(navigator.userAgent)) {
      window.location.href =
        'intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:com.misfinanzas.personal.a36;end';
    } else {
      alert(
        'En tu Samsung Galaxy A36 5G ve a: Ajustes → Aplicaciones → Mis Finanzas → toca los 3 puntos (⋮) arriba a la derecha → "Permitir ajustes restringidos".'
      );
    }
  };

  const handleOpenNotificationAccessSettings = () => {
    if (window.AndroidNativeBridge?.openNotificationSettings) {
      window.AndroidNativeBridge.openNotificationSettings();
      return;
    }
    if (/android/i.test(navigator.userAgent)) {
      window.location.href = 'intent:#Intent;action=android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS;end';
    } else {
      alert(
        'En tu Samsung Galaxy A36 5G ve a: Ajustes → Notificaciones → Ajustes avanzados → Acceso a notificaciones → activa "Mis Finanzas".'
      );
    }
  };

  const handleScanAllSourcesNow = async () => {
    let foundCount = 0;

    try {
      window.AndroidNativeBridge?.scanActiveNotificationsNow?.();
      const rawJson = window.AndroidNativeBridge?.getCapturedNotificationsJson?.();
      if (rawJson && rawJson !== '[]') {
        const list = JSON.parse(rawJson);
        if (Array.isArray(list) && list.length > 0) {
          list.forEach((item: any) => {
            if (item?.text) {
              onSimulateIncomingNotif(item.app || 'Android', item.text);
              foundCount++;
            }
          });
          window.AndroidNativeBridge?.clearCapturedNotifications?.();
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
              onSimulateIncomingNotif(item.app || 'Webhook Automático', item.text);
              foundCount++;
            }
          });
        }
      }
    } catch {
      // ignore
    }

    try {
      const clip = (await navigator.clipboard.readText())?.trim();
      setClipboardPermGranted(true);
      if (
        clip &&
        clip !== lastClipboardRef.current &&
        parseAllNumbersFromText(clip).length > 0 &&
        /\$|cop|compra|recibiste|pagaste|abono|nequi|bancolombia|daviplata|nu|transferencia|factura|cuota|retiro/i.test(clip)
      ) {
        lastClipboardRef.current = clip;
        onSimulateIncomingNotif('Portapapeles', clip);
        foundCount++;
      }
    } catch {
      // ignore
    }

    if (foundCount > 0) {
      setSavedBanner(`✅ ¡Se revisaron ${foundCount} notificación(es) aplicando filtro anti-duplicados y fecha!`);
    } else {
      setSavedBanner('📡 Escaneo al día: No hay compras nuevas pendientes por registrar.');
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setClipboardPermGranted(true);
      if (text && text.trim()) {
        setInputText(text);
        const res = runOnDeviceFinancialAnalysis({
          sourceType: activeMode,
          text,
        });
        setAnalysisResult(res);
        if (res.movimientosDetectados.length > 0 || res.datosExtractoCredito) {
          const outcome = validateAndSaveExtractedResult(res, text, activeMode, Date.now());
          if (outcome.savedCount > 0) {
            setSavedBanner(
              `✅ ¡Pegado y registrado sin duplicados! (${outcome.savedCount} compra/movimiento único)`
            );
          }
        }
      } else {
        alert('Tu portapapeles está vacío. Copia primero el texto de la notificación o escríbela en el cuadro.');
      }
    } catch {
      alert('Mantén presionado dentro del cuadro de texto y toca "Pegar".');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setMimeType(file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'));

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      await inspectImageLocally(file);
    } else {
      setPreviewUrl(null);
    }

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const extractedText = await extractTextFromPdfFileLocal(file);
      if (extractedText) {
        setInputText(extractedText);
      }
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBase64Data(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunAnalysis = async () => {
    if (!inputText.trim() && !selectedFile) return;

    const rawToRecord = inputText.trim() || selectedFile?.name || 'Documento escaneado';
    setIsAnalyzing(true);
    setSavedBanner(null);
    setWarningBanner(null);

    try {
      if (!selectedFile && activeMode === 'notificacion') {
        const localRes = runOnDeviceFinancialAnalysis({
          sourceType: 'notificacion',
          text: inputText,
        });
        setAnalysisResult(localRes);
        if (localRes.movimientosDetectados.length > 0 || localRes.datosExtractoCredito) {
          const outcome = validateAndSaveExtractedResult(localRes, rawToRecord, 'notificacion', Date.now());
          if (outcome.savedCount > 0) {
            setSavedBanner(
              `✅ ¡Compra única registrada!: ${localRes.movimientosDetectados
                .map((m) => `${m.desc} (${formatCurrency(m.monto, currency)})`)
                .join(', ')}`
            );
            setInputText('');
          }
        }
        setIsAnalyzing(false);
        return;
      }

      const data = await callBackendApi<AIAnalysisResult>(
        '/api/ai/analyze',
        {
          sourceType: activeMode,
          text: inputText,
          base64Data,
          mimeType,
          fileName: selectedFile?.name,
        },
        35000
      );
      setAnalysisResult(data);
      if (data.movimientosDetectados?.length > 0 || data.datosExtractoCredito) {
        const outcome = validateAndSaveExtractedResult(data, rawToRecord, activeMode, Date.now());
        if (outcome.savedCount > 0) {
          setSavedBanner(`✅ ¡Se analizaron y guardaron ${outcome.savedCount} movimiento(s) único(s)!`);
        }
      }
    } catch {
      const localRes = runOnDeviceFinancialAnalysis({
        sourceType: activeMode,
        text: inputText,
        fileName: selectedFile?.name,
      });
      setAnalysisResult(localRes);
      if (localRes.movimientosDetectados.length > 0 || localRes.datosExtractoCredito) {
        const outcome = validateAndSaveExtractedResult(localRes, rawToRecord, activeMode, Date.now());
        if (outcome.savedCount > 0) {
          setSavedBanner(`✅ ¡Registrado sin duplicados!: ${outcome.savedCount} movimiento(s).`);
        }
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImportAllMovements = () => {
    if (!analysisResult || analysisResult.movimientosDetectados.length === 0) return;
    onAddTransactions(
      analysisResult.movimientosDetectados.map((item) => ({
        tipo: item.tipo,
        categoria: item.categoria,
        monto: item.monto,
        desc: item.desc,
        entidad: item.entidad,
        cuotas: item.cuotas || 1,
        fuente: activeMode,
        esEsencial: item.esEsencial ?? false,
        fingerprint: buildPurchaseFingerprint(item.monto, item.tipo, item.desc, item.entidad),
      }))
    );
    setSavedBanner(`✅ Se guardaron manualmente ${analysisResult.movimientosDetectados.length} movimiento(s).`);
  };

  const handleImportSingleMovement = (item: ExtractedTransactionItem) => {
    onAddTransactions([
      {
        tipo: item.tipo,
        categoria: item.categoria,
        monto: item.monto,
        desc: item.desc,
        entidad: item.entidad,
        cuotas: item.cuotas || 1,
        fuente: activeMode,
        esEsencial: item.esEsencial ?? false,
        fingerprint: buildPurchaseFingerprint(item.monto, item.tipo, item.desc, item.entidad),
      },
    ]);
    setSavedBanner(`✅ Movimiento "${item.desc}" (${formatCurrency(item.monto, currency)}) registrado.`);
  };

  const handleSaveExtractedCredit = () => {
    const ext = analysisResult?.datosExtractoCredito;
    if (!ext) return;

    onAddOrUpdateCredit({
      nombre: `Tarjeta / Crédito ${ext.entidad || 'Detectado'}`,
      entidad: ext.entidad || 'Banco',
      tipo: 'tarjeta_credito',
      cupoTotal: ext.cupoTotal || 0,
      saldoActual: ext.saldoActual || 0,
      tasaEA: ext.tasaEA || 28.5,
      cuotaMinima: ext.pagoMinimo || 50000,
      diaCorte: 15,
      diaPago: 2,
      enMora: false,
      notas: `Importado de extracto. Cuota de manejo: $${(ext.cuotaManejo || 0).toLocaleString('es-CO')}.`,
    });
    setSavedBanner(`✅ Obligación crediticia de ${ext.entidad || 'tu extracto'} guardada en Deudas.`);
  };

  const formatRelativeDays = (timestamp: number) => {
    const diffMs = Math.max(0, Date.now() - timestamp);
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Hace unos minutos';
    if (diffHours < 24) return `Hace ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    return diffDays === 1 ? 'Ayer' : `Hace ${diffDays} días`;
  };

  const cutoffTimestamp = getPolicyCutoffTimestamp(capturePolicy);
  const cutoffFormatted = cutoffTimestamp
    ? new Date(cutoffTimestamp).toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Sin límite de antigüedad';

  return (
    <div className="space-y-4">
      {/* TARJETA 1: ESCUDO ANTI-DUPLICADOS Y PLAZO DE FECHA DE CAPTURA */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-indigo-500/30 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-indigo-500/40 flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                  Filtro Inteligente Anti-Duplicados y Plazo de Fechas
                </h2>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-500/40 text-emerald-300">
                  1 Compra = 1 Único Registro
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Evita anotar la misma compra varias veces (Push + SMS + Correo) y bloquea notificaciones antiguas
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-500/50 text-indigo-200 transition shadow-sm"
            >
              <History className="w-4 h-4 text-indigo-400" />
              <span>Historial 30 Días</span>
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-indigo-600 text-white font-extrabold">
                {recent30DaysHistory.length}
              </span>
            </button>

            <button
              type="button"
              onClick={onCleanDuplicatesNow}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-500/50 text-slate-200 hover:text-rose-200 transition"
              title="Eliminar cualquier compra repetida en tus movimientos actuales"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Depurar Duplicados</span>
            </button>
          </div>
        </div>

        {/* Selector de Plazo / Fecha desde la cual registrar notificaciones */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-slate-950/90 border border-slate-800/90 rounded-2xl p-3.5">
          <div className="lg:col-span-7 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>¿Desde qué fecha quieres registrar notificaciones?</span>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={capturePolicy.ignorarNotificacionesAntiguas}
                  onChange={(e) =>
                    onUpdateCapturePolicy({
                      ...capturePolicy,
                      ignorarNotificacionesAntiguas: e.target.checked,
                    })
                  }
                  className="accent-emerald-500"
                />
                Bloquear antiguas
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'desde_ahora', label: '⚡ Desde Ahora' },
                { id: 'solo_hoy', label: '☀️ Solo Hoy' },
                { id: 'fecha_personalizada', label: '📅 Elegir Fecha' },
                { id: 'ultimos_dias', label: '⏳ Últimos Días' },
              ].map((opt) => {
                const active = capturePolicy.modoPlazo === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      const now = Date.now();
                      onUpdateCapturePolicy({
                        ...capturePolicy,
                        ignorarNotificacionesAntiguas: true,
                        modoPlazo: opt.id as CaptureTimeframeMode,
                        timestampCorteMs: opt.id === 'desde_ahora' ? now : capturePolicy.timestampCorteMs,
                      });
                    }}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition ${
                      active
                        ? 'bg-indigo-600 border-indigo-400 text-white shadow'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {capturePolicy.modoPlazo === 'fecha_personalizada' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-300">Registrar solo desde:</span>
                <input
                  type="datetime-local"
                  value={capturePolicy.desdeFechaISO}
                  onChange={(e) =>
                    onUpdateCapturePolicy({
                      ...capturePolicy,
                      desdeFechaISO: e.target.value,
                      timestampCorteMs: new Date(e.target.value).getTime() || Date.now(),
                    })
                  }
                  className="bg-slate-900 border border-indigo-500/50 rounded-xl px-3 py-1.5 text-xs text-white font-semibold"
                />
              </div>
            )}

            {capturePolicy.modoPlazo === 'ultimos_dias' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-300">Aceptar notificaciones de los últimos:</span>
                {[1, 3, 7, 15, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      onUpdateCapturePolicy({
                        ...capturePolicy,
                        ultimosDias: d,
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                      capturePolicy.ultimosDias === d
                        ? 'bg-indigo-600 border-indigo-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {d} {d === 1 ? 'día' : 'días'}
                  </button>
                ))}
              </div>
            )}

            <div className="text-[11px] text-slate-400 flex items-center justify-between gap-2 pt-0.5">
              <span>
                📌 <strong>Corte activo:</strong> Solo se registran compras desde{' '}
                <strong className="text-indigo-300">{cutoffFormatted}</strong> en adelante.
              </span>
              {capturePolicy.modoPlazo === 'desde_ahora' && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateCapturePolicy({
                      ...capturePolicy,
                      timestampCorteMs: Date.now(),
                    })
                  }
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 underline shrink-0"
                >
                  Actualizar a este minuto
                </button>
              )}
            </div>
          </div>

          {/* Configuración de Ventana Anti-Duplicados */}
          <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                🛡️ Protección Misma Compra
              </span>
              <label className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={capturePolicy.evitarDuplicadosMismaCompra}
                  onChange={(e) =>
                    onUpdateCapturePolicy({
                      ...capturePolicy,
                      evitarDuplicadosMismaCompra: e.target.checked,
                    })
                  }
                  className="accent-emerald-500"
                />
                Activa
              </label>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Si una compra envía notificación de la App + SMS + Correo por el mismo monto, solo se anota la primera vez.
            </p>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-300">Ventana de bloqueo:</span>
              <select
                value={capturePolicy.ventanaAntiduplicadosMinutos}
                onChange={(e) =>
                  onUpdateCapturePolicy({
                    ...capturePolicy,
                    ventanaAntiduplicadosMinutos: Number(e.target.value),
                  })
                }
                aria-label="Ventana anti-duplicados"
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-semibold"
              >
                <option value={15}>15 minutos</option>
                <option value={60}>1 hora (Recomendado)</option>
                <option value={360}>6 horas</option>
                <option value={1440}>Mismo día (24 horas)</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
              <span className="text-emerald-400 font-semibold">
                🛡️ {blockedDuplicatesCount} duplicadas omitidas
              </span>
              <span className="text-amber-300 font-semibold">
                ⏳ {blockedOldCount} antiguas omitidas
              </span>
            </div>
          </div>
        </div>

        {/* Barra Compacta de Acciones Rápidas y Permisos del Teléfono */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleScanAllSourcesNow}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Sincronizar Compras Nuevas</span>
            </button>

            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Pegar del Portapapeles</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPermissionsPanel((v) => !v)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-400" />
              <span>Configurar Permisos Samsung A36</span>
              {showPermissionsPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl cursor-pointer text-slate-200">
            <input
              type="checkbox"
              checked={autoSaveOnDetect}
              onChange={(e) => setAutoSaveOnDetect(e.target.checked)}
              className="accent-emerald-500"
            />
            Auto-Guardar
          </label>
        </div>

        {/* Panel Desplegable de Permisos del Dispositivo */}
        {showPermissionsPanel && (
          <div className="bg-slate-950 border border-indigo-500/30 rounded-2xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-indigo-200">
                Permisos de Lectura Automática en Samsung Galaxy A36 5G:
              </span>
              <span className="text-[11px] text-slate-400">
                Estado: {nativePermissionGranted ? '🟢 Escucha Android 24/7 Activa' : webNotifPerm === 'granted' || clipboardPermGranted ? '🟢 Permisos Web Activos' : '🟡 Pendiente'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleRequestAllPermissions}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Bell className="w-4 h-4 shrink-0" />
                <span>1. Pedir Permisos Ahora</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAppDetailsSettings}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>2. Permitir Ajustes Restringidos</span>
              </button>

              <button
                type="button"
                onClick={handleOpenNotificationAccessSettings}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>3. Abrir Acceso a Notificaciones</span>
              </button>
            </div>
          </div>
        )}

        {/* Bandeja de Notificaciones Pendientes de Revisión */}
        {autoCapturedNotifs.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <span className="text-xs font-bold text-emerald-400 block">
              📥 Notificaciones Recibidas ({autoCapturedNotifs.length}):
            </span>
            {autoCapturedNotifs.map((n) => (
              <div
                key={n.id}
                className="bg-slate-950 border border-emerald-500/40 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex-1 min-w-[200px]">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300">
                    {n.app} • {n.time}
                  </span>
                  <p className="text-slate-100 font-medium mt-1">{n.text}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const r = runOnDeviceFinancialAnalysis({
                        sourceType: 'notificacion',
                        text: n.text,
                      });
                      setAnalysisResult(r);
                      const outcome = validateAndSaveExtractedResult(r, n.text, 'notificacion', Date.now());
                      if (outcome.savedCount > 0) {
                        setSavedBanner(`✅ Notificación de ${n.app} guardada como compra única.`);
                      }
                      onDismissCapturedNotif(n.id);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg"
                  >
                    Registrar Compra
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissCapturedNotif(n.id)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {warningBanner && (
        <div className="bg-amber-950/90 border border-amber-500/60 text-amber-200 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 shadow-lg">
          <span>{warningBanner}</span>
          <button
            type="button"
            onClick={() => setWarningBanner(null)}
            className="text-amber-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {savedBanner && (
        <div className="bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{savedBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="text-[11px] underline text-emerald-300 hover:text-white shrink-0"
          >
            Ver Historial 30 días →
          </button>
        </div>
      )}

      {/* Escáner Multimodal: Notificación Escrita, Foto/Recibo, Extracto PDF, Correo */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: 'notificacion', label: 'Notificación / SMS', icon: Bell },
            { id: 'imagen', label: 'Foto de Recibo', icon: ImageIcon },
            { id: 'pdf', label: 'Extracto PDF', icon: FileText },
            { id: 'correo', label: 'Correo Bancario', icon: Mail },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveMode(tab.id as SourceType);
                  setSavedBanner(null);
                  setWarningBanner(null);
                }}
                className={`flex items-center gap-2 p-3 rounded-2xl border text-left transition ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 border-indigo-400 text-white font-bold shadow-md'
                    : 'bg-slate-950/90 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-xs">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {(activeMode === 'imagen' || activeMode === 'pdf') && (
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-dashed border-slate-700">
            <input
              ref={fileInputRef}
              type="file"
              accept={activeMode === 'imagen' ? 'image/*' : 'application/pdf,.pdf,.txt'}
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-300">
                {selectedFile ? (
                  <span className="text-emerald-400 font-semibold">
                    📎 Archivo cargado: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                  </span>
                ) : activeMode === 'imagen' ? (
                  'Toma una foto a tu recibo/factura o elige una imagen de tu galería:'
                ) : (
                  'Selecciona el archivo PDF de tu extracto bancario desde tu celular:'
                )}
              </div>

              <div className="flex items-center gap-2">
                {activeMode === 'imagen' && (
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
                  >
                    <Camera className="w-4 h-4" />
                    Tomar Foto
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold px-3 py-2 rounded-xl border border-slate-700 transition"
                >
                  <Upload className="w-4 h-4" />
                  {activeMode === 'imagen' ? 'Galería' : 'Subir PDF'}
                </button>
                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      setBase64Data(null);
                    }}
                    className="p-2 text-rose-400 hover:bg-rose-950/50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {previewUrl && (
              <div className="mt-3 flex justify-center">
                <img
                  src={previewUrl}
                  alt="Comprobante seleccionado"
                  className="max-h-48 rounded-xl border border-slate-700 object-contain"
                />
              </div>
            )}
          </div>
        )}

        <div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={3}
            placeholder={
              activeMode === 'notificacion'
                ? 'Pega o escribe una notificación para analizarla (Ej: "Bancolombia: Compraste $45.000 en D1")...'
                : activeMode === 'pdf'
                ? 'Sube tu extracto PDF arriba o pega aquí el texto del extracto...'
                : activeMode === 'correo'
                ? 'Pega aquí el texto del correo de tu banco o factura...'
                : 'Opcional: Escribe un detalle o monto si la imagen está borrosa...'
            }
            className="w-full bg-slate-950 text-slate-100 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-2xl p-3.5 text-sm"
          />

          <div className="flex flex-wrap items-center justify-between mt-3 gap-2">
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="text-xs text-slate-400 hover:text-indigo-300 flex items-center gap-1.5 font-medium"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              Historial de los últimos 30 días ({recent30DaysHistory.length})
            </button>

            <div className="flex items-center gap-2">
              {inputText && (
                <button
                  type="button"
                  onClick={() => {
                    setInputText('');
                    setAnalysisResult(null);
                  }}
                  className="text-xs text-slate-400 hover:text-white px-2.5 py-2"
                >
                  Limpiar
                </button>
              )}
              <button
                type="button"
                disabled={isAnalyzing || (!inputText.trim() && !selectedFile)}
                onClick={handleRunAnalysis}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-lg transition"
              >
                <Sparkles className="w-4 h-4" />
                {isAnalyzing
                  ? 'Analizando...'
                  : autoSaveOnDetect
                  ? 'Analizar y Registrar (Sin Duplicar)'
                  : 'Analizar Contenido'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resultados extraídos */}
      {analysisResult && (
        <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                {analysisResult.tipoDocumentoDetectado}
              </span>
              <p className="text-sm text-slate-200 mt-1.5">{analysisResult.resumenEjecutivo}</p>
            </div>

            {(!autoSaveOnDetect || warningBanner) && analysisResult.movimientosDetectados.length > 0 && (
              <button
                type="button"
                onClick={handleImportAllMovements}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow transition shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                Forzar Guardado ({analysisResult.movimientosDetectados.length})
              </button>
            )}
          </div>

          {analysisResult.datosExtractoCredito && (
            <div className="bg-indigo-950/30 border border-indigo-500/40 rounded-2xl p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4" />
                  Resumen de Extracto ({analysisResult.datosExtractoCredito.entidad})
                </h3>
                <button
                  type="button"
                  onClick={handleSaveExtractedCredit}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg"
                >
                  + Guardar en Mis Deudas
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-xl">
                  <span className="text-slate-400 block">Cupo Total</span>
                  <strong className="text-white">
                    {formatCurrency(analysisResult.datosExtractoCredito.cupoTotal || 0, currency)}
                  </strong>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl">
                  <span className="text-slate-400 block">Saldo / Deuda</span>
                  <strong className="text-amber-400">
                    {formatCurrency(analysisResult.datosExtractoCredito.saldoActual || 0, currency)}
                  </strong>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl">
                  <span className="text-slate-400 block">Pago Mínimo</span>
                  <strong className="text-emerald-400">
                    {formatCurrency(analysisResult.datosExtractoCredito.pagoMinimo || 0, currency)}
                  </strong>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl">
                  <span className="text-slate-400 block">Tasa E.A.</span>
                  <strong className="text-rose-400">{analysisResult.datosExtractoCredito.tasaEA}% E.A.</strong>
                </div>
              </div>
            </div>
          )}

          {analysisResult.movimientosDetectados.length > 0 && (
            <div className="space-y-2">
              {analysisResult.movimientosDetectados.map((mov, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-2xl p-3.5"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{mov.desc}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        {mov.entidad}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300">
                        {mov.categoria}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-extrabold ${
                        mov.tipo === 'ganancia' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {mov.tipo === 'ganancia' ? '+' : '-'}
                      {formatCurrency(mov.monto, currency)}
                    </span>
                    {!autoSaveOnDetect && (
                      <button
                        type="button"
                        onClick={() => handleImportSingleMovement(mov)}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg transition"
                      >
                        + Guardar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {analysisResult.ejemploPracticoAhorro && (
            <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-3 text-xs text-amber-100 flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{analysisResult.ejemploPracticoAhorro}</span>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE HISTORIAL DE NOTIFICACIONES PROCESADAS (ÚLTIMOS 30 DÍAS) */}
      {showHistoryModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-history-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-4 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
                  <History className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 id="modal-history-title" className="text-sm sm:text-base font-bold text-white">
                    Historial de Notificaciones Procesadas (Últimos 30 Días)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Registros únicos verificados sin duplicados
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
                title="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-900/90 border-b border-slate-800 space-y-3">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Compras / Eventos Únicos
                  </span>
                  <strong className="text-sm sm:text-base font-extrabold text-white">
                    {historySummary.count} registros
                  </strong>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Compras Detectadas
                  </span>
                  <strong className="text-sm sm:text-base font-extrabold text-rose-400">
                    {formatCurrency(historySummary.gastos, currency)}
                  </strong>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Abonos Detectados
                  </span>
                  <strong className="text-sm sm:text-base font-extrabold text-emerald-400">
                    {formatCurrency(historySummary.ingresos, currency)}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-6 relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Buscar por comercio, monto, banco o texto..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl pl-8 pr-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <select
                    value={historyBankFilter}
                    onChange={(e) => setHistoryBankFilter(e.target.value)}
                    aria-label="Filtrar por banco"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
                  >
                    <option value="todos">🏦 Todos los bancos</option>
                    {availableBanksInHistory.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <select
                    value={historyDaysFilter}
                    onChange={(e) => setHistoryDaysFilter(Number(e.target.value))}
                    aria-label="Filtrar por periodo"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
                  >
                    <option value={30}>📅 Últimos 30 días</option>
                    <option value={15}>📅 Últimos 15 días</option>
                    <option value={7}>📅 Últimos 7 días</option>
                    <option value={1}>📅 Últimas 24 horas</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
                  {[
                    { id: 'todos', label: 'Todos' },
                    { id: 'gasto', label: 'Compras / Pagos' },
                    { id: 'ganancia', label: 'Ingresos / Abonos' },
                    { id: 'deuda', label: 'Deudas' },
                  ].map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setHistoryTypeFilter(pill.id)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition ${
                        historyTypeFilter === pill.id
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>

                {recent30DaysHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('¿Deseas vaciar el historial de notificaciones procesadas?')) {
                        onClearProcessedHistory();
                      }
                    }}
                    className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Vaciar historial
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {filteredHistoryRecords.length === 0 ? (
                <div className="text-center py-12 px-4 space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                    <History className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-300">
                    No se encontraron notificaciones procesadas con este filtro
                  </p>
                </div>
              ) : (
                filteredHistoryRecords.map((record) => (
                  <div
                    key={record.id}
                    className="bg-slate-950 border border-slate-800/90 hover:border-indigo-500/40 rounded-xl p-3.5 transition space-y-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                            {record.entidad}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                            {record.categoriaPrincipal}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {record.fechaStr} ({formatRelativeDays(record.timestamp)})
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-white">{record.resumen}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-extrabold ${
                            record.tipoPrincipal === 'ganancia' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {record.tipoPrincipal === 'ganancia' ? '+' : '-'}
                          {formatCurrency(record.montoTotal, currency)}
                        </span>

                        <button
                          type="button"
                          onClick={() => onDeleteProcessedRecord(record.id)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 transition"
                          title="Eliminar del historial"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="bg-slate-900/90 border border-slate-800/80 rounded-lg px-3 py-2 text-[11px] text-slate-300 font-mono break-words">
                      {record.textoOriginal}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span> Conservación automática de 30 días sin duplicados</span>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-1.5 rounded-xl transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
