/**
 * Interpreta flags vindos de `import.meta.env.VITE_*` (sempre strings no build Vite)
 * ou de overrides opcionais. Valores como `TRUE`, `1`, `yes` contam como verdadeiro.
 */
export function viteEnvIsTruthy(v: string | boolean | undefined | null): boolean {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}
