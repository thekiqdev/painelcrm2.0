import { getApiUrl } from '@/integrations/api/client';

/** Exemplo alinhado ao contrato de POST /api/v1/leads. A chave do exemplo não é real. */
export function buildPublicLeadCurl(origin: string): string {
  const base = origin.replace(/\/$/, '');
  const payload = {
    name: 'Maria Souza',
    email: 'maria@empresa.com',
    phone: '11999998888',
    company: 'Empresa Ltda',
    source: 'Website',
    status: 'Novo',
    observacao: 'Veio do formulário',
    cpf_cnpj: '12345678901',
  };
  return [
    `curl -X POST "${base}/api/v1/leads" \\`,
    `  -H "Authorization: Bearer pcrm_SUA_CHAVE" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Idempotency-Key: pedido-1" \\`,
    `  -d '${JSON.stringify(payload)}'`,
  ].join('\n');
}

export function publicApiOrigin(): string {
  const base = getApiUrl().replace(/\/$/, '');
  if (base) return base;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
