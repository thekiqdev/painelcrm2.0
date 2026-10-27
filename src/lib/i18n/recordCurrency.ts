/** Moeda do documento (fatura, produto, contrato). Ausente ou inválida cai em BRL. */
export function resolveRecordCurrency(
  source:
    | {
        currency?: string | null;
        gateway_metadata?: Record<string, unknown> | null;
      }
    | null
    | undefined
): 'BRL' | 'USD' | 'EUR' {
  const direct = typeof source?.currency === 'string' ? source.currency.trim().toUpperCase() : '';
  const meta = source?.gateway_metadata;
  const fromMeta = meta && typeof meta.currency === 'string' ? meta.currency.trim().toUpperCase() : '';
  const raw = direct || fromMeta;
  if (raw === 'USD' || raw === 'EUR' || raw === 'BRL') return raw;
  return 'BRL';
}
