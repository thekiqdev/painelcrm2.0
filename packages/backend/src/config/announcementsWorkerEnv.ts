/** MB-017 — intervalo do worker de envio de anúncios. */

/** Default 15s (antes 4s). Mínimo 2s. */
export function getAnnouncementsSendPollMs(): number {
  return Math.max(2000, parseInt(process.env.ANNOUNCEMENTS_SEND_POLL_MS || '15000', 10));
}
