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
  forcedView?: 'pagos' | 'salario' | 'metas';
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
  forcedView,
}) => {
  const [internalTab, setInternalTab] = useState<'pagos' | 'salario' | 'metas'>('pagos');
  const activeTab = forcedView || internalTab;

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

  // Formulario de Nuevo Pago Fijo
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
      {!forcedView && (
        <div className="inline-flex p-1 rounded-2xl bg-[#111520] border border-white/[0.06]">
          <button
            type="button"
            onClick={() => setInternalTab('pagos')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'pagos' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Pagos Fijos ({recurringPayments.length})
          </button>
          <button
            type="button"
            onClick={() => setInternalTab('salario')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'salario' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Mi Salario
          </button>
          <button
            type="button"
            onClick={() => setInternalTab('metas')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'metas' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Metas ({goals.length})
          </button>
        </div>
      )}

      {/* VISTA 1: MI SALARIO */}
      {activeTab === 'salario' && (
        <div className="bg-[#111520] border border-white/[0.07] rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <Banknote className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Ingreso Mensual Fijo</h2>
                <p className="text-xs text-slate-400">Configura tu sueldo neto para calcular tu disponible real</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEditingSalary(!editingSalary)}
              className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 transition"
            >
              <Edit3 className="w-3.5 h-3.5" />
              {editingSalary ? 'Cancelar' : 'Editar Salario'}
            </button>
          </div>

          {editingSalary ? (
            <form onSubmit={handleSaveSalary} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Salario Mensual Neto</label>
                  <input
                    type="number"
                    required
                    value={salMonto}
                    onChange={(e) => setSalMonto(e.target.value)}
                    placeholder="Ej: 3200000"
                    className="w-full bg-[#0a0d14] border border-white/10 focus:border-emerald-500 focus:outline-none rounded-2xl px-4 py-2.5 text-sm text-white font-semibold tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Otros Ingresos Fijos</label>
                  <input
                    type="number"
                    value={salExtra}
                    onChange={(e) => setSalExtra(e.target.value)}
                    placeholder="Opcional"
                    className="w-full bg-[#0a0d14] border border-white/10 focus:border-emerald-500 focus:outline-none rounded-2xl px-4 py-2.5 text-sm text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Frecuencia de Pago</label>
                  <select
                    value={salFrecuencia}
                    onChange={(e) => setSalFrecuencia(e.target.value as SalaryProfile['frecuenciaPago'])}
                    className="w-full bg-[#0a0d14] border border-white/10 focus:border-emerald-500 focus:outline-none rounded-2xl px-4 py-2.5 text-sm text-white"
                  >
                    <option value="mensual">Mensual</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="semanal">Semanal</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs px-6 py-2.5 rounded-2xl transition"
              >
                Guardar Salario
              </button>
            </form>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-[#0b0e17] border border-white/[0.05] rounded-2xl p-4">
              <div>
                <span className="text-xs text-slate-400 block">Total Mensual</span>
                <strong className="text-2xl font-bold text-white tabular-nums mt-0.5 block">
                  {formatCurrency(totalIngresoFijo, currency)}
                </strong>
                <span className="text-xs text-slate-500 capitalize">
                  Modalidad {salaryProfile.frecuenciaPago}
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block">Comprometido en Pagos Fijos</span>
                <strong className="text-lg font-semibold text-slate-200 tabular-nums mt-0.5 block">
                  {formatCurrency(totalPagosFijos, currency)}
                </strong>
                <span className="text-xs text-slate-500">
                  {totalIngresoFijo > 0
                    ? `${((totalPagosFijos / totalIngresoFijo) * 100).toFixed(0)}% de tu ingreso`
                    : 'Sin pagos fijos aún'}
                </span>
              </div>

              <div className="flex sm:justify-end">
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
                          ? 'Pago de Quincena'
                          : 'Pago de Salario Mensual'
                      );
                    }}
                    className="w-full sm:w-auto bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold py-2.5 px-4 rounded-2xl transition flex items-center justify-center gap-1.5"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Registrar ingreso de {salaryProfile.frecuenciaPago === 'quincenal' ? 'Quincena' : 'Sueldo'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VISTA 2: PAGOS FIJOS DEL MES */}
      {activeTab === 'pagos' && (
        <div className="bg-[#111520] border border-white/[0.07] rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                <CalendarCheck className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Pagos Fijos Mensuales</h2>
                <p className="text-xs text-slate-400">
                  Pendiente por pagar este mes:{' '}
                  <strong className="text-white tabular-nums">{formatCurrency(totalPendientesMes, currency)}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {recurringPayments.some((p) => p.pagadoEsteMes) && (
                <button
                  type="button"
                  onClick={onResetMonthlyPayments}
                  className="text-xs text-slate-400 hover:text-white bg-white/[0.05] px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reiniciar mes
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAddBill(!showAddBill)}
                className="bg-white hover:bg-slate-200 text-slate-950 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                {showAddBill ? 'Cerrar' : 'Nuevo Pago Fijo'}
              </button>
            </div>
          </div>

          {showAddBill && (
            <form onSubmit={handleCreateBill} className="bg-[#0b0e17] border border-white/[0.06] rounded-2xl p-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Concepto</label>
                  <input
                    type="text"
                    required
                    value={billNombre}
                    onChange={(e) => setBillNombre(e.target.value)}
                    placeholder="Arriendo, Internet, Luz, Gimnasio..."
                    className="w-full bg-[#111520] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Valor Mensual</label>
                  <input
                    type="number"
                    required
                    value={billMonto}
                    onChange={(e) => setBillMonto(e.target.value)}
                    placeholder="650000"
                    className="w-full bg-[#111520] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white font-semibold tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Día de pago</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={billDia}
                    onChange={(e) => setBillDia(e.target.value)}
                    className="w-full bg-[#111520] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <select
                  value={billCat}
                  onChange={(e) => setBillCat(e.target.value as TransactionCategory)}
                  className="bg-[#111520] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white"
                >
                  <option value="Vivienda y Servicios">Vivienda y Servicios</option>
                  <option value="Alimentación y Supermercado">Alimentación y Mercado</option>
                  <option value="Transporte y Gasolina">Transporte y Gasolina</option>
                  <option value="Suscripciones Digitales">Suscripciones Digitales</option>
                  <option value="Salud y Bienestar">Salud y Bienestar</option>
                  <option value="Cuota Tarjeta / Crédito">Cuota Crédito / Deuda</option>
                  <option value="Otros">Otros Pagos</option>
                </select>

                <button
                  type="submit"
                  className="bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-xs px-5 py-2 rounded-xl transition"
                >
                  Guardar Pago
                </button>
              </div>
            </form>
          )}

          {recurringPayments.length === 0 ? (
            <div className="bg-[#0b0e17] border border-white/[0.04] rounded-2xl p-6 text-center text-xs text-slate-400">
              No has registrado pagos fijos mensuales. Usa el botón <strong>Nuevo Pago Fijo</strong> para agregar arriendo, servicios o suscripciones.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {recurringPayments.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl p-3.5 border flex items-center justify-between gap-3 transition ${
                    item.pagadoEsteMes
                      ? 'bg-emerald-500/[0.04] border-emerald-500/20'
                      : 'bg-[#0b0e17] border-white/[0.06]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {item.pagadoEsteMes ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <strong className="text-xs font-semibold text-white truncate">{item.nombre}</strong>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Vence el día {item.diaVencimiento} • {item.categoria}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right">
                      <strong className="text-xs font-bold text-white tabular-nums block">
                        {formatCurrency(item.monto, currency)}
                      </strong>
                      <button
                        type="button"
                        onClick={() => onTogglePayRecurring(item.id)}
                        className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-lg mt-1 transition ${
                          item.pagadoEsteMes
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-white/[0.08] hover:bg-white/[0.15] text-white'
                        }`}
                      >
                        {item.pagadoEsteMes ? 'Pagado' : 'Marcar pagado'}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteRecurringPayment(item.id)}
                      className="text-slate-600 hover:text-rose-400 p-1 transition"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VISTA 3: METAS DE AHORRO */}
      {activeTab === 'metas' && (
        <div className="bg-[#111520] border border-white/[0.07] rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Metas de Ahorro</h2>
                <p className="text-xs text-slate-400">Progreso y cuota mensual sugerida para tus objetivos</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAddGoal(!showAddGoal)}
              className="bg-white hover:bg-slate-200 text-slate-950 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              {showAddGoal ? 'Cerrar' : 'Nueva Meta'}
            </button>
          </div>

          {showAddGoal && (
            <form onSubmit={handleCreateGoal} className="bg-[#0b0e17] border border-white/[0.06] rounded-2xl p-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Objetivo</label>
                  <input
                    type="text"
                    required
                    value={goalNombre}
                    onChange={(e) => setGoalNombre(e.target.value)}
                    placeholder="Fondo de emergencia, Viaje..."
                    className="w-full bg-[#111520] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Monto Objetivo</label>
                  <input
                    type="number"
                    required
                    value={goalMonto}
                    onChange={(e) => setGoalMonto(e.target.value)}
                    placeholder="5000000"
                    className="w-full bg-[#111520] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white font-semibold tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Plazo (Meses)</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={goalMeses}
                    onChange={(e) => setGoalMeses(e.target.value)}
                    className="w-full bg-[#111520] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white tabular-nums"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-5 py-2 rounded-xl transition"
              >
                Guardar Meta
              </button>
            </form>
          )}

          {goals.length === 0 ? (
            <div className="bg-[#0b0e17] border border-white/[0.04] rounded-2xl p-6 text-center text-xs text-slate-400">
              Aún no has creado metas de ahorro. Toca <strong>Nueva Meta</strong> para comenzar.
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
                    className="bg-[#0b0e17] border border-white/[0.06] rounded-2xl p-4 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-white">{g.nombre}</h3>
                          <p className="text-xs text-slate-400 tabular-nums">
                            Objetivo: {formatCurrency(g.montoObjetivo, currency)} ({g.plazoMeses} meses)
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteGoal(g.id)}
                          className="text-slate-600 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1.5 tabular-nums">
                          <span className="text-emerald-400 font-semibold">
                            {formatCurrency(g.montoAhorrado, currency)}
                          </span>
                          <span className="text-slate-400">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-400 h-full rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
                          {falta > 0
                            ? `Cuota sugerida: ${formatCurrency(cuotaMensualNecesaria, currency)}/mes`
                            : 'Meta completada'}
                        </p>
                      </div>
                    </div>

                    {falta > 0 && (
                      <div className="flex gap-2 pt-2">
                        <input
                          type="number"
                          value={inputVal}
                          onChange={(e) => setGoalInputs({ ...goalInputs, [g.id]: e.target.value })}
                          placeholder={`Abonar (ej: ${cuotaMensualNecesaria})`}
                          className="flex-1 bg-[#111520] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white tabular-nums"
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
                          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold px-3.5 py-1.5 rounded-xl transition shrink-0"
                        >
                          Abonar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
