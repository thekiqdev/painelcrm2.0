/**
 * Origens CORS (HTTP Express + Socket.IO).
 * Estático (env + localhost) + dinâmico: tenant_hosts active e Partner custom_domain active|verified.
 * TD Sprint 4.
 */

import { pool } from '../utils/db.js';

const CACHE_TTL_MS = 60_000;

let cache: { origins: Set<string>; expiresAt: number } | null = null;

export function getStaticCorsOrigins(): string[] {
  const extraOrigins = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '';
  const parsedExtraOrigins = extraOrigins
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .flatMap((url) => [url, url.replace(/\/$/, '')]);

  return [
    ...new Set([
      ...parsedExtraOrigins,
      'http://localhost:5173',
      'http://localhost:8080',
      'http://localhost:8081',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:8081',
    ]),
  ];
}

/** @deprecated Prefer getAllowedCorsOriginsAsync / isCorsOriginAllowed — lista estática apenas. */
export function getAllowedCorsOrigins(): string[] {
  return getStaticCorsOrigins();
}

function hostnameToOrigins(hostname: string): string[] {
  const h = hostname.trim().toLowerCase().replace(/\/$/, '');
  if (!h || h.includes('/') || h.includes(' ')) return [];
  const isLocal =
    h === 'localhost' ||
    h.startsWith('localhost:') ||
    h === '127.0.0.1' ||
    h.startsWith('127.0.0.1:');
  if (isLocal) {
    return [`http://${h}`, `https://${h}`];
  }
  return [`https://${h}`, `http://${h}`];
}

async function loadDynamicHostnames(): Promise<string[]> {
  const hosts: string[] = [];
  try {
    const tenant = await pool.query<{ hostname: string }>(
      `SELECT lower(hostname) AS hostname
       FROM tenant_hosts
       WHERE status = 'active'
         AND hostname IS NOT NULL
         AND length(trim(hostname)) > 0`
    );
    for (const row of tenant.rows) {
      if (row.hostname) hosts.push(row.hostname);
    }
  } catch (err) {
    console.warn('[corsOrigins] tenant_hosts load failed', err);
  }

  try {
    const partner = await pool.query<{ custom_domain: string }>(
      `SELECT lower(custom_domain) AS custom_domain
       FROM partner_profiles
       WHERE custom_domain IS NOT NULL
         AND length(trim(custom_domain)) > 0
         AND domain_status IN ('verified', 'active')`
    );
    for (const row of partner.rows) {
      if (row.custom_domain) hosts.push(row.custom_domain);
    }
  } catch (err) {
    console.warn('[corsOrigins] partner_profiles load failed', err);
  }

  return [...new Set(hosts)];
}

async function buildOriginSet(): Promise<Set<string>> {
  const set = new Set<string>(getStaticCorsOrigins().map((o) => o.replace(/\/$/, '')));
  const hostnames = await loadDynamicHostnames();
  for (const h of hostnames) {
    for (const o of hostnameToOrigins(h)) {
      set.add(o);
    }
  }
  return set;
}

export function invalidateCorsOriginsCache(): void {
  cache = null;
}

export async function getAllowedCorsOriginsAsync(): Promise<string[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return [...cache.origins];
  }
  const origins = await buildOriginSet();
  cache = { origins, expiresAt: now + CACHE_TTL_MS };
  return [...origins];
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '');
}

/**
 * Callback CORS (Express / Socket.IO): permite origem estática ou host customizado active.
 * Sem Origin (curl / same-origin server) → permite.
 */
export async function isCorsOriginAllowed(origin: string | undefined | null): Promise<boolean> {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  const allowed = await getAllowedCorsOriginsAsync();
  if (allowed.includes(normalized)) return true;
  // Cache miss race: force refresh once if looks like custom host
  try {
    const u = new URL(normalized);
    if (u.hostname && !u.hostname.includes('localhost') && u.hostname !== '127.0.0.1') {
      invalidateCorsOriginsCache();
      const refreshed = await getAllowedCorsOriginsAsync();
      return refreshed.includes(normalized);
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Opção `origin` para `cors` / Socket.IO. */
export function corsOriginDelegate(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean | string) => void
): void {
  void isCorsOriginAllowed(origin)
    .then((ok) => callback(null, ok))
    .catch((err) => callback(err instanceof Error ? err : new Error(String(err)), false));
}
