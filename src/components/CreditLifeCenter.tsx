import React, { useState } from 'react';
import {
  ShieldCheck,
  CreditCard,
  TrendingDown,
  Flame,
  Snowflake,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Calendar,
  Percent,
  HelpCircle,
} from 'lucide-react';
import { CreditObligation } from '../types/finance';
import {
  formatCurrency,
  CurrencyCode,
  eaToMvPercent,
  compareDebtStrategies,
} from '../utils/financeCalculations';

interface CreditLifeCenterProps {
  currency: CurrencyCode;
  credits: CreditObligation[];
  scoreEstimado: number;
  porcentajeUtilizacionCupo: number;
  cupoTotalTarjetas: number;
  saldoTotalTarjetas: number;
  indiceEndeudamientoMensual: number;
  interesesMensualesEstimados: number;
  onAddCredit: (credit: Omit<CreditObligation, 'id'>) => void;
  onPayCreditAmount: (id: string, amount: number, nombre: string) => void;
  onDeleteCredit: (id: string) => void;
}

export const CreditLifeCenter: React.FC<CreditLifeCenterProps> = ({
  currency,
  credits,
  scoreEstimado,
  porcentajeUtilizacionCupo,
  cupoTotalTarjetas,
  saldoTotalTarjetas,
  indiceEndeudamientoMensual,
  interesesMensualesEstimados,
  onAddCredit,
  onPayCreditAmount,
  onDeleteCredit,
}) => {
  const [abonoExtraMensual, setAbonoExtraMensual] = useState<number>(250000);
  const [estrategiaActiva, setEstrategiaActiva] = useState<'avalancha' | 'bolaDeNieve'>('avalancha');
  const [showAddForm, setShowAddForm] = useState(false);

  // Formulario nueva obligación
  const [nombre, setNombre] = useState('');
  const [entidad, setEntidad] = useState('Nu Colombia');
  const [tipo, setTipo] = useState<CreditObligation['tipo']>('tarjeta_credito');
  const [cupoTotal, setCupoTotal] = useState('5000000');
  const [saldoActual, setSaldoActual] = useState('1200000');
  const [tasaEA, setTasaEA] = useState('28.5');
  const [cuotaMinima, setCuotaMinima] = useState('180000');
  const [diaCorte, setDiaCorte] = useState('15');
  const [diaPago, setDiaPago] = useState('2');

  // Input de abono rápido por tarjeta
  const [abonoMontos, setAbonoMontos] = useState<Record<string, string>>({});

  const comparison = compareDebtStrategies(credits, abonoExtraMensual);
  const planActual = estrategiaActiva === 'avalancha' ? comparison.avalancha : comparison.bolaDeNieve;

  const handleCreateCredit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    onAddCredit({
      nombre: nombre.trim(),
      entidad: entidad.trim() || 'Banco',
      tipo,
      cupoTotal: parseInt(cupoTotal, 10) || 0,
      saldoActual: parseInt(saldoActual, 10) || 0,
      tasaEA: parseFloat(tasaEA) || 25.0,
      cuotaMinima: parseInt(cuotaMinima, 10) || 100000,
      diaCorte: parseInt(diaCorte, 10) || 15,
      diaPago: parseInt(diaPago, 10) || 2,
      enMora: false,
    });
    setNombre('');
    setShowAddForm(false);
  };

  const scoreColor =
    scoreEstimado >= 780
      ? 'text-emerald-400'
      : scoreEstimado >= 650
      ? 'text-amber-400'
      : 'text-rose-400';

  const scoreLabel =
    scoreEstimado >= 780
      ? 'Excelente Perfil Crediticio'
      : scoreEstimado >= 650
      ? 'Buen Perfil (Con oportunidad de mejora)'
      : 'Alerta: Alta utilización o endeudamiento';

  return (
    <div className="space-y-4">
      {/* Radiografía de Vida Crediticia y Score Estimado */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Score Crediticio Estimado
              </span>
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <div className={`text-3xl font-extrabold mt-2 ${scoreColor}`}>
              {scoreEstimado} <span className="text-xs font-normal text-slate-500">/ 950 pts</span>
            </div>
            <p className="text-xs font-medium text-slate-300 mt-1">{scoreLabel}</p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
            Basado en la regla del 30% de utilización de cupo, puntualidad y capacidad de endeudamiento.
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Utilización de Cupo en Tarjetas
              </span>
              <CreditCard className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">
              {porcentajeUtilizacionCupo.toFixed(1)}%
            </div>
            <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden mt-2 border border-slate-800">
              <div
                className={`h-full transition-all ${
                  porcentajeUtilizacionCupo <= 30
                    ? 'bg-emerald-500'
                    : porcentajeUtilizacionCupo <= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, porcentajeUtilizacionCupo)}%` }}
              />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex justify-between">
            <span>Usado: {formatCurrency(saldoTotalTarjetas, currency)}</span>
            <span>Cupo: {formatCurrency(cupoTotalTarjetas, currency)}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Costo en Intereses Mensuales
              </span>
              <Percent className="w-5 h-5 text-rose-400" />
            </div>
            <div className="text-2xl font-extrabold text-rose-400 mt-2">
              {formatCurrency(interesesMensualesEstimados, currency)}
              <span className="text-xs font-normal text-slate-400"> / mes</span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Endeudamiento mensual: <strong>{indiceEndeudamientoMensual.toFixed(1)}%</strong> de tus ingresos
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
            Dinero que pierdes cada mes en intereses si no abonas a capital.
          </div>
        </div>
      </div>

      {/* Priorizador Inteligente de Deudas: Avalancha vs Bola de Nieve */}
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-emerald-400" />
              Priorizador de Deudas: ¿Cuál pagar primero?
            </h2>
            <p className="text-xs text-slate-400">
              Compara matemáticamente el Método Avalancha (menor costo en intereses) vs. Bola de Nieve (victorias rápidas)
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setEstrategiaActiva('avalancha')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                estrategiaActiva === 'avalancha'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              Método Avalancha (Recomendado)
            </button>
            <button
              type="button"
              onClick={() => setEstrategiaActiva('bolaDeNieve')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                estrategiaActiva === 'bolaDeNieve'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Snowflake className="w-3.5 h-3.5" />
              Bola de Nieve
            </button>
          </div>
        </div>

        {/* Control de Abono Extra Mensual */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <label className="text-xs font-semibold text-slate-300">
              💪 ¿Cuánto dinero extra al mes puedes destinar como abono a capital (además del pago mínimo)?
            </label>
            <span className="text-sm font-extrabold text-emerald-400">
              + {formatCurrency(abonoExtraMensual, currency)} / mes
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1500000}
            step={50000}
            value={abonoExtraMensual}
            onChange={(e) => setAbonoExtraMensual(Number(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>$0 (Solo mínimos)</span>
            <span>$250.000</span>
            <span>$500.000</span>
            <span>$1.000.000</span>
            <span>$1.500.000</span>
          </div>
        </div>

        {/* Resumen del ahorro logrado con la priorización */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3">
            <span className="text-[11px] text-emerald-300 block">Ahorro Estimado en Intereses</span>
            <strong className="text-lg font-extrabold text-emerald-400">
              {formatCurrency(planActual.ahorroInteresesVsMinimo, currency)}
            </strong>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              vs. pagar únicamente las cuotas mínimas
            </span>
          </div>

          <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-3">
            <span className="text-[11px] text-indigo-300 block">Tiempo Total para quedar Libre</span>
            <strong className="text-lg font-extrabold text-white">
              {planActual.mesesTotales} meses
            </strong>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Ahorras {planActual.mesesAhorradosVsMinimo} meses de pagos
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block">Enfoque de la Estrategia</span>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">{planActual.explicacion}</p>
          </div>
        </div>

        {/* Orden exacto de priorización */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Orden Exacto de Prioridad para tus Pagos de este Mes
          </h3>
          {planActual.pasos.map((paso) => (
            <div
              key={paso.idDeuda}
              className={`rounded-xl p-3 border ${
                paso.orden === 1
                  ? 'bg-indigo-950/40 border-indigo-500/60'
                  : 'bg-slate-950/70 border-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold ${
                      paso.orden === 1
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    #{paso.orden}
                  </span>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      {paso.nombre}
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                        {paso.tasaEA.toFixed(2)}% E.A. ({paso.tasaMV.toFixed(2)}% M.V.)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{paso.razonPrioridad}</p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-400">
                    Pago sugerido este mes:{' '}
                    <strong className="text-emerald-400">
                      {formatCurrency(paso.abonoSugeridoMes1, currency)}
                    </strong>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Saldo: {formatCurrency(paso.saldoActual, currency)} • Libre en ~{paso.mesesEstimadosLiquidacion} meses
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gestor de Tarjetas de Crédito y Obligaciones */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">
              Mis Tarjetas de Crédito y Préstamos ({credits.length})
            </h2>
            <p className="text-xs text-slate-400">
              Controla fechas de corte, fechas límite de pago, tasas y realiza abonos directos
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
          >
            <Plus className="w-4 h-4" />
            {showAddForm ? 'Cerrar' : 'Nueva Tarjeta / Crédito'}
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleCreateCredit}
            className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Nombre de la Obligación</label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Tarjeta Nu / Crédito Vehículo"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Entidad / Banco</label>
                <input
                  type="text"
                  value={entidad}
                  onChange={(e) => setEntidad(e.target.value)}
                  placeholder="Ej: Nu, Bancolombia, Davivienda"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Tipo de Producto</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as CreditObligation['tipo'])}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="tarjeta_credito">💳 Tarjeta de Crédito</option>
                  <option value="prestamo_personal">🏦 Crédito Libre Inversión</option>
                  <option value="compra_cartera">🔄 Compra de Cartera</option>
                  <option value="credito_vehiculo">🚗 Crédito de Vehículo</option>
                  <option value="hipotecario">🏠 Crédito Hipotecario</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Cupo Total ($)</label>
                <input
                  type="number"
                  value={cupoTotal}
                  onChange={(e) => setCupoTotal(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Deuda / Saldo Actual ($)</label>
                <input
                  type="number"
                  value={saldoActual}
                  onChange={(e) => setSaldoActual(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Tasa E.A. (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={tasaEA}
                  onChange={(e) => setTasaEA(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Cuota Mínima ($)</label>
                <input
                  type="number"
                  value={cuotaMinima}
                  onChange={(e) => setCuotaMinima(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Día Corte / Pago</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={diaCorte}
                    onChange={(e) => setDiaCorte(e.target.value)}
                    placeholder="Corte"
                    className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white"
                  />
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={diaPago}
                    onChange={(e) => setDiaPago(e.target.value)}
                    placeholder="Pago"
                    className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-lg transition"
            >
              Guardar Obligación Crediticia
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {credits.map((cred) => {
            const util = cred.cupoTotal > 0 ? (cred.saldoActual / cred.cupoTotal) * 100 : 0;
            const mv = eaToMvPercent(cred.tasaEA);
            const abonoInput = abonoMontos[cred.id] ?? String(cred.cuotaMinima);

            return (
              <div
                key={cred.id}
                className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                        {cred.entidad}
                      </span>
                      <h3 className="text-sm font-bold text-white mt-1">{cred.nombre}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteCredit(cred.id)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                      title="Eliminar obligación"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="bg-slate-900/90 p-2 rounded-lg">
                      <span className="text-slate-400 block text-[10px]">Deuda Actual</span>
                      <strong className="text-amber-400 text-sm">
                        {formatCurrency(cred.saldoActual, currency)}
                      </strong>
                    </div>
                    <div className="bg-slate-900/90 p-2 rounded-lg">
                      <span className="text-slate-400 block text-[10px]">Cuota Mínima</span>
                      <strong className="text-white text-sm">
                        {formatCurrency(cred.cuotaMinima, currency)}
                      </strong>
                    </div>
                  </div>

                  {cred.cupoTotal > 0 && (
                    <div className="mt-2.5">
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Utilización: {util.toFixed(1)}%</span>
                        <span>Cupo Libre: {formatCurrency(Math.max(0, cred.cupoTotal - cred.saldoActual), currency)}</span>
                      </div>
                      <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            util <= 30 ? 'bg-emerald-500' : util <= 55 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.min(100, util)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      Corte: día {cred.diaCorte} | Pago: día {cred.diaPago}
                    </span>
                    <span className="text-rose-300 font-medium">
                      {cred.tasaEA}% E.A. ({mv.toFixed(2)}% M.V.)
                    </span>
                  </div>

                  {cred.notas && (
                    <p className="text-[11px] text-slate-500 mt-1.5 italic">{cred.notas}</p>
                  )}
                </div>

                {cred.saldoActual > 0 ? (
                  <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                    <input
                      type="number"
                      value={abonoInput}
                      onChange={(e) =>
                        setAbonoMontos({ ...abonoMontos, [cred.id]: e.target.value })
                      }
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      placeholder="Monto a pagar"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseInt(abonoInput, 10);
                        if (val > 0) {
                          onPayCreditAmount(cred.id, val, cred.nombre);
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shrink-0"
                    >
                      Registrar Abono
                    </button>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-800 text-xs text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" />
                    ¡Obligación en $0! Excelente para tu vida crediticia.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Guía Educativa con Ejemplos de Vida Crediticia */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5 mb-2.5">
          <HelpCircle className="w-4 h-4" />
          3 Ejemplos Clave para Dominar tu Vida Crediticia (DataCrédito / Bancos)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <strong className="text-white block mb-1">1. El truco de la Fecha de Corte vs. Fecha de Pago</strong>
            <p className="text-slate-400 leading-relaxed">
              <strong>Ejemplo:</strong> Si tu tarjeta corta el día 15 y tiene cupo de $6.000.000, el banco reporta a DataCrédito la foto de tu saldo ese día 15. Si gastaste $4.000.000 (66%), abona $2.500.000 el día 13 (antes del corte). Así el banco reporta solo el 25% de uso y tu puntaje sube rápido.
            </p>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <strong className="text-white block mb-1">2. Compra de Cartera Inteligente</strong>
            <p className="text-slate-400 leading-relaxed">
              <strong>Ejemplo:</strong> Si debes $3.000.000 en una tarjeta al 29% E.A. y otro banco te ofrece compra de cartera al 16% E.A., aceptarla te ahorra más de $32.000 cada mes en intereses desde el primer día.
            </p>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <strong className="text-white block mb-1">3. Jamás cierres tu tarjeta más antigua</strong>
            <p className="text-slate-400 leading-relaxed">
              <strong>Ejemplo:</strong> La antigüedad promedio de tus productos pesa el 15% de tu score. Si tu tarjeta más vieja cobra cuota de manejo, pide exoneración o pásala a categoría sin cuota, pero mantén esa antigüedad viva.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
