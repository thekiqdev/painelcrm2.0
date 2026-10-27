/**
 * PE Etapa 1 — Partner canal aceita somente subdomínio (apex fora do go-live).
 */

/** Sufixos públicos de 2+ labels mais comuns para o mercado do canal. */
const MULTI_PART_PUBLIC_SUFFIXES = [
  'com.br',
  'net.br',
  'org.br',
  'app.br',
  'dev.br',
  'eco.br',
  'emp.br',
  'blog.br',
  'ind.br',
  'inf.br',
  'nom.br',
  'tv.br',
  'gov.br',
  'co.uk',
  'org.uk',
  'com.ar',
  'com.mx',
  'com.co',
  'com.au',
  'com.pt',
] as const;

/**
 * Retorna true se o hostname é um subdomínio utilizável no canal Partner.
 * Apex (`empresa.com`, `empresa.com.br`) → false.
 */
export function isPartnerSubdomainHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host || !host.includes('.')) return false;
  if (host.startsWith('.') || host.endsWith('.')) return false;
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return false;
  if (labels.some((l) => !l || l.length > 63)) return false;

  for (const suffix of MULTI_PART_PUBLIC_SUFFIXES) {
    if (host === suffix) return false;
    if (host.endsWith(`.${suffix}`)) {
      const registrable = host.slice(0, -(suffix.length + 1));
      // empresa.com.br → registrable = empresa (apex)
      // crm.empresa.com.br → registrable = crm.empresa (subdomínio)
      return registrable.includes('.');
    }
  }

  // TLD simples: foo.com = apex; crm.foo.com = ok
  return labels.length >= 3;
}
