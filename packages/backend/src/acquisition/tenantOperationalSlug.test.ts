import { describe, expect, it } from 'vitest';
import {
  isProvisionalOperationalSlug,
  isValidOperationalSlug,
  slugifyOperationalName,
} from './tenantOperationalSlug.js';

describe('slugifyOperationalName', () => {
  it('normaliza acentos, maiúsculas e caracteres especiais', () => {
    expect(slugifyOperationalName('Agência Dev')).toBe('agencia-dev');
    expect(slugifyOperationalName('CRM do João')).toBe('crm-do-joao');
    expect(slugifyOperationalName('Minha Empresa LTDA')).toBe('minha-empresa-ltda');
  });

  it('remove hífens duplicados', () => {
    expect(slugifyOperationalName('Foo   Bar')).toBe('foo-bar');
  });
});

describe('isValidOperationalSlug', () => {
  it('aceita slugs válidos', () => {
    expect(isValidOperationalSlug('agencia-dev')).toBe(true);
    expect(isValidOperationalSlug('crm-agencia-dev')).toBe(true);
  });

  it('rejeita slugs inválidos', () => {
    expect(isValidOperationalSlug('')).toBe(false);
    expect(isValidOperationalSlug('-bad')).toBe(false);
    expect(isValidOperationalSlug('UPPER')).toBe(false);
  });
});

describe('isProvisionalOperationalSlug', () => {
  it('detecta slug provisório do provisionamento', () => {
    expect(isProvisionalOperationalSlug('minha-operacao')).toBe(true);
    expect(isProvisionalOperationalSlug('minha-operacao-2')).toBe(true);
    expect(isProvisionalOperationalSlug('agencia-dev')).toBe(false);
  });
});
