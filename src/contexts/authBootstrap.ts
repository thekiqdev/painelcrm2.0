/**
 * MB-006 — pós-/me bootstrap helpers (Shell / Auth only).
 * Features e migration-flags em paralelo; sem alterar contratos HTTP.
 */

export type PostMeBootstrapLoaders = {
  loadFeatures: () => Promise<void>;
  loadMigrationFlags: () => Promise<void>;
};

/** Executa features ∥ migration-flags (1 estágio paralelo após /me). */
export async function loadPostMeBootstrap(loaders: PostMeBootstrapLoaders): Promise<void> {
  await Promise.all([loaders.loadFeatures(), loaders.loadMigrationFlags()]);
}

/** Marcas DEV para medição de bootstrap auth (Phase 1). */
export const AUTH_PERF_MARKS = {
  meStart: 'perf:auth-me-start',
  meDone: 'perf:auth-me-done',
  postMeStart: 'perf:auth-post-me-start',
  ready: 'perf:auth-ready',
} as const;

export function markAuthPerf(name: string): void {
  if (typeof performance === 'undefined') return;
  // Skip only in explicit production builds.
  try {
    if (import.meta.env.PROD) return;
  } catch {
    /* vitest / non-vite */
  }
  try {
    performance.mark(name);
  } catch {
    /* ignore */
  }
}

export function measureAuthPerf(measureName: string, startMark: string, endMark: string): number | null {
  if (typeof performance === 'undefined') return null;
  try {
    if (import.meta.env.PROD) return null;
  } catch {
    /* vitest / non-vite */
  }
  try {
    performance.measure(measureName, startMark, endMark);
    const entry = performance.getEntriesByName(measureName).pop();
    const ms = entry?.duration ?? null;
    if (ms != null) {
      console.info(`[perf:auth] ${measureName} = ${ms.toFixed(1)}ms`);
    }
    return ms;
  } catch {
    return null;
  }
}
