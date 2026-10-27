import { describe, expect, it } from 'vitest';
import { buildPublicLeadCurl } from './apiKeysCurl';

describe('buildPublicLeadCurl', () => {
  it('bate com o contrato de cadastro de lead', () => {
    const curl = buildPublicLeadCurl('https://painel.exemplo.com/');
    expect(curl).toContain('POST "https://painel.exemplo.com/api/v1/leads"');
    expect(curl).toContain('Authorization: Bearer pcrm_SUA_CHAVE');
    expect(curl).toContain('Content-Type: application/json');
    expect(curl).toContain('Idempotency-Key: pedido-1');
    expect(curl).toContain('"name":"Maria Souza"');
    expect(curl).toContain('"email":"maria@empresa.com"');
    expect(curl).toContain('"phone":"11999998888"');
    expect(curl).toContain('"company":"Empresa Ltda"');
    expect(curl).toContain('"source":"Website"');
    expect(curl).toContain('"status":"Novo"');
    expect(curl).toContain('"observacao":"Veio do formulário"');
    expect(curl).toContain('"cpf_cnpj":"12345678901"');
    expect(curl).not.toContain('notes');
    expect(curl).not.toContain('user_id');
    expect(curl).not.toMatch(/pcrm_[A-Za-z0-9_-]{20,}/);
  });
});
