import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Smartphone,
  Download,
  Upload,
  CheckCircle2,
  Send,
  HardDriveDownload,
  Trash2,
  Sparkles,
  User,
  ShieldCheck,
  Mic,
  LayoutGrid,
} from 'lucide-react';
import {
  Transaction,
  CreditObligation,
  ChatMessage,
  AdvisorActionCommand,
} from '../types/finance';
import { CurrencyCode, formatCurrency } from '../utils/financeCalculations';
import {
  validateTransactionsArray,
  validateCreditsArray,
  sanitizeTextInput,
} from '../utils/securityAndValidation';
import { callBackendApi } from '../utils/apiClient';
import { solveUserQuestionLocally } from '../utils/localAnalyzer';

interface AdvisorAndMobileCenterProps {
  currency: CurrencyCode;
  transactions: Transaction[];
  credits: CreditObligation[];
  financialSnapshot: any;
  onExecuteAdvisorActions: (actions: AdvisorActionCommand[]) => void;
  onImportBackup: (data: { transactions: Transaction[]; credits: CreditObligation[] }) => void;
  installPromptEvent: any;
  onTriggerInstallPrompt: () => void;
}

type AdvisorViewTab = 'chat' | 'widget' | 'respaldo';

export const AdvisorAndMobileCenter: React.FC<AdvisorAndMobileCenterProps> = ({
  currency,
  transactions,
  credits,
  financialSnapshot,
  onExecuteAdvisorActions,
  onImportBackup,
  installPromptEvent,
  onTriggerInstallPrompt,
}) => {
  const [activeView, setActiveView] = useState<AdvisorViewTab>('chat');
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [widgetReply, setWidgetReply] = useState<string>(
    'Listo para verificar si tu última compra ya quedó registrada o anotar un movimiento.'
  );
  const [showWidgetQuickModal, setShowWidgetQuickModal] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        '¡Hola! Soy tu agente financiero conectado a tus tablas, gráficas y a tu Widget de pantalla de inicio en tiempo real. Puedes preguntarme o pedirme acciones:\n• *"¿Ya registraste mi última compra?"*\n• *"Gasté 35 mil en almuerzo con Nequi"*\n• *"Elimina el último gasto"*\n• *"Mi salario es de 3.5 millones"*',
      timestamp: 'Ahora',
    },
  ]);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    try {
      window.AndroidNativeBridge?.syncWidgetSummary?.(
        JSON.stringify({ agentReply: widgetReply })
      );
    } catch {
      // ignore
    }
  }, [widgetReply]);

  const lastPurchase = transactions.find((t) => t.tipo === 'gasto') || transactions[0];

  const handleSendQuestion = async (customText?: string) => {
    const q = sanitizeTextInput(customText ?? question, 800);
    if (!q || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setQuestion('');

    const low = q.toLowerCase();
    // Verificación directa en vivo si pregunta "¿Ya registraste la compra?"
    if (
      low.includes('ya registraste') ||
      low.includes('registró la compra') ||
      low.includes('registro la compra') ||
      low.includes('registró mi compra') ||
      low.includes('última compra') ||
      low.includes('ultima compra')
    ) {
      const answerText = lastPurchase
        ? `Sí, tu última compra registrada es "${lastPurchase.desc}" por ${formatCurrency(
            lastPurchase.monto,
            currency
          )} (${lastPurchase.entidad || 'Banco'}, ${lastPurchase.fecha}) en la categoría ${
            lastPurchase.categoria
          }. El escudo anti-duplicados está activo.`
        : 'Revisé el escáner en tiempo real y aún no tienes compras registradas hoy. Puedes decirme por ejemplo: "Gasté 35 mil en almuerzo".';

      setWidgetReply(answerText);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: answerText,
          timestamp: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
          actionsExecuted: ['Verificación en tiempo real de última compra'],
        },
      ]);
      return;
    }

    setIsLoading(true);
    try {
      const localCheck = solveUserQuestionLocally(q, financialSnapshot);

      const response = await callBackendApi<{
        answer: string;
        actions?: AdvisorActionCommand[];
      }>(
        '/api/ai/advisor',
        {
          question: q,
          history: messages.slice(-6),
          financialSnapshot,
        },
        40000
      );

      const actionsToRun =
        response.actions && response.actions.length > 0
          ? response.actions
          : localCheck.actions;

      let executedLabels: string[] = [];
      if (actionsToRun && actionsToRun.length > 0) {
        onExecuteAdvisorActions(actionsToRun);
        executedLabels = actionsToRun.map((a) => a.descripcionConfirmacion);
      }

      setWidgetReply(response.answer);
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        timestamp: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        actionsExecuted: executedLabels,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const localRes = solveUserQuestionLocally(q, financialSnapshot);
      let executedLabels: string[] = [];
      if (localRes.actions.length > 0) {
        onExecuteAdvisorActions(localRes.actions);
        executedLabels = localRes.actions.map((a) => a.descripcionConfirmacion);
      }

      setWidgetReply(localRes.answer);
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: localRes.answer,
        timestamp: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        actionsExecuted: executedLabels,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceDictation = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setShowWidgetQuickModal(true);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-CO';
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        handleSendQuestion(transcript);
      }
    };
    recognition.start();
  };

  const handleExportBackupJson = () => {
    const payload = {
      version: '3.0-samsung-a36',
      exportedAt: new Date().toISOString(),
      transactions,
      credits,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mis-finanzas-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupMessage('✅ Copia de seguridad (.json) guardada en Descargas.');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const safeTx = validateTransactionsArray(parsed?.transactions);
        const safeCreds = validateCreditsArray(parsed?.credits);
        onImportBackup({
          transactions: safeTx,
          credits: safeCreds,
        });
        setBackupMessage(`✅ Restaurados ${safeTx.length} movimientos y ${safeCreds.length} deudas.`);
      } catch {
        setBackupMessage('⚠️ El archivo seleccionado no es válido.');
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadFullCompiledApp = () => {
    window.location.href = '/api/download-full-app';
    setBackupMessage('✅ Descargando la App Portátil Completa.');
  };

  return (
    <div className="space-y-4">
      {/* Selector de Opciones Limpio (Chat con Agente | Widget de Inicio | Respaldo y App) */}
      <div className="flex flex-wrap gap-1.5 bg-[#1C1B18] border border-[#2C2A24] p-2 rounded-2xl">
        {[
          { id: 'chat', label: 'Chat con Agente', icon: Bot },
          { id: 'widget', label: 'Widget de Inicio (Nuevo)', icon: LayoutGrid },
          { id: 'respaldo', label: 'Instalación y Respaldo', icon: Smartphone },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveView(tab.id as AdvisorViewTab)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                active
                  ? 'bg-[#0D7A5F] text-white shadow'
                  : 'text-[#A6A297] hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* OPCIÓN 1: CHAT CONVERSACIONAL CON EL AGENTE */}
      {activeView === 'chat' && (
        <div className="bg-[#1C1B18] border border-[#2C2A24] rounded-2xl overflow-hidden flex flex-col h-[500px] shadow-xl">
          <div className="bg-[#121210] border-b border-[#2C2A24] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#0D7A5F]/20 border border-[#0D7A5F]/40 flex items-center justify-center">
                <Bot className="w-4 h-4 text-[#10B981]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                  Agente Financiero en Tiempo Real
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                </h2>
                <p className="text-[11px] text-[#A6A297]">
                  Pregunta si ya registró tu compra o pídele agregar/eliminar datos
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setMessages([
                  {
                    id: 'reset-msg',
                    role: 'assistant',
                    content: 'Conversación reiniciada. ¿Qué deseas verificar o registrar?',
                    timestamp: 'Ahora',
                  },
                ])
              }
              className="text-xs text-[#A6A297] hover:text-white p-1.5 rounded-lg"
              title="Limpiar conversación"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-2 bg-[#121210]/60 border-b border-[#2C2A24] flex flex-wrap gap-1.5">
            {[
              '¿Ya registraste mi última compra?',
              'Gasté 35 mil en almuerzo',
              'Mi salario es 3.5 millones',
              '¿Cuánto disponible real tengo?',
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleSendQuestion(chip)}
                className="text-[11px] bg-[#262420] hover:bg-[#0D7A5F] text-white px-2.5 py-1 rounded-full transition"
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#121210]/40">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-[#0D7A5F]/20 border border-[#0D7A5F]/40 flex items-center justify-center shrink-0 mt-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#0D7A5F] text-white rounded-br-sm'
                      : 'bg-[#1C1B18] border border-[#2C2A24] text-[#F4F2EC] rounded-bl-sm'
                  }`}
                >
                  {msg.actionsExecuted && msg.actionsExecuted.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {msg.actionsExecuted.map((act, i) => (
                        <div
                          key={i}
                          className="bg-[#0D7A5F]/20 border border-[#10B981]/40 text-[#10B981] text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{act}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="whitespace-pre-line">{msg.content}</div>
                  <span className="text-[10px] opacity-60 block text-right mt-1">
                    {msg.timestamp}
                  </span>
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-[#262420] flex items-center justify-center shrink-0 mt-1">
                    <User className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 bg-[#1C1B18] border-t border-[#2C2A24]">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleVoiceDictation}
                className="p-2.5 rounded-xl bg-[#262420] hover:bg-[#0D7A5F] text-white transition"
                title="Hablar por voz al agente"
              >
                <Mic className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendQuestion()}
                placeholder="Pregunta si ya registró la compra o anota un gasto..."
                className="flex-1 bg-[#121210] border border-[#2C2A24] focus:border-[#0D7A5F] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white"
              />
              <button
                type="button"
                disabled={isLoading || !question.trim()}
                onClick={() => handleSendQuestion()}
                className="bg-[#0D7A5F] hover:bg-[#10B981] disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shrink-0 transition"
              >
                <Send className="w-4 h-4" />
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPCIÓN 2: WIDGET INTERACTIVO DE PANTALLA DE INICIO */}
      {activeView === 'widget' && (
        <div className="bg-[#1C1B18] border border-[#2C2A24] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-white">
                Widget de Pantalla de Inicio (Mis Finanzas • Agente y Saldo)
              </h3>
              <p className="text-xs text-[#A6A297]">
                Habla con el agente desde el widget, pregúntale si ya registró tu compra y consulta tus datos relevantes al instante.
              </p>
            </div>
          </div>

          {/* Réplica Interactiva en Vivo del Widget Nativo Android */}
          <div className="bg-[#F6F4EE] border-2 border-[#DDD7C8] rounded-3xl p-4 text-[#181815] space-y-3 max-w-xl mx-auto shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-sm font-extrabold block text-[#181815]">
                  Mis Finanzas • Tiempo Real
                </strong>
                <span className="text-[11px] font-bold text-[#0D7A5F]">
                  Escudo Anti-Duplicados Activo • Sincronizado en vivo
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleSendQuestion('¿Ya registraste mi última compra?')}
                className="bg-white border border-[#E2DDD1] rounded-xl px-3 py-1 text-[11px] font-bold text-[#181815]"
              >
                ↻ Escanear
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white border border-[#E2DDD1] rounded-2xl p-2.5">
                <span className="text-[10px] font-bold text-[#5E5B52] block">DISPONIBLE REAL</span>
                <strong className="text-sm font-extrabold text-[#0D7A5F]">
                  {formatCurrency(financialSnapshot?.disponibleDespuesDePagosFijos || 0, currency)}
                </strong>
              </div>
              <div className="bg-white border border-[#E2DDD1] rounded-2xl p-2.5">
                <span className="text-[10px] font-bold text-[#5E5B52] block">COMPRAS MES</span>
                <strong className="text-sm font-extrabold text-[#C25E00]">
                  {formatCurrency(financialSnapshot?.totalGastos || 0, currency)}
                </strong>
              </div>
              <div className="bg-white border border-[#E2DDD1] rounded-2xl p-2.5">
                <span className="text-[10px] font-bold text-[#5E5B52] block">FIJOS PEND.</span>
                <strong className="text-sm font-extrabold text-[#181815]">
                  {formatCurrency(financialSnapshot?.pagosFijosPendientes || 0, currency)}
                </strong>
              </div>
            </div>

            <div className="bg-white border border-[#E2DDD1] rounded-2xl p-3">
              <span className="text-[10px] font-bold text-[#5E5B52] block">
                ÚLTIMA COMPRA REGISTRADA EN TIEMPO REAL
              </span>
              {lastPurchase ? (
                <>
                  <strong className="text-xs font-extrabold text-[#181815] block mt-0.5">
                    {lastPurchase.desc} • {formatCurrency(lastPurchase.monto, currency)}
                  </strong>
                  <span className="text-[11px] text-[#5E5B52]">
                    {lastPurchase.entidad || 'Banco'} • {lastPurchase.fecha} •{' '}
                    {lastPurchase.categoria}
                  </span>
                </>
              ) : (
                <strong className="text-xs font-bold text-[#181815] block mt-0.5">
                  Sin compras registradas aún hoy
                </strong>
              )}
            </div>

            <div className="bg-[#EAF5F1] border border-[#0D7A5F] rounded-2xl p-3 text-xs font-bold text-[#0D7A5F]">
              Agente: {widgetReply}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowWidgetQuickModal(true)}
                className="bg-[#0D7A5F] text-white text-xs font-bold py-2.5 px-3 rounded-xl"
              >
                💬 Hablar con Agente
              </button>
              <button
                type="button"
                onClick={handleVoiceDictation}
                className="bg-[#0D7A5F] text-white text-xs font-bold py-2.5 px-3 rounded-xl"
              >
                🎤 Voz
              </button>
              <button
                type="button"
                onClick={() => handleSendQuestion('¿Ya registraste mi última compra?')}
                className="bg-[#C25E00] text-white text-xs font-bold py-2.5 px-3 rounded-xl"
              >
                ✓ ¿Registró compra?
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPCIÓN 3: INSTALACIÓN Y RESPALDO */}
      {activeView === 'respaldo' && (
        <div className="bg-[#1C1B18] border border-[#2C2A24] rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0D7A5F]/20 border border-[#0D7A5F]/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-[#10B981]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Lectura Automática 24/7, Widget y Respaldo de Datos
              </h3>
              <p className="text-xs text-[#A6A297]">
                Guarda o restaura tus datos y activa el Widget en la pantalla principal de tu Android
              </p>
            </div>
          </div>

          {backupMessage && (
            <div className="bg-[#0D7A5F]/20 border border-[#10B981]/50 text-[#10B981] px-3.5 py-2 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{backupMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {installPromptEvent ? (
              <button
                type="button"
                onClick={onTriggerInstallPrompt}
                className="bg-[#0D7A5F] text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Smartphone className="w-4 h-4" />
                Instalar App Ahora
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownloadFullCompiledApp}
                className="bg-[#0D7A5F] text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5"
              >
                <HardDriveDownload className="w-4 h-4" />
                Descargar App Portátil
              </button>
            )}

            <button
              type="button"
              onClick={handleExportBackupJson}
              className="bg-[#262420] text-white text-xs font-semibold py-2.5 px-3 rounded-xl border border-[#2C2A24] flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              Guardar Copia (.json)
            </button>

            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              className="bg-[#262420] text-white text-xs font-semibold py-2.5 px-3 rounded-xl border border-[#2C2A24] flex items-center justify-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              Restaurar Copia (.json)
            </button>

            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Modal Rápido Flotante al tocar "Hablar con Agente" en el Widget */}
      {showWidgetQuickModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#1C1B18] border border-[#0D7A5F] rounded-3xl max-w-md w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <strong className="text-sm font-bold text-white">
                Agente Rápido desde el Widget
              </strong>
              <button
                type="button"
                onClick={() => setShowWidgetQuickModal(false)}
                className="text-xs text-[#A6A297] hover:text-white"
              >
                Cerrar
              </button>
            </div>
            <div className="bg-[#121210] border border-[#2C2A24] rounded-2xl p-3 text-xs text-[#10B981]">
              {widgetReply}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSendQuestion();
                  }
                }}
                placeholder="Ej: ¿Ya registraste mi compra? / Gasté 35 mil..."
                className="flex-1 bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => handleSendQuestion()}
                className="bg-[#0D7A5F] text-white text-xs font-bold px-3.5 py-2 rounded-xl"
              >
                Preguntar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
