/**
 * Em desenvolvimento: base URL da API.
 * - '' → mesmo origin que o Vite; `/api` e `/socket.io` são proxied para o backend (vite.config.ts).
 * - Evita `VITE_API_URL=http://localhost:3002` quando o Vite também está na 3002 (pedidos iam para o próprio Vite → 404).
 */
export function getDevApiBaseUrl(): string {
  if (!import.meta.env.DEV) return '';
  if (import.meta.env.VITE_API_USE_PROXY === 'true') return '';

  const raw = import.meta.env.VITE_API_URL?.trim() ?? '';
  if (!raw) return '';
  if (typeof window === 'undefined') return raw;

  try {
    const u = new URL(raw);
    const loc = window.location;
    const defPort = (protocol: string) => (protocol === 'https:' ? '443' : '80');
    const apiPort = u.port || defPort(u.protocol);
    const locPort = loc.port || defPort(loc.protocol);
    if (u.hostname === loc.hostname && apiPort === locPort) {
      console.warn(
        '[PainelCRM] VITE_API_URL usa a mesma origem que o Vite; API passará por /api (proxy). Defina API em outra porta ou use VITE_API_USE_PROXY=true.',
      );
      return '';
    }
    const proxyTarget = import.meta.env.VITE_API_PROXY_TARGET?.trim() ?? 'http://127.0.0.1:3001';
    const proxyPort = new URL(proxyTarget).port || '3001';
    if (apiPort === '3002' && proxyPort === '3001' && u.hostname === 'localhost') {
      console.warn(
        '[PainelCRM] VITE_API_URL aponta para :3002 mas VITE_API_PROXY_TARGET usa :3001. ' +
          'Se o backend está na 3001, use VITE_API_URL=http://127.0.0.1:3001 ou deixe VITE_API_URL vazio (proxy /api).',
      );
    }
  } catch {
    return raw;
  }
  return raw;
}
