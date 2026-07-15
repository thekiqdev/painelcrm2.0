import type {
  ChatConversation,
  ChatInstance,
  ChatMessage,
  ChatInternalComment,
} from '@/services/chat';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import { formatPhoneBrDigits } from '@/lib/brazilInputMasks';

export const formatHour = (value?: string | null) => {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Preview de notas CRM no painel lateral (inclui deep link para conversa). */
export type CrmNotePreviewRow = {
  id: string;
  note_text: string;
  created_at: string;
  conversation_id: string | null;
  message_id: string | null;
  source_comment_id: string | null;
};

export function mapCrmNoteToPreview(n: Record<string, unknown>): CrmNotePreviewRow {
  return {
    id: String(n.id ?? ''),
    note_text: String(n.note_text ?? ''),
    created_at: String(n.created_at ?? ''),
    conversation_id: n.conversation_id != null ? String(n.conversation_id) : null,
    message_id: n.message_id != null ? String(n.message_id) : null,
    source_comment_id: n.source_comment_id != null ? String(n.source_comment_id) : null,
  };
}

/** Instâncias ativas no chat (`metadata.enabled_in_chat !== false`). */
export function pickEnabledChatInstanceIds(instances: ChatInstance[]): string[] {
  return instances
    .filter(
      (inst) =>
        (inst.metadata as Record<string, unknown> | null | undefined)?.enabled_in_chat !== false,
    )
    .map((inst) => inst.id);
}

export function mergeInternalCommentIntoMessage(m: ChatMessage, c: ChatInternalComment): ChatMessage {
  const ex = m.internal_comments ?? [];
  if (ex.some((x) => x.id === c.id)) return m;
  const next = [...ex, c].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return {
    ...m,
    internal_comments: next,
    internal_comment_count: next.length,
  };
}

export const formatRelativeDate = (value?: string | null) => {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = now.getTime() - date.getTime();
  const daysDiff = Math.floor((today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24));

  // Menos de 1 minuto
  if (diff < 60_000) return 'Agora mesmo';
  
  // Menos de 1 hora
  if (diff < 3_600_000) {
    const minutes = Math.floor(diff / 60_000);
    return `${minutes} min atrás`;
  }
  
  // Hoje
  if (daysDiff === 0) {
    return `Hoje ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  // Ontem
  if (daysDiff === 1) {
    return `Ontem ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  // Esta semana (últimos 7 dias)
  if (daysDiff < 7) {
    return date.toLocaleDateString('pt-BR', { 
      weekday: 'short', 
      day: '2-digit', 
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Este ano
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Outro ano
  return date.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/** Etapa 5 — rótulo curto para badge de atendimento (evita confundir com `status` da conversa Uaz). */
/** Compat: backend Fase 5 usa `in_progress`; valores antigos `in_service`. */
export const attendanceIsInProgress = (s?: string | null) => s === 'in_progress' || s === 'in_service';

export const attendanceStatusLabel = (s?: string | null) => {
  switch (s) {
    case 'open':
    case 'pending':
      return 'Aberto';
    case 'unassigned':
      return 'Sem resp.';
    case 'queued':
      return 'Na fila';
    case 'in_progress':
    case 'in_service':
      return 'Em atendimento';
    case 'waiting_customer':
      return 'Aguardando';
    case 'closed':
      return 'Encerrada';
    case 'archived':
      return 'Arquivada';
    default:
      return null;
  }
};

/** Nome curto do operador (lista / cabeçalho). */
export const shortOperatorName = (display?: string | null) => {
  if (!display?.trim()) return '';
  const first = display.trim().split(/\s+/)[0];
  return first.length > 18 ? `${first.slice(0, 16)}…` : first;
};

function readInstanceMetaString(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = metadata?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** Telefone da linha conectada formatado (BR; inclui +55 quando o metadata traz código do país). */
function formatConnectedPhoneForDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '');
  if (d.length === 0) return '';
  if (d.length > 11 && d.startsWith('55')) {
    const local = d.slice(2, 13);
    const formatted = formatPhoneBrDigits(local);
    return formatted ? `+55 ${formatted}` : `+${d}`;
  }
  if (d.length <= 11) {
    return formatPhoneBrDigits(d);
  }
  return `+${d}`;
}

export function resolveInstanceConnectionUi(instance: ChatInstance | null): {
  avatarUrl: string | null;
  displayName: string;
  phoneDisplay: string;
} {
  if (!instance) {
    return { avatarUrl: null, displayName: 'Selecione uma instância', phoneDisplay: '' };
  }
  const m = instance.metadata as Record<string, unknown> | null | undefined;
  const pic = readInstanceMetaString(m, [
    'connectedProfilePicUrl',
    'connected_profile_pic_url',
    'profilePicUrl',
    'whatsapp_profile_photo',
  ]);
  const name =
    readInstanceMetaString(m, ['connectedProfileName', 'connected_profile_name', 'profileName']) ||
    instance.external_instance_name ||
    instance.name;
  const phoneRaw = readInstanceMetaString(m, ['connectedPhone', 'connected_phone', 'phone']);
  return {
    avatarUrl: chatAvatarUrlForImgSrc(pic),
    displayName: name,
    phoneDisplay: formatConnectedPhoneForDisplay(phoneRaw || ''),
  };
}

export const CHAT_COMPOSER_MAX_HEIGHT_PX = 120;

/** Eventos realtime enviam payloads parciais — não apagar `instance_id` / vínculos quando o patch vem sem esses campos. */
export function mergeChatConversationRealtimePatch(
  prev: ChatConversation,
  incoming: ChatConversation,
): ChatConversation {
  return {
    ...prev,
    ...incoming,
    instance_id: incoming.instance_id ?? prev.instance_id ?? null,
    whatsapp_official_account_id:
      incoming.whatsapp_official_account_id ?? prev.whatsapp_official_account_id ?? null,
    client_id: incoming.client_id ?? prev.client_id ?? null,
    leadId: incoming.leadId ?? prev.leadId ?? null,
    external_chat_id: incoming.external_chat_id || prev.external_chat_id,
    phoneNumber: incoming.phoneNumber ?? prev.phoneNumber,
    canonicalPhone: incoming.canonicalPhone ?? prev.canonicalPhone,
    canonical_phone: incoming.canonical_phone ?? prev.canonical_phone,
    conversation_type: incoming.conversation_type ?? prev.conversation_type,
    provider: incoming.provider || prev.provider,
    contactName: incoming.contactName ?? prev.contactName ?? null,
    profileName: incoming.profileName ?? prev.profileName ?? null,
    displayName: incoming.displayName ?? prev.displayName ?? null,
    display_name: incoming.display_name ?? prev.display_name ?? null,
    avatarUrl: incoming.avatarUrl ?? prev.avatarUrl ?? null,
    avatar_url: incoming.avatar_url ?? prev.avatar_url ?? null,
    final_avatar_url: incoming.final_avatar_url ?? prev.final_avatar_url ?? null,
    avatar_cached_url: incoming.avatar_cached_url ?? prev.avatar_cached_url ?? null,
    tags: incoming.tags !== undefined ? incoming.tags : prev.tags,
    metadata: incoming.metadata !== undefined ? incoming.metadata : prev.metadata,
  };
}

/** Cabeçalho da thread: pills de tags Kanban, + (lista / criar) e nome do operador. */
