/**
 * Kill switch opcional: ENABLE_LEGAL_PAGES=false desativa leitura pública (API + útil para rollout).
 * Omitir variável = páginas leigas ativas.
 */
export function isLegalPagesPublicApiEnabled(): boolean {
  const v = process.env.ENABLE_LEGAL_PAGES?.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  return true;
}
