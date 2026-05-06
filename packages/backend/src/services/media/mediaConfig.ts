import path from 'path';

const DEFAULT_STORAGE_ROOT = path.resolve(process.cwd(), 'storage/media');
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

function isWeakSigningSecret(value: string): boolean {
  if (!value) return true;
  const s = value.trim();
  if (s.length < 24) return true;
  if (/^(dev|test|local)/i.test(s)) return true;
  if (s.includes('change-me')) return true;
  return false;
}

export function getMediaStorageRoot(): string {
  const raw = process.env.MEDIA_STORAGE_ROOT?.trim();
  if (!raw) return DEFAULT_STORAGE_ROOT;
  return path.resolve(raw);
}

export function getMediaMaxFileBytes(): number {
  const raw = parseInt(process.env.MEDIA_MAX_FILE_BYTES || '', 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_BYTES;
  return raw;
}

/** Qual env “ganhou” para assinatura (diagnóstico; nunca expõe o segredo). */
export type MediaSigningSecretSource =
  | 'MEDIA_SIGNING_SECRET'
  | 'CATALOG_MEDIA_PUBLIC_TOKEN_SECRET'
  | 'JWT_SECRET'
  | 'dev_fallback';

export function getMediaSigningSecretSource(): MediaSigningSecretSource {
  if (process.env.MEDIA_SIGNING_SECRET?.trim()) return 'MEDIA_SIGNING_SECRET';
  if (process.env.CATALOG_MEDIA_PUBLIC_TOKEN_SECRET?.trim()) return 'CATALOG_MEDIA_PUBLIC_TOKEN_SECRET';
  if (process.env.JWT_SECRET?.trim()) return 'JWT_SECRET';
  return 'dev_fallback';
}

export function getMediaSigningSecret(): string {
  const secret =
    process.env.MEDIA_SIGNING_SECRET?.trim() ||
    process.env.CATALOG_MEDIA_PUBLIC_TOKEN_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    '';

  if (process.env.NODE_ENV === 'production' && isWeakSigningSecret(secret)) {
    throw new Error(
      'MEDIA_SIGNING_SECRET ausente/fraco em produção. Defina MEDIA_SIGNING_SECRET (>=24 chars, forte) ou CATALOG_MEDIA_PUBLIC_TOKEN_SECRET forte.'
    );
  }

  return secret || 'dev-only-media-signing-secret-change-in-prod';
}

/** Logs sanitizados em GET /api/media/v1/raw — `MEDIA_RAW_DIAGNOSTIC_LOGS=true`. Desligar após investigar. */
export function isMediaRawDiagnosticLogsEnabled(): boolean {
  const raw = String(process.env.MEDIA_RAW_DIAGNOSTIC_LOGS || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function isMediaAssetsWriteEnabled(): boolean {
  const raw = String(process.env.MEDIA_ASSETS_WRITE_ENABLED || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/** Avatar perfil, logos tenant/loja — novos uploads via MediaService quando `true` (default: `false`). */
export function isMediaSimpleUploadsServiceEnabled(): boolean {
  const raw = String(process.env.MEDIA_SIMPLE_UPLOADS_SERVICE_ENABLED || 'false')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function isMediaAvatarWhatsappEnabled(): boolean {
  const raw = String(process.env.MEDIA_AVATAR_WHATSAPP_ENABLED || 'false')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function isMediaAvatarWhatsappWorkerEnabled(): boolean {
  const raw = String(process.env.MEDIA_AVATAR_WHATSAPP_WORKER_ENABLED || 'false')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function getMediaAvatarWhatsappWorkerLimit(): number {
  const n = parseInt(process.env.MEDIA_AVATAR_WHATSAPP_WORKER_LIMIT || '', 10);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(500, Math.max(1, n));
}

export function getMediaAvatarWhatsappWorkerIntervalMinutes(): number {
  const n = parseInt(process.env.MEDIA_AVATAR_WHATSAPP_WORKER_INTERVAL_MINUTES || '', 10);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(24 * 60, Math.max(1, n));
}

export function getMediaAvatarWhatsappWorkerMaxFailures(): number {
  const n = parseInt(process.env.MEDIA_AVATAR_WHATSAPP_WORKER_MAX_FAILURES || '', 10);
  if (!Number.isFinite(n) || n <= 0) return 3;
  return Math.min(50, Math.max(1, n));
}
