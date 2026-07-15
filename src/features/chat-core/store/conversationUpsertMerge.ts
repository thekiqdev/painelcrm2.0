/**
 * TF3.2 — merge de upsert full no Domain Store.
 * Payload WS magro não pode apagar avatar/caches que a inbox já hidratou.
 */

import type { ChatDomainConversation } from '../domain/types';

const AVATAR_RAW_KEYS = [
  'avatarUrl',
  'avatar_url',
  'final_avatar_url',
  'avatar_cached_url',
  'client_whatsapp_avatar_url',
  'lead_whatsapp_avatar_url',
  'client_whatsapp_avatar_cached_url',
  'lead_whatsapp_avatar_cached_url',
  'communication_avatar_url',
  'communication_avatar_cached_url',
  'image',
  'image_preview',
  'imagePreview',
] as const;

const META_AVATAR_KEYS = ['whatsapp_profile_photo', 'image', 'image_preview', 'imagePreview'] as const;

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function mergeAvatarRaw(
  existingRaw: Record<string, unknown>,
  incomingRaw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existingRaw, ...incomingRaw };
  for (const key of AVATAR_RAW_KEYS) {
    const next = nonEmptyString(incomingRaw[key]);
    if (next) {
      out[key] = next;
      continue;
    }
    const prev = existingRaw[key];
    if (prev != null && prev !== '') out[key] = prev;
  }

  const existingMeta =
    existingRaw.metadata && typeof existingRaw.metadata === 'object'
      ? (existingRaw.metadata as Record<string, unknown>)
      : null;
  const incomingMeta =
    incomingRaw.metadata && typeof incomingRaw.metadata === 'object'
      ? (incomingRaw.metadata as Record<string, unknown>)
      : null;
  if (existingMeta || incomingMeta) {
    const meta: Record<string, unknown> = { ...(existingMeta ?? {}), ...(incomingMeta ?? {}) };
    for (const key of META_AVATAR_KEYS) {
      const next = nonEmptyString(incomingMeta?.[key]);
      if (next) {
        meta[key] = next;
        continue;
      }
      const prev = existingMeta?.[key];
      if (prev != null && prev !== '') meta[key] = prev;
    }
    out.metadata = meta;
  }
  return out;
}

/**
 * Upsert full: incoming ganha em preview/unread/CRM quando vem preenchido;
 * avatar/caches só sobrescrevem se o incoming trouxer URL não-vazia.
 */
export function mergeDomainConversationFullUpsert(
  existing: ChatDomainConversation,
  incoming: ChatDomainConversation,
): ChatDomainConversation {
  const existingRaw =
    existing.raw && typeof existing.raw === 'object'
      ? (existing.raw as Record<string, unknown>)
      : {};
  const incomingRaw =
    incoming.raw && typeof incoming.raw === 'object'
      ? (incoming.raw as Record<string, unknown>)
      : {};

  return {
    ...existing,
    ...incoming,
    instanceId: incoming.instanceId ?? existing.instanceId,
    contactName: incoming.contactName ?? existing.contactName,
    phoneNumber: incoming.phoneNumber ?? existing.phoneNumber,
    attendanceStatus: incoming.attendanceStatus ?? existing.attendanceStatus,
    assignedToUserId: incoming.assignedToUserId ?? existing.assignedToUserId,
    clientId: incoming.clientId ?? existing.clientId,
    leadId: incoming.leadId ?? existing.leadId,
    conversationType: incoming.conversationType ?? existing.conversationType,
    waArchived:
      typeof incoming.waArchived === 'boolean' ? incoming.waArchived : existing.waArchived,
    lastMessagePreview: incoming.lastMessagePreview ?? existing.lastMessagePreview,
    lastMessageAt: incoming.lastMessageAt ?? existing.lastMessageAt,
    unreadCount: incoming.unreadCount ?? existing.unreadCount,
    raw: mergeAvatarRaw(existingRaw, incomingRaw),
  };
}
