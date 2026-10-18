import {
  Transaction,
  CreditObligation,
  PayoffComparison,
  DebtPayoffStep,
  TransactionCategory,
} from '../types/finance';

export type CurrencyCode = 'COP' | 'USD' | 'MXN' | 'EUR';

export function formatCurrency(amount: number, currency: CurrencyCode = 'COP'): string {
  const locales: Record<CurrencyCode, string> = {
    COP: 'es-CO',
    USD: 'en-US',
    MXN: 'es-MX',
    EUR: 'es-ES',
  };
  return new Intl.NumberFormat(locales[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(Math.round(amount));
}

/**
 * Convierte Tasa Efectiva Anual (E.A. %) a Tasa Mensual Vencida (M.V. %)
 * Fórmula financiera exacta: MV = (1 + EA)^(1/12) - 1
 */
export function eaToMvPercent(eaPercent: number): number {
  if (eaPercent <= 0) return 0;
  const eaDecimal = eaPercent / 100;
  const mvDecimal = Math.pow(1 + eaDecimal, 1 / 12) - 1;
  return mvDecimal * 100;
}

/**
 * Convierte Tasa Mensual Vencida (M.V. %) a Tasa Efectiva Anual (E.A. %)
 * Fórmula financiera exacta: EA = (1 + MV)^12 - 1
 */
export function mvToEaPercent(mvPercent: number): number {
  if (mvPercent <= 0) return 0;
  const mvDecimal = mvPercent / 100;
  const eaDecimal = Math.pow(1 + mvDecimal, 12) - 1;
  return eaDecimal * 100;
}

/**
 * Simulador de compra con tarjeta de crédito diferida a N cuotas
 * Nota:En Colombia y LatAm, compras a 1 cuota suelen tener 0% de interés corriente si se pagan a tiempo.
 */
export function simulateInstallmentPurchase(
  montoCompra: number,
  cuotas: number,
  tasaEA: number,
  cuotaManejoMensual: number = 0
) {
  if (cuotas <= 1) {
    return {
      montoCompra,
      cuotas: 1,
      tasaEA,
      tasaMV: eaToMvPercent(tasaEA),
      cuotaMensual: montoCompra + cuotaManejoMensual,
      totalIntereses: 0,
      totalCuotaManejo: cuotaManejoMensual,
      totalPagar: montoCompra + cuotaManejoMensual,
      sobrecostoPorcentaje: montoCompra > 0 ? (cuotaManejoMensual / montoCompra) * 100 : 0,
      tablaAmortizacion: [
        {
          mes: 1,
          cuota: montoCompra + cuotaManejoMensual,
          abonoCapital: montoCompra,
          interes: 0,
          saldoRestante: 0,
        },
      ],
    };
  }

  const mvPercent = eaToMvPercent(tasaEA);
  const r = mvPercent / 100;

  // Cuota fija francesa (o amortización constante en TC):
  // Usamos cuota fija estándar financiera: P * [r(1+r)^n] / [(1+r)^n - 1]
  const factor = Math.pow(1 + r, cuotas);
  const cuotaBase = r > 0 ? (montoCompra * (r * factor)) / (factor - 1) : montoCompra / cuotas;

  let saldo = montoCompra;
  let totalIntereses = 0;
  const tablaAmortizacion = [];

  for (let mes = 1; mes <= cuotas; mes++) {
    const interesMes = saldo * r;
    const abonoCapital = cuotaBase - interesMes;
    saldo = Math.max(0, saldo - abonoCapital);
    totalIntereses += interesMes;

    tablaAmortizacion.push({
      mes,
      cuota: cuotaBase + cuotaManejoMensual,
      abonoCapital,
      interes: interesMes,
      saldoRestante: saldo,
    });
  }

  const totalCuotaManejo = cuotaManejoMensual * cuotas;
  const totalPagar = montoCompra + totalIntereses + totalCuotaManejo;
  const sobrecostoPorcentaje = montoCompra > 0 ? ((totalPagar - montoCompra) / montoCompra) * 100 : 0;

  return {
    montoCompra,
    cuotas,
    tasaEA,
    tasaMV: mvPercent,
    cuotaMensual: cuotaBase + cuotaManejoMensual,
    totalIntereses,
    totalCuotaManejo,
    totalPagar,
    sobrecostoPorcentaje,
    tablaAmortizacion,
  };
}

/**
 * Calcula métricas completas de finanzas personales, promedios, regla 50/30/20 y salud crediticia
 */
export function calculateFinancialMetrics(
  transactions: Transaction[],
  credits: CreditObligation[]
) {
  let totalGanancias = 0;
  let totalGastos = 0;
  let totalDeudasMovs = 0;
  let totalTrading = 0;
  let gastosEsenciales = 0;
  let gastosDeseos = 0;
  let gastosHormiga = 0;

  const gastosPorCategoria: Record<string, { total: number; count: number }> = {};

  transactions.forEach((t) => {
    if (t.tipo === 'ganancia') {
      totalGanancias += t.monto;
    } else if (t.tipo === 'gasto' || t.tipo === 'pago_credito') {
      totalGastos += t.monto;
      if (t.esEsencial) {
        gastosEsenciales += t.monto;
      } else {
        gastosDeseos += t.monto;
      }
      if (
        t.categoria === 'Gastos Hormiga / Café / Snacks' ||
        (t.monto <= 45000 && !t.esEsencial)
      ) {
        gastosHormiga += t.monto;
      }

      if (!gastosPorCategoria[t.categoria]) {
        gastosPorCategoria[t.categoria] = { total: 0, count: 0 };
      }
      gastosPorCategoria[t.categoria].total += t.monto;
      gastosPorCategoria[t.categoria].count += 1;
    } else if (t.tipo === 'deuda') {
      totalDeudasMovs += t.monto;
    } else if (t.tipo === 'trading') {
      totalTrading += t.monto;
    }
  });

  const balanceDisponible = totalGanancias - totalGastos - totalTrading;
  const numGastos = transactions.filter((t) => t.tipo === 'gasto' || t.tipo === 'pago_credito').length;
  const promedioPorCompra = numGastos > 0 ? totalGastos / numGastos : 0;
  const promedioGastoDiario = totalGastos / 30;
  const promedioGastoSemanal = totalGastos / 4.33;

  // Métricas de Vida Crediticia
  const tarjetas = credits.filter((c) => c.tipo === 'tarjeta_credito');
  const cupoTotalTarjetas = tarjetas.reduce((acc, c) => acc + c.cupoTotal, 0);
  const saldoTotalTarjetas = tarjetas.reduce((acc, c) => acc + c.saldoActual, 0);
  const porcentajeUtilizacionCupo =
    cupoTotalTarjetas > 0 ? (saldoTotalTarjetas / cupoTotalTarjetas) * 100 : 0;

  const deudaTotalObligaciones = credits.reduce((acc, c) => acc + c.saldoActual, 0) + totalDeudasMovs;
  const cuotaMinimaTotalMensual = credits.reduce((acc, c) => acc + c.cuotaMinima, 0);

  const ingresoBase = Math.max(totalGanancias, 1);
  const indiceEndeudamientoMensual = (cuotaMinimaTotalMensual / ingresoBase) * 100;

  // Tasa promedio ponderada E.A. de todas las deudas
  const sumaPonderadaTasas = credits.reduce((acc, c) => acc + c.saldoActual * c.tasaEA, 0);
  const saldoTotalCreditos = credits.reduce((acc, c) => acc + c.saldoActual, 0);
  const tasaPromedioPonderadaEA =
    saldoTotalCreditos > 0 ? sumaPonderadaTasas / saldoTotalCreditos : 0;

  // Intereses mensuales que se van "a la basura" solo por mantener el saldo actual
  const interesesMensualesEstimados = credits.reduce((acc, c) => {
    const mv = eaToMvPercent(c.tasaEA) / 100;
    return acc + c.saldoActual * mv;
  }, 0);

  // Cálculo de Score Crediticio Estimado (Escala 150 - 950 estilo DataCrédito Experian)
  let scoreEstimado = 820;
  if (porcentajeUtilizacionCupo > 70) scoreEstimado -= 160;
  else if (porcentajeUtilizacionCupo > 50) scoreEstimado -= 95;
  else if (porcentajeUtilizacionCupo > 30) scoreEstimado -= 40;
  else if (porcentajeUtilizacionCupo > 0 && porcentajeUtilizacionCupo <= 25) scoreEstimado += 35;

  if (indiceEndeudamientoMensual > 50) scoreEstimado -= 120;
  else if (indiceEndeudamientoMensual > 35) scoreEstimado -= 55;

  const tieneMora = credits.some((c) => c.enMora);
  if (tieneMora) scoreEstimado -= 220;

  scoreEstimado = Math.max(150, Math.min(950, Math.round(scoreEstimado)));

  const categoriasOrdenadas = Object.entries(gastosPorCategoria)
    .map(([categoria, data]) => ({
      categoria: categoria as TransactionCategory,
      total: data.total,
      count: data.count,
      promedio: data.total / data.count,
      porcentajeDelGasto: totalGastos > 0 ? (data.total / totalGastos) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    totalGanancias,
    totalGastos,
    totalDeudasMovs,
    totalTrading,
    balanceDisponible,
    gastosEsenciales,
    gastosDeseos,
    gastosHormiga,
    promedioPorCompra,
    promedioGastoDiario,
    promedioGastoSemanal,
    cupoTotalTarjetas,
    saldoTotalTarjetas,
    porcentajeUtilizacionCupo,
    deudaTotalObligaciones,
    cuotaMinimaTotalMensual,
    indiceEndeudamientoMensual,
    tasaPromedioPonderadaEA,
    interesesMensualesEstimados,
    scoreEstimado,
    categoriasOrdenadas,
  };
}

/**
 * Simula la liquidación de múltiples deudas comparando:
 * 1) Método Avalancha (Mayor Tasa E.A. primero)
 * 2) Método Bola de Nieve (Menor Saldo primero)
 * 3) Solo Pagos Mínimos
 */
export function compareDebtStrategies(
  credits: CreditObligation[],
  abonoExtraMensual: number
): PayoffComparison {
  const activeCredits = credits.filter((c) => c.saldoActual > 0);

  if (activeCredits.length === 0) {
    return {
      avalancha: {
        pasos: [],
        mesesTotales: 0,
        interesesTotales: 0,
        ahorroInteresesVsMinimo: 0,
        mesesAhorradosVsMinimo: 0,
        explicacion: 'No tienes deudas activas registradas.',
      },
      bolaDeNieve: {
        pasos: [],
        mesesTotales: 0,
        interesesTotales: 0,
        ahorroInteresesVsMinimo: 0,
        mesesAhorradosVsMinimo: 0,
        explicacion: 'No tienes deudas activas registradas.',
      },
      soloPagosMinimos: {
        mesesTotales: 0,
        interesesTotales: 0,
      },
    };
  }

  function runSimulation(sortedList: CreditObligation[], extraMonthly: number, strategyName: 'avalancha' | 'nieve') {
    const items = sortedList.map((c) => ({
      ...c,
      remaining: c.saldoActual,
      mvRate: eaToMvPercent(c.tasaEA) / 100,
      minPayment: Math.max(c.cuotaMinima, c.saldoActual * (eaToMvPercent(c.tasaEA) / 100) + 25000),
      monthsToPayOff: 0,
      interestPaid: 0,
    }));

    let month = 0;
    let totalInterest = 0;
    const maxMonths = 180; // Tope 15 años

    while (items.some((i) => i.remaining > 1) && month < maxMonths) {
      month++;
      let availableExtra = extraMonthly;

      // 1. Generar intereses del mes y pagar cuota mínima en todas
      for (const item of items) {
        if (item.remaining <= 1) {
          // Efecto bola de nieve/avalancha: la cuota mínima de una deuda ya liquidada se suma al abono extra
          availableExtra += item.minPayment;
          continue;
        }
        const interest = item.remaining * item.mvRate;
        item.interestPaid += interest;
        totalInterest += interest;
        item.remaining += interest;

        const payment = Math.min(item.remaining, item.minPayment);
        item.remaining -= payment;
        if (payment < item.minPayment) {
          availableExtra += item.minPayment - payment;
        }
        if (item.remaining <= 1 && item.monthsToPayOff === 0) {
          item.monthsToPayOff = month;
        }
      }

      // 2. Aplicar todo el abono extra + cuotas liberadas a la deuda prioritaria #1 viva
      for (const item of items) {
        if (item.remaining > 1 && availableExtra > 0) {
          const extraApplied = Math.min(item.remaining, availableExtra);
          item.remaining -= extraApplied;
          availableExtra -= extraApplied;
          if (item.remaining <= 1 && item.monthsToPayOff === 0) {
            item.monthsToPayOff = month;
          }
        }
      }
    }

    const pasos: DebtPayoffStep[] = items.map((item, idx) => ({
      orden: idx + 1,
      idDeuda: item.id,
      nombre: item.nombre,
      entidad: item.entidad,
      saldoActual: item.saldoActual,
      tasaEA: item.tasaEA,
      tasaMV: eaToMvPercent(item.tasaEA),
      cuotaMinima: item.cuotaMinima,
      abonoSugeridoMes1: idx === 0 ? item.cuotaMinima + extraMonthly : item.cuotaMinima,
      mesesEstimadosLiquidacion: item.monthsToPayOff || month,
      interesesTotalesEstimados: item.interestPaid,
      razonPrioridad:
        strategyName === 'avalancha'
          ? idx === 0
            ? `Prioridad #1 por tener la tasa más costosa (${item.tasaEA.toFixed(1)}% E.A.). Destina aquí todo tu abono extra.`
            : `Paga el mínimo ($${Math.round(item.cuotaMinima).toLocaleString('es-CO')}) hasta liquidar la deuda #${idx}.`
          : idx === 0
          ? `Prioridad #1 por tener el saldo más bajo ($${Math.round(item.saldoActual).toLocaleString('es-CO')}). La eliminarás rápido para liberar cuota.`
          : `Paga el mínimo mientras liberas el flujo de caja de la deuda #${idx}.`,
    }));

    return {
      pasos,
      mesesTotales: month,
      interesesTotales: totalInterest,
    };
  }

  // Simulación base solo pagando mínimos (sin efecto cascada de abono extra)
  const baseMin = runSimulation(
    [...activeCredits].sort((a, b) => b.tasaEA - a.tasaEA),
    0,
    'avalancha'
  );

  // Simulación Avalancha (Mayor tasa E.A. primero)
  const avalanchaSorted = [...activeCredits].sort((a, b) => b.tasaEA - a.tasaEA);
  const simAvalancha = runSimulation(avalanchaSorted, abonoExtraMensual, 'avalancha');

  // Simulación Bola de Nieve (Menor saldo actual primero)
  const nieveSorted = [...activeCredits].sort((a, b) => a.saldoActual - b.saldoActual);
  const simNieve = runSimulation(nieveSorted, abonoExtraMensual, 'nieve');

  return {
    avalancha: {
      ...simAvalancha,
      ahorroInteresesVsMinimo: Math.max(0, baseMin.interesesTotales - simAvalancha.interesesTotales),
      mesesAhorradosVsMinimo: Math.max(0, baseMin.mesesTotales - simAvalancha.mesesTotales),
      explicacion:
        'Ataca primero la obligación con la tasa Efectiva Anual (E.A.) más alta. Es el camino que matemáticamente te hace pagar menos intereses al banco.',
    },
    bolaDeNieve: {
      ...simNieve,
      ahorroInteresesVsMinimo: Math.max(0, baseMin.interesesTotales - simNieve.interesesTotales),
      mesesAhorradosVsMinimo: Math.max(0, baseMin.mesesTotales - simNieve.mesesTotales),
      explicacion:
        'Ataca primero la deuda más pequeña sin importar la tasa. Al cerrarla rápido, sumas su cuota mínima a la siguiente deuda ganando impulso psicológico y liquidez.',
    },
    soloPagosMinimos: {
      mesesTotales: baseMin.mesesTotales,
      interesesTotales: baseMin.interesesTotales,
    },
  };
}
