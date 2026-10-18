import React, { useState } from 'react';
import {
  Banknote,
  CalendarCheck,
  Target,
  Plus,
  CheckCircle2,
  Clock,
  Trash2,
  Edit3,
  ArrowUpRight,
  RotateCcw,
} from 'lucide-react';
import {
  SalaryProfile,
  RecurringPayment,
  FinancialGoal,
  TransactionCategory,
} from '../types/finance';
import { formatCurrency, CurrencyCode } from '../utils/financeCalculations';

interface SalaryBillsGoalsCenterProps {
  currency: CurrencyCode;
  salaryProfile: SalaryProfile;
  onUpdateSalary: (profile: SalaryProfile) => void;
  onDepositSalaryNow: (amount: number, label: string) => void;
  recurringPayments: RecurringPayment[];
  onAddRecurringPayment: (item: Omit<RecurringPayment, 'id' | 'pagadoEsteMes'>) => void;
  onTogglePayRecurring: (id: string) => void;
  onResetMonthlyPayments: () => void;
  onDeleteRecurringPayment: (id: string) => void;
  goals: FinancialGoal[];
  onAddGoal: (goal: Omit<FinancialGoal, 'id' | 'montoAhorrado'>) => void;
  onContributeGoal: (id: string, amount: number) => void;
  onDeleteGoal: (id: string) => void;
}

export const SalaryBillsGoalsCenter: React.FC<SalaryBillsGoalsCenterProps> = ({
  currency,
  salaryProfile,
  onUpdateSalary,
  onDepositSalaryNow,
  recurringPayments,
  onAddRecurringPayment,
  onTogglePayRecurring,
  onResetMonthlyPayments,
  onDeleteRecurringPayment,
  goals,
  onAddGoal,
  onContributeGoal,
  onDeleteGoal,
}) => {
  // Editor de Salario
  const [editingSalary, setEditingSalary] = useState(salaryProfile.salarioMensualNeto === 0);
  const [salMonto, setSalMonto] = useState(
    salaryProfile.salarioMensualNeto > 0 ? String(salaryProfile.salarioMensualNeto) : ''
  );
  const [salExtra, setSalExtra] = useState(
    salaryProfile.otrosIngresosFijos > 0 ? String(salaryProfile.otrosIngresosFijos) : ''
  );
  const [salFrecuencia, setSalFrecuencia] = useState<SalaryProfile['frecuenciaPago']>(
    salaryProfile.frecuenciaPago || 'mensual'
  );

  // Formulario de Nuevo Pago Fijo ("Cosas que pago")
  const [showAddBill, setShowAddBill] = useState(false);
  const [billNombre, setBillNombre] = useState('');
  const [billMonto, setBillMonto] = useState('');
  const [billDia, setBillDia] = useState('5');
  const [billCat, setBillCat] = useState<TransactionCategory>('Vivienda y Servicios');

  // Formulario de Nueva Meta
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [goalNombre, setGoalNombre] = useState('');
  const [goalMonto, setGoalMonto] = useState('');
  const [goalMeses, setGoalMeses] = useState('6');
  const [goalInputs, setGoalInputs] = useState<Record<string, string>>({});

  const handleSaveSalary = (e: React.FormEvent) => {
    e.preventDefault();
    const neto = parseInt(salMonto.replace(/[.,]/g, ''), 10) || 0;
    const extra = parseInt(salExtra.replace(/[.,]/g, ''), 10) || 0;
    onUpdateSalary({
      ...salaryProfile,
      salarioMensualNeto: neto,
      otrosIngresosFijos: extra,
      frecuenciaPago: salFrecuencia,
    });
    setEditingSalary(false);
  };

  const handleCreateBill = (e: React.FormEvent) => {
    e.preventDefault();
    const m = parseInt(billMonto.replace(/[.,]/g, ''), 10) || 0;
    if (!billNombre.trim() || m <= 0) return;
    onAddRecurringPayment({
      nombre: billNombre.trim(),
      monto: m,
      diaVencimiento: Math.max(1, Math.min(31, parseInt(billDia, 10) || 5)),
      categoria: billCat,
    });
    setBillNombre('');
    setBillMonto('');
    setShowAddBill(false);
  };

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const m = parseInt(goalMonto.replace(/[.,]/g, ''), 10) || 0;
    if (!goalNombre.trim() || m <= 0) return;
    onAddGoal({
      nombre: goalNombre.trim(),
      montoObjetivo: m,
      plazoMeses: Math.max(1, parseInt(goalMeses, 10) || 6),
      prioridad: 'alta',
    });
    setGoalNombre('');
    setGoalMonto('');
    setShowAddGoal(false);
  };

  const totalIngresoFijo = salaryProfile.salarioMensualNeto + salaryProfile.otrosIngresosFijos;
  const totalPagosFijos = recurringPayments.reduce((acc, p) => acc + p.monto, 0);
  const totalPagadosMes = recurringPayments
    .filter((p) => p.pagadoEsteMes)
    .reduce((acc, p) => acc + p.monto, 0);
  const totalPendientesMes = totalPagosFijos - totalPagadosMes;

  return (
    <div className="space-y-4">
      {/* 1. TARJETA DE MI SALARIO E INGRESOS FIJOS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Mi Salario e Ingreso Mensual</h2>
              <p className="text-xs text-slate-400">
                Base real para calcular cuánto dinero te queda libre después de tus obligaciones
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setEditingSalary(!editingSalary)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            <Edit3 className="w-3.5 h-3.5" />
            {editingSalary ? 'Cancelar' : 'Configurar Salario'}
          </button>
        </div>

        {editingSalary ? (
          <form onSubmit={handleSaveSalary} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Salario Mensual Neto ($)</label>
                <input
                  type="number"
                  required
                  value={salMonto}
                  onChange={(e) => setSalMonto(e.target.value)}
                  placeholder="Ej: 3200000"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Otros Ingresos Fijos ($)</label>
                <input
                  type="number"
                  value={salExtra}
                  onChange={(e) => setSalExtra(e.target.value)}
                  placeholder="Ej: 400000 (opcional)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">¿Cada cuánto te pagan?</label>
                <select
                  value={salFrecuencia}
                  onChange={(e) => setSalFrecuencia(e.target.value as SalaryProfile['frecuenciaPago'])}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="mensual">Mensual (1 pago al mes)</option>
                  <option value="quincenal">Quincenal (Cada 15 días)</option>
                  <option value="semanal">Semanal</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-xl transition"
            >
              Guardar Mi Salario Real
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5">
            <div>
              <span className="text-[11px] text-slate-400 block">Ingreso Mensual Total</span>
              <strong className="text-xl font-extrabold text-emerald-400">
                {formatCurrency(totalIngresoFijo, currency)}
              </strong>
              <span className="text-[11px] text-slate-500 block mt-0.5 capitalize">
                Pago {salaryProfile.frecuenciaPago}
                {salaryProfile.frecuenciaPago === 'quincenal' && totalIngresoFijo > 0
                  ? ` (${formatCurrency(totalIngresoFijo / 2, currency)} / quincena)`
                  : ''}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block">Apartado para Pagos Fijos</span>
              <strong className="text-base font-bold text-amber-400">
                {formatCurrency(totalPagosFijos, currency)}
              </strong>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                {totalIngresoFijo > 0
                  ? `${((totalPagosFijos / totalIngresoFijo) * 100).toFixed(0)}% de tu sueldo`
                  : 'Agrega tus pagos abajo'}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {totalIngresoFijo > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const montoAbonar =
                      salaryProfile.frecuenciaPago === 'quincenal'
                        ? Math.round(salaryProfile.salarioMensualNeto / 2)
                        : salaryProfile.salarioMensualNeto;
                    onDepositSalaryNow(
                      montoAbonar,
                      salaryProfile.frecuenciaPago === 'quincenal'
                        ? 'Pago de Quincena Recibido'
                        : 'Pago de Salario Mensual Recibido'
                    );
                  }}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Abonar {salaryProfile.frecuenciaPago === 'quincenal' ? 'Quincena' : 'Sueldo'} al Historial
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. COSAS QUE PAGO CADA MES (PAGOS FIJOS Y RECIBOS) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Cosas que Pago Cada Mes ({recurringPayments.length})
              </h2>
              <p className="text-xs text-slate-400">
                Arriendo, servicios, internet, transporte o suscripciones • Pendiente:{' '}
                <strong className="text-amber-400">{formatCurrency(totalPendientesMes, currency)}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {recurringPayments.some((p) => p.pagadoEsteMes) && (
              <button
                type="button"
                onClick={onResetMonthlyPayments}
                className="text-xs text-slate-400 hover:text-white bg-slate-800 px-2.5 py-1.5 rounded-xl flex items-center gap-1"
                title="Marcar todos como pendientes para iniciar nuevo mes"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Nuevo Mes
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddBill(!showAddBill)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              {showAddBill ? 'Cerrar' : 'Agregar Pago Fijo'}
            </button>
          </div>
        </div>

        {showAddBill && (
          <form onSubmit={handleCreateBill} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">¿Qué pagas? (Concepto)</label>
                <input
                  type="text"
                  required
                  value={billNombre}
                  onChange={(e) => setBillNombre(e.target.value)}
                  placeholder="Ej: Arriendo, Factura Luz, Internet Claro, Gimnasio..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Valor Mensual ($)</label>
                <input
                  type="number"
                  required
                  value={billMonto}
                  onChange={(e) => setBillMonto(e.target.value)}
                  placeholder="Ej: 650000"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Día límite (1-31)</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={billDia}
                  onChange={(e) => setBillDia(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <select
                value={billCat}
                onChange={(e) => setBillCat(e.target.value as TransactionCategory)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="Vivienda y Servicios">🏠 Vivienda y Servicios</option>
                <option value="Alimentación y Supermercado">🛒 Alimentación y Mercado</option>
                <option value="Transporte y Gasolina">🚌 Transporte y Gasolina</option>
                <option value="Suscripciones Digitales">📺 Suscripciones Digitales</option>
                <option value="Salud y Bienestar">💪 Salud / Gimnasio</option>
                <option value="Cuota Tarjeta / Crédito">💳 Cuota Crédito / Deuda</option>
                <option value="Otros">📌 Otros Pagos</option>
              </select>

              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2 rounded-xl transition"
              >
                Guardar en Mis Pagos
              </button>
            </div>
          </form>
        )}

        {recurringPayments.length === 0 ? (
          <div className="bg-slate-950/60 border border-dashed border-slate-800 rounded-xl p-4 text-center text-xs text-slate-400">
            Aún no has agregado tus pagos fijos del mes (arriendo, servicios, internet, plan celular). Toca <strong>"+ Agregar Pago Fijo"</strong> arriba para llevar el control exacto.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {recurringPayments.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl p-3 border flex items-center justify-between gap-2 transition ${
                  item.pagadoEsteMes
                    ? 'bg-emerald-950/20 border-emerald-800/50'
                    : 'bg-slate-950/90 border-slate-800'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.pagadoEsteMes ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <strong className="text-xs text-white truncate">{item.nombre}</strong>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Día {item.diaVencimiento} • {item.categoria}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <strong className="text-xs font-extrabold text-white block">
                      {formatCurrency(item.monto, currency)}
                    </strong>
                    <button
                      type="button"
                      onClick={() => onTogglePayRecurring(item.id)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md mt-0.5 transition ${
                        item.pagadoEsteMes
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      {item.pagadoEsteMes ? 'Pagado ✓' : 'Marcar Pagado'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteRecurringPayment(item.id)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                    title="Eliminar pago fijo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. MIS METAS Y PROPÓSITOS DE AHORRO */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Target className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Mis Metas y Ahorros ({goals.length})</h2>
              <p className="text-xs text-slate-400">
                Define tus propósitos (moto, viaje, fondo de emergencia, casa) y calcula cuánto ahorrar
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddGoal(!showAddGoal)}
            className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            {showAddGoal ? 'Cerrar' : 'Nueva Meta'}
          </button>
        </div>

        {showAddGoal && (
          <form onSubmit={handleCreateGoal} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nombre de tu Meta</label>
                <input
                  type="text"
                  required
                  value={goalNombre}
                  onChange={(e) => setGoalNombre(e.target.value)}
                  placeholder="Ej: Comprar Moto / Fondo Emergencia"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Valor Meta Total ($)</label>
                <input
                  type="number"
                  required
                  value={goalMonto}
                  onChange={(e) => setGoalMonto(e.target.value)}
                  placeholder="Ej: 5000000"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Plazo deseado (Meses)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={goalMeses}
                  onChange={(e) => setGoalMeses(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs py-2 rounded-xl transition"
            >
              Crear Meta de Ahorro
            </button>
          </form>
        )}

        {goals.length === 0 ? (
          <div className="bg-slate-950/60 border border-dashed border-slate-800 rounded-xl p-4 text-center text-xs text-slate-400">
            No tienes metas registradas aún. Toca <strong>"+ Nueva Meta"</strong> para calcular cuánto debes ahorrar por día y por mes.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {goals.map((g) => {
              const pct = g.montoObjetivo > 0 ? Math.min(100, (g.montoAhorrado / g.montoObjetivo) * 100) : 0;
              const falta = Math.max(0, g.montoObjetivo - g.montoAhorrado);
              const cuotaMensualNecesaria = Math.round(falta / Math.max(1, g.plazoMeses));
              const inputVal = goalInputs[g.id] ?? '';

              return (
                <div
                  key={g.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-white">{g.nombre}</h3>
                        <p className="text-[11px] text-slate-400">
                          Meta: <strong>{formatCurrency(g.montoObjetivo, currency)}</strong> en {g.plazoMeses} meses
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteGoal(g.id)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="mt-2.5">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-emerald-400 font-bold">
                          Ahorrado: {formatCurrency(g.montoAhorrado, currency)}
                        </span>
                        <span className="text-slate-300 font-bold">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        {falta > 0
                          ? `Necesitas ahorrar ${formatCurrency(cuotaMensualNecesaria, currency)}/mes (${formatCurrency(
                              cuotaMensualNecesaria / 30,
                              currency
                            )}/día)`
                          : '🎉 ¡Meta alcanzada al 100%!'}
                      </p>
                    </div>
                  </div>

                  {falta > 0 && (
                    <div className="flex gap-2 pt-2 border-t border-slate-800/80">
                      <input
                        type="number"
                        value={inputVal}
                        onChange={(e) => setGoalInputs({ ...goalInputs, [g.id]: e.target.value })}
                        placeholder={`Ej: ${cuotaMensualNecesaria}`}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const v = parseInt(inputVal.replace(/[.,]/g, ''), 10) || 0;
                          if (v > 0) {
                            onContributeGoal(g.id, v);
                            setGoalInputs({ ...goalInputs, [g.id]: '' });
                          }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shrink-0"
                      >
                        + Abonar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
