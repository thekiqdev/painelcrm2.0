/**
 * Valores de exemplo seguros para preview/validação strict de templates (sem dados reais de clientes).
 */
const STATIC_SAMPLES: Record<string, string> = {
  'tenant.name': 'Empresa Exemplo Lda.',
  'client.name': 'Cliente Exemplo',
  'proposal.title': 'Proposta comercial #2026-001',
  'proposal.total': '1.250,00 €',
  'proposal.public_link': 'https://exemplo.app/p/proposta-demo',
  'contract.title': 'Contrato de prestação de serviços',
  'contract.sign_link': 'https://exemplo.app/assinar-demo',
  'contract.public_view_link': 'https://exemplo.app/contract-view/demo-token',
  'signer.name': 'Maria Signatária',
  'signer.email': 'maria@exemplo.com',
  'signer.whatsapp': '(11) 98765-4321',
  'invoice.number': 'FT 2026/042',
  'invoice.total': 'R$ 320,50',
  'invoice.due_date': '2026-05-01',
  'invoice.public_link': 'https://exemplo.app/pay/token-demo',
};

/**
 * Garante uma string por cada chave permitida; chaves desconhecidas usam marcador neutro.
 * `overrides` permite ao cliente simular valores no preview (sobrepõe amostras).
 */
export function buildSampleMergeContext(
  allowedKeys: string[],
  overrides?: Record<string, string> | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of allowedKeys) {
    const fromUser = overrides?.[k];
    if (fromUser !== undefined && fromUser !== null) {
      out[k] = String(fromUser);
      continue;
    }
    out[k] = STATIC_SAMPLES[k] ?? `[exemplo: ${k}]`;
  }
  return out;
}
