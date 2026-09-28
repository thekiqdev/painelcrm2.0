const STORAGE_KEY = 'painelcrm_marketing_attribution_v1';
const COOKIE_KEY = 'pcrm_mkt_attr';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type MarketingAttribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  landing_path?: string;
  first_seen_at?: string;
};

type StoredAttribution = MarketingAttribution & { saved_at: string };

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  const maxAge = Math.floor(TTL_MS / 1000);
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function parseStored(raw: string | null): StoredAttribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed?.saved_at) return null;
    const age = Date.now() - new Date(parsed.saved_at).getTime();
    if (Number.isNaN(age) || age > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readStored(): StoredAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromLs = parseStored(localStorage.getItem(STORAGE_KEY));
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  return parseStored(readCookie(COOKIE_KEY));
}

function persist(data: StoredAttribution): void {
  const raw = JSON.stringify(data);
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* ignore */
  }
  writeCookie(COOKIE_KEY, raw);
}

function pickAttributionFromSearch(search: string): MarketingAttribution {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'] as const;
  const out: MarketingAttribution = {};
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) out[key] = value.slice(0, 500);
  }
  return out;
}

export function captureMarketingAttributionFromLocation(pathname: string, search: string): void {
  if (typeof window === 'undefined') return;
  const incoming = pickAttributionFromSearch(search);
  const hasIncoming = Object.keys(incoming).length > 0;
  const existing = readStored();
  const nowIso = new Date().toISOString();
  const landingPath = `${pathname || '/'}${search || ''}`.slice(0, 2000);

  if (!hasIncoming && existing) return;

  if (!hasIncoming && !existing) {
    persist({
      landing_path: landingPath,
      first_seen_at: nowIso,
      saved_at: nowIso,
    });
    return;
  }

  const merged: StoredAttribution = {
    utm_source: incoming.utm_source ?? existing?.utm_source,
    utm_medium: incoming.utm_medium ?? existing?.utm_medium,
    utm_campaign: incoming.utm_campaign ?? existing?.utm_campaign,
    utm_content: incoming.utm_content ?? existing?.utm_content,
    utm_term: incoming.utm_term ?? existing?.utm_term,
    fbclid: incoming.fbclid ?? existing?.fbclid,
    landing_path: existing?.landing_path ?? landingPath,
    first_seen_at: existing?.first_seen_at ?? nowIso,
    saved_at: nowIso,
  };

  if (!merged.landing_path) merged.landing_path = landingPath;
  if (!merged.first_seen_at) merged.first_seen_at = nowIso;

  persist(merged);
}

export function getMarketingAttributionPayload(): MarketingAttribution | null {
  const stored = readStored();
  if (!stored) return null;
  return {
    utm_source: stored.utm_source,
    utm_medium: stored.utm_medium,
    utm_campaign: stored.utm_campaign,
    utm_content: stored.utm_content,
    utm_term: stored.utm_term,
    fbclid: stored.fbclid,
    landing_path: stored.landing_path,
    first_seen_at: stored.first_seen_at,
  };
}

export function withMarketingAttribution<T extends Record<string, unknown>>(
  body: T,
): T & { marketing_attribution?: MarketingAttribution } {
  const marketing_attribution = getMarketingAttributionPayload();
  if (!marketing_attribution) return body;
  const hasValue = Object.values(marketing_attribution).some(
    (value) => typeof value === 'string' && value.length > 0,
  );
  if (!hasValue) return body;
  return { ...body, marketing_attribution };
}
