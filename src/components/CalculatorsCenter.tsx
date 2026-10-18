import React, { useState, useMemo } from 'react';
import {
  Calculator,
  PieChart as PieChartIcon,
  Layers,
  Percent,
  Coffee,
  Lightbulb,
  Flame,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import {
  formatCurrency,
  CurrencyCode,
  simulateInstallmentPurchase,
  eaToMvPercent,
  mvToEaPercent,
} from '../utils/financeCalculations';
import { TransactionCategory } from '../types/finance';

interface CalculatorsCenterProps {
  currency: CurrencyCode;
  totalGanancias: number;
  totalGastos: number;
  gastosEsenciales: number;
  gastosDeseos: number;
  gastosHormiga: number;
  totalTrading: number;
  promedioPorCompra: number;
  promedioGastoDiario: number;
  promedioGastoSemanal: number;
  categoriasOrdenadas: {
    categoria: TransactionCategory;
    total: number;
    count: number;
    promedio: number;
    porcentajeDelGasto: number;
  }[];
}

// Paleta priorizada por impacto (Mayor impacto -> colores cálidos/intensos a tonos fríos)
const IMPACT_COLORS = [
  '#f43f5e', // #1 Mayor impacto (Rose 500)
  '#f59e0b', // #2 Segundo mayor impacto (Amber 500)
  '#6366f1', // #3 Tercer impacto (Indigo 500)
  '#10b981', // #4 Cuarto impacto (Emerald 500)
  '#06b6d4', // #5 Quinto impacto (Cyan 500)
  '#a855f7', // #6 Sexto impacto (Purple 500)
  '#64748b', // Otras categorías (Slate 500)
];

export const CalculatorsCenter: React.FC<CalculatorsCenterProps> = ({
  currency,
  totalGanancias,
  totalGastos,
  gastosEsenciales,
  gastosDeseos,
  gastosHormiga,
  totalTrading,
  promedioPorCompra,
  promedioGastoDiario,
  promedioGastoSemanal,
  categoriasOrdenadas,
}) => {
  // Índice activo en el gráfico de anillos para inspección táctil en el Samsung A36 5G
  const [selectedSliceIndex, setSelectedSliceIndex] = useState<number>(0);

  // Estado para Simulador de Compras a Cuotas
  const [montoCompra, setMontoCompra] = useState<number>(1200000);
  const [cuotas, setCuotas] = useState<number>(6);
  const [tasaEA, setTasaEA] = useState<number>(28.45);
  const [cuotaManejo, setCuotaManejo] = useState<number>(0);

  // Estado para Conversor de Tasas E.A. <-> M.V.
  const [inputEA, setInputEA] = useState<string>('28.45');
  const [inputMV, setInputMV] = useState<string>(eaToMvPercent(28.45).toFixed(2));

  const sim = simulateInstallmentPurchase(montoCompra, cuotas, tasaEA, cuotaManejo);

  // Datos estructurados y priorizados para el Gráfico de Anillos (Recharts)
  const donutData = useMemo(() => {
    const sorted = [...categoriasOrdenadas].sort((a, b) => b.total - a.total);
    if (sorted.length <= 6) {
      return sorted.map((item, index) => ({
        ...item,
        rank: index + 1,
        color: IMPACT_COLORS[index % IMPACT_COLORS.length],
        nivelImpacto:
          index === 0
            ? 'Impacto Crítico #1'
            : index === 1
            ? 'Alto Impacto #2'
            : index === 2
            ? 'Impacto Medio #3'
            : `Prioridad #${index + 1}`,
      }));
    }

    const top5 = sorted.slice(0, 5).map((item, index) => ({
      ...item,
      rank: index + 1,
      color: IMPACT_COLORS[index],
      nivelImpacto:
        index === 0
          ? 'Impacto Crítico #1'
          : index === 1
          ? 'Alto Impacto #2'
          : index === 2
          ? 'Impacto Medio #3'
          : `Prioridad #${index + 1}`,
    }));

    const others = sorted.slice(5);
    const othersTotal = others.reduce((acc, c) => acc + c.total, 0);
    const othersCount = others.reduce((acc, c) => acc + c.count, 0);

    return [
      ...top5,
      {
        categoria: 'Otros' as TransactionCategory,
        total: othersTotal,
        count: othersCount,
        promedio: othersCount > 0 ? othersTotal / othersCount : 0,
        porcentajeDelGasto: totalGastos > 0 ? (othersTotal / totalGastos) * 100 : 0,
        rank: 6,
        color: IMPACT_COLORS[6],
        nivelImpacto: 'Impacto Menor Agrupado',
      },
    ];
  }, [categoriasOrdenadas, totalGastos]);

  const activeCategory =
    donutData[selectedSliceIndex] || donutData[0] || null;

  // Cálculos Regla 50 / 30 / 20
  const ingresoRef = Math.max(totalGanancias, 1);
  const pctNecesidades = (gastosEsenciales / ingresoRef) * 100;
  const pctDeseos = (gastosDeseos / ingresoRef) * 100;
  const ahorroReal = Math.max(0, totalGanancias - totalGastos);
  const pctAhorro = (ahorroReal / ingresoRef) * 100;

  const handleEAChange = (val: string) => {
    setInputEA(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setInputMV(eaToMvPercent(num).toFixed(2));
    }
  };

  const handleMVChange = (val: string) => {
    setInputMV(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setInputEA(mvToEaPercent(num).toFixed(2));
    }
  };

  return (
    <div className="space-y-4">
      {/* Tarjetas de Promedios Automáticos */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2 mb-1">
          <Calculator className="w-5 h-5 text-indigo-400" />
          Promedios y Ritmo de Gasto Personal
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          Cálculos automáticos basados en tus movimientos registrados
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block">Promedio Diario Estimado</span>
            <strong className="text-base font-extrabold text-white">
              {formatCurrency(promedioGastoDiario, currency)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">Ritmo cada 24 horas</span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block">Promedio Semanal</span>
            <strong className="text-base font-extrabold text-indigo-300">
              {formatCurrency(promedioGastoSemanal, currency)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">Gasto cada 7 días</span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block">Ticket Promedio por Compra</span>
            <strong className="text-base font-extrabold text-emerald-400">
              {formatCurrency(promedioPorCompra, currency)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">Valor medio por salida</span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Coffee className="w-3 h-3 text-amber-400" /> Gastos Hormiga
            </span>
            <strong className="text-base font-extrabold text-amber-400">
              {formatCurrency(gastosHormiga, currency)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Anualizado: {formatCurrency(gastosHormiga * 12, currency)}/año
            </span>
          </div>
        </div>

        {/* Gráfico de Anillos (Recharts) + Ranking Priorizado por Mayor Impacto */}
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-400" />
                Distribución de Gastos por Categoría (Priorizadas por Mayor Impacto)
              </h3>
              <p className="text-xs text-slate-400">
                Toca cualquier segmento del anillo o categoría para inspeccionar su impacto exacto y promedio
              </p>
            </div>
            {donutData.length > 0 && (
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-rose-950/80 border border-rose-700/50 text-rose-300 font-semibold">
                Mayor Impacto: {donutData[0].categoria} ({donutData[0].porcentajeDelGasto.toFixed(1)}%)
              </span>
            )}
          </div>

          {donutData.length === 0 ? (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">
              No hay compras o gastos registrados aún para graficar la distribución por categorías.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-slate-950/60 border border-slate-800/90 rounded-2xl p-3.5">
              {/* Columna Izquierda: Gráfico de Anillos Recharts con Indicador Central */}
              <div className="lg:col-span-5 flex flex-col items-center">
                <div className="relative w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="total"
                        nameKey="categoria"
                        cx="50%"
                        cy="50%"
                        innerRadius={64}
                        outerRadius={94}
                        paddingAngle={3}
                        stroke="#090d16"
                        strokeWidth={2}
                        onClick={(_, index) => setSelectedSliceIndex(index)}
                        onMouseEnter={(_, index) => setSelectedSliceIndex(index)}
                      >
                        {donutData.map((entry, index) => {
                          const isSelected = index === selectedSliceIndex;
                          return (
                            <Cell
                              key={`cell-${entry.categoria}`}
                              fill={entry.color}
                              opacity={isSelected ? 1 : 0.72}
                              style={{
                                cursor: 'pointer',
                                filter: isSelected
                                  ? 'drop-shadow(0 0 8px rgba(255,255,255,0.25))'
                                  : 'none',
                                transition: 'all 0.2s ease',
                              }}
                            />
                          );
                        })}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, _name: any, props: any) => [
                          `${formatCurrency(Number(value), currency)} (${props.payload.porcentajeDelGasto.toFixed(1)}%)`,
                          props.payload.categoria,
                        ]}
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: '#f8fafc',
                        }}
                        itemStyle={{ color: '#f8fafc', fontWeight: 700 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Centro del Anillo con la Categoría Prioritaria Seleccionada */}
                  {activeCategory && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                      <span
                        className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1"
                        style={{
                          backgroundColor: `${activeCategory.color}22`,
                          color: activeCategory.color,
                        }}
                      >
                        #{activeCategory.rank} Impacto
                      </span>
                      <span className="text-[11px] font-semibold text-slate-300 line-clamp-1 max-w-[115px]">
                        {activeCategory.categoria}
                      </span>
                      <strong className="text-sm font-extrabold text-white mt-0.5">
                        {formatCurrency(activeCategory.total, currency)}
                      </strong>
                      <span className="text-[11px] font-bold text-slate-400">
                        {activeCategory.porcentajeDelGasto.toFixed(1)}% del total
                      </span>
                    </div>
                  )}
                </div>

                {/* Resumen de la categoría seleccionada debajo del anillo */}
                {activeCategory && (
                  <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-center">
                    <div className="text-xs font-bold text-white">
                      {activeCategory.categoria} ({activeCategory.count} movs)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Promedio por movimiento:{' '}
                      <strong className="text-emerald-400">
                        {formatCurrency(activeCategory.promedio, currency)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Columna Derecha: Lista Priorizada de Mayor a Menor Impacto */}
              <div className="lg:col-span-7 space-y-2">
                {donutData.map((cat, idx) => {
                  const isSelected = idx === selectedSliceIndex;
                  return (
                    <button
                      key={cat.categoria}
                      type="button"
                      onClick={() => setSelectedSliceIndex(idx)}
                      className={`w-full text-left rounded-xl p-2.5 border transition ${
                        isSelected
                          ? 'bg-slate-900 border-slate-600 shadow-md'
                          : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                            #{cat.rank}
                          </span>
                          <span className="font-bold text-slate-100">{cat.categoria}</span>
                          {idx === 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Mayor Impacto
                            </span>
                          )}
                        </div>

                        <div className="text-right">
                          <strong className="text-white">
                            {formatCurrency(cat.total, currency)}
                          </strong>
                          <span className="text-[11px] font-bold text-slate-300 ml-1.5">
                            ({cat.porcentajeDelGasto.toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, cat.porcentajeDelGasto)}%`,
                            backgroundColor: cat.color,
                          }}
                        />
                      </div>

                      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>{cat.count} movimiento(s) registrados</span>
                        <span>Promedio: {formatCurrency(cat.promedio, currency)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Diagnóstico de la Regla 50 / 30 / 20 con Ejemplos */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-emerald-400" />
              Diagnóstico Regla 50% / 30% / 20%
            </h2>
            <p className="text-xs text-slate-400">
              Compara tu distribución actual frente al estándar ideal sobre tus ingresos ({formatCurrency(totalGanancias, currency)})
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-semibold">50% Necesidades Básicas</span>
              <span className={pctNecesidades <= 55 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                Actual: {pctNecesidades.toFixed(1)}%
              </span>
            </div>
            <div className="text-sm font-bold text-white">
              {formatCurrency(gastosEsenciales, currency)}{' '}
              <span className="text-[11px] font-normal text-slate-400">
                / Meta: {formatCurrency(totalGanancias * 0.5, currency)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Vivienda, mercado, servicios públicos y transporte esencial.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-semibold">30% Estilo de Vida / Deseos</span>
              <span className={pctDeseos <= 32 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                Actual: {pctDeseos.toFixed(1)}%
              </span>
            </div>
            <div className="text-sm font-bold text-white">
              {formatCurrency(gastosDeseos, currency)}{' '}
              <span className="text-[11px] font-normal text-slate-400">
                / Tope: {formatCurrency(totalGanancias * 0.3, currency)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Restaurantes, suscripciones, compras no esenciales y cafés.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-semibold">20% Ahorro, Deuda y Trading</span>
              <span className={pctAhorro >= 20 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                Actual: {pctAhorro.toFixed(1)}%
              </span>
            </div>
            <div className="text-sm font-bold text-emerald-400">
              {formatCurrency(ahorroReal, currency)}{' '}
              <span className="text-[11px] font-normal text-slate-400">
                (Trading: {formatCurrency(totalTrading, currency)})
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Fondo de emergencia, abono a capital de deudas e inversiones.
            </p>
          </div>
        </div>
      </div>

      {/* Simulador de Compras a Cuotas con Tarjeta de Crédito */}
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-4 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            Simulador de Compras a Cuotas (Tarjeta de Crédito)
          </h2>
          <p className="text-xs text-slate-400">
            Descubre cuánto terminas pagando realmente antes de pasar tu tarjeta a varias cuotas
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Valor de la Compra ($)</label>
            <input
              type="number"
              value={montoCompra}
              onChange={(e) => setMontoCompra(Math.max(0, Number(e.target.value)))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-semibold"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Número de Cuotas (1 a 36)</label>
            <select
              value={cuotas}
              onChange={(e) => setCuotas(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-semibold"
            >
              {[1, 2, 3, 6, 9, 12, 18, 24, 36].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'cuota (0% interés)' : 'cuotas'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Tasa E.A. de tu Tarjeta (%)</label>
            <input
              type="number"
              step="0.1"
              value={tasaEA}
              onChange={(e) => setTasaEA(Math.max(0, Number(e.target.value)))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-semibold"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Cuota de Manejo Mensual ($)</label>
            <input
              type="number"
              value={cuotaManejo}
              onChange={(e) => setCuotaManejo(Math.max(0, Number(e.target.value)))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-semibold"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block">Cuota Mensual Estimada</span>
            <strong className="text-base font-extrabold text-white">
              {formatCurrency(sim.cuotaMensual, currency)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Tasa: {sim.tasaMV.toFixed(2)}% M.V.
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block">Solo en Intereses Pagarás</span>
            <strong className={`text-base font-extrabold ${sim.totalIntereses > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {formatCurrency(sim.totalIntereses, currency)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              +{sim.sobrecostoPorcentaje.toFixed(1)}% sobre el precio original
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block">Total Final a Pagar</span>
            <strong className="text-base font-extrabold text-amber-400">
              {formatCurrency(sim.totalPagar, currency)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Capital + Intereses + Manejo
            </span>
          </div>

          <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3">
            <span className="text-[11px] text-amber-300 font-bold flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5" /> Ejemplo de Ahorro
            </span>
            <p className="text-[11px] text-amber-100 mt-1 leading-snug">
              {cuotas > 3
                ? `Si bajas de ${cuotas} a 3 cuotas, te ahorras ${formatCurrency(
                    sim.totalIntereses -
                      simulateInstallmentPurchase(montoCompra, 3, tasaEA, cuotaManejo).totalIntereses,
                    currency
                  )} en intereses.`
                : cuotas === 1
                ? '¡Ideal! A 1 sola cuota aprovechas el dinero del banco gratis a 0% de interés.'
                : `Si la pagas a 1 cuota te ahorras ${formatCurrency(sim.totalIntereses, currency)}.`}
            </p>
          </div>
        </div>
      </div>

      {/* Conversor Rápido de Tasas E.A. <-> M.V. */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
          <Percent className="w-4 h-4 text-emerald-400" />
          Conversor Instantáneo de Tasas de Interés (E.A. ↔ M.V.)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">
              Tasa Efectiva Anual (% E.A. - como la muestra el extracto)
            </label>
            <input
              type="number"
              step="0.01"
              value={inputEA}
              onChange={(e) => handleEAChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-bold"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">
              Tasa Mensual Vencida (% M.V. - lo que te cobran cada mes)
            </label>
            <input
              type="number"
              step="0.01"
              value={inputMV}
              onChange={(e) => handleMVChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-emerald-400 font-bold"
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          💡 <strong>Ejemplo rápido:</strong> Una tasa del <strong>{inputEA}% E.A.</strong> significa que por cada{' '}
          <strong>$1.000.000</strong> de deuda, el banco te cobra{' '}
          <strong className="text-rose-400">
            {formatCurrency(1000000 * ((parseFloat(inputMV) || 0) / 100), currency)}
          </strong>{' '}
          de intereses cada mes.
        </p>
      </div>
    </div>
  );
};
