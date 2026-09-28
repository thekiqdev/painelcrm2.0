/**
 * Interpretação de erros retornados pela API Asaas (mensagem serializada no Error do client).
 */

export function isAsaasInvalidCustomerError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('invalid_customer') ||
    msg.includes('cpfcnpj') ||
    msg.includes('cpf/cnpj') ||
    msg.includes('customer.cpf')
  );
}
