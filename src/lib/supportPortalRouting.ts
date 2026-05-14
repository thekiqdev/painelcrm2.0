/**
 * Distingue ticket da plataforma (`/suporte/:uuid`) do portal público do tenant (`/suporte/:slug`).
 */
export function isPlatformSupportTicketPathSegment(segment: string): boolean {
  const s = segment.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
