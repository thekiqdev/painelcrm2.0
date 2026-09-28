import { randomUUID } from 'crypto';
import type { MediaOwnerType, MediaScope } from './mediaTypes.js';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

const ALLOWED_SCOPES = new Set<MediaScope>([
  'whatsapp_avatar',
  'user_avatar',
  'tenant_logo',
  'store_logo',
  'product_image',
  'library',
  'chat_attachment',
  'contract_document',
  'invoice_document',
  'flow_inbound_temp',
]);

const ALLOWED_OWNER_TYPES = new Set<MediaOwnerType>([
  'conversation',
  'client',
  'lead',
  'user',
  'tenant',
  'store',
  'product',
  'chat_message',
  'contract',
  'invoice',
  'unassigned',
]);

function sanitizeSegment(input: string): string {
  const s = String(input || '').trim();
  if (!s) return 'unassigned';
  if (s.includes('..') || s.includes('/') || s.includes('\\')) {
    throw new Error('Segmento inválido para storage key.');
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function extensionFromMime(mimeType?: string | null, originalFilename?: string | null): string {
  const byMime = mimeType ? EXT_BY_MIME[mimeType.toLowerCase()] : '';
  if (byMime) return byMime;

  const fromName = String(originalFilename || '')
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (fromName && fromName.length <= 8) return fromName;
  return 'bin';
}

export function buildMediaStorageKey(input: {
  tenantId: string;
  scope: MediaScope;
  ownerType: MediaOwnerType;
  ownerId?: string | null;
  mimeType?: string | null;
  originalFilename?: string | null;
}): string {
  const tenantId = sanitizeSegment(input.tenantId);
  if (!ALLOWED_SCOPES.has(input.scope)) throw new Error('scope inválido.');
  if (!ALLOWED_OWNER_TYPES.has(input.ownerType)) throw new Error('ownerType inválido.');
  const scope = sanitizeSegment(input.scope);
  const ownerType = sanitizeSegment(input.ownerType);
  const ownerId = sanitizeSegment(input.ownerId || 'unassigned');
  const ext = extensionFromMime(input.mimeType, input.originalFilename);
  const fileName = `${randomUUID()}.${ext}`;
  return `tenants/${tenantId}/${scope}/${ownerType}/${ownerId}/${fileName}`;
}
