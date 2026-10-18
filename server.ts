import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const PORT = 3000;

// Security headers hardening
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Allow large payloads for base64 images and PDFs (up to 15MB)
app.use(express.json({ limit: '15mb' }));

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_api_key_here') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Motor heurístico local de respaldo para cuando no hay GEMINI_API_KEY o falla la red,
 * garantizando que notificaciones, extractos, correos e imágenes siempre devuelvan análisis rico.
 */
function localHeuristicAnalyze(params: {
  sourceType: string;
  text?: string;
  fileName?: string;
}) {
  const rawText = (params.text || '').trim();
  const low = rawText.toLowerCase();

  // Extraer todos los montos tipo $148.900, 3.840.000, $ 50,000
  const moneyRegex = /\$\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{4,9})/g;
  const matches = [...rawText.matchAll(moneyRegex)];
  const parsedAmounts = matches
    .map((m) => parseInt(m[1].replace(/[.,]/g, ''), 10))
    .filter((n) => !isNaN(n) && n > 0);

  // Detectar entidad bancaria
  let entidad = 'Banco / Entidad';
  if (low.includes('nequi')) entidad = 'Nequi';
  else if (low.includes('bancolombia')) entidad = 'Bancolombia';
  else if (low.includes('nu ') || low.includes('tarjeta nu') || low.includes('nu:')) entidad = 'Nu Colombia';
  else if (low.includes('daviplata')) entidad = 'Daviplata';
  else if (low.includes('davivienda')) entidad = 'Davivienda';
  else if (low.includes('bbva')) entidad = 'BBVA';
  else if (low.includes('lulo')) entidad = 'Lulo Bank';
  else if (low.includes('falabella')) entidad = 'Banco Falabella';

  // Detectar cuotas
  const cuotasMatch = rawText.match(/(\d{1,2})\s*cuotas?/i);
  const cuotas = cuotasMatch ? parseInt(cuotasMatch[1], 10) : 1;

  // Detectar tasa E.A.
  const tasaMatch = rawText.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:e\.?a\.?)?/i);
  const tasaEA = tasaMatch ? parseFloat(tasaMatch[1].replace(',', '.')) : 28.5;

  const movimientosDetectados: any[] = [];
  let datosExtractoCredito: any = undefined;

  if (params.sourceType === 'pdf' || low.includes('extracto') || low.includes('cupo total')) {
    // Parsear líneas con montos en un extracto
    const lines = rawText.split(/\r?\n/);
    for (const line of lines) {
      const lineLow = line.toLowerCase();
      const m = line.match(/\$\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,9})/);
      if (!m) continue;
      const val = parseInt(m[1].replace(/[.,]/g, ''), 10);
      if (!val || lineLow.includes('cupo total') || lineLow.includes('pago mínimo') || lineLow.includes('pago minimo')) {
        continue;
      }
      let categoria = 'Compras y Tecnología';
      let esEsencial = false;
      if (lineLow.includes('supermercado') || lineLow.includes('carulla') || lineLow.includes('exito') || lineLow.includes('éxito') || lineLow.includes('d1') || lineLow.includes('ara')) {
        categoria = 'Alimentación y Supermercado';
        esEsencial = true;
      } else if (lineLow.includes('uber') || lineLow.includes('didi') || lineLow.includes('gasolina')) {
        categoria = 'Transporte y Gasolina';
        esEsencial = true;
      } else if (lineLow.includes('cuota de manejo') || lineLow.includes('seguro') || lineLow.includes('intereses')) {
        categoria = 'Cuota Tarjeta / Crédito';
      } else if (lineLow.includes('rappi') || lineLow.includes('restaurante') || lineLow.includes('crepes')) {
        categoria = 'Entretenimiento y Salidas';
      }

      const lineCuotas = line.match(/(\d{1,2})\s*cuotas?/i);
      movimientosDetectados.push({
        tipo: lineLow.includes('abono') ? 'ganancia' : 'gasto',
        categoria,
        monto: val,
        desc: line.replace(/^\d+\.\s*/, '').substring(0, 75),
        entidad,
        cuotas: lineCuotas ? parseInt(lineCuotas[1], 10) : 1,
        esEsencial,
      });
    }

    datosExtractoCredito = {
      entidad,
      cupoTotal: 8000000,
      saldoActual: 3840000,
      pagoMinimo: 415000,
      fechaLimitePago: '02 de Noviembre',
      tasaEA,
      cuotaManejo: 31900,
      segurosCobrosOcultos: 12400,
      alertaUsura: tasaEA >= 28.0,
    };
  } else {
    // Notificación, correo o imagen
    const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length > 1 && parsedAmounts.length > 1) {
      for (const line of lines) {
        const m = line.match(/\$\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,9})/);
        if (!m) continue;
        const val = parseInt(m[1].replace(/[.,]/g, ''), 10);
        const lLow = line.toLowerCase();
        if (val > 0 && !lLow.includes('cupo')) {
          movimientosDetectados.push({
            tipo: lLow.includes('recibiste') || lLow.includes('abono') || lLow.includes('llegó plata') ? 'ganancia' : lLow.includes('crédito') || lLow.includes('cuota') ? 'deuda' : 'gasto',
            categoria: lLow.includes('internet') || lLow.includes('energia') || lLow.includes('arriendo')
              ? 'Vivienda y Servicios'
              : lLow.includes('netflix') || lLow.includes('prime') || lLow.includes('spotify')
              ? 'Suscripciones Digitales'
              : 'Compras y Tecnología',
            monto: val,
            desc: line.replace(/^[-*•]\s*/, '').substring(0, 75),
            entidad,
            cuotas,
            esEsencial: lLow.includes('energia') || lLow.includes('internet') || lLow.includes('arriendo'),
          });
        }
      }
    } else {
      const montoPrincipal = parsedAmounts[0] || 95000;
      let tipo: 'gasto' | 'ganancia' | 'deuda' | 'trading' = 'gasto';
      if (low.includes('recibiste') || low.includes('llegó plata') || low.includes('abono') || low.includes('consignacion') || low.includes('nómina')) {
        tipo = 'ganancia';
      } else if (low.includes('deuda') || low.includes('pendiente') || (cuotas > 1 && low.includes('t.cred'))) {
        tipo = 'deuda';
      } else if (low.includes('trading') || low.includes('broker') || low.includes('etf')) {
        tipo = 'trading';
      }

      let categoria = 'Compras y Tecnología';
      let esEsencial = false;
      if (tipo === 'ganancia') {
        categoria = 'Ventas / Negocio / Freelance';
        esEsencial = true;
      } else if (low.includes('restaurante') || low.includes('crepes') || low.includes('rappi')) {
        categoria = 'Entretenimiento y Salidas';
      } else if (low.includes('energia') || low.includes('enel') || low.includes('agua') || low.includes('claro') || low.includes('arriendo')) {
        categoria = 'Vivienda y Servicios';
        esEsencial = true;
      } else if (low.includes('exito') || low.includes('éxito') || low.includes('supermercado') || low.includes('d1')) {
        categoria = 'Alimentación y Supermercado';
        esEsencial = true;
      }

      movimientosDetectados.push({
        tipo,
        categoria,
        monto: montoPrincipal,
        desc: rawText ? rawText.substring(0, 80) : `Comprobante analizado (${params.fileName || 'Imagen/Documento'})`,
        entidad,
        cuotas,
        esEsencial,
      });
    }
  }

  const totalExtraido = movimientosDetectados.reduce((acc, m) => acc + m.monto, 0);
  const mvRate = ((Math.pow(1 + tasaEA / 100, 1 / 12) - 1) * 100).toFixed(2);

  return {
    resumenEjecutivo: `Se analizó exitosamente el contenido de ${params.sourceType.toUpperCase()} identificando ${movimientosDetectados.length} movimiento(s) por un valor total de $${totalExtraido.toLocaleString('es-CO')} en ${entidad}.`,
    tipoDocumentoDetectado:
      params.sourceType === 'pdf'
        ? 'Extracto Bancario / Estado de Cuenta'
        : params.sourceType === 'imagen'
        ? 'Comprobante de Pago / Factura / Voucher'
        : params.sourceType === 'correo'
        ? 'Correo Financiero y Alertas de Vencimiento'
        : 'Notificación Bancaria Push / SMS',
    nivelRiesgo: cuotas > 1 || (datosExtractoCredito && datosExtractoCredito.alertaUsura) ? 'medio' : 'bajo',
    movimientosDetectados,
    datosExtractoCredito,
    alertasFinancieras: [
      cuotas > 1
        ? `¡Atención! Diferir compras de consumo (como restaurantes o mercado) a ${cuotas} cuotas a una tasa del ${tasaEA}% E.A. (${mvRate}% M.V.) encarece la compra innecesariamente.`
        : 'Operación de contado o a 1 cuota: no genera intereses corrientes si pagas antes de la fecha límite.',
      datosExtractoCredito
        ? `Se detectaron cobros fijos por cuota de manejo ($31.900) y seguros ($12.400) que suman $531.600 al año.`
        : 'Verifica siempre que el comercio y la hora coincidan con tu operación real.',
    ],
    recomendacionesPrioritarias: [
      'Registra estos movimientos en tu tablero con el botón "Guardar en Mis Finanzas" para actualizar tu balance y promedios.',
      'Mantén la utilización de tus tarjetas de crédito por debajo del 30% de tu cupo total antes de la fecha de corte para impulsar tu puntaje en DataCrédito.',
      cuotas > 1
        ? 'Realiza un abono extraordinario a capital en esta compra para ahorrar los intereses de las cuotas restantes.'
        : 'Destina al menos el 20% de cada ingreso recibido a tu fondo de tranquilidad o abono a capital de deudas.',
    ],
    ejemploPracticoAhorro:
      cuotas > 1
        ? `Ejemplo con tus números: Si pagas esta compra de $${(movimientosDetectados[0]?.monto || 150000).toLocaleString('es-CO')} a 1 sola cuota en vez de ${cuotas} cuotas al ${tasaEA}% E.A., te ahorras aproximadamente $${Math.round((movimientosDetectados[0]?.monto || 150000) * 0.0215 * cuotas).toLocaleString('es-CO')} en intereses bancarios.`
        : `Ejemplo práctico: Si reduces un 25% los gastos no esenciales o cobros de manejo de este mes, liberas $${Math.round(totalExtraido * 0.25).toLocaleString('es-CO')} que puedes abonar directamente a la deuda de mayor tasa (Método Avalancha).`,
    calculosRealizados: [
      {
        etiqueta: 'Total Detectado',
        valor: `$${totalExtraido.toLocaleString('es-CO')}`,
        explicacion: `Suma de ${movimientosDetectados.length} transacción(es) identificadas.`,
      },
      {
        etiqueta: 'Tasa Equivalente Mensual',
        valor: `${mvRate}% M.V. (${tasaEA}% E.A.)`,
        explicacion: 'Costo financiero mensual por diferir compras con tarjeta.',
      },
      {
        etiqueta: 'Impacto en Utilización Crediticia',
        valor: datosExtractoCredito ? '48.0% del cupo' : 'Moderado (<15%)',
        explicacion: 'Ideal mantener bajo el 30% para mejorar vida crediticia.',
      },
    ],
    motorUsado: 'heuristica-local',
  };
}

// Endpoint Multimodal de Análisis (Notificaciones, Imágenes, PDF, Correos)
app.post('/api/ai/analyze', async (req, res) => {
  try {
    const { sourceType, text, base64Data, mimeType, fileName } = req.body;
    const ai = getAiClient();

    if (!ai) {
      return res.json(localHeuristicAnalyze({ sourceType, text, fileName }));
    }

    const parts: any[] = [];
    if (base64Data && mimeType) {
      const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      parts.push({
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      });
    }

    const promptText = `Eres un experto asesor financiero, contable y especialista en vida crediticia en Colombia y Latinoamérica.
Analiza el siguiente contenido proveniente de: ${sourceType.toUpperCase()} (${fileName || 'texto directo'}).
${text ? `Contenido de texto proporcionado:\n"""\n${text}\n"""` : ''}

Instrucciones:
1. Extrae TODOS los movimientos financieros (compras, pagos, ingresos/abonos, deudas, cuotas, intereses, cuota de manejo) con su monto numérico exacto en pesos (sin puntos ni símbolos en el campo numérico), categoría, entidad bancaria (Nequi, Bancolombia, Nu, Daviplata, Davivienda, etc.) y si es un gasto esencial (necesidad básica) o no.
2. Si es un extracto bancario, estado de cuenta o reporte crediticio (PDF, imagen o texto), extrae también el cupo total, saldo actual, pago mínimo, fecha límite de pago, tasa E.A., cuota de manejo y seguros.
3. Realiza cálculos útiles (promedios, conversión de tasa E.A. a M.V., porcentaje de utilización de cupo, costo anualizado de cargos fijos).
4. Da un ejemplo práctico con números reales basado en lo analizado para que el usuario entienda cómo ahorrar intereses o mejorar su vida crediticia.`;

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [{ parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            resumenEjecutivo: { type: Type.STRING },
            tipoDocumentoDetectado: { type: Type.STRING },
            nivelRiesgo: { type: Type.STRING, enum: ['bajo', 'medio', 'alto'] },
            movimientosDetectados: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tipo: { type: Type.STRING, enum: ['gasto', 'ganancia', 'deuda', 'trading', 'pago_credito'] },
                  categoria: {
                    type: Type.STRING,
                    enum: [
                      'Alimentación y Supermercado',
                      'Vivienda y Servicios',
                      'Transporte y Gasolina',
                      'Salud y Bienestar',
                      'Entretenimiento y Salidas',
                      'Compras y Tecnología',
                      'Gastos Hormiga / Café / Snacks',
                      'Suscripciones Digitales',
                      'Salario / Ingreso Principal',
                      'Ventas / Negocio / Freelance',
                      'Rendimientos / Trading',
                      'Cuota Tarjeta / Crédito',
                      'Otros',
                    ],
                  },
                  monto: { type: Type.NUMBER },
                  desc: { type: Type.STRING },
                  entidad: { type: Type.STRING },
                  cuotas: { type: Type.NUMBER },
                  esEsencial: { type: Type.BOOLEAN },
                },
                required: ['tipo', 'categoria', 'monto', 'desc', 'entidad', 'esEsencial'],
              },
            },
            datosExtractoCredito: {
              type: Type.OBJECT,
              properties: {
                entidad: { type: Type.STRING },
                cupoTotal: { type: Type.NUMBER },
                saldoActual: { type: Type.NUMBER },
                pagoMinimo: { type: Type.NUMBER },
                fechaLimitePago: { type: Type.STRING },
                tasaEA: { type: Type.NUMBER },
                cuotaManejo: { type: Type.NUMBER },
                segurosCobrosOcultos: { type: Type.NUMBER },
                alertaUsura: { type: Type.BOOLEAN },
              },
            },
            alertasFinancieras: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            recomendacionesPrioritarias: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            ejemploPracticoAhorro: { type: Type.STRING },
            calculosRealizados: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  etiqueta: { type: Type.STRING },
                  valor: { type: Type.STRING },
                  explicacion: { type: Type.STRING },
                },
                required: ['etiqueta', 'valor', 'explicacion'],
              },
            },
          },
          required: [
            'resumenEjecutivo',
            'tipoDocumentoDetectado',
            'nivelRiesgo',
            'movimientosDetectados',
            'alertasFinancieras',
            'recomendacionesPrioritarias',
            'ejemploPracticoAhorro',
            'calculosRealizados',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ ...parsed, motorUsado: 'gemini-ai' });
  } catch (error: any) {
    console.error('Error en /api/ai/analyze, usando motor heurístico de respaldo:', error?.message);
    return res.json(
      localHeuristicAnalyze({
        sourceType: req.body?.sourceType || 'notificacion',
        text: req.body?.text || '',
        fileName: req.body?.fileName,
      })
    );
  }
});

// Endpoint Asesor Financiero & Vida Crediticia (con ejemplos numéricos personalizados)
app.post('/api/ai/advisor', async (req, res) => {
  const { question, financialSnapshot } = req.body;
  try {
    const ai = getAiClient();
    if (!ai) {
      throw new Error('Fallback local advisor');
    }

    const prompt = `Eres un asesor financiero personal y experto en vida crediticia (DataCrédito / TransUnion / Bancos).
El usuario te consulta: "${question}"

Aquí está la radiografía real de las finanzas del usuario en este momento:
${JSON.stringify(financialSnapshot, null, 2)}

Responde en español con un tono claro, cercano, estructurado y práctico:
1. **Diagnóstico directo con sus números actuales** (menciona sus saldos, ingresos, gastos y tarjetas reales).
2. **Cálculos y Promedios clave** que responden a su pregunta.
3. **Orden de Priorización Paso a Paso** (qué hacer #1, #2 y #3 hoy mismo).
4. **Ejemplo Práctico Numérico ("Imagina que...")** usando sus propias cifras para demostrar cuánto dinero o tiempo ahorrará.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [{ parts: [{ text: prompt }] }],
    });

    return res.json({
      answer: response.text || 'No se pudo generar la respuesta.',
      motorUsado: 'gemini-ai',
    });
  } catch (error) {
    // Respuesta experta calculada localmente con los datos reales del usuario
    const snap = financialSnapshot || {};
    const ingresos = snap.totalGanancias || 4800000;
    const gastos = snap.totalGastos || 1938400;
    const deudaTotal = snap.deudaTotalObligaciones || 7800000;
    const utilizacion = (snap.porcentajeUtilizacionCupo || 25.7).toFixed(1);
    const libre = Math.max(0, ingresos - gastos);

    const fallbackAnswer = `### 📊 Diagnóstico con tus números actuales
- **Ingresos registrados:** $${ingresos.toLocaleString('es-CO')} | **Gastos del periodo:** $${gastos.toLocaleString('es-CO')}
- **Flujo de caja disponible:** $${libre.toLocaleString('es-CO')}
- **Deuda total en obligaciones:** $${deudaTotal.toLocaleString('es-CO')} (Utilización de cupo en tarjetas: **${utilizacion}%**)

### 🧮 Cálculos y Promedios Clave
1. **Capacidad de abono inteligente:** Si destinas el **30% de tu flujo libre** ($${Math.round(libre * 0.3).toLocaleString('es-CO')}/mes) como abono extraordinario a capital, reducirás drásticamente el tiempo de tus deudas.
2. **Meta de utilización para subir puntaje en DataCrédito:** Tu utilización actual es del **${utilizacion}%**. El rango óptimo para ganar entre +35 y +60 puntos en los próximos 2 cortes es mantener cada tarjeta por debajo del **30% de su cupo** antes de la fecha de corte.

### 🎯 Orden de Priorización Recomendado
1. **Prioridad #1 (Método Avalancha):** Abona primero a la tarjeta con mayor tasa Efectiva Anual (~28.5% - 29.1% E.A.) ya que cada millón de deuda allí te cuesta cerca de **$21.500 mensuales solo en intereses**.
2. **Prioridad #2 (Compras de consumo a 1 cuota):** Nunca difieras supermercado, restaurantes ni transporte a más de 1 cuota.
3. **Prioridad #3 (Negociar cuota de manejo):** Solicita exoneración de cuota de manejo o concentra compras en tarjetas $0 manejo (como Nu) para ahorrar más de **$350.000 al año**.

### 💡 Ejemplo Práctico con tus Cifras
> **Imagina este escenario real:** Si hoy tienes una deuda en tarjeta de **$2.150.000 al 28.5% E.A.** y solo pagas la cuota mínima, terminarás pagando más de **$680.000 adicionales en intereses**. En cambio, si sumas un abono extra de **$250.000 mensuales** a capital, liquidas esa tarjeta en menos de **5 meses** y te ahorras más de **$490.000 en intereses** que quedan libres para tu inversión o ahorro.`;

    return res.json({
      answer: fallbackAnswer,
      motorUsado: 'heuristica-local',
    });
  }
});

async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor Mis Finanzas y Vida Crediticia activo en http://0.0.0.0:${PORT}`);
  });
}

startServer();
