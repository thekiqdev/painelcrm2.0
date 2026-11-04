/**
 * Interpretação de erros retornados pela API Asaas (mensagem serializada no Error do client).
 */

export function isAsaasInvalidCustomerError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('invalid_customer') ||
    msg.includes('cpfcnpj') ||
    msg.includes('cpf/cnpj') ||
    msg.includes('cpf ou cnpj') ||
    msg.includes('preencher o cpf') ||
    msg.includes('customer.cpf')
  );
}

/** Cobrança recusada porque o customer Asaas está sem CPF/CNPJ (documento no CRM pode já existir). */
export function isAsaasMissingCustomerDocumentError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('preencher o cpf') ||
    msg.includes('cpf ou cnpj do cliente') ||
    (msg.includes('cpf ou cnpj') && msg.includes('cobran'))
  );
}
