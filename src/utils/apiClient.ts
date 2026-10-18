// URL del servidor en la nube para que el APK instalado en el Samsung Galaxy A36 5G
// también pueda usar el motor Gemini 3.5 Flash cuando tenga datos o Wi-Fi.
const CLOUD_BACKEND_URL = 'https://ais-pre-4s6kjtsko5cj52axuli7l3-147664983550.us-west2.run.app';

export async function callBackendApi<T>(endpoint: string, payload: unknown, timeoutMs = 40000): Promise<T> {
  const isLocalWebServer =
    typeof window !== 'undefined' &&
    (window.location.hostname.includes('run.app') || window.location.port === '3000');

  const urlsToTry = isLocalWebServer
    ? [endpoint, `${CLOUD_BACKEND_URL}${endpoint}`]
    : [`${CLOUD_BACKEND_URL}${endpoint}`, endpoint];

  let lastError: Error | null = null;

  for (const url of urlsToTry) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        return (await response.json()) as T;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;
    }
  }

  throw lastError || new Error('No se pudo conectar al servidor IA');
}
