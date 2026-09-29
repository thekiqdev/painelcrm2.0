import { getCatalogMediaMaxBytes } from './catalogMediaUploadService.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** SSRF guard para download de imagem remota (catalog import). */
export function assertSafeRemoteImageUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('URL inválida');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Apenas http/https');
  }
  const host = (u.hostname || '').toLowerCase();
  if (!host) throw new Error('Host inválido');
  if (LOCAL_HOSTS.has(host)) throw new Error('Host local bloqueado');
  if (isPrivateIpv4(host)) throw new Error('IP privado bloqueado');
  if (host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Host interno bloqueado');
  }
  return u;
}

function sniffImageContentType(buffer: Buffer, headerType: string | null): string | null {
  const ht = (headerType || '').split(';')[0].trim().toLowerCase();
  if (ht === 'image/jpeg' || ht === 'image/png' || ht === 'image/webp' || ht === 'image/gif') {
    return ht;
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 6) {
    const sig = buffer.toString('ascii', 0, 6);
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif';
  }
  return null;
}

function filenameFromUrl(u: URL, contentType: string): string {
  const last = u.pathname.split('/').filter(Boolean).pop() || 'image';
  const clean = last.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  if (/\.(jpe?g|png|webp|gif)$/i.test(clean)) return clean;
  const ext =
    contentType === 'image/png'
      ? 'png'
      : contentType === 'image/webp'
        ? 'webp'
        : contentType === 'image/gif'
          ? 'gif'
          : 'jpg';
  return `${clean || 'image'}.${ext}`;
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

async function fetchFollowingSafeRedirects(start: URL): Promise<Response> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'PainelCRM-CatalogImport/1.0',
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('Redirect sem Location');
      current = assertSafeRemoteImageUrl(new URL(loc, current).toString());
      continue;
    }
    return res;
  }
  throw new Error('Muitos redirects');
}

export type FetchedRemoteImage = {
  buffer: Buffer;
  contentType: string;
  filename: string;
};

/** Baixa imagem pública com limites de tamanho e SSRF. */
export async function fetchRemoteImageForCatalog(rawUrl: string): Promise<FetchedRemoteImage> {
  const start = assertSafeRemoteImageUrl(rawUrl);
  const res = await fetchFollowingSafeRedirects(start);
  if (!res.ok) {
    throw new Error(`Falha ao baixar imagem (HTTP ${res.status}).`);
  }

  const max = getCatalogMediaMaxBytes();
  const lenHeader = res.headers.get('content-length');
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > max) {
      throw new Error(`Imagem muito grande (máx. ${Math.round(max / (1024 * 1024))} MB).`);
    }
  }

  const ab = await res.arrayBuffer();
  const buffer = Buffer.from(ab);
  if (buffer.length > max) {
    throw new Error(`Imagem muito grande (máx. ${Math.round(max / (1024 * 1024))} MB).`);
  }
  if (buffer.length <= 0) {
    throw new Error('Imagem vazia.');
  }

  const contentType = sniffImageContentType(buffer, res.headers.get('content-type'));
  if (!contentType) {
    throw new Error('Resposta não é uma imagem JPEG/PNG/WebP/GIF.');
  }

  return {
    buffer,
    contentType,
    filename: filenameFromUrl(start, contentType),
  };
}
