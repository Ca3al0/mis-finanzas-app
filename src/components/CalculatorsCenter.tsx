import React, { useState, useMemo } from 'react';
import {
  Calculator,
  PieChart as PieChartIcon,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import { TransactionCategory } from '../types/finance';
import {
  simulateInstallmentPurchase,
  formatCurrency,
  CurrencyCode,
} from '../utils/financeCalculations';

interface CategoryOrderedItem {
  categoria: TransactionCategory;
  total: number;
  count: number;
  promedio: number;
  porcentajeDelGasto: number;
}

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
  categoriasOrdenadas: CategoryOrderedItem[];
}

type CalcOption = 'anillos' | 'promedios' | 'simulador';

const WARM_CHART_COLORS = [
  '#C25E00', // Terracota
  '#0D7A5F', // Esmeralda Bosque
  '#D97706', // Ámbar Dorado
  '#BE123C', // Carmesí
  '#65A30D', // Oliva
  '#9333EA', // Ciruela
];

export const CalculatorsCenter: React.FC<CalculatorsCenterProps> = ({
  currency,
  totalGanancias,
  totalGastos,
  gastosEsenciales,
  gastosDeseos,
  gastosHormiga,
  promedioPorCompra,
  promedioGastoDiario,
  promedioGastoSemanal,
  categoriasOrdenadas,
}) => {
  const [selectedOption, setSelectedOption] = useState<CalcOption>('anillos');
  const [montoCompra, setMontoCompra] = useState('1200000');
  const [cuotas, setCuotas] = useState('6');
  const [tasaEA, setTasaEA] = useState('28.5');
  const [cuotaManejo, setCuotaManejo] = useState('0');

  const simulation = useMemo(
    () =>
      simulateInstallmentPurchase(
        Math.max(0, Number(montoCompra) || 0),
        Math.max(1, Number(cuotas) || 1),
        Math.max(0, Number(tasaEA) || 0),
        Math.max(0, Number(cuotaManejo) || 0)
      ),
    [montoCompra, cuotas, tasaEA, cuotaManejo]
  );

  const chartData = useMemo(
    () =>
      categoriasOrdenadas.map((item, idx) => ({
        name: item.categoria,
        value: item.total,
        count: item.count,
        pct: item.porcentajeDelGasto,
        color: WARM_CHART_COLORS[idx % WARM_CHART_COLORS.length],
      })),
    [categoriasOrdenadas]
  );

  return (
    <div className="space-y-5">
      {/* Selector de Opciones Limpio */}
      <div className="flex flex-wrap gap-1.5 bg-[#1C1B18] border border-[#2C2A24] p-2 rounded-2xl">
        {[
          { id: 'anillos', label: 'Gráfico de Anillos y Categorías', icon: PieChartIcon },
          { id: 'promedios', label: 'Promedios y Regla 50/30/20', icon: SlidersHorizontal },
          { id: 'simulador', label: 'Simulador de Cuotas (% E.A.)', icon: Calculator },
        ].map((opt) => {
          const Icon = opt.icon;
          const active = selectedOption === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelectedOption(opt.id as CalcOption)}
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

      {selectedOption === 'anillos' && (
        <div className="bg-[#1C1B18] border border-[#2C2A24] rounded-2xl p-5 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-white">
              Distribución de Gastos en Tiempo Real
            </h3>
            <p className="text-xs text-[#A6A297]">
              Total compras del mes: {formatCurrency(totalGastos, currency)}
            </p>
          </div>

          {chartData.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#A6A297]">
              Aún no hay compras registradas para graficar.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={3}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => formatCurrency(Number(val), currency)}
                      contentStyle={{
                        backgroundColor: '#1C1B18',
                        borderColor: '#2C2A24',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2.5">
                {chartData.map((item, idx) => (
                  <div
                    key={item.name}
                    className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <div>
                        <strong className="text-white block">
                          #{idx + 1} {item.name}
                        </strong>
                        <span className="text-[11px] text-[#A6A297]">
                          {item.count} compra(s) • {item.pct.toFixed(1)}% del gasto
                        </span>
                      </div>
                    </div>
                    <strong className="text-white tabular-nums">
                      {formatCurrency(item.value, currency)}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedOption === 'promedios' && (
        <div className="bg-[#1C1B18] border border-[#2C2A24] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3.5">
              <span className="text-[11px] text-[#A6A297] block">Promedio por Compra</span>
              <strong className="text-base font-extrabold text-white">
                {formatCurrency(promedioPorCompra, currency)}
              </strong>
            </div>
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3.5">
              <span className="text-[11px] text-[#A6A297] block">Ritmo Diario Estimado</span>
              <strong className="text-base font-extrabold text-[#10B981]">
                {formatCurrency(promedioGastoDiario, currency)}
              </strong>
            </div>
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3.5">
              <span className="text-[11px] text-[#A6A297] block">Ritmo Semanal</span>
              <strong className="text-base font-extrabold text-[#D97706]">
                {formatCurrency(promedioGastoSemanal, currency)}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3.5">
              <strong className="text-white block">Gastos Esenciales (50%)</strong>
              <span className="text-[#10B981] font-bold">
                {formatCurrency(gastosEsenciales, currency)}
              </span>
              <span className="block text-[11px] text-[#A6A297] mt-1">
                Meta ideal: {formatCurrency(totalGanancias * 0.5, currency)}
              </span>
            </div>
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3.5">
              <strong className="text-white block">Deseos y Salidas (30%)</strong>
              <span className="text-[#D97706] font-bold">
                {formatCurrency(gastosDeseos, currency)}
              </span>
              <span className="block text-[11px] text-[#A6A297] mt-1">
                Meta ideal: {formatCurrency(totalGanancias * 0.3, currency)}
              </span>
            </div>
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3.5">
              <strong className="text-white block">Gastos Hormiga</strong>
              <span className="text-rose-400 font-bold">
                {formatCurrency(gastosHormiga, currency)}
              </span>
              <span className="block text-[11px] text-[#A6A297] mt-1">
                Compras pequeñas no esenciales
              </span>
            </div>
          </div>
        </div>
      )}

      {selectedOption === 'simulador' && (
        <div className="bg-[#1C1B18] border border-[#2C2A24] rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white">
            Simulador de Compras a Cuotas con Tarjeta de Crédito
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-[#A6A297] block mb-1">Valor Compra ($)</label>
              <input
                type="number"
                value={montoCompra}
                onChange={(e) => setMontoCompra(e.target.value)}
                className="w-full bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#A6A297] block mb-1">Cuotas (1-48)</label>
              <input
                type="number"
                value={cuotas}
                onChange={(e) => setCuotas(e.target.value)}
                className="w-full bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#A6A297] block mb-1">Tasa % E.A.</label>
              <input
                type="number"
                step="0.1"
                value={tasaEA}
                onChange={(e) => setTasaEA(e.target.value)}
                className="w-full bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#A6A297] block mb-1">Cuota Manejo ($)</label>
              <input
                type="number"
                value={cuotaManejo}
                onChange={(e) => setCuotaManejo(e.target.value)}
                className="w-full bg-[#121210] border border-[#2C2A24] rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3.5">
              <span className="text-[11px] text-[#A6A297] block">Cuota Mensual</span>
              <strong className="text-base font-extrabold text-[#10B981]">
                {formatCurrency(simulation.cuotaMensual, currency)}
              </strong>
            </div>
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3.5">
              <span className="text-[11px] text-[#A6A297] block">Intereses Totales</span>
              <strong className="text-base font-extrabold text-[#D97706]">
                {formatCurrency(simulation.totalIntereses, currency)}
              </strong>
            </div>
            <div className="bg-[#121210] border border-[#2C2A24] rounded-xl p-3.5">
              <span className="text-[11px] text-[#A6A297] block">Total Final a Pagar</span>
              <strong className="text-base font-extrabold text-white">
                {formatCurrency(simulation.totalPagar, currency)}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
