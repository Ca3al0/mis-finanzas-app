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
} from 'lucide-react';
import {
  Transaction,
  CreditObligation,
  ChatMessage,
  AdvisorActionCommand,
} from '../types/finance';
import { CurrencyCode } from '../utils/financeCalculations';
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

export const AdvisorAndMobileCenter: React.FC<AdvisorAndMobileCenterProps> = ({
  transactions,
  credits,
  financialSnapshot,
  onExecuteAdvisorActions,
  onImportBackup,
  installPromptEvent,
  onTriggerInstallPrompt,
}) => {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        '¡Hola! Soy tu asesor financiero interactivo. Puedes preguntarme cualquier cálculo, duda de tus deudas o escribirme directamente cosas como:\n• *"Mi salario es de 3.200.000"*\n• *"Pago 750.000 de arriendo cada mes"*\n• *"Quiero ahorrar 5.000.000 para una moto"*\n• *"¿Me alcanza para comprar algo de 400.000 o a cuántas cuotas me conviene?"*',
      timestamp: 'Ahora',
    },
  ]);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
    setIsLoading(true);

    try {
      // Primero verificar si el mensaje contiene una orden directa local (salario, meta, pago fijo)
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
    setBackupMessage('✅ Descargando la App Completa en un solo archivo ejecutable.');
  };

  return (
    <div className="space-y-4">
      {/* Chat Conversacional en Vivo con el Asesor */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[520px] shadow-xl">
        {/* Cabecera del Chat */}
        <div className="bg-slate-950/90 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center">
              <Bot className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                Asesor Financiero Inteligente
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </h2>
              <p className="text-[11px] text-slate-400">
                Pregunta lo que quieras o pídele que registre tu salario, metas o pagos
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
                  content: 'Conversación reiniciada. ¿Qué cálculo, registro o consulta deseas hacer ahora?',
                  timestamp: 'Ahora',
                },
              ])
            }
            className="text-xs text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800"
            title="Limpiar conversación"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Historial de Mensajes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/40">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-sm'
                }`}
              >
                {msg.actionsExecuted && msg.actionsExecuted.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {msg.actionsExecuted.map((act, i) => (
                      <div
                        key={i}
                        className="bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{act}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="whitespace-pre-line">{msg.content}</div>
                <span className="text-[10px] opacity-60 block text-right mt-1">{msg.timestamp}</span>
              </div>

              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 mt-1">
                  <User className="w-3.5 h-3.5 text-slate-300" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-indigo-300 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 w-fit">
              <Sparkles className="w-4 h-4 animate-spin text-indigo-400" />
              Analizando tu consulta y haciendo cálculos...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Barra de Entrada de Mensaje Libre */}
        <div className="p-3 bg-slate-900 border-t border-slate-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendQuestion()}
              placeholder="Escribe cualquier pregunta o comando (Ej: Gano 3.200.000, ¿cómo divido mis gastos?)"
              className="flex-1 bg-slate-950 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white"
            />
            <button
              type="button"
              disabled={isLoading || !question.trim()}
              onClick={() => handleSendQuestion()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shrink-0 transition"
            >
              <Send className="w-4 h-4" />
              Enviar
            </button>
          </div>
        </div>
      </div>

      {/* Descarga e Instalación en Samsung Galaxy A36 5G */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-emerald-400" />
          Instalar en tu Samsung Galaxy A36 5G y Copias de Seguridad
        </h3>

        {backupMessage && (
          <div className="bg-emerald-950/80 border border-emerald-600/60 text-emerald-200 px-3.5 py-2 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{backupMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {installPromptEvent ? (
            <button
              type="button"
              onClick={onTriggerInstallPrompt}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition"
            >
              <Download className="w-4 h-4" />
              Instalar App en Pantalla de Inicio
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDownloadFullCompiledApp}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition"
            >
              <HardDriveDownload className="w-4 h-4" />
              Descargar App Portátil (1 Clic)
            </button>
          )}

          <button
            type="button"
            onClick={handleExportBackupJson}
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2.5 px-3 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition"
          >
            <Download className="w-4 h-4" />
            Guardar Copia de mis Datos (.json)
          </button>

          <button
            type="button"
            onClick={() => backupInputRef.current?.click()}
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2.5 px-3 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition"
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
    </div>
  );
};
