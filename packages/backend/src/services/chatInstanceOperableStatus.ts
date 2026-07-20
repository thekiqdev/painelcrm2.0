/**
 * Critério alinhado ao chat UI (`connected` | `open`) para envio WhatsApp.
 * Fonte única de “instância operable” para motor de notificações e resolve de remetente.
 */

export function isChatInstanceStatusOperable(status: string | null | undefined): boolean {
  const s = String(status ?? '')
    .toLowerCase()
    .trim();
  return s === 'connected' || s === 'open';
}

/** SQL fragment: column alias `i` assumed. */
export const CHAT_INSTANCE_OPERABLE_STATUS_SQL = `i.status IN ('connected', 'open')`;

/**
 * Normaliza payload de GET /instance/status (UazAPI) para o valor persistido em chat_instances.status.
 * Espelha a lógica de getInstanceStatus no chatController.
 */
export function mapUazStatusPayloadToDbStatus(result: unknown, fallbackStatus: string): string {
  const r = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
  const instanceRaw = r.instance;
  const instanceData =
    instanceRaw && typeof instanceRaw === 'object' ? (instanceRaw as Record<string, unknown>) : r;

  const newStatus = String(instanceData.state ?? instanceData.status ?? r.status ?? '')
    .toLowerCase()
    .trim();
  const connected = r.connected === true || instanceData.connected === true;
  const loggedIn = r.loggedIn === true || instanceData.loggedIn === true;

  if (newStatus === 'open' || newStatus === 'connected' || connected || loggedIn) {
    return 'connected';
  }
  if (newStatus === 'connecting') return 'connecting';
  if (newStatus) return newStatus;
  return fallbackStatus;
}

/** 503 / mensagem típica quando a sessão WhatsApp na Uaz está offline. */
export function isUazWhatsAppDisconnectedSignal(message: string, httpStatus?: number | null): boolean {
  const m = String(message ?? '').toLowerCase();
  if (m.includes('whatsapp disconnected')) return true;
  if (httpStatus === 503 && m.includes('disconnect')) return true;
  return false;
}
