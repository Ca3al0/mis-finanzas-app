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
} from 'lucide-react';
import {
  AIAnalysisResult,
  SourceType,
  Transaction,
  CreditObligation,
  ExtractedTransactionItem,
  ProcessedNotificationRecord,
} from '../types/finance';
import { formatCurrency, CurrencyCode } from '../utils/financeCalculations';
import {
  extractTextFromPdfFileLocal,
  inspectImageLocally,
  runOnDeviceFinancialAnalysis,
  parseAllNumbersFromText,
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
}

declare global {
  interface Window {
    AndroidNativeBridge?: {
      openNotificationSettings?: () => void;
      openAppDetailsSettings?: () => void;
      isNotificationListenerEnabled?: () => boolean;
      getCapturedNotificationsJson?: () => string;
      clearCapturedNotifications?: () => void;
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
  const [autoSaveOnDetect, setAutoSaveOnDetect] = useState<boolean>(true);
  const [autoClipboardEnabled] = useState<boolean>(true);
  const [hasNativeAndroidBridge, setHasNativeAndroidBridge] = useState<boolean>(false);
  const [nativePermissionGranted, setNativePermissionGranted] = useState<boolean>(false);

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
      if (window.AndroidNativeBridge) {
        setHasNativeAndroidBridge(true);
        try {
          setNativePermissionGranted(Boolean(window.AndroidNativeBridge.isNotificationListenerEnabled?.()));
        } catch {
          // ignore
        }
      }
    };
    checkBridge();
    window.addEventListener('focus', checkBridge);
    return () => window.removeEventListener('focus', checkBridge);
  }, []);

  // Filtrar registros de los últimos 30 días
  const recent30DaysHistory = useMemo(() => {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    return processedHistory
      .filter((item) => item.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [processedHistory]);

  // Bancos / entidades únicas presentes en el historial de 30 días para el filtro
  const availableBanksInHistory = useMemo(() => {
    const set = new Set<string>();
    recent30DaysHistory.forEach((h) => {
      if (h.entidad) set.add(h.entidad);
    });
    return Array.from(set);
  }, [recent30DaysHistory]);

  // Lista filtrada según búsqueda, tipo, banco y rango de días (Hoy, 7 días, 30 días)
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

  // Totales del historial filtrado
  const historySummary = useMemo(() => {
    let gastos = 0;
    let ingresos = 0;
    filteredHistoryRecords.forEach((r) => {
      if (r.tipoPrincipal === 'ganancia') ingresos += r.montoTotal;
      else gastos += r.montoTotal;
    });
    return { gastos, ingresos, count: filteredHistoryRecords.length };
  }, [filteredHistoryRecords]);

  const recordSuccessfulScan = (res: AIAnalysisResult, rawText: string, source: SourceType) => {
    if (!res || (res.movimientosDetectados.length === 0 && !res.datosExtractoCredito)) return;
    const firstMov = res.movimientosDetectados[0];
    const total = res.movimientosDetectados.reduce((acc, m) => acc + m.monto, 0) || res.datosExtractoCredito?.saldoActual || 0;

    onRecordProcessedNotification({
      fuente: source,
      entidad: firstMov?.entidad || res.datosExtractoCredito?.entidad || 'Banco',
      textoOriginal: rawText.trim() || res.resumenEjecutivo,
      resumen: firstMov ? `${firstMov.desc}` : res.resumenEjecutivo,
      montoTotal: total,
      tipoPrincipal: firstMov?.tipo || 'gasto',
      categoriaPrincipal: firstMov?.categoria || 'Otros',
      itemsCount: Math.max(1, res.movimientosDetectados.length),
    });
  };

  const saveDetectedMovementsAutomatically = (res: AIAnalysisResult, source: SourceType) => {
    if (!res || res.movimientosDetectados.length === 0) return false;
    const toAdd = res.movimientosDetectados.map((item: ExtractedTransactionItem) => ({
      tipo: item.tipo,
      categoria: item.categoria,
      monto: item.monto,
      desc: item.desc,
      entidad: item.entidad,
      cuotas: item.cuotas || 1,
      fuente: source,
      esEsencial: item.esEsencial ?? false,
    }));
    onAddTransactions(toAdd);
    return true;
  };

  // Auto-lectura de notificación copiada al abrir o volver a la aplicación
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
          /\$|compra|recibiste|pagaste|abono|nequi|bancolombia|daviplata|nu|transferencia|factura|cuota|retiro/i.test(clip)
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
            recordSuccessfulScan(res, clip, 'notificacion');
            if (autoSaveOnDetect) {
              saveDetectedMovementsAutomatically(res, 'notificacion');
              setSavedBanner(
                `📲 ¡Notificación detectada de tu portapapeles y guardada automáticamente! (${formatCurrency(
                  res.movimientosDetectados[0].monto,
                  currency
                )})`
              );
            } else {
              setSavedBanner('📲 ¡Notificación bancaria detectada automáticamente de tu portapapeles!');
            }
          }
        }
      } catch {
        // El navegador puede requerir toque manual si no tiene foco
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [autoClipboardEnabled, autoSaveOnDetect, currency]);

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setInputText(text);
        const res = runOnDeviceFinancialAnalysis({
          sourceType: activeMode,
          text,
        });
        setAnalysisResult(res);
        if (res.movimientosDetectados.length > 0 || res.datosExtractoCredito) {
          recordSuccessfulScan(res, text, activeMode);
          if (autoSaveOnDetect && res.movimientosDetectados.length > 0) {
            saveDetectedMovementsAutomatically(res, activeMode);
            setSavedBanner(
              `✅ ¡Pegado y guardado en tus movimientos e historial de 30 días! (${res.movimientosDetectados.length} registro(s))`
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

    try {
      if (!selectedFile && activeMode === 'notificacion') {
        const localRes = runOnDeviceFinancialAnalysis({
          sourceType: 'notificacion',
          text: inputText,
        });
        setAnalysisResult(localRes);
        if (localRes.movimientosDetectados.length > 0 || localRes.datosExtractoCredito) {
          recordSuccessfulScan(localRes, rawToRecord, 'notificacion');
          if (autoSaveOnDetect && localRes.movimientosDetectados.length > 0) {
            saveDetectedMovementsAutomatically(localRes, 'notificacion');
            setSavedBanner(
              `✅ ¡Registrado en tu historial!: ${localRes.movimientosDetectados
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
        recordSuccessfulScan(data, rawToRecord, activeMode);
        if (autoSaveOnDetect && data.movimientosDetectados?.length > 0) {
          saveDetectedMovementsAutomatically(data, activeMode);
          setSavedBanner(
            `✅ ¡Se analizaron y guardaron ${data.movimientosDetectados.length} movimiento(s) en tu historial!`
          );
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
        recordSuccessfulScan(localRes, rawToRecord, activeMode);
        if (autoSaveOnDetect && localRes.movimientosDetectados.length > 0) {
          saveDetectedMovementsAutomatically(localRes, activeMode);
          setSavedBanner(
            `✅ ¡Registrado en tu historial!: ${localRes.movimientosDetectados.length} movimiento(s) detectado(s).`
          );
        }
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImportAllMovements = () => {
    if (!analysisResult || analysisResult.movimientosDetectados.length === 0) return;
    saveDetectedMovementsAutomatically(analysisResult, activeMode);
    setSavedBanner(`✅ Se guardaron ${analysisResult.movimientosDetectados.length} movimiento(s) en tu historial.`);
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
    setSavedBanner(`✅ Obligación crediticia de ${ext.entidad || 'tu extracto'} guardada en la pestaña Deudas.`);
  };

  const formatRelativeDays = (timestamp: number) => {
    const diffMs = Math.max(0, Date.now() - timestamp);
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Hace unos minutos';
    if (diffHours < 24) return `Hace ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    return diffDays === 1 ? 'Ayer' : `Hace ${diffDays} días`;
  };

  return (
    <div className="space-y-4">
      {/* Panel de Estado y Control del Lector de Notificaciones */}
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Radio className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Sistema Lector de Notificaciones Bancarias
              </h2>
              <p className="text-xs text-slate-400">
                Detecta Nequi, Bancolombia, Daviplata, Nu y SMS y descuenta/suma de tu saldo al instante
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Botón para abrir el Modal de Historial de los últimos 30 días */}
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

            {hasNativeAndroidBridge && (
              <button
                type="button"
                onClick={() => window.AndroidNativeBridge?.openNotificationSettings?.()}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition ${
                  nativePermissionGranted
                    ? 'bg-emerald-950 border border-emerald-600 text-emerald-300'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                <Settings className="w-4 h-4" />
                {nativePermissionGranted
                  ? 'Escucha Android Activa ✓'
                  : 'Dar Permiso de Notificaciones Android'}
              </button>
            )}

            <label className="flex items-center gap-2 text-xs font-semibold bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl cursor-pointer text-slate-200">
              <input
                type="checkbox"
                checked={autoSaveOnDetect}
                onChange={(e) => setAutoSaveOnDetect(e.target.checked)}
                className="accent-emerald-500"
              />
              Auto-Guardar en Historial
            </label>
          </div>
        </div>

        {/* Guía y Controles para Lectura 100% Automática sin copiar ni pegar */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-200 font-semibold">
              ⚡ ¿Cómo dejar activada la lectura 100% AUTOMÁTICA en tu Samsung A36 5G (sin tener que pegar nada)?
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {hasNativeAndroidBridge && !nativePermissionGranted && (
                <button
                  type="button"
                  onClick={() => window.AndroidNativeBridge?.openAppDetailsSettings?.()}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition"
                >
                  Paso 1: Permitir Ajustes Restringidos
                </button>
              )}
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition shadow"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Pegar Manual
              </button>
              <button
                type="button"
                onClick={() => {
                  onSimulateIncomingNotif(
                    'Bancolombia',
                    'Bancolombia: Compra por $42.500 en SUPERMERCADO D1 con tu Tarjeta Débito.'
                  );
                }}
                className="bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Probar Captura Automática
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
              <strong className="text-emerald-400 block mb-0.5">1. Instalar el APK sin bloqueo</strong>
              En <strong>Play Store → Perfil → Play Protect → ⚙️</strong> apaga <em>"Analizar apps con Play Protect"</em> por 10 segundos e instala el APK.
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
              <strong className="text-amber-300 block mb-0.5">2. Desbloquear permiso en Samsung</strong>
              Ve a <strong>Ajustes → Aplicaciones → Mis Finanzas → 3 puntos (⋮) arriba a la derecha → "Permitir ajustes restringidos"</strong>.
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
              <strong className="text-indigo-300 block mb-0.5">3. Activar Acceso a Notificaciones</strong>
              Activa a <strong>Mis Finanzas</strong> en <em>Acceso a notificaciones</em>. ¡Listo! Leerá Nequi, Bancolombia, Nu y SMS <strong>100% sola sin pegar nada</strong>.
            </div>
          </div>
        </div>

        {/* Bandeja de Notificaciones Capturadas Automáticamente en segundo plano */}
        {autoCapturedNotifs.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <span className="text-xs font-bold text-emerald-400 block">
              📥 Notificaciones Capturadas ({autoCapturedNotifs.length}):
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
                      recordSuccessfulScan(r, n.text, 'notificacion');
                      saveDetectedMovementsAutomatically(r, 'notificacion');
                      setSavedBanner(
                        `✅ Notificación de ${n.app} guardada en tus movimientos e historial.`
                      );
                      onDismissCapturedNotif(n.id);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg"
                  >
                    Guardar en Movimientos
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

      {savedBanner && (
        <div className="bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{savedBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="text-[11px] underline text-emerald-300 hover:text-white shrink-0"
          >
            Ver en Historial 30 días →
          </button>
        </div>
      )}

      {/* Escáner Multimodal: Notificación Escrita, Foto/Recibo, Extracto PDF, Correo */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: 'notificacion', label: 'Texto Notificación / SMS', icon: Bell },
            { id: 'imagen', label: 'Foto Recibo / Factura', icon: ImageIcon },
            { id: 'pdf', label: 'Extracto en PDF', icon: FileText },
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
                }}
                className={`flex items-center gap-2 p-3 rounded-xl border text-left transition ${
                  isActive
                    ? 'bg-indigo-600 border-indigo-500 text-white font-bold shadow'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-xs">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Subida de foto/cámara o PDF real */}
        {(activeMode === 'imagen' || activeMode === 'pdf') && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-dashed border-slate-700">
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
                  'Toma una foto a tu recibo/comprobante o elige una imagen de tu galería:'
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
                  {activeMode === 'imagen' ? 'Elegir de Galería' : 'Subir PDF'}
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
                  className="max-h-48 rounded-lg border border-slate-700 object-contain"
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
                ? 'Escribe o pega tu notificación bancaria aquí (Ej: "Compra en Éxito por $58.000 con Nequi" o "Recibiste $300.000 en Bancolombia")...'
                : activeMode === 'pdf'
                ? 'Sube tu extracto PDF arriba o pega aquí el texto del extracto...'
                : activeMode === 'correo'
                ? 'Pega aquí el texto del correo de tu banco o factura...'
                : 'Opcional: Escribe un detalle o monto si la imagen está borrosa...'
            }
            className="w-full bg-slate-950 text-slate-100 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl p-3 text-sm"
          />

          <div className="flex flex-wrap items-center justify-between mt-2.5 gap-2">
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="text-xs text-slate-400 hover:text-indigo-300 flex items-center gap-1.5 font-medium"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              Ver notificaciones procesadas (últimos 30 días): {recent30DaysHistory.length}
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
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow transition"
              >
                <Sparkles className="w-4 h-4" />
                {isAnalyzing
                  ? 'Procesando...'
                  : autoSaveOnDetect
                  ? 'Analizar y Registrar Movimiento'
                  : 'Analizar Contenido'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resultados extraídos */}
      {analysisResult && (
        <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                {analysisResult.tipoDocumentoDetectado}
              </span>
              <p className="text-sm text-slate-200 mt-1.5">{analysisResult.resumenEjecutivo}</p>
            </div>

            {!autoSaveOnDetect && analysisResult.movimientosDetectados.length > 0 && (
              <button
                type="button"
                onClick={handleImportAllMovements}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow transition shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                Guardar Todos ({analysisResult.movimientosDetectados.length})
              </button>
            )}
          </div>

          {analysisResult.datosExtractoCredito && (
            <div className="bg-indigo-950/30 border border-indigo-500/40 rounded-xl p-3.5">
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
                <div className="bg-slate-950 p-2.5 rounded-lg">
                  <span className="text-slate-400 block">Cupo Total</span>
                  <strong className="text-white">
                    {formatCurrency(analysisResult.datosExtractoCredito.cupoTotal || 0, currency)}
                  </strong>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg">
                  <span className="text-slate-400 block">Saldo / Deuda</span>
                  <strong className="text-amber-400">
                    {formatCurrency(analysisResult.datosExtractoCredito.saldoActual || 0, currency)}
                  </strong>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg">
                  <span className="text-slate-400 block">Pago Mínimo</span>
                  <strong className="text-emerald-400">
                    {formatCurrency(analysisResult.datosExtractoCredito.pagoMinimo || 0, currency)}
                  </strong>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg">
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
                  className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{mov.desc}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {mov.entidad}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300">
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
            <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-100 flex items-start gap-2">
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Cabecera del Modal */}
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
                    Consulta, busca y filtra todas las notificaciones, correos y documentos procesados con éxito
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

            {/* Resumen Rápido de los 30 Días y Controles de Búsqueda / Filtro */}
            <div className="p-4 bg-slate-900/90 border-b border-slate-800 space-y-3">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Notificaciones Procesadas
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

              {/* Barra de Búsqueda y Filtros */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-6 relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Buscar por comercio, monto, banco o texto original..."
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

              {/* Píldoras de Filtro por Tipo de Movimiento */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 overflow-x-auto">
                  <Filter className="w-3.5 h-3.5 text-slate-400 mr-1 shrink-0" />
                  {[
                    { id: 'todos', label: 'Todos' },
                    { id: 'gasto', label: '🛒 Compras / Pagos' },
                    { id: 'ganancia', label: '💰 Ingresos / Abonos' },
                    { id: 'deuda', label: '⏳ Deudas' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setHistoryTypeFilter(tab.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                        historyTypeFilter === tab.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {(historySearch || historyTypeFilter !== 'todos' || historyBankFilter !== 'todos' || historyDaysFilter !== 30) && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistorySearch('');
                      setHistoryTypeFilter('todos');
                      setHistoryBankFilter('todos');
                      setHistoryDaysFilter(30);
                    }}
                    className="text-[11px] text-indigo-300 hover:text-white flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Quitar filtros
                  </button>
                )}
              </div>
            </div>

            {/* Lista de Registros Históricos */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-950/50">
              {filteredHistoryRecords.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Bell className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-semibold text-slate-300">
                    No se encontraron notificaciones procesadas con estos filtros en los últimos 30 días.
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                    Cada vez que pegues una notificación bancaria, uses el botón "Probar Lector en Vivo" o recibas una alerta en tu Samsung A36 5G, quedará guardada aquí automáticamente.
                  </p>
                </div>
              ) : (
                filteredHistoryRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 space-y-2 transition"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/40">
                            {rec.entidad}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                            {rec.categoriaPrincipal}
                          </span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {rec.fechaStr} ({formatRelativeDays(rec.timestamp)})
                          </span>
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-white">
                          {rec.resumen}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <strong
                          className={`text-sm font-extrabold ${
                            rec.tipoPrincipal === 'ganancia' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {rec.tipoPrincipal === 'ganancia' ? '+' : '-'}
                          {formatCurrency(rec.montoTotal, currency)}
                        </strong>

                        <button
                          type="button"
                          onClick={() => {
                            setInputText(rec.textoOriginal);
                            setActiveMode(rec.fuente === 'manual' ? 'notificacion' : rec.fuente);
                            const r = runOnDeviceFinancialAnalysis({
                              sourceType: rec.fuente === 'manual' ? 'notificacion' : rec.fuente,
                              text: rec.textoOriginal,
                            });
                            setAnalysisResult(r);
                            setShowHistoryModal(false);
                          }}
                          className="text-[11px] bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white font-semibold px-2.5 py-1 rounded-lg transition"
                          title="Volver a cargar en el escáner"
                        >
                          Inspeccionar
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteProcessedRecord(rec.id)}
                          className="p-1 text-slate-500 hover:text-rose-400"
                          title="Eliminar del historial"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Texto original de la notificación */}
                    <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg px-3 py-2 text-[11px] text-slate-300 font-mono break-words">
                      {rec.textoOriginal}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pie del Modal */}
            <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">
                Mostrando {filteredHistoryRecords.length} de {recent30DaysHistory.length} notificaciones (retención automática de 30 días)
              </span>

              <div className="flex items-center gap-2">
                {recent30DaysHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('¿Deseas vaciar el historial de notificaciones procesadas?')) {
                        onClearProcessedHistory();
                      }
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300 px-3 py-1.5 rounded-xl bg-rose-950/40 border border-rose-800/50 font-semibold"
                  >
                    Vaciar Historial
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-1.5 rounded-xl transition"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
