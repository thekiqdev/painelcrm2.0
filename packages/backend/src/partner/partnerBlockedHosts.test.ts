import { afterEach, describe, expect, it } from 'vitest';
import { getPartnerBlockedHosts } from './partnerBlockedHosts.js';

describe('getPartnerBlockedHosts', () => {
  afterEach(() => {
    delete process.env.PARTNER_WL_BLOCKED_HOSTS;
    delete process.env.FRONTEND_URL;
    delete process.env.PUBLIC_APP_URL;
    delete process.env.PARTNER_WL_CNAME_TARGET;
  });

  it('inclui localhost e hosts da plataforma', () => {
    process.env.FRONTEND_URL = 'https://app.painelcrm.com';
    process.env.PARTNER_WL_CNAME_TARGET = 'customers.painelcrm.com';
    const hosts = getPartnerBlockedHosts();
    expect(hosts).toContain('localhost');
    expect(hosts).toContain('app.painelcrm.com');
    expect(hosts).toContain('customers.painelcrm.com');
    expect(hosts).toContain('painelcrm.com');
  });
});
