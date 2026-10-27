import { describe, expect, it } from 'vitest';
import { isPartnerSubdomainHostname } from './partnerHostname.js';

describe('isPartnerSubdomainHostname', () => {
  it('aceita subdomínios comuns', () => {
    expect(isPartnerSubdomainHostname('crm.parceiro.com')).toBe(true);
    expect(isPartnerSubdomainHostname('crm.suaempresa.com.br')).toBe(true);
    expect(isPartnerSubdomainHostname('app.agenciadev.com.br')).toBe(true);
    expect(isPartnerSubdomainHostname('venda.loja.net.br')).toBe(true);
  });

  it('rejeita apex / raiz', () => {
    expect(isPartnerSubdomainHostname('parceiro.com')).toBe(false);
    expect(isPartnerSubdomainHostname('suaempresa.com.br')).toBe(false);
    expect(isPartnerSubdomainHostname('agenciadev.com.br')).toBe(false);
    expect(isPartnerSubdomainHostname('loja.net.br')).toBe(false);
  });

  it('rejeita inválidos', () => {
    expect(isPartnerSubdomainHostname('')).toBe(false);
    expect(isPartnerSubdomainHostname('localhost')).toBe(false);
    expect(isPartnerSubdomainHostname('.com.br')).toBe(false);
  });
});
