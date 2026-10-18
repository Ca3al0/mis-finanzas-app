import {
  Transaction,
  CreditObligation,
  PayoffComparison,
  DebtPayoffStep,
  TransactionCategory,
  SalaryProfile,
  RecurringPayment,
  FinancialGoal,
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
  }).format(Math.round(amount || 0));
}

export function eaToMvPercent(eaPercent: number): number {
  if (eaPercent <= 0) return 0;
  const eaDecimal = eaPercent / 100;
  const mvDecimal = Math.pow(1 + eaDecimal, 1 / 12) - 1;
  return mvDecimal * 100;
}

export function mvToEaPercent(mvPercent: number): number {
  if (mvPercent <= 0) return 0;
  const mvDecimal = mvPercent / 100;
  const eaDecimal = Math.pow(1 + mvDecimal, 12) - 1;
  return eaDecimal * 100;
}

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

export function calculateFinancialMetrics(
  transactions: Transaction[],
  credits: CreditObligation[],
  salaryProfile?: SalaryProfile,
  recurringPayments: RecurringPayment[] = [],
  goals: FinancialGoal[] = []
) {
  let ingresosMovimientos = 0;
  let totalGastosVariables = 0;
  let totalDeudasMovs = 0;
  let totalTrading = 0;
  let gastosEsenciales = 0;
  let gastosDeseos = 0;
  let gastosHormiga = 0;

  const gastosPorCategoria: Record<string, { total: number; count: number }> = {};

  transactions.forEach((t) => {
    if (t.tipo === 'ganancia') {
      ingresosMovimientos += t.monto;
    } else if (t.tipo === 'gasto' || t.tipo === 'pago_credito') {
      totalGastosVariables += t.monto;
      if (t.esEsencial) {
        gastosEsenciales += t.monto;
      } else {
        gastosDeseos += t.monto;
      }
      if (
        t.categoria === 'Gastos Hormiga / Café / Snacks' ||
        (t.monto <= 35000 && !t.esEsencial)
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

  // Pagos fijos pendientes por pagar este mes (los ya pagados ya generaron su movimiento en transactions)
  const pagosFijosPendientes = recurringPayments
    .filter((p) => !p.pagadoEsteMes)
    .reduce((acc, p) => acc + p.monto, 0);

  const totalPagosFijosMensuales = recurringPayments.reduce((acc, p) => acc + p.monto, 0);

  // El ingreso total del mes toma el salario fijo configurado + ingresos extra (o la suma de ingresos registrados si es mayor)
  const salarioConfigurado =
    (salaryProfile?.salarioMensualNeto || 0) + (salaryProfile?.otrosIngresosFijos || 0);
  const totalGanancias = Math.max(salarioConfigurado, ingresosMovimientos);

  const totalGastos = totalGastosVariables;
  const balanceDisponible = totalGanancias - totalGastos - totalTrading;
  const disponibleDespuesDePagosFijos = Math.max(0, balanceDisponible - pagosFijosPendientes);

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
  const indiceEndeudamientoMensual =
    totalGanancias > 0 ? (cuotaMinimaTotalMensual / ingresoBase) * 100 : 0;

  const sumaPonderadaTasas = credits.reduce((acc, c) => acc + c.saldoActual * c.tasaEA, 0);
  const saldoTotalCreditos = credits.reduce((acc, c) => acc + c.saldoActual, 0);
  const tasaPromedioPonderadaEA =
    saldoTotalCreditos > 0 ? sumaPonderadaTasas / saldoTotalCreditos : 0;

  const interesesMensualesEstimados = credits.reduce((acc, c) => {
    const mv = eaToMvPercent(c.tasaEA) / 100;
    return acc + c.saldoActual * mv;
  }, 0);

  let scoreEstimado = 800;
  if (credits.length > 0) {
    if (porcentajeUtilizacionCupo > 70) scoreEstimado -= 160;
    else if (porcentajeUtilizacionCupo > 50) scoreEstimado -= 95;
    else if (porcentajeUtilizacionCupo > 30) scoreEstimado -= 40;
    else if (porcentajeUtilizacionCupo > 0 && porcentajeUtilizacionCupo <= 25) scoreEstimado += 45;

    if (indiceEndeudamientoMensual > 50) scoreEstimado -= 120;
    else if (indiceEndeudamientoMensual > 35) scoreEstimado -= 55;

    if (credits.some((c) => c.enMora)) scoreEstimado -= 220;
  }
  scoreEstimado = Math.max(150, Math.min(950, Math.round(scoreEstimado)));

  const totalMetasObjetivo = goals.reduce((acc, g) => acc + g.montoObjetivo, 0);
  const totalMetasAhorrado = goals.reduce((acc, g) => acc + g.montoAhorrado, 0);

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
    salarioMensualNeto: salaryProfile?.salarioMensualNeto || 0,
    otrosIngresosFijos: salaryProfile?.otrosIngresosFijos || 0,
    ingresosMovimientos,
    totalGanancias,
    totalGastos,
    totalPagosFijosMensuales,
    pagosFijosPendientes,
    disponibleDespuesDePagosFijos,
    totalDeudasMovs,
    totalTrading,
    balanceDisponible,
    gastosEsenciales: gastosEsenciales + pagosFijosPendientes,
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
    totalMetasObjetivo,
    totalMetasAhorrado,
    categoriasOrdenadas,
  };
}

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
        explicacion: 'Registra tus tarjetas o préstamos abajo para calcular el orden exacto de pago.',
      },
      bolaDeNieve: {
        pasos: [],
        mesesTotales: 0,
        interesesTotales: 0,
        ahorroInteresesVsMinimo: 0,
        mesesAhorradosVsMinimo: 0,
        explicacion: 'Registra tus tarjetas o préstamos abajo para calcular el orden exacto de pago.',
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
    const maxMonths = 180;

    while (items.some((i) => i.remaining > 1) && month < maxMonths) {
      month++;
      let availableExtra = extraMonthly;

      for (const item of items) {
        if (item.remaining <= 1) {
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
            ? `Págala de #1 por tener la tasa más alta (${item.tasaEA.toFixed(1)}% E.A.). Aquí va tu abono extra.`
            : `Paga la cuota mínima ($${Math.round(item.cuotaMinima).toLocaleString('es-CO')}) mientras terminas la deuda #${idx}.`
          : idx === 0
          ? `Págala de #1 por tener el saldo más pequeño ($${Math.round(item.saldoActual).toLocaleString('es-CO')}).`
          : `Paga el mínimo hasta liberar la cuota de la deuda #${idx}.`,
    }));

    return {
      pasos,
      mesesTotales: month,
      interesesTotales: totalInterest,
    };
  }

  const baseMin = runSimulation(
    [...activeCredits].sort((a, b) => b.tasaEA - a.tasaEA),
    0,
    'avalancha'
  );

  const avalanchaSorted = [...activeCredits].sort((a, b) => b.tasaEA - a.tasaEA);
  const simAvalancha = runSimulation(avalanchaSorted, abonoExtraMensual, 'avalancha');

  const nieveSorted = [...activeCredits].sort((a, b) => a.saldoActual - b.saldoActual);
  const simNieve = runSimulation(nieveSorted, abonoExtraMensual, 'nieve');

  return {
    avalancha: {
      ...simAvalancha,
      ahorroInteresesVsMinimo: Math.max(0, baseMin.interesesTotales - simAvalancha.interesesTotales),
      mesesAhorradosVsMinimo: Math.max(0, baseMin.mesesTotales - simAvalancha.mesesTotales),
      explicacion:
        'Ataca primero la deuda con mayor tasa de interés (% E.A.). Es la ruta que más dinero te ahorra.',
    },
    bolaDeNieve: {
      ...simNieve,
      ahorroInteresesVsMinimo: Math.max(0, baseMin.interesesTotales - simNieve.interesesTotales),
      mesesAhorradosVsMinimo: Math.max(0, baseMin.mesesTotales - simNieve.mesesTotales),
      explicacion:
        'Ataca primero la deuda más pequeña para eliminar obligaciones rápido y liberar flujo de caja.',
    },
    soloPagosMinimos: {
      mesesTotales: baseMin.mesesTotales,
      interesesTotales: baseMin.interesesTotales,
    },
  };
}
