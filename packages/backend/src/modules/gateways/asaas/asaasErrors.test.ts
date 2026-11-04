import { describe, expect, it } from 'vitest';
import {
  isAsaasInvalidCustomerError,
  isAsaasMissingCustomerDocumentError,
} from './asaasErrors.js';

describe('asaasErrors', () => {
  it('detecta customer inválido clássico', () => {
    expect(isAsaasInvalidCustomerError(new Error('Asaas API 400: invalid_customer'))).toBe(true);
  });

  it('detecta falta de CPF/CNPJ na cobrança (mensagem Asaas pt-BR)', () => {
    const err = new Error(
      'Asaas API 400: {"errors":[{"code":"invalid_object","description":"Para criar esta cobrança é necessário preencher o CPF ou CNPJ do cliente."}]}'
    );
    expect(isAsaasMissingCustomerDocumentError(err)).toBe(true);
    expect(isAsaasInvalidCustomerError(err)).toBe(true);
  });

  it('não classifica 403 CloudFront como documento ausente', () => {
    const err = new Error('Asaas API 403: Request blocked. CloudFront');
    expect(isAsaasMissingCustomerDocumentError(err)).toBe(false);
    expect(isAsaasInvalidCustomerError(err)).toBe(false);
  });
});
