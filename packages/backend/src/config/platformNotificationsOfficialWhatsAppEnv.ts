/**
 * S1 — Allowlist de event_keys que usam API oficial Meta (sem fallback UazAPI).
 * Env: PLATFORM_NOTIFICATIONS_OFFICIAL_WHATSAPP_EVENT_KEYS=platform.billing.charge.created,platform.auth...
 * Valor `*` = todos os eventos platform (usar com cuidado).
 * Vazio / ausente = nenhum (legado UazAPI).
 */
export function getPlatformOfficialWhatsAppEventKeysAllowlist(): string[] | 'all' {
  const raw = (process.env.PLATFORM_NOTIFICATIONS_OFFICIAL_WHATSAPP_EVENT_KEYS || '').trim();
  if (!raw) return [];
  if (raw === '*') return 'all';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isPlatformOfficialWhatsAppEvent(eventKey: string): boolean {
  const list = getPlatformOfficialWhatsAppEventKeysAllowlist();
  if (list === 'all') return true;
  if (list.length === 0) return false;
  return list.includes(eventKey.trim());
}
