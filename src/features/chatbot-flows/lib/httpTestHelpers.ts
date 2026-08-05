/**
 * Helpers do teste HTTP no editor (S14).
 */

export const LAST_TEST_BODY_MAX = 64_000;

export function getByDotPath(root: unknown, path: string): unknown {
  if (!path.trim()) return undefined;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
      continue;
    }
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function suggestVarNameFromPath(path: string): string {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return 'value';
  const last = parts[parts.length - 1]!;
  let base =
    /^\d+$/.test(last) && parts.length >= 2
      ? `${parts[parts.length - 2]}_${last}`
      : last;
  base = base.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
  if (!/^[a-zA-Z_]/.test(base)) base = `v_${base}`;
  return base || 'value';
}

export function formatSampleValue(v: unknown): string {
  if (v == null) return 'null';
  if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 60)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 60 ? `${s.slice(0, 60)}…` : s;
  } catch {
    return String(v);
  }
}

export function applyHttpResponseMap(opts: {
  bodyJson: unknown;
  bodyText: string;
  status: number;
  statusVariable?: string;
  responseVariable?: string;
  responseMap?: Array<{ path: string; variable: string }>;
}): Record<string, string> {
  const mapped: Record<string, string> = {};
  if (opts.statusVariable) mapped[opts.statusVariable] = String(opts.status);
  if (opts.responseVariable) {
    mapped[opts.responseVariable] =
      opts.bodyJson != null
        ? JSON.stringify(opts.bodyJson)
        : opts.bodyText.slice(0, 8000);
  }
  for (const m of opts.responseMap || []) {
    const name = String(m.variable || '').trim();
    if (!name) continue;
    const v = getByDotPath(opts.bodyJson, m.path);
    mapped[name] = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  }
  return mapped;
}

export function parseLastTestBodyJson(data: Record<string, unknown>): unknown {
  if (data.last_test_json != null) return data.last_test_json;
  const raw = String(data.last_test_body || '');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasLastHttpSample(data: Record<string, unknown>): boolean {
  return Boolean(data.last_test_at) && (data.last_test_body != null || data.last_test_json != null);
}

export function buildMappedFromLastSample(data: Record<string, unknown>): Record<string, string> {
  if (data.last_test_mapped && typeof data.last_test_mapped === 'object') {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.last_test_mapped as Record<string, unknown>)) {
      out[k] = v == null ? '' : String(v);
    }
    if (Object.keys(out).length) return out;
  }
  const bodyJson = parseLastTestBodyJson(data);
  const responseMap = Array.isArray(data.response_map)
    ? (data.response_map as Array<{ path: string; variable: string }>)
    : [];
  return applyHttpResponseMap({
    bodyJson,
    bodyText: String(data.last_test_body || ''),
    status: Number(data.last_test_status) || 0,
    statusVariable: data.status_variable ? String(data.status_variable) : undefined,
    responseVariable: data.response_variable ? String(data.response_variable) : undefined,
    responseMap,
  });
}
