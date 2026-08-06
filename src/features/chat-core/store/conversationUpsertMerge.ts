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

const ASSIGNEE_RAW_KEYS = [
  'assigned_to_user_id',
  'assignee_email',
  'assignee_display',
  'assignee_avatar_url',
] as const;

function mergeAvatarRaw(
  existingRaw: Record<string, unknown>,
  incomingRaw: Record<string, unknown>,
): Record<string, unknown> {
  const lean = Boolean(incomingRaw.__leanRealtimePatch);
  const out: Record<string, unknown> = { ...existingRaw, ...incomingRaw };

  if (lean) {
    // Lean bump não deve apagar assignee hidratado na inbox.
    for (const key of ASSIGNEE_RAW_KEYS) {
      if (!(key in incomingRaw) || incomingRaw[key] == null) {
        const prev = existingRaw[key];
        if (prev != null && prev !== '') out[key] = prev;
      }
    }
  } else if (
    Object.prototype.hasOwnProperty.call(incomingRaw, 'assigned_to_user_id') &&
    (incomingRaw.assigned_to_user_id === null || incomingRaw.assigned_to_user_id === '')
  ) {
    out.assigned_to_user_id = null;
    out.assignee_email = null;
    out.assignee_display = null;
    out.assignee_avatar_url = null;
  } else {
    for (const key of ASSIGNEE_RAW_KEYS) {
      const next = incomingRaw[key];
      if (typeof next === 'string' && next.trim()) {
        out[key] = next;
        continue;
      }
      if (next == null || next === '') {
        const prev = existingRaw[key];
        if (prev != null && prev !== '') out[key] = prev;
      }
    }
  }

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

  const lean = Boolean(incomingRaw.__leanRealtimePatch);
  const explicitUnassign =
    !lean &&
    Object.prototype.hasOwnProperty.call(incomingRaw, 'assigned_to_user_id') &&
    (incomingRaw.assigned_to_user_id === null || incomingRaw.assigned_to_user_id === '');

  let assignedToUserId = existing.assignedToUserId;
  if (lean) {
    assignedToUserId = existing.assignedToUserId;
  } else if (explicitUnassign) {
    assignedToUserId = null;
  } else if (incoming.assignedToUserId) {
    assignedToUserId = incoming.assignedToUserId;
  } else if (incoming.assignedToUserId === null && incomingRaw.last_assignment_reason) {
    assignedToUserId = null;
  } else {
    assignedToUserId = incoming.assignedToUserId ?? existing.assignedToUserId;
  }

  return {
    ...existing,
    ...incoming,
    instanceId: incoming.instanceId ?? existing.instanceId,
    contactName: incoming.contactName ?? existing.contactName,
    phoneNumber: incoming.phoneNumber ?? existing.phoneNumber,
    attendanceStatus: incoming.attendanceStatus ?? existing.attendanceStatus,
    assignedToUserId,
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
