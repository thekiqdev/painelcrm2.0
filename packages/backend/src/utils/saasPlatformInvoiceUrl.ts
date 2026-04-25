/**
 * URL pública da fatura SaaS (mesma tenant_billing), sem UUID na rota.
 */
export function buildPlatformSaasInvoiceUrl(publicPayToken: string): string {
  const fe = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const tok = publicPayToken.trim();
  return `${fe}/saas-pay/${encodeURIComponent(tok)}`;
}
