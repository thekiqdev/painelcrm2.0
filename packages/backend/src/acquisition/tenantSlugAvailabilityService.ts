import { pool } from '../utils/db.js';
import {
  isValidOperationalSlug,
  normalizeOperationalSlugInput,
  slugifyOperationalName,
} from './tenantOperationalSlug.js';

export type SlugAvailabilityResult =
  | { available: true; slug: string }
  | { available: false; slug: string; suggestion: string };

async function slugTakenByOtherTenant(slug: string, excludeTenantId?: string): Promise<boolean> {
  const params: string[] = [slug];
  let sql = 'SELECT id FROM tenants WHERE slug = $1';
  if (excludeTenantId) {
    params.push(excludeTenantId);
    sql += ' AND id <> $2::uuid';
  }
  sql += ' LIMIT 1';
  const r = await pool.query(sql, params);
  return r.rows.length > 0;
}

export async function suggestNextAvailableOperationalSlug(
  baseSlug: string,
  excludeTenantId?: string,
): Promise<string> {
  const base = normalizeOperationalSlugInput(baseSlug) || 'workspace';
  if (!(await slugTakenByOtherTenant(base, excludeTenantId))) return base;
  for (let n = 2; n <= 999; n++) {
    const candidate = `${base}-${n}`;
    if (!(await slugTakenByOtherTenant(candidate, excludeTenantId))) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

export async function checkOperationalSlugAvailability(
  rawSlug: string,
  options?: { excludeTenantId?: string },
): Promise<SlugAvailabilityResult> {
  const slug = normalizeOperationalSlugInput(rawSlug);
  if (!isValidOperationalSlug(slug)) {
    const fallback = slugifyOperationalName(rawSlug) || 'workspace';
    const suggestion = await suggestNextAvailableOperationalSlug(fallback, options?.excludeTenantId);
    return { available: false, slug, suggestion };
  }

  const taken = await slugTakenByOtherTenant(slug, options?.excludeTenantId);
  if (!taken) {
    return { available: true, slug };
  }

  const suggestion = await suggestNextAvailableOperationalSlug(slug, options?.excludeTenantId);
  return { available: false, slug, suggestion };
}
