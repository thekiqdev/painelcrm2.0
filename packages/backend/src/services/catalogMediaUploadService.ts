import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { Request } from 'express';

export const CATALOG_MEDIA_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/** Subpasta fixa dentro do storage: uploads/catalog-media (ou CATALOG_MEDIA_STORAGE_PATH/catalog-media). */
export const CATALOG_MEDIA_SUBDIR = 'catalog-media';

export type CatalogMediaScope =
  | 'product'
  | 'store_logo'
  | 'store_banner'
  | 'tenant_logo_light'
  | 'tenant_logo_dark';

/**
 * Raiz física dos arquivos (volume persistente no EasyPanel).
 * Padrão: {cwd}/uploads — arquivos ficam em {cwd}/uploads/catalog-media/...
 */
export function getCatalogMediaStorageRoot(): string {
  const fromEnv = process.env.CATALOG_MEDIA_STORAGE_PATH?.trim();
  const base = fromEnv ? path.resolve(fromEnv) : path.resolve(process.cwd(), 'uploads');
  return path.join(base, CATALOG_MEDIA_SUBDIR);
}

export function getCatalogMediaMaxBytes(): number {
  const n = parseInt(process.env.CATALOG_MEDIA_UPLOAD_MAX_BYTES || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'file';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

/**
 * Caminho relativo ao diretório catalog-media (sem path absoluto). Usado na URL /media/catalog/...
 */
export function buildCatalogMediaRelativeKey(params: {
  tenantId: string | null;
  userId: string;
  scope: CatalogMediaScope;
  contentType: string;
  originalName?: string;
}): string {
  const tenantPart = params.tenantId || 'no-tenant';
  const ext =
    params.contentType === 'image/png'
      ? 'png'
      : params.contentType === 'image/webp'
        ? 'webp'
        : params.contentType === 'image/gif'
          ? 'gif'
          : 'jpg';
  const filePart = `${randomUUID()}-${sanitizeFilename(params.originalName || `upload.${ext}`)}`;
  return `tenants/${tenantPart}/users/${params.userId}/${params.scope}/${filePart}`;
}

export function assertAllowedImageUpload(contentType: string, byteSize: number): void {
  if (!CATALOG_MEDIA_ALLOWED_TYPES.has(contentType)) {
    throw new Error('Tipo de arquivo não permitido. Use JPEG, PNG, WebP ou GIF.');
  }
  const max = getCatalogMediaMaxBytes();
  if (byteSize > max) {
    throw new Error(`Arquivo muito grande. Máximo ${Math.round(max / (1024 * 1024))} MB.`);
  }
  if (byteSize <= 0) {
    throw new Error('Tamanho inválido.');
  }
}

/**
 * URL absoluta salva no banco e usada na vitrine.
 * CATALOG_MEDIA_PUBLIC_BASE_URL (sem barra final) força origem; senão usa o Host da requisição (trust proxy).
 */
export function buildCatalogMediaPublicUrl(req: Request, relativeKey: string): string {
  const envBase = process.env.CATALOG_MEDIA_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  const origin =
    envBase ||
    `${req.protocol}://${req.get('host') || 'localhost'}`;
  const safeKey = relativeKey
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${origin}/media/catalog/${safeKey}`;
}

export async function saveCatalogMediaBuffer(relativeKey: string, buffer: Buffer): Promise<string> {
  const root = getCatalogMediaStorageRoot();
  const abs = path.join(root, relativeKey);
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(abs);
  if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
    throw new Error('Caminho de arquivo inválido.');
  }
  await fs.mkdir(path.dirname(resolvedFile), { recursive: true });
  await fs.writeFile(resolvedFile, buffer);
  return relativeKey;
}
