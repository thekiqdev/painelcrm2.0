/** Erros de domínio do Tenant Custom Domain (TD). */
export class TenantDomainError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400
  ) {
    super(message);
    this.name = 'TenantDomainError';
  }
}
