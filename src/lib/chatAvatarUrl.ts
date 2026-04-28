/**
 * URLs de mídia em domínios WhatsApp/Meta costumam devolver 403 no browser (anti-hotlink),
 * mesmo com referrerPolicy no-referrer. Não usar em <img src> — mostrar iniciais ou foto CRM.
 */
export function isWhatsappCdnBlockedInBrowser(url: string | null | undefined): boolean {
  if (url == null || typeof url !== 'string') return false;
  const s = url.trim();
  if (!s) return false;
  try {
    const host = new URL(s).hostname.toLowerCase();
    return host === 'whatsapp.net' || host.endsWith('.whatsapp.net');
  } catch {
    return false;
  }
}

/** URL segura para AvatarImage / <img>; null se for CDN WhatsApp ou inválida. */
export function chatAvatarUrlForImgSrc(url: string | null | undefined): string | null {
  if (url == null || typeof url !== 'string') return null;
  const t = url.trim();
  if (!t) return null;
  if (isWhatsappCdnBlockedInBrowser(t)) return null;
  return t;
}
