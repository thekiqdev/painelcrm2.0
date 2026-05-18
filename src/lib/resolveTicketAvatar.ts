import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';

export type TicketAvatarFields = {
  client_avatar?: string | null;
  lead_avatar?: string | null;
};

/** Prioridade: avatar do cliente, depois do lead; null se nenhum. */
export function resolveTicketAvatar(ticket: TicketAvatarFields): string | null {
  for (const raw of [ticket.client_avatar, ticket.lead_avatar]) {
    const s = raw != null && String(raw).trim() ? String(raw).trim() : '';
    const url = chatAvatarUrlForImgSrc(s || null);
    if (url) return url;
  }
  return null;
}

export function ticketEntityInitials(ticket: {
  client_name?: string | null;
  lead_name?: string | null;
  contact_name?: string | null;
}): string {
  const name =
    ticket.client_name?.trim() ||
    ticket.lead_name?.trim() ||
    ticket.contact_name?.trim() ||
    '?';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}
