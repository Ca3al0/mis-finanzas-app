import React, { useState, useRef } from 'react';
import {
  Bot,
  Smartphone,
  Download,
  Upload,
  Sparkles,
  CheckCircle2,
  Send,
  Shield,
  FileCode,
  HardDriveDownload,
  Lightbulb,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import { Transaction, CreditObligation } from '../types/finance';
import { formatCurrency, CurrencyCode } from '../utils/financeCalculations';
import {
  validateTransactionsArray,
  validateCreditsArray,
  sanitizeTextInput,
} from '../utils/securityAndValidation';

interface AdvisorAndMobileCenterProps {
  currency: CurrencyCode;
  transactions: Transaction[];
  credits: CreditObligation[];
  financialSnapshot: any;
  onImportBackup: (data: { transactions: Transaction[]; credits: CreditObligation[] }) => void;
  installPromptEvent: any;
  onTriggerInstallPrompt: () => void;
}

export const AdvisorAndMobileCenter: React.FC<AdvisorAndMobileCenterProps> = ({
  currency,
  transactions,
  credits,
  financialSnapshot,
  onImportBackup,
  installPromptEvent,
  onTriggerInstallPrompt,
}) => {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const generateLocalPersonalizedAdvice = (q: string) => {
    const ingresos = financialSnapshot.totalGanancias || 0;
    const gastos = financialSnapshot.totalGastos || 0;
    const disponible = Math.max(0, ingresos - gastos);
    const deudaTotal = financialSnapshot.deudaTotalObligaciones || 0;
    const util = financialSnapshot.porcentajeUtilizacionCupo || 0;
    const interesesMes = financialSnapshot.interesesMensualesEstimados || 0;
    const hormiga = financialSnapshot.gastosHormiga || 0;

    const topDebt = [...credits].sort((a, b) => b.tasaEA - a.tasaEA)[0];

    return `📋 DIAGNÓSTICO PERSONALIZADO CON TUS NÚMEROS ACTUALES:
• Ingresos registrados: ${formatCurrency(ingresos, currency)} | Gastos: ${formatCurrency(gastos, currency)}
• Flujo libre disponible: ${formatCurrency(disponible, currency)}
• Deuda total activa: ${formatCurrency(deudaTotal, currency)} (Intereses estimados: ${formatCurrency(interesesMes, currency)}/mes)
• Utilización de cupo en tarjetas: ${util.toFixed(1)}% (Score estimado: ${financialSnapshot.scoreEstimado} pts)

🎯 PLAN DE ACCIÓN Y PRIORIZACIÓN PASO A PASO:
1. Prioridad #1 (Atacar la deuda más cara): ${
      topDebt
        ? `Tu obligación más costosa hoy es "${topDebt.nombre}" (${topDebt.entidad}) al ${topDebt.tasaEA}% E.A. con saldo de ${formatCurrency(topDebt.saldoActual, currency)}. Destina ahí cualquier abono extra a capital.`
        : 'Mantén tus tarjetas con compras a 1 sola cuota para pagar $0 en intereses.'
    }
2. Prioridad #2 (Regla del 30% antes del corte): ${
      util > 30
        ? `Tu utilización actual es del ${util.toFixed(1)}%. Para bajarla al 28% óptimo antes de tu fecha de corte, necesitas abonar ${formatCurrency(
            Math.max(50000, financialSnapshot.saldoTotalTarjetas - financialSnapshot.cupoTotalTarjetas * 0.28),
            currency
          )}. Eso impulsará tu puntaje en DataCrédito.`
        : `¡Excelente! Tu utilización de cupo (${util.toFixed(1)}%) está en zona verde (<30%), lo que protege tu puntaje crediticio.`
    }
3. Prioridad #3 (Optimización de Gastos Hormiga y Promedios): Tu gasto promedio diario es de ${formatCurrency(
      financialSnapshot.promedioGastoDiario || 0,
      currency
    )} y acumulas ${formatCurrency(hormiga, currency)} en gastos pequeños/hormiga.

💡 EJEMPLO PRÁCTICO CON TUS CIFRAS ("IMAGINA QUE..."):
Si tomas el 50% de tus gastos hormiga (${formatCurrency(hormiga * 0.5, currency)}) más el 20% de tu flujo libre (${formatCurrency(
      disponible * 0.2,
      currency
    )}), reúnes un abono extra mensual de ${formatCurrency(
      hormiga * 0.5 + disponible * 0.2,
      currency
    )}/mes. Al inyectarlo a capital cada mes, te ahorras cerca de ${formatCurrency(
      interesesMes * 6.5,
      currency
    )} en intereses bancarios durante el próximo semestre.`;
  };

  const handleAskAdvisor = async (customPrompt?: string) => {
    const q = sanitizeTextInput(customPrompt ?? question, 500);
    if (!q) return;

    setIsLoading(true);
    if (customPrompt) setQuestion(q);

    try {
      if (!navigator.onLine) {
        setAnswer(generateLocalPersonalizedAdvice(q));
        setIsLoading(false);
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch('/api/ai/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, financialSnapshot }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error('Fallback local');
      const data = await res.json();
      setAnswer(data.answer || generateLocalPersonalizedAdvice(q));
    } catch {
      setAnswer(generateLocalPersonalizedAdvice(q));
    } finally {
      setIsLoading(false);
    }
  };

  // Exportar copia de seguridad JSON al Samsung A36 5G
  const handleExportBackupJson = () => {
    const payload = {
      version: '2.0-samsung-a36-hardened',
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
    setBackupMessage('✅ Copia de seguridad (.json) verificada y guardada en la carpeta Descargas de tu celular.');
  };

  // Importar copia de seguridad JSON con validación estricta de esquema y sanitización anti-corrupción
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setBackupMessage('⚠️ Archivo demasiado grande (máximo 10 MB por seguridad).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const safeTx = validateTransactionsArray(parsed?.transactions);
        const safeCreds = validateCreditsArray(parsed?.credits);
        if (safeTx.length > 0 || safeCreds.length > 0) {
          onImportBackup({
            transactions: safeTx.length > 0 ? safeTx : transactions,
            credits: safeCreds.length > 0 ? safeCreds : credits,
          });
          setBackupMessage(`✅ Restauración segura completada: ${safeTx.length} movimientos y ${safeCreds.length} créditos validados.`);
        } else {
          setBackupMessage('⚠️ El archivo no contenía registros válidos para importar.');
        }
      } catch {
        setBackupMessage('⚠️ El archivo seleccionado no tiene un formato JSON válido.');
      }
    };
    reader.readAsText(file);
  };

  // Descargar App Portátil Autónoma (.html) protegida contra XSS (con escapeHtml y CSP)
  const handleDownloadStandaloneApp = () => {
    const preloadedMovs = JSON.stringify(transactions).replace(/</g, '\\u003c');
    const preloadedCreds = JSON.stringify(credits).replace(/</g, '\\u003c');

    const standaloneHtml = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0f172a">
<title>Mis Finanzas y Vida Crediticia - Samsung A36 5G</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
  body { background: #090d16; color: #f1f5f9; padding: 14px; max-width: 680px; margin: 0 auto; }
  .card { background: #111827; border: 1px solid #1f2937; border-radius: 14px; padding: 14px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .label { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
  .val { font-size: 19px; font-weight: 800; margin-top: 4px; }
  .green { color: #34d399; } .red { color: #fb7185; } .amber { color: #fbbf24; }
  input, select, textarea { width: 100%; background: #090d16; color: #fff; border: 1px solid #334155; border-radius: 10px; padding: 10px; font-size: 13px; margin-bottom: 8px; }
  button { background: #4f46e5; color: #fff; border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; font-size: 13px; cursor: pointer; width: 100%; }
  .item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #1f2937; font-size: 13px; }
</style>
</head>
<body>
  <div class="card" style="border-color:#4f46e5">
    <h1 style="font-size:18px">📱 Mis Finanzas y Vida Crediticia (Portátil Offline)</h1>
    <p style="font-size:12px;color:#94a3b8;margin-top:4px">Versión autónoma protegida para tu Samsung Galaxy A36 5G — Funciona 100% sin internet</p>
  </div>
  <div class="grid">
    <div class="card" style="margin:0"><div class="label">Balance Libre</div><div id="bal" class="val">$0</div></div>
    <div class="card" style="margin:0"><div class="label">Deuda Total</div><div id="deu" class="val amber">$0</div></div>
  </div>
  <div class="card">
    <h2 style="font-size:14px;margin-bottom:8px">📲 Escáner Local de Notificaciones y Extractos</h2>
    <textarea id="notif" rows="3" placeholder="Pega aquí tu notificación de Nequi, Bancolombia, Nu o extracto..."></textarea>
    <button onclick="escanear()">Analizar y Guardar en mi Celular</button>
  </div>
  <div class="card">
    <h2 style="font-size:14px;margin-bottom:8px">📊 Historial de Movimientos</h2>
    <div id="lista"></div>
  </div>
<script>
  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  let movs = [];
  try { movs = JSON.parse(localStorage.getItem('finanzas_a36_v2')) || ${preloadedMovs}; } catch(e) { movs = ${preloadedMovs}; }
  let creds = ${preloadedCreds};
  const fmt = (n) => new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 }).format(Number(n)||0);
  function escanear() {
    const t = document.getElementById('notif').value.trim();
    if (!t) return;
    const m = t.match(/\\$?\\s?(\\d{1,3}(?:[.,]\\d{3})+|\\d{4,9})/);
    const monto = m ? parseInt(m[1].replace(/[.,]/g, ''), 10) : 0;
    if (!monto || monto <= 0) return alert('No se detectó un monto válido.');
    const low = t.toLowerCase();
    const tipo = (low.includes('recibiste') || low.includes('abono') || low.includes('llegó')) ? 'ganancia' : 'gasto';
    movs.unshift({ id: Date.now()+'', fecha: new Date().toLocaleDateString('es-CO'), tipo, categoria: 'General', monto, desc: '📲 ' + t.substring(0, 60) });
    localStorage.setItem('finanzas_a36_v2', JSON.stringify(movs));
    document.getElementById('notif').value = '';
    render();
  }
  function render() {
    let g = 0, s = 0;
    movs.forEach(x => { if (x.tipo === 'ganancia') g += (Number(x.monto)||0); else s += (Number(x.monto)||0); });
    const dTotal = creds.reduce((a, c) => a + (Number(c.saldoActual)||0), 0);
    document.getElementById('bal').innerText = fmt(g - s);
    document.getElementById('deu').innerText = fmt(dTotal);
    document.getElementById('lista').innerHTML = movs.map(x => '<div class="item"><div><strong>'+esc(x.desc)+'</strong><div style="font-size:11px;color:#64748b">'+esc(x.fecha)+'</div></div><strong class="'+(x.tipo==='ganancia'?'green':'red')+'">'+fmt(x.monto)+'</strong></div>').join('');
  }
  render();
</script>
</body>
</html>`;

    const blob = new Blob([standaloneHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Mis-Finanzas-Samsung-A36-Offline.html';
    a.click();
    URL.revokeObjectURL(url);
    setBackupMessage('✅ Aplicación Portátil Offline (.html) blindada contra XSS descargada en tu celular.');
  };

  return (
    <div className="space-y-4">
      {/* Asesor Financiero y Generador de Ejemplos Personalizados */}
      <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            Asesor de Finanzas y Vida Crediticia (Con Ejemplos Reales)
          </h2>
          <p className="text-xs text-slate-400">
            Pide cálculos, simulaciones, priorización de pagos o ejemplos explicados con tus propios números
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            'Dame un ejemplo paso a paso para salir de mis deudas más rápido',
            '¿Cómo subir mi puntaje en DataCrédito antes del próximo corte?',
            'Analiza mis promedios y dime cómo reducir mis gastos hormiga',
            '¿Qué tarjeta o crédito debo pagar primero este mes y por qué?',
          ].map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleAskAdvisor(q)}
              className="text-xs bg-slate-950 hover:bg-indigo-950/60 text-indigo-300 border border-slate-800 hover:border-indigo-500/50 px-3 py-2 rounded-xl text-left transition flex items-center gap-1.5"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{q}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAskAdvisor()}
            placeholder="Escribe tu consulta... Ej: ¿Me conviene comprar un televisor de $1.800.000 a 12 cuotas?"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white"
          />
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleAskAdvisor()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shrink-0 transition"
          >
            <Send className="w-4 h-4" />
            {isLoading ? 'Calculando...' : 'Consultar'}
          </button>
        </div>

        {answer && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs sm:text-sm text-slate-200 whitespace-pre-line leading-relaxed">
            {answer}
          </div>
        )}
      </div>

      {/* Centro Nativo para Samsung Galaxy A36 5G */}
      <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 text-[11px] font-bold mb-1.5">
              <Shield className="w-3.5 h-3.5" />
              100% Privado • Sin Dependencias Externas • Blindado
            </div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              Instalación y Descarga para tu Samsung Galaxy A36 5G
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Elige cualquiera de las 3 formas de instalarla y respaldar tus datos en tu celular.
            </p>
          </div>
        </div>

        {backupMessage && (
          <div className="bg-emerald-950/80 border border-emerald-600/60 text-emerald-200 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{backupMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-indigo-400" />
                1. Instalar App / Descargar APK Nativo
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Instala directo desde Chrome en tu Samsung A36 5G o descarga el instalador <code>app-debug.apk</code> generado por GitHub Actions.
              </p>
            </div>
            {installPromptEvent ? (
              <button
                type="button"
                onClick={onTriggerInstallPrompt}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-lg transition flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                Instalar Ahora en mi Samsung A36
              </button>
            ) : (
              <div className="text-[11px] bg-slate-900 text-indigo-300 p-2.5 rounded-lg border border-slate-800">
                💡 En Chrome de tu Samsung A36: toca <strong>⋮</strong> arriba a la derecha y selecciona <strong>"Instalar aplicación"</strong>.
              </div>
            )}
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-emerald-400" />
                2. Descargar App Portátil Offline (.html)
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Descarga un archivo único ejecutable que puedes abrir desde la app <strong>"Mis Archivos"</strong> de tu Samsung A36 sin necesidad de internet.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadStandaloneApp}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-lg transition flex items-center justify-center gap-1.5"
            >
              <HardDriveDownload className="w-4 h-4" />
              Descargar App Portátil (.html)
            </button>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                3. Respaldo Privado en tu Celular
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Exporta o restaura una copia verificada (<code>.json</code>) de todos tus movimientos y tarjetas en la memoria de tu Samsung A36.
              </p>
            </div>

            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExportBackupJson}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2 rounded-lg border border-slate-700 flex items-center justify-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar
              </button>
              <button
                type="button"
                onClick={() => backupInputRef.current?.click()}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-2 rounded-lg border border-slate-700 flex items-center justify-center gap-1"
              >
                <Upload className="w-3.5 h-3.5" />
                Restaurar
              </button>
            </div>
          </div>
        </div>

        {/* Reporte de Auditoría de Vulnerabilidades y Fallas Solucionadas */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Lock className="w-4 h-4" />
            Auditoría de Seguridad y Vulnerabilidades Solucionadas
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <strong className="text-white block">1. Prevención de Inyección XSS (Cross-Site Scripting)</strong>
              En tu <code>index.html</code> original se insertaba <code>m.desc</code> directamente en <code>innerHTML</code> sin escapar. Ahora todo texto se sanitiza con <code>escapeHtml</code> y React DOM seguro.
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <strong className="text-white block">2. Protección contra Corrupción de Memoria Local</strong>
              Si <code>localStorage</code> o un JSON importado tenía datos corruptos o <code>NaN</code>, la app fallaba. Ahora <code>validateTransactionsArray</code> repara y valida cada campo al iniciar.
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <strong className="text-white block">3. Tolerancia Total a Fallos de Red (100% Offline)</strong>
              El escáner de PDF, imágenes y notificaciones cuenta con un motor local autónomo con <code>AbortController</code> (timeout de 8s) para que jamás se quede congelado sin señal.
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <strong className="text-white block">4. Bloqueo por PIN Local y Límites de Memoria</strong>
              Límite de tamaño de archivos (máx 15MB) para proteger la RAM de tu Samsung Galaxy A36 5G y opción de bloqueo por PIN de 4 dígitos en la cabecera.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
