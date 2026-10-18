import React, { useState, useRef } from 'react';
import {
  Bell,
  Image as ImageIcon,
  FileText,
  Mail,
  Sparkles,
  Upload,
  Camera,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  ClipboardPaste,
  Calculator,
  Lightbulb,
  CreditCard,
  Trash2,
  Cpu,
} from 'lucide-react';
import {
  AIAnalysisResult,
  SourceType,
  Transaction,
  CreditObligation,
  ExtractedTransactionItem,
} from '../types/finance';
import { SAMPLE_NOTIFICATIONS, SAMPLE_STATEMENTS_AND_EMAILS } from '../data/sampleData';
import { formatCurrency, CurrencyCode } from '../utils/financeCalculations';
import {
  extractTextFromPdfFileLocal,
  inspectImageLocally,
  runOnDeviceFinancialAnalysis,
} from '../utils/localAnalyzer';

interface ScannerCenterProps {
  currency: CurrencyCode;
  onAddTransactions: (items: Omit<Transaction, 'id' | 'fecha' | 'timestamp'>[]) => void;
  onAddOrUpdateCredit: (credit: Omit<CreditObligation, 'id'>) => void;
}

export const ScannerCenter: React.FC<ScannerCenterProps> = ({
  currency,
  onAddTransactions,
  onAddOrUpdateCredit,
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
  const [preferLocalOnly, setPreferLocalOnly] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText(text);
      }
    } catch {
      // Si el permiso de portapapeles requiere toque manual en el input, enfocar
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

    // Si es un PDF, extraer también el texto localmente en el Samsung A36 5G para no depender de internet
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const extractedText = await extractTextFromPdfFileLocal(file);
      if (!inputText.trim()) {
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

    setIsAnalyzing(true);
    setSavedBanner(null);

    try {
      // Si el usuario activó Modo 100% En-Dispositivo (sin red) o no hay conexión, procesar directamente en el celular
      if (preferLocalOnly || !navigator.onLine) {
        const localRes = runOnDeviceFinancialAnalysis({
          sourceType: activeMode,
          text: inputText,
          fileName: selectedFile?.name,
        });
        setAnalysisResult(localRes);
        setIsAnalyzing(false);
        return;
      }

      // Intentar enriquecimiento IA con respaldo instantáneo al motor nativo local del celular
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: activeMode,
          text: inputText,
          base64Data,
          mimeType,
          fileName: selectedFile?.name,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('Usando motor local en dispositivo');
      const data: AIAnalysisResult = await response.json();
      setAnalysisResult(data);
    } catch {
      const localRes = runOnDeviceFinancialAnalysis({
        sourceType: activeMode,
        text: inputText,
        fileName: selectedFile?.name,
      });
      setAnalysisResult(localRes);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImportAllMovements = () => {
    if (!analysisResult || analysisResult.movimientosDetectados.length === 0) return;
    const toAdd = analysisResult.movimientosDetectados.map((item: ExtractedTransactionItem) => ({
      tipo: item.tipo,
      categoria: item.categoria,
      monto: item.monto,
      desc: `${
        activeMode === 'notificacion'
          ? '📲'
          : activeMode === 'imagen'
          ? '🖼️'
          : activeMode === 'pdf'
          ? '📄'
          : '📧'
      } ${item.desc}`,
      entidad: item.entidad,
      cuotas: item.cuotas || 1,
      fuente: activeMode,
      esEsencial: item.esEsencial ?? false,
    }));

    onAddTransactions(toAdd);
    setSavedBanner(`✅ Se guardaron ${toAdd.length} movimiento(s) en tu historial y se recalcularon tus promedios.`);
  };

  const handleImportSingleMovement = (item: ExtractedTransactionItem) => {
    onAddTransactions([
      {
        tipo: item.tipo,
        categoria: item.categoria,
        monto: item.monto,
        desc: `📲 ${item.desc}`,
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
      cupoTotal: ext.cupoTotal || 5000000,
      saldoActual: ext.saldoActual || 1500000,
      tasaEA: ext.tasaEA || 28.5,
      cuotaMinima: ext.pagoMinimo || 220000,
      diaCorte: 15,
      diaPago: 2,
      enMora: false,
      notas: `Importado de extracto. Cuota de manejo: $${(ext.cuotaManejo || 0).toLocaleString('es-CO')}.`,
    });
    setSavedBanner(`✅ Obligación crediticia de ${ext.entidad || 'tu extracto'} agregada a Vida Crediticia.`);
  };

  return (
    <div className="space-y-4">
      {/* Selector de modo multimodal */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Escáner Multimodal Inteligente
            </h2>
            <p className="text-xs text-slate-400">
              Analiza notificaciones, fotos de recibos, extractos en PDF y correos directamente en tu Samsung A36 5G
            </p>
          </div>

          <button
            type="button"
            onClick={() => setPreferLocalOnly(!preferLocalOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              preferLocalOnly
                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            {preferLocalOnly ? 'Modo 100% Local Activo (Sin Red)' : 'Motor Híbrido (Local + IA)'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[
            { id: 'notificacion', label: 'Notificaciones', icon: Bell, badge: 'SMS / Push' },
            { id: 'imagen', label: 'Imágenes / Fotos', icon: ImageIcon, badge: 'Cámara / QR' },
            { id: 'pdf', label: 'Extractos PDF', icon: FileText, badge: 'Bancos / Buró' },
            { id: 'correo', label: 'Correos / Facturas', icon: Mail, badge: 'Servicios / TC' },
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
                className={`flex flex-col items-start p-3 rounded-xl border text-left transition ${
                  isActive
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                    {tab.badge}
                  </span>
                </div>
                <span className="text-xs font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Botones de ejemplo rápido (1 toque) */}
        <div className="mb-3">
          <p className="text-[11px] font-medium text-slate-400 mb-1.5 flex items-center gap-1">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
            Prueba con un ejemplo real (1 toque) o pega tus propios datos:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeMode === 'notificacion' &&
              SAMPLE_NOTIFICATIONS.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInputText(s.texto)}
                  className="text-xs bg-slate-950 hover:bg-slate-800 text-indigo-300 border border-slate-800 px-2.5 py-1.5 rounded-lg transition"
                >
                  {s.titulo}
                </button>
              ))}

            {(activeMode === 'pdf' || activeMode === 'correo') &&
              SAMPLE_STATEMENTS_AND_EMAILS.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setActiveMode(s.tipo);
                    setInputText(s.texto);
                  }}
                  className="text-xs bg-slate-950 hover:bg-slate-800 text-indigo-300 border border-slate-800 px-2.5 py-1.5 rounded-lg transition"
                >
                  {s.titulo}
                </button>
              ))}

            {activeMode === 'imagen' && (
              <button
                type="button"
                onClick={() =>
                  setInputText(
                    'FACTURA DE VENTA POS - ALMACENES ÉXITO S.A.\nFecha: 17/10/2026\n1. Mercado Familiar Quincenal: $342.000\n2. Aseo y Hogar: $78.500\nIVA Incluido: $67.100\nTOTAL PAGADO TARJETA DÉBITO BANCOLOMBIA: $420.500'
                  )
                }
                className="text-xs bg-slate-950 hover:bg-slate-800 text-indigo-300 border border-slate-800 px-2.5 py-1.5 rounded-lg transition"
              >
                🧾 Cargar Ejemplo de Tirilla / Factura de Compra
              </button>
            )}
          </div>
        </div>

        {/* Cargador de Imagen / Cámara o Archivo PDF nativo del celular */}
        {(activeMode === 'imagen' || activeMode === 'pdf') && (
          <div className="mb-3 p-3.5 rounded-xl bg-slate-950/90 border border-dashed border-slate-700">
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
                  <span className="text-emerald-400 font-medium">
                    📎 Archivo cargado: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                  </span>
                ) : activeMode === 'imagen' ? (
                  'Toma una foto a tu recibo/factura con la cámara de tu Samsung A36 5G o elige una imagen de tu galería:'
                ) : (
                  'Selecciona el archivo PDF de tu extracto bancario desde la carpeta Descargas de tu celular:'
                )}
              </div>

              <div className="flex items-center gap-2">
                {activeMode === 'imagen' && (
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
                  >
                    <Camera className="w-4 h-4" />
                    Usar Cámara
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-700 transition"
                >
                  <Upload className="w-4 h-4" />
                  {activeMode === 'imagen' ? 'Elegir Imagen' : 'Subir Archivo PDF'}
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
                    title="Quitar archivo"
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
                  alt="Vista previa de comprobante"
                  className="max-h-48 rounded-lg border border-slate-700 object-contain"
                />
              </div>
            )}
          </div>
        )}

        {/* Área de texto para pegar notificación, extracto o correo */}
        <div className="relative">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={4}
            placeholder={
              activeMode === 'notificacion'
                ? 'Pega aquí la notificación de Nequi, Bancolombia, Nu, Daviplata o SMS bancario...'
                : activeMode === 'pdf'
                ? 'Sube tu archivo PDF arriba o pega aquí el texto de tu extracto bancario o historial crediticio...'
                : activeMode === 'correo'
                ? 'Pega aquí el texto del correo de tu banco, factura de servicios públicos o cobro de suscripción...'
                : 'Opcional: Añade una nota o el texto del recibo si deseas complementar la foto...'
            }
            className="w-full bg-slate-950 text-slate-100 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl p-3 text-sm placeholder:text-slate-500"
          />
          <div className="flex items-center justify-between mt-2 gap-2">
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-3 py-2 rounded-lg border border-slate-700 transition"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-indigo-400" />
              Pegar Portapapeles
            </button>

            <div className="flex items-center gap-2">
              {inputText && (
                <button
                  type="button"
                  onClick={() => setInputText('')}
                  className="text-xs text-slate-400 hover:text-slate-200 px-2.5 py-2"
                >
                  Limpiar
                </button>
              )}
              <button
                type="button"
                disabled={isAnalyzing || (!inputText.trim() && !selectedFile)}
                onClick={handleRunAnalysis}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-md transition"
              >
                <Sparkles className="w-4 h-4" />
                {isAnalyzing ? 'Analizando datos...' : 'Analizar y Extraer Datos'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {savedBanner && (
        <div className="bg-emerald-950/80 border border-emerald-600/60 text-emerald-200 px-4 py-3 rounded-xl text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      {/* Resultado detallado del análisis */}
      {analysisResult && (
        <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {analysisResult.tipoDocumentoDetectado}
                </span>
                <span
                  className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                    analysisResult.nivelRiesgo === 'alto'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : analysisResult.nivelRiesgo === 'medio'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  Riesgo Crediticio: {analysisResult.nivelRiesgo}
                </span>
              </div>
              <p className="text-sm text-slate-200 mt-2 leading-relaxed">{analysisResult.resumenEjecutivo}</p>
            </div>

            {analysisResult.movimientosDetectados.length > 0 && (
              <button
                type="button"
                onClick={handleImportAllMovements}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow transition shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                Guardar Todo en Mis Finanzas ({analysisResult.movimientosDetectados.length})
              </button>
            )}
          </div>

          {/* Cálculos automáticos realizados sobre el documento/notificación */}
          {analysisResult.calculosRealizados && analysisResult.calculosRealizados.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-indigo-400" />
                Cálculos y Métricas Extraídas
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {analysisResult.calculosRealizados.map((calc, i) => (
                  <div key={i} className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] text-slate-400">{calc.etiqueta}</div>
                    <div className="text-base font-bold text-white mt-0.5">{calc.valor}</div>
                    <div className="text-[11px] text-slate-500 mt-1">{calc.explicacion}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Si detectó datos de Extracto de Tarjeta o Crédito */}
          {analysisResult.datosExtractoCredito && (
            <div className="bg-indigo-950/30 border border-indigo-500/40 rounded-xl p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4" />
                  Resumen de Extracto Crediticio Detectado ({analysisResult.datosExtractoCredito.entidad})
                </h3>
                <button
                  type="button"
                  onClick={handleSaveExtractedCredit}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-lg transition"
                >
                  + Agregar/Actualizar en Vida Crediticia
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-950/70 p-2.5 rounded-lg">
                  <span className="text-slate-400 block">Cupo Total</span>
                  <strong className="text-white">
                    {formatCurrency(analysisResult.datosExtractoCredito.cupoTotal || 0, currency)}
                  </strong>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg">
                  <span className="text-slate-400 block">Cupo Utilizado</span>
                  <strong className="text-amber-400">
                    {formatCurrency(analysisResult.datosExtractoCredito.saldoActual || 0, currency)}
                  </strong>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg">
                  <span className="text-slate-400 block">Pago Mínimo</span>
                  <strong className="text-emerald-400">
                    {formatCurrency(analysisResult.datosExtractoCredito.pagoMinimo || 0, currency)}
                  </strong>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg">
                  <span className="text-slate-400 block">Tasa E.A. / Cargos</span>
                  <strong className="text-rose-400">
                    {analysisResult.datosExtractoCredito.tasaEA}% E.A.
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Lista de movimientos detectados */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Movimientos Identificados ({analysisResult.movimientosDetectados.length})
            </h3>
            <div className="space-y-2">
              {analysisResult.movimientosDetectados.map((mov, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/90 border border-slate-800 rounded-xl p-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{mov.desc}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {mov.entidad}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                        {mov.categoria}
                      </span>
                      {mov.cuotas && mov.cuotas > 1 && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/50">
                          {mov.cuotas} cuotas
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Clasificación: {mov.esEsencial ? 'Necesidad Básica (50%)' : 'Deseo / Variable (30%)'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-bold ${
                        mov.tipo === 'ganancia'
                          ? 'text-emerald-400'
                          : mov.tipo === 'deuda'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {mov.tipo === 'ganancia' ? '+' : '-'}
                      {formatCurrency(mov.monto, currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleImportSingleMovement(mov)}
                      className="text-xs bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white px-2.5 py-1.5 rounded-lg transition"
                    >
                      + Registrar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ejemplo práctico de ahorro e inteligencia crediticia */}
          <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3.5">
            <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5 mb-1">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              Ejemplo Práctico con tus Números
            </h4>
            <p className="text-xs text-amber-100/90 leading-relaxed">{analysisResult.ejemploPracticoAhorro}</p>
          </div>

          {/* Alertas y Recomendaciones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
              <h4 className="text-xs font-bold text-rose-300 flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                Alertas Detectadas
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                {analysisResult.alertasFinancieras.map((al, i) => (
                  <li key={i}>{al}</li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
              <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Acciones Recomendadas
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                {analysisResult.recomendacionesPrioritarias.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
