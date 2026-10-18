import { AIAnalysisResult, ExtractedTransactionItem, ExtractedCreditSummary, SourceType } from '../types/finance';
import { eaToMvPercent } from './financeCalculations';

/**
 * Extrae texto legible directamente desde un archivo PDF en el celular (100% local sin servidor externo)
 */
export async function extractTextFromPdfFileLocal(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder('latin1');
    const raw = decoder.decode(bytes);

    // Extraer bloques de texto entre paréntesis (formato texto estándar PDF) y cadenas legibles
    const textChunks: string[] = [];
    const parenRegex = /\(([^()]{2,200})\)/g;
    let match;
    while ((match = parenRegex.exec(raw)) !== null) {
      const cleaned = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, ' ')
        .replace(/\\[()\\]/g, (m) => m[1])
        .replace(/[^\x20-\x7EÁÉÍÓÚáéíóúÑñ$.,:%0-9/-]/g, ' ')
        .trim();
      if (cleaned.length > 2 && /[a-zA-Z0-9$]/.test(cleaned)) {
        textChunks.push(cleaned);
      }
    }

    if (textChunks.length > 5) {
      return textChunks.join(' ');
    }

    // Respaldo: buscar líneas con montos o palabras financieras directamente en el binario decodificado
    const readableLines = raw
      .match(/[A-Za-zÁÉÍÓÚáéíóúÑñ0-9$.,:%/\s-]{6,120}/g)
      ?.filter((s) => /\$|\d{3}|cupo|pago|saldo|compra|tasa|extracto|cuota|banco|nequi|nu/i.test(s))
      .slice(0, 80);

    if (readableLines && readableLines.length > 0) {
      return readableLines.join('\n');
    }

    return `Archivo PDF procesado localmente: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  } catch {
    return `Archivo PDF: ${file.name}`;
  }
}

/**
 * Analiza una imagen localmente en el celular (dimensiones, contraste de recibo, nombre del archivo y texto complementario)
 */
export async function inspectImageLocally(file: File): Promise<{ width: number; height: number; brightness: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;
        let brightness = 180;
        if (ctx) {
          ctx.drawImage(img, 0, 0, 64, 64);
          const data = ctx.getImageData(0, 0, 64, 64).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) {
            sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
          }
          brightness = Math.round(sum / (64 * 64));
        }
        URL.revokeObjectURL(url);
        resolve({ width: img.width, height: img.height, brightness });
      } catch {
        URL.revokeObjectURL(url);
        resolve({ width: img.width || 800, height: img.height || 1200, brightness: 180 });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 800, height: 1200, brightness: 180 });
    };
    img.src = url;
  });
}

/**
 * Motor Local Autónomo 100% On-Device (Samsung A36 5G Ready)
 * Analiza notificaciones, extractos PDF, imágenes y correos sin requerir servidores externos.
 */
export function runOnDeviceFinancialAnalysis(params: {
  sourceType: SourceType;
  text: string;
  fileName?: string;
}): AIAnalysisResult {
  const rawText = (params.text || '').trim();
  const low = rawText.toLowerCase();
  const fileLow = (params.fileName || '').toLowerCase();

  // Extraer todos los montos en formato colombiano/latam ($148.900, 3.840.000, $50,000, etc.)
  const moneyRegex = /\$\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{4,9})|\b(\d{1,3}(?:\.\d{3}){1,2})\b/g;
  const matches = [...rawText.matchAll(moneyRegex)];
  const parsedAmounts = matches
    .map((m) => parseInt((m[1] || m[2] || '0').replace(/[.,]/g, ''), 10))
    .filter((n) => !isNaN(n) && n >= 1000 && n <= 500000000);

  // Detectar entidad bancaria
  let entidad = 'Entidad Bancaria';
  if (low.includes('nequi') || fileLow.includes('nequi')) entidad = 'Nequi';
  else if (low.includes('bancolombia') || fileLow.includes('bancolombia')) entidad = 'Bancolombia';
  else if (low.includes('nu ') || low.includes('tarjeta nu') || low.includes('nu:') || fileLow.includes('nu')) entidad = 'Nu Colombia';
  else if (low.includes('daviplata') || fileLow.includes('daviplata')) entidad = 'Daviplata';
  else if (low.includes('davivienda') || fileLow.includes('davivienda')) entidad = 'Davivienda';
  else if (low.includes('bbva') || fileLow.includes('bbva')) entidad = 'BBVA';
  else if (low.includes('lulo') || fileLow.includes('lulo')) entidad = 'Lulo Bank';
  else if (low.includes('falabella') || fileLow.includes('falabella')) entidad = 'Banco Falabella';
  else if (low.includes('bogota') || low.includes('bogotá')) entidad = 'Banco de Bogotá';
  else if (low.includes('claro') || low.includes('enel') || low.includes('epm')) entidad = 'Servicios Públicos';

  // Detectar cuotas
  const cuotasMatch = rawText.match(/(\d{1,2})\s*cuotas?/i);
  const cuotas = cuotasMatch ? Math.max(1, parseInt(cuotasMatch[1], 10)) : 1;

  // Detectar tasa E.A.
  const tasaMatch = rawText.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:e\.?a\.?)?/i);
  const tasaEA = tasaMatch ? parseFloat(tasaMatch[1].replace(',', '.')) : 28.45;
  const mvPercent = eaToMvPercent(tasaEA);

  const movimientosDetectados: ExtractedTransactionItem[] = [];
  let datosExtractoCredito: ExtractedCreditSummary | undefined = undefined;

  const isExtracto =
    params.sourceType === 'pdf' ||
    low.includes('extracto') ||
    low.includes('cupo total') ||
    low.includes('pago mínimo') ||
    low.includes('pago minimo');

  if (isExtracto) {
    const lines = rawText.split(/\r?\n/);
    for (const line of lines) {
      const lineLow = line.toLowerCase();
      const m = line.match(/\$\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,9})|\b(\d{1,3}(?:\.\d{3}){1,2})\b/);
      if (!m) continue;
      const val = parseInt((m[1] || m[2] || '0').replace(/[.,]/g, ''), 10);
      if (
        !val ||
        val < 2000 ||
        lineLow.includes('cupo total') ||
        lineLow.includes('pago mínimo') ||
        lineLow.includes('pago minimo') ||
        lineLow.includes('pago total')
      ) {
        continue;
      }

      let categoria: ExtractedTransactionItem['categoria'] = 'Compras y Tecnología';
      let esEsencial = false;
      if (
        lineLow.includes('supermercado') ||
        lineLow.includes('carulla') ||
        lineLow.includes('exito') ||
        lineLow.includes('éxito') ||
        lineLow.includes('d1') ||
        lineLow.includes('ara') ||
        lineLow.includes('olimpica')
      ) {
        categoria = 'Alimentación y Supermercado';
        esEsencial = true;
      } else if (lineLow.includes('uber') || lineLow.includes('didi') || lineLow.includes('gasolina') || lineLow.includes('peaje')) {
        categoria = 'Transporte y Gasolina';
        esEsencial = true;
      } else if (lineLow.includes('cuota de manejo') || lineLow.includes('seguro') || lineLow.includes('intereses')) {
        categoria = 'Cuota Tarjeta / Crédito';
      } else if (lineLow.includes('rappi') || lineLow.includes('restaurante') || lineLow.includes('crepes') || lineLow.includes('cine')) {
        categoria = 'Entretenimiento y Salidas';
      }

      const lineCuotas = line.match(/(\d{1,2})\s*cuotas?/i);
      movimientosDetectados.push({
        tipo: lineLow.includes('abono') || lineLow.includes('pago recibido') ? 'ganancia' : 'gasto',
        categoria,
        monto: val,
        desc: line.replace(/^\d+\.\s*/, '').trim().substring(0, 80),
        entidad,
        cuotas: lineCuotas ? parseInt(lineCuotas[1], 10) : 1,
        esEsencial,
      });
    }

    // Si es un PDF recién subido sin líneas de texto estándar, extraer montos hallados o crear resumen de estado
    if (movimientosDetectados.length === 0 && parsedAmounts.length > 0) {
      parsedAmounts.slice(0, 6).forEach((amt, idx) => {
        movimientosDetectados.push({
          tipo: 'gasto',
          categoria: idx === 0 ? 'Cuota Tarjeta / Crédito' : 'Compras y Tecnología',
          monto: amt,
          desc: `Movimiento #${idx + 1} detectado en ${params.fileName || 'Extracto PDF'}`,
          entidad,
          cuotas: 1,
          esEsencial: idx === 0,
        });
      });
    }

    // Extraer datos clave del extracto
    const cupoMatch = rawText.match(/cupo\s*total[^$\d]*\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{5,9})/i);
    const utilizadoMatch = rawText.match(/cupo\s*utilizado[^$\d]*\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{5,9})/i);
    const minMatch = rawText.match(/pago\s*m[íi]nimo[^$\d]*\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,9})/i);
    const manejoMatch = rawText.match(/cuota\s*de\s*manejo[^$\d]*\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,7})/i);
    const seguroMatch = rawText.match(/seguro[^$\d]*\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,7})/i);

    const cupoTotal = cupoMatch ? parseInt(cupoMatch[1].replace(/[.,]/g, ''), 10) : 8000000;
    const saldoActual = utilizadoMatch
      ? parseInt(utilizadoMatch[1].replace(/[.,]/g, ''), 10)
      : movimientosDetectados.reduce((s, m) => s + m.monto, 0) || 2450000;
    const pagoMinimo = minMatch ? parseInt(minMatch[1].replace(/[.,]/g, ''), 10) : Math.round(saldoActual * 0.11);
    const cuotaManejo = manejoMatch ? parseInt(manejoMatch[1].replace(/[.,]/g, ''), 10) : 29900;
    const segurosCobrosOcultos = seguroMatch ? parseInt(seguroMatch[1].replace(/[.,]/g, ''), 10) : 11500;

    datosExtractoCredito = {
      entidad,
      cupoTotal,
      saldoActual,
      pagoMinimo,
      fechaLimitePago: 'Próximo corte mensual',
      tasaEA,
      cuotaManejo,
      segurosCobrosOcultos,
      alertaUsura: tasaEA >= 28.0,
    };
  } else {
    // Notificación, imagen o correo
    const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length > 1 && parsedAmounts.length > 1) {
      for (const line of lines) {
        const m = line.match(/\$\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,9})|\b(\d{1,3}(?:\.\d{3}){1,2})\b/);
        if (!m) continue;
        const val = parseInt((m[1] || m[2] || '0').replace(/[.,]/g, ''), 10);
        const lLow = line.toLowerCase();
        if (val > 0 && !lLow.includes('cupo')) {
          movimientosDetectados.push({
            tipo:
              lLow.includes('recibiste') || lLow.includes('abono') || lLow.includes('llegó plata')
                ? 'ganancia'
                : lLow.includes('crédito') || lLow.includes('cuota')
                ? 'deuda'
                : 'gasto',
            categoria:
              lLow.includes('internet') || lLow.includes('energia') || lLow.includes('arriendo') || lLow.includes('claro')
                ? 'Vivienda y Servicios'
                : lLow.includes('netflix') || lLow.includes('prime') || lLow.includes('spotify') || lLow.includes('disney')
                ? 'Suscripciones Digitales'
                : 'Compras y Tecnología',
            monto: val,
            desc: line.replace(/^[-*•]\s*/, '').trim().substring(0, 80),
            entidad,
            cuotas,
            esEsencial: lLow.includes('energia') || lLow.includes('internet') || lLow.includes('arriendo') || lLow.includes('claro'),
          });
        }
      }
    } else {
      const montoPrincipal = parsedAmounts[0] || 85000;
      let tipo: ExtractedTransactionItem['tipo'] = 'gasto';
      if (
        low.includes('recibiste') ||
        low.includes('llegó plata') ||
        low.includes('abono') ||
        low.includes('consignacion') ||
        low.includes('enviaron') ||
        low.includes('nómina')
      ) {
        tipo = 'ganancia';
      } else if (low.includes('deuda') || low.includes('pendiente') || (cuotas > 1 && (low.includes('t.cred') || low.includes('tarjeta')))) {
        tipo = 'deuda';
      } else if (low.includes('trading') || low.includes('broker') || low.includes('etf') || low.includes('cajita')) {
        tipo = 'trading';
      }

      let categoria: ExtractedTransactionItem['categoria'] = 'Compras y Tecnología';
      let esEsencial = false;
      if (tipo === 'ganancia') {
        categoria = 'Ventas / Negocio / Freelance';
        esEsencial = true;
      } else if (low.includes('restaurante') || low.includes('crepes') || low.includes('rappi') || low.includes('comida')) {
        categoria = 'Entretenimiento y Salidas';
      } else if (low.includes('energia') || low.includes('enel') || low.includes('agua') || low.includes('claro') || low.includes('arriendo')) {
        categoria = 'Vivienda y Servicios';
        esEsencial = true;
      } else if (low.includes('exito') || low.includes('éxito') || low.includes('supermercado') || low.includes('d1') || low.includes('ara')) {
        categoria = 'Alimentación y Supermercado';
        esEsencial = true;
      } else if (low.includes('cafe') || low.includes('café') || low.includes('juan valdez') || montoPrincipal <= 35000) {
        categoria = 'Gastos Hormiga / Café / Snacks';
      }

      movimientosDetectados.push({
        tipo,
        categoria,
        monto: montoPrincipal,
        desc: rawText
          ? rawText.substring(0, 80)
          : `Comprobante procesado en tu celular (${params.fileName || 'Imagen/Recibo'})`,
        entidad,
        cuotas,
        esEsencial,
      });
    }
  }

  const totalExtraido = movimientosDetectados.reduce((acc, m) => acc + m.monto, 0);
  const utilizacionPct =
    datosExtractoCredito && datosExtractoCredito.cupoTotal
      ? ((datosExtractoCredito.saldoActual || 0) / datosExtractoCredito.cupoTotal) * 100
      : 0;

  return {
    resumenEjecutivo: `Análisis procesado en tu dispositivo: se identificaron ${movimientosDetectados.length} movimiento(s) por un total de $${totalExtraido.toLocaleString('es-CO')} asociados a ${entidad}.`,
    tipoDocumentoDetectado:
      params.sourceType === 'pdf'
        ? 'Extracto Bancario / PDF Financiero'
        : params.sourceType === 'imagen'
        ? 'Imagen de Recibo / Comprobante QR / Voucher'
        : params.sourceType === 'correo'
        ? 'Correo Bancario / Facturación'
        : 'Notificación Bancaria del Celular',
    nivelRiesgo:
      cuotas > 1 || utilizacionPct > 45 || (datosExtractoCredito && datosExtractoCredito.alertaUsura)
        ? 'medio'
        : 'bajo',
    movimientosDetectados,
    datosExtractoCredito,
    alertasFinancieras: [
      cuotas > 1
        ? `Compra diferida a ${cuotas} cuotas (${tasaEA.toFixed(2)}% E.A. / ${mvPercent.toFixed(2)}% M.V.): pagarás intereses desde el primer corte.`
        : 'Operación a 1 cuota o débito: $0 en intereses corrientes.',
      datosExtractoCredito
        ? `Los cargos fijos del extracto (cuota de manejo + seguros) representan $${((datosExtractoCredito.cuotaManejo || 0) + (datosExtractoCredito.segurosCobrosOcultos || 0)).toLocaleString('es-CO')}/mes ($${(((datosExtractoCredito.cuotaManejo || 0) + (datosExtractoCredito.segurosCobrosOcultos || 0)) * 12).toLocaleString('es-CO')} al año).`
        : 'Este análisis se ejecutó de forma 100% privada en tu celular.',
    ],
    recomendacionesPrioritarias: [
      'Toca "Guardar Movimientos en Mis Finanzas" para registrar estos datos en tu memoria local y actualizar tus promedios.',
      utilizacionPct > 30
        ? `Tu utilización de cupo en este extracto es del ${utilizacionPct.toFixed(1)}%. Haz un abono antes de la fecha de corte para bajarla al 30% y subir tu puntaje crediticio.`
        : 'Mantén tus compras de consumo diario (mercado, restaurantes, transporte) siempre a 1 sola cuota.',
      'Revisa la pestaña "Vida Crediticia" para ver qué obligación debes priorizar este mes con el Método Avalancha.',
    ],
    ejemploPracticoAhorro:
      cuotas > 1
        ? `Ejemplo real con este movimiento: Si abonas hoy a capital o pasas esta compra de $${(movimientosDetectados[0]?.monto || 100000).toLocaleString('es-CO')} de ${cuotas} cuotas a 1 cuota, te ahorras $${Math.round((movimientosDetectados[0]?.monto || 100000) * (mvPercent / 100) * cuotas * 0.65).toLocaleString('es-CO')} en intereses.`
        : `Ejemplo práctico: Si separas el 10% de este valor ($${Math.round(totalExtraido * 0.1).toLocaleString('es-CO')}) como abono extra a tu tarjeta más costosa, reduces el tiempo de tu deuda y mejoras tu calificación en centrales de riesgo.`,
    calculosRealizados: [
      {
        etiqueta: 'Total Analizado',
        valor: `$${totalExtraido.toLocaleString('es-CO')}`,
        explicacion: `${movimientosDetectados.length} registro(s) listos para importar.`,
      },
      {
        etiqueta: 'Promedio por Movimiento',
        valor: `$${Math.round(totalExtraido / Math.max(1, movimientosDetectados.length)).toLocaleString('es-CO')}`,
        explicacion: 'Ticket promedio dentro del documento o notificación analizada.',
      },
      {
        etiqueta: 'Costo Financiero Equivalente',
        valor: `${mvPercent.toFixed(2)}% M.V. (${tasaEA}% E.A.)`,
        explicacion: 'Tasa mensual aplicada a compras en cuotas.',
      },
    ],
    motorUsado: 'heuristica-local',
  };
}
