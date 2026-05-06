import type { CatalogMediaScope } from '../catalogMediaUploadService.js';
import {
  getScopeFromCatalogMediaKey,
  isCatalogMediaKeyOwnedByTenantUser,
  unlinkCatalogMediaRelativeKey,
} from '../catalogMediaUploadService.js';
import { extractCatalogMediaRelativeKeyFromStoredUrl } from '../../utils/catalogMediaPublicSignedUrl.js';
import { deleteFile } from './mediaLocalStorageAdapter.js';
import { saveFromBuffer } from './mediaService.js';
import type { MediaOwnerType, MediaScope } from './mediaTypes.js';
import { extractMediaStorageKeyFromStoredUrl } from './mediaUrlSigner.js';

const SIMPLE_MEDIA_SCOPES = new Set(['user_avatar', 'tenant_logo', 'store_logo']);

export function parseMediaServiceSimpleStorageKey(key: string): {
  tenantSegment: string;
  scope: string;
  ownerType: string;
  ownerId: string;
} | null {
  const parts = key.split('/').filter(Boolean);
  if (parts.length < 6 || parts[0] !== 'tenants') return null;
  const scope = parts[2];
  if (!SIMPLE_MEDIA_SCOPES.has(scope)) return null;
  return {
    tenantSegment: parts[1],
    scope,
    ownerType: parts[3],
    ownerId: parts[4],
  };
}

export function isMediaSimpleUploadOwnedBy(
  key: string,
  ctx: { tenantSegment: string; tenantUuid: string | null; userId: string },
): boolean {
  const p = parseMediaServiceSimpleStorageKey(key);
  if (!p) return false;
  if (p.tenantSegment !== ctx.tenantSegment) return false;
  if (p.scope === 'user_avatar') {
    return p.ownerType === 'user' && p.ownerId === ctx.userId;
  }
  if (p.scope === 'store_logo') {
    return p.ownerType === 'user' && p.ownerId === ctx.userId;
  }
  if (p.scope === 'tenant_logo') {
    return p.ownerType === 'tenant' && ctx.tenantUuid != null && p.ownerId === ctx.tenantUuid;
  }
  return false;
}

function catalogScopeMatchesMediaKey(mediaKey: string, catalogScope: CatalogMediaScope): boolean {
  const p = parseMediaServiceSimpleStorageKey(mediaKey);
  if (!p) return false;
  if (catalogScope === 'user_avatar') return p.scope === 'user_avatar';
  if (catalogScope === 'store_logo') return p.scope === 'store_logo';
  if (catalogScope === 'tenant_logo_light' || catalogScope === 'tenant_logo_dark') {
    return p.scope === 'tenant_logo';
  }
  return false;
}

export async function saveSimpleUploadFromBuffer(input: {
  tenantSegment: string;
  tenantUuid: string | null;
  userId: string;
  catalogScope: 'user_avatar' | 'tenant_logo_light' | 'tenant_logo_dark' | 'store_logo';
  buffer: Buffer;
  mimeType: string;
  originalFilename?: string | null;
}): Promise<{ relativeUrl: string; storageKey: string }> {
  const tid = input.tenantSegment;
  let scope: MediaScope;
  let ownerType: MediaOwnerType;
  let ownerId: string | null | undefined;
  let metadata: Record<string, unknown> | undefined;

  switch (input.catalogScope) {
    case 'user_avatar':
      scope = 'user_avatar';
      ownerType = 'user';
      ownerId = input.userId;
      break;
    case 'tenant_logo_light':
      scope = 'tenant_logo';
      ownerType = 'tenant';
      ownerId = input.tenantUuid;
      metadata = { variant: 'light', catalog_scope: 'tenant_logo_light' };
      break;
    case 'tenant_logo_dark':
      scope = 'tenant_logo';
      ownerType = 'tenant';
      ownerId = input.tenantUuid;
      metadata = { variant: 'dark', catalog_scope: 'tenant_logo_dark' };
      break;
    case 'store_logo':
      scope = 'store_logo';
      ownerType = 'user';
      ownerId = input.userId;
      break;
    default:
      throw new Error('scope não suportado para upload simples');
  }

  if (
    (input.catalogScope === 'tenant_logo_light' || input.catalogScope === 'tenant_logo_dark') &&
    !input.tenantUuid
  ) {
    throw new Error('Tenant obrigatório para logo da empresa.');
  }

  const saved = await saveFromBuffer({
    tenantId: tid,
    ownerType,
    ownerId,
    scope,
    buffer: input.buffer,
    mimeType: input.mimeType,
    originalFilename: input.originalFilename ?? null,
    writeAssetRecord: true,
    metadata,
  });
  return { relativeUrl: saved.relativeUrl, storageKey: saved.storageKey };
}

export async function maybeUnlinkPreviousSimpleUpload(params: {
  previousRaw: unknown;
  newKey: string;
  tenantUuid: string | null;
  userId: string;
  catalogScope: CatalogMediaScope;
}): Promise<void> {
  const { previousRaw, newKey, tenantUuid, userId, catalogScope } = params;
  if (typeof previousRaw !== 'string') return;
  const trimmed = previousRaw.trim();
  if (!trimmed) return;

  const tenantSegment = tenantUuid || 'no-tenant';

  const catalogPrev =
    extractCatalogMediaRelativeKeyFromStoredUrl(trimmed) ||
    (trimmed.startsWith('tenants/') && trimmed.includes('/users/') ? trimmed : null);

  const mediaPrev =
    extractMediaStorageKeyFromStoredUrl(trimmed) ||
    (trimmed.startsWith('tenants/') && !trimmed.includes('/users/') ? trimmed : null);

  if (catalogPrev && catalogPrev !== newKey) {
    if (!isCatalogMediaKeyOwnedByTenantUser(catalogPrev, tenantUuid, userId)) return;
    if (getScopeFromCatalogMediaKey(catalogPrev) !== catalogScope) return;
    try {
      await unlinkCatalogMediaRelativeKey(catalogPrev);
    } catch (e) {
      console.warn('[simpleUpload] falha ao remover ficheiro catalog anterior', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (mediaPrev && mediaPrev !== newKey) {
    if (!isMediaSimpleUploadOwnedBy(mediaPrev, { tenantSegment, tenantUuid, userId })) return;
    if (!catalogScopeMatchesMediaKey(mediaPrev, catalogScope)) return;
    try {
      await deleteFile(mediaPrev);
    } catch (e) {
      console.warn('[simpleUpload] falha ao remover ficheiro media anterior', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

export async function maybeUnlinkPreviousAvatarUrl(params: {
  previousUrl: string | null;
  newKey: string;
  tenantUuid: string | null;
  userId: string;
}): Promise<void> {
  await maybeUnlinkPreviousSimpleUpload({
    previousRaw: params.previousUrl,
    newKey: params.newKey,
    tenantUuid: params.tenantUuid,
    userId: params.userId,
    catalogScope: 'user_avatar',
  });
}
