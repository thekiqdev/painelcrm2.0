import type { ChatConversation } from '@/services/chat';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import { chatAvatarDebugLog, isChatAvatarDebugEnabled } from '@/lib/chatAvatarDebug';
import { chatMediaDebugLog } from '@/lib/chatMediaDebug';

/** Campos opcionais vindos do CRM (API pode expor além do tipo `Client`). */
export type ChatCrmEntity = {
  name?: string | null;
  avatar_url?: string | null;
  photo?: string | null;
  whatsapp_avatar_url?: string | null;
} | null;

/** Cadastro CRM (perfil): avatar_url → photo → whatsapp_avatar_url */
function pickCrmPhoto(entity: ChatCrmEntity): string | null {
  if (!entity) return null;
  const order = [entity.avatar_url, entity.photo, entity.whatsapp_avatar_url];
  for (const a of order) {
    const s = a != null && String(a).trim() ? String(a).trim() : '';
    const u = chatAvatarUrlForImgSrc(s || null);
    if (u) return u;
  }
  return null;
}

/** CRM legado: foto de cadastro (não prioriza whatsapp_avatar_url — essa entra antes na cadeia principal). */
function pickCrmLegacyPhoto(client: ChatCrmEntity, lead: ChatCrmEntity, conv: ChatConversation): string | null {
  const entity = conv.client_id ? client : conv.leadId ? lead : null;
  if (!entity) return null;
  for (const k of ['avatar_url', 'photo'] as const) {
    const raw = entity[k];
    const s = raw != null && String(raw).trim() ? String(raw).trim() : '';
    const u = chatAvatarUrlForImgSrc(s || null);
    if (u) return u;
  }
  return null;
}

function pickCrmWhatsappAvatar(client: ChatCrmEntity, lead: ChatCrmEntity, conv: ChatConversation): string | null {
  const entity = conv.client_id ? client : conv.leadId ? lead : null;
  if (!entity) return null;
  const w = entity.whatsapp_avatar_url;
  const s = w != null && String(w).trim() ? String(w).trim() : '';
  return chatAvatarUrlForImgSrc(s || null);
}

function firstMetaAvatarUrl(
  meta: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === 'string' && v.trim()) {
      const u = chatAvatarUrlForImgSrc(v.trim());
      if (u) return u;
    }
  }
  return null;
}

/** Metadados “resto” / legado (imagem agregada na conversa + campos típicos Uaz). */
function pickConversationMetaFallback(conv: ChatConversation): string | null {
  const meta = (conv.metadata || {}) as Record<string, unknown>;
  const fromMeta = firstMetaAvatarUrl(meta, [
    'whatsapp_profile_photo',
    'image',
    'imagePreview',
    'image_preview',
  ]);
  if (fromMeta) return fromMeta;
  const merged =
    conv.avatarUrl && String(conv.avatarUrl).trim() ? String(conv.avatarUrl).trim() : null;
  return chatAvatarUrlForImgSrc(merged);
}

function firstNonEmpty(...vals: (string | null | undefined)[]): string {
  for (const v of vals) {
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

/** Formatação leve para exibição (mantém dígitos e máscara simples BR quando possível). */
/**
 * Linha secundária padrão em listas/seletores: telefone formatado → e-mail → empresa.
 */
export function formatCrmIdentitySecondaryLine(entity: {
  phone?: string | null;
  email?: string | null;
  company?: string | null;
}): string {
  const phone = formatChatPhoneLine(entity.phone);
  if (phone) return phone;
  const e = entity.email?.trim();
  if (e) return e;
  const c = entity.company?.trim();
  if (c) return c;
  return '—';
}

export function formatChatPhoneLine(phone: string | null | undefined): string {
  if (!phone?.trim()) return '';
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    const d = digits.slice(1);
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (digits.length === 13 && digits.startsWith('55')) {
    const d = digits.slice(2);
    if (d.length === 11) {
      return `+55 (${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

export type ResolvedChatIdentity = {
  displayName: string;
  phoneLine: string;
  avatarUrl: string | null;
  initials: string;
  /** Nome de exibição WhatsApp quando diferente do CRM (opcional). */
  waSubtitle: string | null;
};

/**
 * Regra única: nome (cliente → lead → contact/profile → telefone formatado → id);
 * avatar: CRM → WhatsApp → placeholder (via initials).
 */
export function resolveConversationIdentity(
  conversation: ChatConversation,
  client: ChatCrmEntity,
  lead: ChatCrmEntity
): ResolvedChatIdentity {
  const conv = conversation;
  const phoneLine = formatChatPhoneLine(conv.phoneNumber);

  let displayName = '';
  let waSubtitle: string | null = null;

  const waName = firstNonEmpty(conv.displayName, conv.contactName, conv.profileName);

  if (conv.client_id && client?.name) {
    displayName = String(client.name).trim();
    if (waName && waName !== displayName) waSubtitle = waName;
  } else if (conv.client_id) {
    displayName = firstNonEmpty(waName, phoneLine, conv.external_chat_id) || 'Cliente';
  } else if (conv.leadId && lead?.name) {
    displayName = String(lead.name).trim();
    if (waName && waName !== displayName) waSubtitle = waName;
  } else if (conv.leadId) {
    displayName = firstNonEmpty(waName, phoneLine, conv.external_chat_id) || 'Lead';
  } else {
    displayName =
      firstNonEmpty(waName, phoneLine, conv.external_chat_id) || '?';
  }

  /**
   * Prioridade:
   * 1) coluna avatar da conversa (contact)
   * 2) communication_contacts.profile_avatar_url (API: communication_avatar_url)
   * 3) client | lead whatsapp_avatar_url
   * 4) metadata.profile_picture_url
   * 5) CRM avatar_url / photo (cadastro)
   * 6) metadata / avatarUrl agregado (legado)
   * Não usar nome da instância como rosto do contacto.
   */
  const meta = (conv.metadata || {}) as Record<string, unknown>;
  const fromConvColumn = chatAvatarUrlForImgSrc(
    (conv.avatar_url && String(conv.avatar_url).trim()) || null,
  );
  const fromComm = chatAvatarUrlForImgSrc(
    (conv.communication_avatar_url && String(conv.communication_avatar_url).trim()) || null,
  );
  const fromCrmWa = pickCrmWhatsappAvatar(client, lead, conv);
  const fromMetaProfile = firstMetaAvatarUrl(meta, [
    'profile_picture_url',
    'profilePictureUrl',
    'profilePicture',
  ]);
  const fromCrmLegacy = pickCrmLegacyPhoto(client, lead, conv);
  const fromMetaFallback = pickConversationMetaFallback(conv);

  const avatarUrl =
    fromConvColumn ||
    fromComm ||
    fromCrmWa ||
    fromMetaProfile ||
    fromCrmLegacy ||
    fromMetaFallback ||
    null;

  if (isChatAvatarDebugEnabled()) {
    const pickOrder = [
      fromConvColumn && 'fromConvColumn',
      fromComm && 'fromComm',
      fromCrmWa && 'fromCrmWa',
      fromMetaProfile && 'fromMetaProfile',
      fromCrmLegacy && 'fromCrmLegacy',
      fromMetaFallback && 'fromMetaFallback',
    ].filter(Boolean);
    chatAvatarDebugLog('resolveConversationIdentity', {
      conversationId: conv.id,
      picked: pickOrder[0] ?? null,
      finalAvatarPrefix:
        avatarUrl && avatarUrl.length > 120 ? `${avatarUrl.slice(0, 120)}…` : avatarUrl,
      conv_avatar_url_column: conv.avatar_url ?? null,
      conv_communication_avatar_url: conv.communication_avatar_url ?? null,
    });
  }

  if (!avatarUrl) {
    chatMediaDebugLog('chat_avatar_missing', {
      conversationId: conv.id,
      hasClient: !!conv.client_id,
      hasLead: !!conv.leadId,
    });
  }

  const initials = (displayName.charAt(0) || '?').toUpperCase();

  return {
    displayName,
    phoneLine,
    avatarUrl,
    initials,
    waSubtitle,
  };
}

export type ProfileAvatarResolution = {
  src: string | null;
  isWhatsappFallback: boolean;
  initials: string;
};

/**
 * Perfil CRM (cliente/lead): foto do cadastro → foto WhatsApp (metadata) → placeholder (iniciais).
 * Não altera dados persistidos; alinha regra ao chat.
 */
export function resolveProfileAvatarUrl(
  entity: { name?: string | null; avatar_url?: string | null; photo?: string | null } | null,
  whatsappFallbackUrl: string | null
): ProfileAvatarResolution {
  const crm = pickCrmPhoto(entity as ChatCrmEntity);
  const initials = (entity?.name?.trim() || '?').charAt(0).toUpperCase();
  if (crm) {
    return { src: crm, isWhatsappFallback: false, initials };
  }
  const wa = chatAvatarUrlForImgSrc(whatsappFallbackUrl?.trim() || null);
  if (wa) {
    return { src: wa, isWhatsappFallback: true, initials };
  }
  return { src: null, isWhatsappFallback: false, initials };
}
