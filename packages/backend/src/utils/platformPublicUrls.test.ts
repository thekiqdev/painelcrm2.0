import { afterEach, describe, expect, it } from 'vitest';
import { buildPlatformSupportLink, resolvePlatformPublicAppBaseUrl } from './platformPublicUrls.js';

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
