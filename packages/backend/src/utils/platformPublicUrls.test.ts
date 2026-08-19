import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPlatformSupportLink,
  LOCAL_PUBLIC_APP_FALLBACK,
  normalizePublicOriginHint,
  resolvePlatformPublicAppBaseUrl,
  resolveSaleLinkOrigin,
} from './platformPublicUrls.js';

const env = process.env;

afterEach(() => {
  process.env = { ...env };
});

describe('platformPublicUrls', () => {
  it('resolvePlatformPublicAppBaseUrl strips trailing slash', () => {
    process.env.PUBLIC_APP_URL = 'https://painelcrm.com/';
    process.env.FRONTEND_URL = 'http://ignored.test';
    expect(resolvePlatformPublicAppBaseUrl()).toBe('https://painelcrm.com');
  });

  it('resolvePlatformPublicAppBaseUrl falls back to FRONTEND_URL then local Vite default', () => {
    delete process.env.PUBLIC_APP_URL;
    process.env.FRONTEND_URL = 'http://localhost:8081/';
    expect(resolvePlatformPublicAppBaseUrl()).toBe('http://localhost:8081');

    delete process.env.FRONTEND_URL;
    expect(resolvePlatformPublicAppBaseUrl()).toBe(LOCAL_PUBLIC_APP_FALLBACK);
  });

  it('normalizePublicOriginHint aceita Origin e host local com http', () => {
    expect(normalizePublicOriginHint('http://localhost:8081/')).toBe('http://localhost:8081');
    expect(normalizePublicOriginHint('localhost:8081')).toBe('http://localhost:8081');
    expect(normalizePublicOriginHint('crm.parceiro.com')).toBe('https://crm.parceiro.com');
  });

  it('normalizePublicOriginHint ignora host da API', () => {
    process.env.API_PORT = '3001';
    expect(normalizePublicOriginHint('http://localhost:3001')).toBeNull();
    expect(normalizePublicOriginHint('localhost:3001')).toBeNull();
  });

  it('resolveSaleLinkOrigin: hint → env → fallback', () => {
    delete process.env.PUBLIC_APP_URL;
    process.env.FRONTEND_URL = 'http://localhost:8081';
    expect(resolveSaleLinkOrigin({ originHint: 'http://localhost:8081' })).toBe('http://localhost:8081');
    expect(resolveSaleLinkOrigin({ originHint: 'localhost:3001' })).toBe('http://localhost:8081');
    delete process.env.FRONTEND_URL;
    expect(resolveSaleLinkOrigin({})).toBe(LOCAL_PUBLIC_APP_FALLBACK);
  });

  it('buildPlatformSupportLink appends /suporte without double slash', () => {
    process.env.PLATFORM_SUPPORT_URL = '';
    process.env.PUBLIC_APP_URL = 'https://painelcrm.com/';
    expect(buildPlatformSupportLink()).toBe('https://painelcrm.com/suporte');
  });

  it('buildPlatformSupportLink prefers PLATFORM_SUPPORT_URL override', () => {
    process.env.PLATFORM_SUPPORT_URL = 'https://custom.example/help';
    process.env.PUBLIC_APP_URL = 'https://painelcrm.com';
    expect(buildPlatformSupportLink()).toBe('https://custom.example/help');
  });
});
