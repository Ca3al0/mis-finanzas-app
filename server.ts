import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const PORT = 3000;

// Habilitar CORS completo para que el APK instalado en el Samsung Galaxy A36 5G pueda conectarse al motor IA
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '15mb' }));

function getAiClient(customKey?: string): GoogleGenAI | null {
  const apiKey = (customKey && customKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_api_key_here') {
    return null;
  }
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

async function generateContentWithFallback(ai: GoogleGenAI, payload: { contents: any; config: any }) {
  const modelsToTry = ['gemini-3.5-flash', 'gemini-flash-latest'];
  let lastErr: any = null;
  for (const modelName of modelsToTry) {
    try {
      return await ai.models.generateContent({
        model: modelName,
        contents: payload.contents,
        config: payload.config,
      });
    } catch (err: any) {
      lastErr = err;
    }
  }
  throw lastErr;
}

app.get('/api/download-full-app', (_req, res) => {
  try {
    const distAssetsDir = path.resolve(process.cwd(), 'dist/assets');
    if (!fs.existsSync(distAssetsDir)) {
      return res.status(404).json({ error: 'Compilación dist no encontrada' });
    }

    const files = fs.readdirSync(distAssetsDir);
    const cssFile = files.find((f) => f.endsWith('.css'));
    const jsFile = files.find((f) => f.endsWith('.js'));

    const cssContent = cssFile ? fs.readFileSync(path.join(distAssetsDir, cssFile), 'utf-8') : '';
    const jsContent = jsFile ? fs.readFileSync(path.join(distAssetsDir, jsFile), 'utf-8') : '';

    const fullSingleFileHtml = `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#0f172a" />
  <title>Mis Finanzas y Vida Crediticia - Samsung A36 5G</title>
  <style>${cssContent}</style>
</head>
<body class="bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
  <div id="root"></div>
  <script type="module">${jsContent.replace(/<\/script>/gi, '<\\/script>')}</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Mis-Finanzas-Completa-Samsung-A36.html"'
    );
    return res.send(fullSingleFileHtml);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error al empaquetar la app' });
  }
});

// Endpoint Multimodal de Análisis con Gemini (CERO datos inventados)
app.post('/api/ai/analyze', async (req, res) => {
  try {
    const { sourceType, text, base64Data, mimeType, fileName, customApiKey } = req.body;
    const ai = getAiClient(customApiKey);

    if (!ai) {
      return res.status(503).json({ error: 'IA no disponible, usar motor local' });
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

    const promptText = `Eres un analizador financiero exacto. Analiza el siguiente contenido real (${sourceType}: ${fileName || 'texto directo'}).
${text ? `Texto enviado:\n"""\n${text}\n"""` : ''}

REGLA ESTRICTA:
- NO inventes ningún monto ni movimiento que no aparezca explícitamente en la imagen, PDF o texto enviado.
- Extrae cada compra, pago, transferencia, abono, ingreso o cuota real con su monto exacto en número entero.
- Si es un extracto bancario o de tarjeta de crédito, extrae los valores reales de cupo total, saldo/deuda actual, pago mínimo, tasa E.A. y cuota de manejo si aparecen.`;

    parts.push({ text: promptText });

    const response = await generateContentWithFallback(ai, {
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
                      'Ahorro para Meta',
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
    console.error('Error en /api/ai/analyze:', error?.message);
    return res.status(500).json({ error: error?.message || 'Error en análisis IA' });
  }
});

// Endpoint Conversacional Inteligente del Asesor (Responde cualquier pregunta + Ejecuta acciones reales en la app)
app.post('/api/ai/advisor', async (req, res) => {
  const { question, history, financialSnapshot, customApiKey } = req.body;
  try {
    const ai = getAiClient(customApiKey);
    if (!ai) {
      return res.status(503).json({ error: 'IA no disponible' });
    }

    const historyText = Array.isArray(history)
      ? history
          .slice(-8)
          .map((m: any) => `${m.role === 'user' ? 'Usuario' : 'Asesor'}: ${m.content}`)
          .join('\n')
      : '';

    const prompt = `Eres un asesor financiero personal y contable interactivo en Colombia/Latinoamérica, directo, conversacional y muy capaz.
PROHIBIDO responder con plantillas genéricas. Responde SIEMPRE de manera específica y directa a la pregunta, cálculo o solicitud exacta del usuario.

Historial reciente de la conversación:
${historyText}

Estado financiero real actual del usuario en la app:
${JSON.stringify(financialSnapshot, null, 2)}

Mensaje actual del usuario: "${question}"

REGLAS OBLIGATORIAS:
1. Si el usuario hace una pregunta abierta, matemática, de inversión, de compras, de tarjetas, de ahorro o de cualquier tema financiero, respóndele exactamente lo que preguntó con cálculos claros y ejemplos prácticos.
2. Si el usuario dice que quiere registrar o cambiar su salario (ej. "gano 2.800.000", "mi sueldo es 3 millones"), o agregar cosas que paga cada mes (ej. "pago 700.000 de arriendo y 80.000 de internet"), o crear una meta (ej. "quiero ahorrar 4 millones para una moto"), o registrar un gasto/ingreso/deuda, genera los objetos correspondientes en el arreglo "actions" para que la aplicación los guarde de inmediato.
3. Habla de forma natural, clara y útil.`;

    const response = await generateContentWithFallback(ai, {
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: {
              type: Type.STRING,
              description: 'Respuesta conversacional completa, directa y personalizada.',
            },
            actions: {
              type: Type.ARRAY,
              description: 'Acciones automáticas a ejecutar en la app si el usuario pidió registrar salario, pago fijo, meta, movimiento o deuda.',
              items: {
                type: Type.OBJECT,
                properties: {
                  tipoAccion: {
                    type: Type.STRING,
                    enum: [
                      'actualizar_salario',
                      'agregar_pago_fijo',
                      'agregar_meta',
                      'registrar_movimiento',
                      'agregar_deuda',
                    ],
                  },
                  descripcionConfirmacion: { type: Type.STRING },
                  salarioMensualNeto: { type: Type.NUMBER },
                  nombre: { type: Type.STRING },
                  monto: { type: Type.NUMBER },
                  diaVencimiento: { type: Type.NUMBER },
                  plazoMeses: { type: Type.NUMBER },
                  tipoMovimiento: { type: Type.STRING, enum: ['gasto', 'ganancia', 'deuda', 'trading'] },
                  categoria: { type: Type.STRING },
                  entidad: { type: Type.STRING },
                  tasaEA: { type: Type.NUMBER },
                  cupoTotal: { type: Type.NUMBER },
                },
                required: ['tipoAccion', 'descripcionConfirmacion'],
              },
            },
          },
          required: ['answer'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const formattedActions = (parsed.actions || []).map((a: any) => ({
      tipoAccion: a.tipoAccion,
      descripcionConfirmacion: a.descripcionConfirmacion,
      datos: a,
    }));

    return res.json({
      answer: parsed.answer || 'Aquí tienes la respuesta a tu consulta.',
      actions: formattedActions,
      motorUsado: 'gemini-ai',
    });
  } catch (error: any) {
    console.error('Error en /api/ai/advisor:', error?.message);
    return res.status(500).json({ error: error?.message || 'Error en asesor IA' });
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
