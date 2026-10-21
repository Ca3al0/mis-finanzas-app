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
  Settings,
  History,
  Search,
  X,
  Filter,
  Clock,
  RotateCcw,
  ShieldCheck,
  Calendar,
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
      syncWidgetSummary?: (jsonPayload: string) => void;
      openWidgetAgentDialog?: (initialPrompt?: string) => void;
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
  const [nativePermissionGranted, setNativePermissionGranted] = useState<boolean>(false);
  const [webNotifPerm, setWebNotifPerm] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [clipboardPermGranted, setClipboardPermGranted] = useState<boolean>(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState<boolean>(false);

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

  useEffect(() => {
    const cutoff = getPolicyCutoffTimestamp(capturePolicy);
    try {
      window.AndroidNativeBridge?.setMinCaptureTimestamp?.(cutoff);
    } catch {
      // ignore
    }
  }, [capturePolicy]);

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

    if (capturePolicy.ignorarNotificacionesAntiguas && (source === 'notificacion' || source === 'automatico')) {
      const oldCheck = isNotificationOlderThanPolicy(rawText, eventTimestampMs, capturePolicy);
      if (oldCheck.isOld) {
        setWarningBanner(`Notificación omitida por fecha límite: ${oldCheck.reason}`);
        return { savedCount: 0, blockedReason: oldCheck.reason };
      }
    }

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
      setWarningBanner(`Compra duplicada bloqueada: ${duplicateReason}`);
      return { savedCount: 0, blockedReason: duplicateReason };
    }

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
                `Compra detectada y registrada (${formatCurrency(
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
          statusMessages.push('Notificaciones concedidas');
        }
      } catch {
        // ignore
      }
    }

    if (navigator.clipboard?.readText) {
      try {
        const clip = (await navigator.clipboard.readText())?.trim();
        setClipboardPermGranted(true);
        statusMessages.push('Portapapeles activo');
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
        ? `Permisos verificados: ${statusMessages.join(' • ')}`
        : 'Solicitud enviada. Activa también "Acceso a Notificaciones".'
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
      setSavedBanner(`Se procesaron ${foundCount} notificación(es) aplicando filtro de fecha y anti-duplicados.`);
    } else {
      setSavedBanner('Sincronizado: No hay notificaciones nuevas pendientes.');
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
            setSavedBanner(`Registrado sin duplicados (${outcome.savedCount} compra única).`);
          }
        }
      } else {
        alert('Tu portapapeles está vacío.');
      }
    } catch {
      alert('Mantén presionado dentro del cuadro de texto y selecciona "Pegar".');
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
              `Compra registrada: ${localRes.movimientosDetectados
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
          setSavedBanner(`Se guardaron ${outcome.savedCount} movimiento(s) único(s).`);
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
          setSavedBanner(`Registrado sin duplicados: ${outcome.savedCount} movimiento(s).`);
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
    setSavedBanner(`Se guardaron manualmente ${analysisResult.movimientosDetectados.length} movimiento(s).`);
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
    setSavedBanner(`Movimiento "${item.desc}" (${formatCurrency(item.monto, currency)}) registrado.`);
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
    setSavedBanner(`Obligación crediticia de ${ext.entidad || 'tu extracto'} guardada en Deudas.`);
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
    : 'Sin límite';

  return (
    <div className="space-y-4">
      {/* BARRA DE CONTROL DE PLAZO Y ANTI-DUPLICADOS */}
      <div className="bg-[#111520] border border-white/[0.07] rounded-3xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">Control de Lectura y Fecha Límite</h2>
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300">
                  1 Compra = 1 Registro
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Corte activo: <strong className="text-slate-200">{cutoffFormatted}</strong> • {blockedDuplicatesCount} duplicadas omitidas • {blockedOldCount} antiguas omitidas
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleScanAllSourcesNow}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white text-slate-950 hover:bg-slate-200 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Sincronizar</span>
            </button>

            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 transition"
            >
              <History className="w-3.5 h-3.5 text-indigo-400" />
              <span>Historial ({recent30DaysHistory.length})</span>
            </button>

            <button
              type="button"
              onClick={onCleanDuplicatesNow}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 transition"
              title="Eliminar duplicados existentes"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Depurar</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPermissionsModal((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 transition"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span>Permisos</span>
            </button>
          </div>
        </div>

        {/* Selector limpio de Plazo y Ventana Anti-duplicados */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-white/[0.06] items-center">
          <div className="md:col-span-8 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Registrar desde:
            </span>
            {[
              { id: 'desde_ahora', label: 'Desde Ahora' },
              { id: 'solo_hoy', label: 'Solo Hoy' },
              { id: 'fecha_personalizada', label: 'Elegir Fecha' },
              { id: 'ultimos_dias', label: 'Últimos Días' },
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
                  className={`py-1.5 px-3 rounded-xl text-xs font-medium transition ${
                    active
                      ? 'bg-indigo-500 text-white'
                      : 'bg-[#0b0e17] text-slate-400 hover:text-white border border-white/[0.05]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}

            {capturePolicy.modoPlazo === 'fecha_personalizada' && (
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
                className="bg-[#0b0e17] border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white"
              />
            )}

            {capturePolicy.modoPlazo === 'ultimos_dias' && (
              <select
                value={capturePolicy.ultimosDias}
                onChange={(e) =>
                  onUpdateCapturePolicy({
                    ...capturePolicy,
                    ultimosDias: Number(e.target.value),
                  })
                }
                aria-label="Últimos días"
                className="bg-[#0b0e17] border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white"
              >
                <option value={1}>Último día</option>
                <option value={3}>Últimos 3 días</option>
                <option value={7}>Últimos 7 días</option>
                <option value={15}>Últimos 15 días</option>
                <option value={30}>Últimos 30 días</option>
              </select>
            )}
          </div>

          <div className="md:col-span-4 flex items-center justify-end gap-2">
            <span className="text-xs text-slate-400">Bloqueo duplicados:</span>
            <select
              value={capturePolicy.ventanaAntiduplicadosMinutos}
              onChange={(e) =>
                onUpdateCapturePolicy({
                  ...capturePolicy,
                  ventanaAntiduplicadosMinutos: Number(e.target.value),
                })
              }
              aria-label="Ventana anti-duplicados"
              className="bg-[#0b0e17] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              <option value={15}>15 min</option>
              <option value={60}>1 hora</option>
              <option value={360}>6 horas</option>
              <option value={1440}>24 horas</option>
            </select>
          </div>
        </div>

        {/* Panel desplegable de permisos */}
        {showPermissionsModal && (
          <div className="bg-[#0b0e17] border border-white/[0.08] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">
                Permisos del dispositivo ({nativePermissionGranted || webNotifPerm === 'granted' || clipboardPermGranted ? 'Activos' : 'Pendientes'})
              </span>
              <button
                type="button"
                onClick={() => setShowPermissionsModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleRequestAllPermissions}
                className="bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold py-2.5 px-3 rounded-xl transition"
              >
                1. Autorizar Permisos
              </button>
              <button
                type="button"
                onClick={handleOpenAppDetailsSettings}
                className="bg-white/[0.07] hover:bg-white/[0.12] text-white text-xs font-medium py-2.5 px-3 rounded-xl transition"
              >
                2. Ajustes Restringidos
              </button>
              <button
                type="button"
                onClick={handleOpenNotificationAccessSettings}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold py-2.5 px-3 rounded-xl transition"
              >
                3. Acceso a Notificaciones
              </button>
            </div>
          </div>
        )}

        {autoCapturedNotifs.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <span className="text-xs font-medium text-emerald-400 block">
              Notificaciones pendientes ({autoCapturedNotifs.length})
            </span>
            {autoCapturedNotifs.map((n) => (
              <div
                key={n.id}
                className="bg-[#0b0e17] border border-white/[0.08] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex-1 min-w-[200px]">
                  <span className="text-[10px] font-semibold uppercase text-indigo-400">
                    {n.app} • {n.time}
                  </span>
                  <p className="text-slate-200 mt-0.5">{n.text}</p>
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
                        setSavedBanner(`Notificación de ${n.app} guardada.`);
                      }
                      onDismissCapturedNotif(n.id);
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-3 py-1.5 rounded-xl"
                  >
                    Registrar
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
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-2xl text-xs font-medium flex items-center justify-between gap-2">
          <span>{warningBanner}</span>
          <button type="button" onClick={() => setWarningBanner(null)} className="text-amber-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {savedBanner && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 px-4 py-3 rounded-2xl text-xs font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{savedBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="text-xs underline text-emerald-300 hover:text-white shrink-0"
          >
            Ver historial →
          </button>
        </div>
      )}

      {/* ESCÁNER MULTIMODAL LIMPIO */}
      <div className="bg-[#111520] border border-white/[0.07] rounded-3xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex p-1 rounded-2xl bg-[#0b0e17] border border-white/[0.05] overflow-x-auto max-w-full">
            {[
              { id: 'notificacion', label: 'Notificación / SMS', icon: Bell },
              { id: 'imagen', label: 'Recibo / Foto', icon: ImageIcon },
              { id: 'pdf', label: 'Extracto PDF', icon: FileText },
              { id: 'correo', label: 'Correo', icon: Mail },
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
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    isActive ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-xs font-medium px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400" />
              <span>Pegar</span>
            </button>

            <label className="flex items-center gap-2 text-xs text-slate-300 bg-[#0b0e17] border border-white/[0.06] px-3 py-2 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={autoSaveOnDetect}
                onChange={(e) => setAutoSaveOnDetect(e.target.checked)}
                className="accent-emerald-500"
              />
              Auto-Guardar
            </label>
          </div>
        </div>

        {(activeMode === 'imagen' || activeMode === 'pdf') && (
          <div className="p-4 rounded-2xl bg-[#0b0e17] border border-dashed border-white/15">
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
              <div className="text-xs text-slate-400">
                {selectedFile ? (
                  <span className="text-emerald-400 font-medium">
                    Archivo cargado: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                  </span>
                ) : activeMode === 'imagen' ? (
                  'Toma una foto a tu recibo o selecciona una imagen de tu galería'
                ) : (
                  'Selecciona el archivo PDF de tu extracto bancario'
                )}
              </div>

              <div className="flex items-center gap-2">
                {activeMode === 'imagen' && (
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Cámara
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 bg-white/[0.07] hover:bg-white/[0.12] text-white text-xs font-medium px-3.5 py-2 rounded-xl transition"
                >
                  <Upload className="w-3.5 h-3.5" />
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
                    className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl"
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
                  alt="Comprobante"
                  className="max-h-48 rounded-2xl border border-white/10 object-contain"
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
                ? 'Pega aquí una notificación bancaria o SMS para analizarla (ej: "Bancolombia: Compraste $45.000 en D1")...'
                : activeMode === 'pdf'
                ? 'Sube tu extracto PDF arriba o pega el texto aquí...'
                : activeMode === 'correo'
                ? 'Pega el texto del correo bancario...'
                : 'Detalle opcional del recibo...'
            }
            className="w-full bg-[#0b0e17] text-slate-100 border border-white/[0.07] focus:border-indigo-500 focus:outline-none rounded-2xl p-4 text-sm"
          />

          <div className="flex flex-wrap items-center justify-between mt-3 gap-2">
            <span className="text-xs text-slate-500">
              Ignora automáticamente saldos disponibles y compras repetidas
            </span>

            <div className="flex items-center gap-2">
              {inputText && (
                <button
                  type="button"
                  onClick={() => {
                    setInputText('');
                    setAnalysisResult(null);
                  }}
                  className="text-xs text-slate-400 hover:text-white px-3 py-2"
                >
                  Limpiar
                </button>
              )}
              <button
                type="button"
                disabled={isAnalyzing || (!inputText.trim() && !selectedFile)}
                onClick={handleRunAnalysis}
                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition"
              >
                <Sparkles className="w-4 h-4" />
                {isAnalyzing ? 'Analizando...' : 'Analizar y Registrar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RESULTADOS EXTRAÍDOS */}
      {analysisResult && (
        <div className="bg-[#111520] border border-white/[0.08] rounded-3xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
            <div>
              <span className="text-[11px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300">
                {analysisResult.tipoDocumentoDetectado}
              </span>
              <p className="text-sm text-slate-200 mt-1.5">{analysisResult.resumenEjecutivo}</p>
            </div>

            {(!autoSaveOnDetect || warningBanner) && analysisResult.movimientosDetectados.length > 0 && (
              <button
                type="button"
                onClick={handleImportAllMovements}
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold px-4 py-2 rounded-xl transition shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                Forzar Guardado ({analysisResult.movimientosDetectados.length})
              </button>
            )}
          </div>

          {analysisResult.datosExtractoCredito && (
            <div className="bg-[#0b0e17] border border-white/[0.07] rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4" />
                  Extracto detectado ({analysisResult.datosExtractoCredito.entidad})
                </h3>
                <button
                  type="button"
                  onClick={handleSaveExtractedCredit}
                  className="text-xs bg-indigo-500 hover:bg-indigo-400 text-white font-semibold px-3 py-1.5 rounded-xl"
                >
                  Guardar en Deudas
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-[#111520] p-3 rounded-xl">
                  <span className="text-slate-400 block">Cupo Total</span>
                  <strong className="text-white tabular-nums">
                    {formatCurrency(analysisResult.datosExtractoCredito.cupoTotal || 0, currency)}
                  </strong>
                </div>
                <div className="bg-[#111520] p-3 rounded-xl">
                  <span className="text-slate-400 block">Deuda</span>
                  <strong className="text-amber-400 tabular-nums">
                    {formatCurrency(analysisResult.datosExtractoCredito.saldoActual || 0, currency)}
                  </strong>
                </div>
                <div className="bg-[#111520] p-3 rounded-xl">
                  <span className="text-slate-400 block">Pago Mínimo</span>
                  <strong className="text-emerald-400 tabular-nums">
                    {formatCurrency(analysisResult.datosExtractoCredito.pagoMinimo || 0, currency)}
                  </strong>
                </div>
                <div className="bg-[#111520] p-3 rounded-xl">
                  <span className="text-slate-400 block">Tasa E.A.</span>
                  <strong className="text-rose-400 tabular-nums">{analysisResult.datosExtractoCredito.tasaEA}% E.A.</strong>
                </div>
              </div>
            </div>
          )}

          {analysisResult.movimientosDetectados.length > 0 && (
            <div className="space-y-2">
              {analysisResult.movimientosDetectados.map((mov, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center justify-between gap-2 bg-[#0b0e17] border border-white/[0.06] rounded-2xl p-3.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-white">{mov.desc}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-lg bg-white/[0.05] text-slate-300">
                      {mov.entidad}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-300">
                      {mov.categoria}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        mov.tipo === 'ganancia' ? 'text-emerald-400' : 'text-white'
                      }`}
                    >
                      {mov.tipo === 'ganancia' ? '+' : '-'}
                      {formatCurrency(mov.monto, currency)}
                    </span>
                    {!autoSaveOnDetect && (
                      <button
                        type="button"
                        onClick={() => handleImportSingleMovement(mov)}
                        className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-3 py-1.5 rounded-xl transition"
                      >
                        Guardar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {analysisResult.ejemploPracticoAhorro && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 text-xs text-amber-200 flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{analysisResult.ejemploPracticoAhorro}</span>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE HISTORIAL DE 30 DÍAS */}
      {showHistoryModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-history-title"
        >
          <div className="bg-[#111520] border border-white/10 rounded-3xl max-w-3xl w-full max-h-[86vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                  <History className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 id="modal-history-title" className="text-sm sm:text-base font-semibold text-white">
                    Historial de Notificaciones (30 Días)
                  </h3>
                  <p className="text-xs text-slate-400">Registros únicos verificados sin duplicados</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-white/[0.07] space-y-3 bg-[#0b0e17]">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-[#111520] border border-white/[0.05] rounded-2xl p-3">
                  <span className="text-[11px] text-slate-400 block">Registros</span>
                  <strong className="text-sm sm:text-base font-bold text-white tabular-nums">
                    {historySummary.count}
                  </strong>
                </div>
                <div className="bg-[#111520] border border-white/[0.05] rounded-2xl p-3">
                  <span className="text-[11px] text-slate-400 block">Compras</span>
                  <strong className="text-sm sm:text-base font-bold text-rose-400 tabular-nums">
                    {formatCurrency(historySummary.gastos, currency)}
                  </strong>
                </div>
                <div className="bg-[#111520] border border-white/[0.05] rounded-2xl p-3">
                  <span className="text-[11px] text-slate-400 block">Ingresos</span>
                  <strong className="text-sm sm:text-base font-bold text-emerald-400 tabular-nums">
                    {formatCurrency(historySummary.ingresos, currency)}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-6 relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Buscar comercio, monto o banco..."
                    className="w-full bg-[#111520] border border-white/10 focus:border-indigo-500 focus:outline-none rounded-xl pl-9 pr-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <select
                    value={historyBankFilter}
                    onChange={(e) => setHistoryBankFilter(e.target.value)}
                    aria-label="Filtrar por banco"
                    className="w-full bg-[#111520] border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="todos">Todos los bancos</option>
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
                    className="w-full bg-[#111520] border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value={30}>Últimos 30 días</option>
                    <option value={15}>Últimos 15 días</option>
                    <option value={7}>Últimos 7 días</option>
                    <option value={1}>Últimas 24 horas</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
                  {[
                    { id: 'todos', label: 'Todos' },
                    { id: 'gasto', label: 'Compras' },
                    { id: 'ganancia', label: 'Ingresos' },
                    { id: 'deuda', label: 'Deudas' },
                  ].map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setHistoryTypeFilter(pill.id)}
                      className={`text-xs font-medium px-3 py-1 rounded-lg transition ${
                        historyTypeFilter === pill.id
                          ? 'bg-indigo-500 text-white'
                          : 'bg-[#111520] text-slate-400 hover:text-white'
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
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Vaciar
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {filteredHistoryRecords.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <p className="text-xs text-slate-400">No hay notificaciones procesadas con este filtro.</p>
                </div>
              ) : (
                filteredHistoryRecords.map((record) => (
                  <div
                    key={record.id}
                    className="bg-[#0b0e17] border border-white/[0.06] rounded-2xl p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300">
                            {record.entidad}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.05] text-slate-300">
                            {record.categoriaPrincipal}
                          </span>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {record.fechaStr} ({formatRelativeDays(record.timestamp)})
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-white mt-1">{record.resumen}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            record.tipoPrincipal === 'ganancia' ? 'text-emerald-400' : 'text-white'
                          }`}
                        >
                          {record.tipoPrincipal === 'ganancia' ? '+' : '-'}
                          {formatCurrency(record.montoTotal, currency)}
                        </span>

                        <button
                          type="button"
                          onClick={() => onDeleteProcessedRecord(record.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="bg-[#111520] rounded-xl px-3 py-2 text-[11px] text-slate-400 font-mono break-words">
                      {record.textoOriginal}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
