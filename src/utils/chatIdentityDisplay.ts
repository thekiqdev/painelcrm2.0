import type { ChatConversation } from '@/services/chat';

/** Campos opcionais vindos do CRM (API pode expor além do tipo `Client`). */
export type ChatCrmEntity = {
  name?: string | null;
  avatar_url?: string | null;
  photo?: string | null;
} | null;

function pickCrmPhoto(entity: ChatCrmEntity): string | null {
  if (!entity) return null;
  const a = entity.avatar_url || entity.photo;
  return a && String(a).trim() ? String(a).trim() : null;
}

/** Foto WhatsApp: coluna/API `avatar_url` → normalizeConversation.avatarUrl → metadata. */
function pickWhatsAppPhoto(conv: ChatConversation): string | null {
  if (conv.avatarUrl && String(conv.avatarUrl).trim()) return String(conv.avatarUrl).trim();
  const meta = (conv.metadata || {}) as Record<string, unknown>;
  const fromMeta =
    (typeof meta.whatsapp_profile_photo === 'string' && meta.whatsapp_profile_photo.trim()) ||
    (typeof meta.image === 'string' && meta.image.trim()) ||
    (typeof meta.imagePreview === 'string' && meta.imagePreview.trim()) ||
    (typeof meta.image_preview === 'string' && meta.image_preview.trim()) ||
    null;
  return fromMeta || null;
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

  const crmPhoto = conv.client_id ? pickCrmPhoto(client) : conv.leadId ? pickCrmPhoto(lead) : null;
  const waPhoto = pickWhatsAppPhoto(conv);
  const avatarUrl = crmPhoto || waPhoto || null;

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
  const wa = whatsappFallbackUrl?.trim() || null;
  if (wa) {
    return { src: wa, isWhatsappFallback: true, initials };
  }
  return { src: null, isWhatsappFallback: false, initials };
}
