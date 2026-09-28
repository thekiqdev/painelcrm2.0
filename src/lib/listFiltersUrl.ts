/**
 * Utilitários compartilhados para sincronizar filtros de listagens com query string.
 * Usado nas páginas da Etapa mobile (PHASE-03): Clientes, Cobranças, Propostas, Contratos.
 */

export type UrlParamPatch = Record<string, string | number | null | undefined>;

/** Aplica patch sobre uma cópia de URLSearchParams; valores vazios/null/undefined removem a chave. */
export function applyUrlPatch(base: URLSearchParams, patch: UrlParamPatch): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const [key, raw] of Object.entries(patch)) {
    if (raw === null || raw === undefined || raw === "") {
      next.delete(key);
    } else {
      next.set(key, String(raw));
    }
  }
  return next;
}

export function readString(sp: URLSearchParams, key: string, fallback = ""): string {
  return sp.get(key) ?? fallback;
}

export function readInt(
  sp: URLSearchParams,
  key: string,
  fallback: number,
  opts?: { min?: number; max?: number },
): number {
  const raw = sp.get(key);
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  const min = opts?.min ?? -Infinity;
  const max = opts?.max ?? Infinity;
  return Math.min(max, Math.max(min, n));
}
