import { formatPhoneBrDigits } from '@/lib/brazilInputMasks';
import type { ChatKanbanBoardCard } from '@/services/chatKanban';

/** Rótulo para linha de conversa no seletor do Kanban (evita importar tipos pesados). */
export function pickerConversationLabel(c: {
  displayName?: string | null;
  contactName?: string | null;
  profileName?: string | null;
  phoneNumber?: string | null;
  canonicalPhone?: string | null;
}): string {
  const d = (c.displayName || c.contactName || c.profileName || '').trim();
  if (d) return d;
  const p = c.canonicalPhone || c.phoneNumber;
  if (p?.trim()) return p.trim();
  return 'Conversa';
}

export function pickerConversationPhoneLine(c: {
  phoneNumber?: string | null;
  canonicalPhone?: string | null;
}): string | null {
  const raw = c.canonicalPhone || c.phoneNumber;
  if (!raw?.trim()) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length >= 10 && d.length <= 11) return formatPhoneBrDigits(d);
  if (d.length > 11 && d.startsWith('55')) return `+55 ${formatPhoneBrDigits(d.slice(2, 13))}`;
  return raw.trim();
}

export function kanbanCardTitle(card: ChatKanbanBoardCard): string {
  const d =
    card.conv_display_name?.trim() ||
    card.conv_profile_name?.trim() ||
    card.conv_contact_name?.trim() ||
    '';
  if (d) return d;
  const p = card.conv_canonical_phone || card.conv_phone_number;
  if (p?.trim()) return p.trim();
  return 'Contato';
}

export function kanbanCardPhoneLine(card: ChatKanbanBoardCard): string | null {
  const raw = card.conv_canonical_phone || card.conv_phone_number;
  if (!raw?.trim()) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length >= 10 && d.length <= 11) return formatPhoneBrDigits(d);
  if (d.length > 11 && d.startsWith('55')) return `+55 ${formatPhoneBrDigits(d.slice(2, 13))}`;
  return raw.trim();
}

export function formatKanbanActivity(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = now.getTime() - date.getTime();
  const daysDiff = Math.floor((today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 60_000) return 'agora';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (daysDiff === 0) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (daysDiff === 1) return 'ontem';
  if (daysDiff < 7) return date.toLocaleDateString('pt-BR', { weekday: 'short' });
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function kanbanAttendanceShort(status?: string | null): string | null {
  switch (status) {
    case 'open':
      return 'Aberta';
    case 'pending':
    case 'unassigned':
      return 'Aguardando';
    case 'queued':
      return 'Na fila';
    case 'in_progress':
    case 'in_service':
      return 'Em atendimento';
    case 'waiting_customer':
      return 'Aguardando cliente';
    case 'closed':
      return 'Encerrada';
    case 'archived':
      return 'Arquivada';
    default:
      return null;
  }
}

export function shortOperatorName(display?: string | null): string {
  if (!display?.trim()) return '';
  const first = display.trim().split(/\s+/)[0];
  return first.length > 18 ? `${first.slice(0, 16)}…` : first;
}
