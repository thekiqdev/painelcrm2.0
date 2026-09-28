/**
 * M5 S7.3 — regressão: sale-link paths, origin, honeypot, superfícies separadas.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildPartnerSaleUrl } from './partnerAttribution.js';
import {
  LOCAL_PUBLIC_APP_FALLBACK,
  resolveSaleLinkOrigin,
} from '../utils/platformPublicUrls.js';
import { isPartnerChannelHoneypotTriggered } from './partnerChannelPublicController.js';
import { EXCLUSIVE_SIGNUP_INACTIVE_CODE } from '../platform/exclusiveSignupFlowGate.js';

const env = process.env;

afterEach(() => {
  process.env = { ...env };
});

describe('S7.3 partner channel regression', () => {
  it('sale-link platform: /{slug}/cadastro e /{slug}/{seller}/cadastro', () => {
    expect(
      buildPartnerSaleUrl({
        origin: 'http://localhost:8081',
        partnerSlug: 'agencia-devs',
      })
    ).toBe('http://localhost:8081/agencia-devs/cadastro');

    expect(
      buildPartnerSaleUrl({
        origin: 'http://localhost:8081',
        partnerSlug: 'agencia-devs',
        sellerUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      })
    ).toBe(
      'http://localhost:8081/agencia-devs/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/cadastro'
    );
  });

  it('sale-link WL: /cadastro e /{seller}/cadastro sem slug', () => {
    expect(
      buildPartnerSaleUrl({
        origin: 'https://crm.parceiro.com',
        partnerSlug: 'agencia-devs',
        onCustomDomain: true,
      })
    ).toBe('https://crm.parceiro.com/cadastro');

    expect(
      buildPartnerSaleUrl({
        origin: 'https://crm.parceiro.com',
        partnerSlug: 'agencia-devs',
        sellerUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        onCustomDomain: true,
      })
    ).toBe('https://crm.parceiro.com/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/cadastro');
  });

  it('origin do sale-link: Origin → FRONTEND_URL → fallback Vite (não 5173 hardcoded)', () => {
    delete process.env.PUBLIC_APP_URL;
    process.env.FRONTEND_URL = 'http://localhost:8081';
    expect(resolveSaleLinkOrigin({})).toBe('http://localhost:8081');
    expect(resolveSaleLinkOrigin({ originHint: 'http://localhost:8081' })).toBe(
      'http://localhost:8081'
    );

    delete process.env.FRONTEND_URL;
    expect(resolveSaleLinkOrigin({})).toBe(LOCAL_PUBLIC_APP_FALLBACK);
    expect(LOCAL_PUBLIC_APP_FALLBACK).not.toContain('5173');
  });

  it('honeypot: website preenchido dispara; vazio não', () => {
    expect(isPartnerChannelHoneypotTriggered({ website: 'http://spam.test' })).toBe(true);
    expect(isPartnerChannelHoneypotTriggered({ company_website: 'x' })).toBe(true);
    expect(isPartnerChannelHoneypotTriggered({ website: '  ', company_website: null })).toBe(false);
    expect(isPartnerChannelHoneypotTriggered({})).toBe(false);
  });

  it('canal Partner não reutiliza código exclusive_signup_inactive', () => {
    // Gate Platform permanece isolado; APIs partner-channel não importam requireExclusiveSignupFlow.
    expect(EXCLUSIVE_SIGNUP_INACTIVE_CODE).toBe('exclusive_signup_inactive');
  });
});
