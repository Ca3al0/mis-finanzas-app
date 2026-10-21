import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  ShieldCheck,
  TrendingDown,
  Plus,
  Trash2,
  CheckCircle,
  Gauge,
} from 'lucide-react';
import { CreditObligation } from '../types/finance';
import {
  compareDebtStrategies,
  formatCurrency,
  eaToMvPercent,
  CurrencyCode,
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
  onPayCreditAmount: (id: string, amount: number, creditName: string) => void;
  onDeleteCredit: (id: string) => void;
}

type CreditSubOption = 'obligaciones' | 'score' | 'plan_pagos';

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
  const [selectedOption, setSelectedOption] = useState<CreditSubOption>('obligaciones');
  const [showAddForm, setShowAddForm] = useState(false);

  const [nombre, setNombre] = useState('');
  const [entidad, setEntidad] = useState('Bancolombia');
  const [tipo, setTipo] = useState<CreditObligation['tipo']>('tarjeta_credito');
  const [cupoTotal, setCupoTotal] = useState('');
  const [saldoActual, setSaldoActual] = useState('');
  const [tasaEA, setTasaEA] = useState('28.5');
  const [cuotaMinima, setCuotaMinima] = useState('');
  const [diaCorte, setDiaCorte] = useState('15');
  const [diaPago, setDiaPago] = useState('2');

  const [extraPayment, setExtraPayment] = useState('150000');
  const [strategyMode, setStrategyMode] = useState<'avalancha' | 'bolaDeNieve'>('avalancha');
  const [payInputs, setPayInputs] = useState<Record<string, string>>({});

  const payoffComparison = useMemo(
    () => compareDebtStrategies(credits, Math.max(0, Number(extraPayment) || 0)),
    [credits, extraPayment]
  );

  const activePlan = payoffComparison[strategyMode];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const saldo = Number(saldoActual.replace(/\D/g, '')) || 0;
    const cupo = Number(cupoTotal.replace(/\D/g, '')) || saldo;
    const min = Number(cuotaMinima.replace(/\D/g, '')) || Math.max(50000, Math.round(saldo * 0.08));
    if (!nombre.trim() || saldo <= 0) return;

    onAddCredit({
      nombre: nombre.trim(),
      entidad: entidad.trim() || 'Banco',
      tipo,
      cupoTotal: Math.max(cupo, saldo),
      saldoActual: saldo,
      tasaEA: Number(tasaEA) || 28.5,
      cuotaMinima: min,
      diaCorte: Number(diaCorte) || 15,
      diaPago: Number(diaPago) || 2,
      enMora: false,
    });

    setNombre('');
    setCupoTotal('');
    setSaldoActual('');
    setCuotaMinima('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-5">
      {/* Selector de Opciones Limpio */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1C1B18] border border-[#2C2A24] p-2 rounded-2xl">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'obligaciones', label: `Mis Tarjetas y Deudas (${credits.length})`, icon: CreditCard },
            { id: 'score', label: `Score y Salud (${scoreEstimado} pts)`, icon: Gauge },
            { id: 'plan_pagos', label: 'Plan Salir de Deudas', icon: TrendingDown },
          ].map((opt) => {
            const Icon = opt.icon;
            const active = selectedOption === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedOption(opt.id as CreditSubOption)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  active
                    ? 'bg-[#0D7A5F] text-white shadow'
                    : 'text-[#A6A297] hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-[#C25E00] hover:bg-[#a65000] text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nueva Tarjeta / Deuda</span>
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleCreate}
          className="bg-[#1C1B18] border border-[#2C2A24] rounded-2xl p-5 space-y-4"
        >
          <h3 className="text-sm font-bold text-white">Registrar Obligación Crediticia</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Tarjeta Nu / Bancolombia"
              className="bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
            />
            <input
              type="text"
              value={entidad}
              onChange={(e) => setEntidad(e.target.value)}
              placeholder="Entidad (Nu, Bancolombia...)"
              className="bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
            />
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as CreditObligation['tipo'])}
              className="bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
            >
              <option value="tarjeta_credito">Tarjeta de Crédito</option>
              <option value="libre_inversion">Crédito Libre Inversión</option>
              <option value="vehiculo">Crédito Vehículo</option>
              <option value="hipotecario">Crédito Hipotecario</option>
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <input
              type="number"
              value={cupoTotal}
              onChange={(e) => setCupoTotal(e.target.value)}
              placeholder="Cupo total ($)"
              className="bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
            />
            <input
              type="number"
              required
              value={saldoActual}
              onChange={(e) => setSaldoActual(e.target.value)}
              placeholder="Deuda actual ($)"
              className="bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
            />
            <input
              type="number"
              step="0.1"
              value={tasaEA}
              onChange={(e) => setTasaEA(e.target.value)}
              placeholder="Tasa % E.A."
              className="bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
            />
            <input
              type="number"
              value={cuotaMinima}
              onChange={(e) => setCuotaMinima(e.target.value)}
              placeholder="Cuota mínima ($)"
              className="bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-2 text-xs text-[#A6A297]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-[#0D7A5F] text-white text-xs font-bold px-4 py-2 rounded-xl"
            >
              Guardar Obligación
            </button>
          </div>
        </form>
      )}

      {selectedOption === 'obligaciones' && (
        <div className="space-y-3">
          {credits.length === 0 ? (
            <div className="bg-[#1C1B18] border border-[#2C2A24] rounded-2xl p-6 text-center text-xs text-[#A6A297]">
              No tienes tarjetas ni deudas registradas. Usa el botón superior para agregar una obligación.
            </div>
          ) : (
            credits.map((c) => {
              const usoPct =
                c.cupoTotal > 0 ? Math.min(100, Math.round((c.saldoActual / c.cupoTotal) * 100)) : 0;
              return (
                <div
                  key={c.id}
                  className="bg-[#1C1B18] border border-[#2C2A24] rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-white">{c.nombre}</h4>
                      <p className="text-xs text-[#A6A297]">
                        {c.entidad} • Tasa {c.tasaEA}% E.A. ({eaToMvPercent(c.tasaEA).toFixed(2)}% M.V.)
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold text-[#D97706]">
                        {formatCurrency(c.saldoActual, currency)}
                      </span>
                      <span className="block text-[11px] text-[#A6A297]">
                        Cupo: {formatCurrency(c.cupoTotal, currency)} ({usoPct}%)
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2 rounded-full bg-[#121210] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        usoPct <= 30 ? 'bg-[#10B981]' : usoPct <= 60 ? 'bg-[#D97706]' : 'bg-rose-500'
                      }`}
                      style={{ width: `${usoPct}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={payInputs[c.id] ?? ''}
                        onChange={(e) => setPayInputs({ ...payInputs, [c.id]: e.target.value })}
                        placeholder={`Abonar (Mín ${formatCurrency(c.cuotaMinima, currency)})`}
                        className="bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-1.5 text-xs text-white w-48"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = Number(payInputs[c.id]) || c.cuotaMinima;
                          onPayCreditAmount(c.id, val, c.nombre);
                          setPayInputs({ ...payInputs, [c.id]: '' });
                        }}
                        className="bg-[#0D7A5F] text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Abonar
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteCredit(c.id)}
                      className="text-xs text-[#A6A297] hover:text-rose-400 p-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {selectedOption === 'score' && (
        <div className="bg-[#1C1B18] border border-[#2C2A24] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3">
              <span className="text-[11px] text-[#A6A297] block">Score Estimado</span>
              <strong className="text-xl font-extrabold text-[#10B981]">{scoreEstimado} pts</strong>
            </div>
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3">
              <span className="text-[11px] text-[#A6A297] block">Uso de Cupo</span>
              <strong className="text-xl font-extrabold text-white">
                {porcentajeUtilizacionCupo.toFixed(1)}%
              </strong>
            </div>
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3">
              <span className="text-[11px] text-[#A6A297] block">Endeudamiento</span>
              <strong className="text-xl font-extrabold text-[#D97706]">
                {indiceEndeudamientoMensual.toFixed(1)}%
              </strong>
            </div>
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3">
              <span className="text-[11px] text-[#A6A297] block">Intereses / Mes</span>
              <strong className="text-sm font-extrabold text-rose-400">
                {formatCurrency(interesesMensualesEstimados, currency)}
              </strong>
            </div>
          </div>

          <div className="text-xs text-[#A6A297] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>
              Cupo usado: {formatCurrency(saldoTotalTarjetas, currency)} de{' '}
              {formatCurrency(cupoTotalTarjetas, currency)}. Mantenerlo bajo el 30% impulsa tu vida crediticia.
            </span>
          </div>
        </div>
      )}

      {selectedOption === 'plan_pagos' && (
        <div className="bg-[#1C1B18] border border-[#2C2A24] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStrategyMode('avalancha')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                  strategyMode === 'avalancha'
                    ? 'bg-[#0D7A5F] text-white'
                    : 'bg-[#121210] text-[#A6A297]'
                }`}
              >
                Método Avalancha (Menor Interés)
              </button>
              <button
                type="button"
                onClick={() => setStrategyMode('bolaDeNieve')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                  strategyMode === 'bolaDeNieve'
                    ? 'bg-[#C25E00] text-white'
                    : 'bg-[#121210] text-[#A6A297]'
                }`}
              >
                Bola de Nieve (Deuda más pequeña)
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#A6A297]">Abono extra mensual:</span>
              <input
                type="number"
                value={extraPayment}
                onChange={(e) => setExtraPayment(e.target.value)}
                className="bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-1.5 text-xs text-white w-32"
              />
            </div>
          </div>

          <p className="text-xs text-[#A6A297]">{activePlan.explicacion}</p>

          <div className="space-y-2">
            {activePlan.pasos.map((paso) => (
              <div
                key={paso.idDeuda}
                className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <strong className="text-white block">
                    #{paso.orden} {paso.nombre} ({paso.tasaEA}% E.A.)
                  </strong>
                  <span className="text-[#A6A297]">{paso.razonPrioridad}</span>
                </div>
                <div className="text-right shrink-0">
                  <strong className="text-[#10B981] block">
                    Cuota sugerida: {formatCurrency(paso.abonoSugeridoMes1, currency)}
                  </strong>
                  <span className="text-[11px] text-[#A6A297]">
                    Saldada en ~{paso.mesesEstimadosLiquidacion} meses
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
