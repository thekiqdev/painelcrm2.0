import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import type { Request } from 'express';

export type WhatsappTemplateMediaType = 'image' | 'document';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const BASE_SUBDIR = 'whatsapp-template-media';

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DOCUMENT_MIME = new Set(['application/pdf']);

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'file';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160) || 'file';
}

export function getWhatsappTemplateMediaRoot(): string {
  const fromEnv = process.env.WHATSAPP_TEMPLATE_MEDIA_STORAGE_PATH?.trim();
  const base = fromEnv ? path.resolve(fromEnv) : path.resolve(process.cwd(), 'uploads');
  return path.join(base, BASE_SUBDIR);
}

/**
 * Compatibilidade de runtime: alguns ambientes iniciam o backend em `repo/`,
 * outros em `repo/packages/backend/`. Mantemos raízes candidatas para leitura
 * e static serving de arquivos já gravados antes de uma troca de cwd.
 */
export function getWhatsappTemplateMediaRootCandidates(): string[] {
  const fromEnv = process.env.WHATSAPP_TEMPLATE_MEDIA_STORAGE_PATH?.trim();
  if (fromEnv) {
    return [path.join(path.resolve(fromEnv), BASE_SUBDIR)];
  }

  const cwd = path.resolve(process.cwd());
  const roots = new Set<string>();
  roots.add(path.join(path.resolve(cwd, 'uploads'), BASE_SUBDIR));
  roots.add(path.join(path.resolve(cwd, '..', '..', 'uploads'), BASE_SUBDIR));
  roots.add(path.join(path.resolve(cwd, 'packages', 'backend', 'uploads'), BASE_SUBDIR));
  return Array.from(roots);
}

export function getWhatsappTemplateMediaMaxBytes(): number {
  const n = parseInt(process.env.WHATSAPP_TEMPLATE_MEDIA_UPLOAD_MAX_BYTES || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

export function assertWhatsappTemplateUploadAllowed(
  mediaType: WhatsappTemplateMediaType,
  mimeType: string,
  sizeBytes: number,
): void {
  const allowed = mediaType === 'image' ? IMAGE_MIME : DOCUMENT_MIME;
  if (!allowed.has(mimeType)) {
    if (mediaType === 'image') {
      throw new Error('Tipo inválido para imagem. Use JPG, JPEG, PNG, WEBP ou GIF.');
    }
    throw new Error('Tipo inválido para documento. Apenas PDF é permitido.');
  }
  const max = getWhatsappTemplateMediaMaxBytes();
  if (sizeBytes <= 0) throw new Error('Arquivo inválido.');
  if (sizeBytes > max) {
    throw new Error(`Arquivo muito grande. Máximo ${Math.round(max / (1024 * 1024))} MB.`);
  }
}

export function buildWhatsappTemplateTempPath(params: {
  tenantId: string;
  mediaType: WhatsappTemplateMediaType;
  originalFilename: string;
}): string {
  const kind = params.mediaType === 'image' ? 'images' : 'documents';
  const filename = `${randomUUID()}_${sanitizeFilename(params.originalFilename)}`;
  return `tenants/${params.tenantId}/whatsapp-templates/tmp/${kind}/${filename}`;
}

export function buildWhatsappTemplateFinalPath(params: {
  tenantId: string;
  templateId: string;
  mediaType: WhatsappTemplateMediaType;
  originalFilename: string;
}): string {
  const kind = params.mediaType === 'image' ? 'images' : 'documents';
  const filename = `${randomUUID()}_${sanitizeFilename(params.originalFilename)}`;
  return `tenants/${params.tenantId}/whatsapp-templates/${kind}/${params.templateId}/${filename}`;
}

function resolveInsideRoot(relativePath: string): string {
  const root = getWhatsappTemplateMediaRoot();
  const abs = path.resolve(path.join(root, relativePath));
  const resolvedRoot = path.resolve(root);
  if (!abs.startsWith(resolvedRoot + path.sep) && abs !== resolvedRoot) {
    throw new Error('Caminho de storage inválido.');
  }
  return abs;
}

export async function writeWhatsappTemplateFile(relativePath: string, buffer: Buffer): Promise<void> {
  const abs = resolveInsideRoot(relativePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
}

export async function moveWhatsappTemplateFile(fromRelativePath: string, toRelativePath: string): Promise<void> {
  const fromAbs = resolveInsideRoot(fromRelativePath);
  const toAbs = resolveInsideRoot(toRelativePath);
  await fs.mkdir(path.dirname(toAbs), { recursive: true });
  await fs.rename(fromAbs, toAbs);
}

export function resolveExistingWhatsappTemplateMediaAbsolutePath(relativePath: string): string | null {
  const clean = relativePath
    .split('/')
    .filter(Boolean)
    .map((seg) => decodeURIComponent(seg))
    .join('/');
  if (!clean) return null;

  for (const root of getWhatsappTemplateMediaRootCandidates()) {
    const resolvedRoot = path.resolve(root);
    const abs = path.resolve(path.join(resolvedRoot, clean));
    if ((!abs.startsWith(resolvedRoot + path.sep) && abs !== resolvedRoot) || !fsSync.existsSync(abs)) {
      continue;
    }
    return abs;
  }
  return null;
}

export function isWhatsappTemplateTempPath(tenantId: string, storagePath: string): boolean {
  const p = storagePath.trim();
  return p.startsWith(`tenants/${tenantId}/whatsapp-templates/tmp/`);
}

export function buildWhatsappTemplateMediaPublicUrl(req: Request, storagePath: string): string {
  const envBase = process.env.WHATSAPP_TEMPLATE_MEDIA_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  const origin = envBase || `${req.protocol}://${req.get('host') || 'localhost'}`;
  return buildWhatsappTemplateMediaPublicUrlFromOrigin(origin, storagePath);
}

export function buildWhatsappTemplateMediaPublicUrlFromStoragePath(storagePath: string): string {
  const envBase = process.env.WHATSAPP_TEMPLATE_MEDIA_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  const fallbackOrigin =
    process.env.API_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') ||
    process.env.API_PUBLIC_ORIGIN?.trim().replace(/\/$/, '') ||
    'http://localhost:3001';
  return buildWhatsappTemplateMediaPublicUrlFromOrigin(envBase || fallbackOrigin, storagePath);
}

function buildWhatsappTemplateMediaPublicUrlFromOrigin(origin: string, storagePath: string): string {
  const safe = storagePath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${origin}/media/whatsapp-templates/${safe}`;
}

