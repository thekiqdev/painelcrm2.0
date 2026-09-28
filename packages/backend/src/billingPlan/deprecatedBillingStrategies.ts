/**
 * Estratégias e marcadores legados ainda possíveis em linhas antigas do banco.
 * Centralizado para detecção/rejeição — não usar em código novo.
 */
export const DEPRECATED_BILLING_STRATEGY_INVOICE_COPY = 'legacy_invoice_copy' as const;

export const DEPRECATED_METADATA_MARKERS = [
  'context_virtual',
  'virtual_from_invoice_template',
  DEPRECATED_BILLING_STRATEGY_INVOICE_COPY,
  'invoice_template',
] as const;

export function isDeprecatedBillingStrategy(strategy: string): boolean {
  return strategy === DEPRECATED_BILLING_STRATEGY_INVOICE_COPY;
}
