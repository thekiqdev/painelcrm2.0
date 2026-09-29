import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
}));

vi.mock('./tenantDomainFlags.js', () => ({
  isTenantCustomDomainEnabled: vi.fn().mockResolvedValue(true),
  isTenantDomainVerifyBypassEnabled: vi.fn().mockResolvedValue(false),
  isTenantHostRole: (v: unknown) => v === 'store' || v === 'support',
  getTenantCustomDomainBlockedHosts: vi.fn().mockReturnValue(['localhost', '127.0.0.1']),
  getTenantCustomDomainCnameTarget: vi.fn().mockReturnValue('edge.platform.com'),
}));

vi.mock('node:dns/promises', () => ({
  default: {
    resolveTxt: vi.fn(),
    resolveCname: vi.fn(),
  },
}));

import dns from 'node:dns/promises';
import {
  isTenantCustomDomainEnabled,
  isTenantDomainVerifyBypassEnabled,
} from './tenantDomainFlags.js';
import {
  changeTenantHostRole,
  clearTenantDomain,
  setTenantDomain,
  verifyTenantDomain,
} from './tenantDomainService.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('tenantDomainService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTenantCustomDomainEnabled).mockResolvedValue(true);
    vi.mocked(isTenantDomainVerifyBypassEnabled).mockResolvedValue(false);
  });

  it('setTenantDomain rejeita role inválida', async () => {
    await expect(
      setTenantDomain({ tenantId: TENANT_ID, hostnameRaw: 'loja.empresa.com', role: 'app' })
    ).rejects.toMatchObject({ code: 'ROLE_INVALID' });
  });

  it('setTenantDomain rejeita se feature off', async () => {
    vi.mocked(isTenantCustomDomainEnabled).mockResolvedValue(false);
    await expect(
      setTenantDomain({ tenantId: TENANT_ID, hostnameRaw: 'loja.empresa.com', role: 'store' })
    ).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('setTenantDomain grava pending + token (store)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ account_type: 'platform_customer' }] }) // assertPlatformCustomer
      .mockResolvedValueOnce({ rows: [] }) // getTenantHostByRole
      .mockResolvedValueOnce({ rows: [] }) // partner collision
      .mockResolvedValueOnce({ rows: [] }) // tenant collision
      .mockResolvedValueOnce({
        rows: [
          {
            id: HOST_ID,
            tenant_id: TENANT_ID,
            hostname: 'loja.empresa.com',
            role: 'store',
            status: 'pending',
            verification_token: 'tok1234567890',
            verified_at: null,
            activated_at: null,
            last_check_at: null,
            last_error: null,
            created_at: '',
            updated_at: '',
          },
        ],
      });

    const instr = await setTenantDomain({
      tenantId: TENANT_ID,
      hostnameRaw: 'https://Loja.Empresa.com/path',
      role: 'store',
    });
    expect(instr.hostname).toBe('loja.empresa.com');
    expect(instr.role).toBe('store');
    expect(instr.status).toBe('pending');
    expect(instr.txt_host).toBe('_painelcrm-tenant.loja.empresa.com');
    expect(instr.cname_target).toBe('edge.platform.com');
  });

  it('setTenantDomain rejeita colisão com Partner', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ account_type: 'platform_customer' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ partner_tenant_id: 'p1' }] });

    await expect(
      setTenantDomain({ tenantId: TENANT_ID, hostnameRaw: 'crm.parceiro.com', role: 'support' })
    ).rejects.toMatchObject({ code: 'DOMAIN_TAKEN_PARTNER' });
  });

  it('verifyTenantDomain bypass via flag', async () => {
    vi.mocked(isTenantDomainVerifyBypassEnabled).mockResolvedValue(true);
    const row = {
      id: HOST_ID,
      tenant_id: TENANT_ID,
      hostname: 'suporte.empresa.com',
      role: 'support',
      status: 'pending',
      verification_token: 'tok',
      verified_at: null,
      activated_at: null,
      last_check_at: null,
      last_error: null,
      created_at: '',
      updated_at: '',
    };
    query
      .mockResolvedValueOnce({ rows: [row] }) // get by role
      .mockResolvedValueOnce({ rows: [] }) // last_check
      .mockResolvedValueOnce({ rows: [] }) // set active
      .mockResolvedValueOnce({ rows: [{ ...row, status: 'active' }] }); // getHostById

    const result = await verifyTenantDomain({ tenantId: TENANT_ID, role: 'support' });
    expect(result.verified).toBe(true);
    expect(result.method).toBe('bypass');
    expect(result.status).toBe('active');
  });

  it('verifyTenantDomain aceita TXT', async () => {
    const row = {
      id: HOST_ID,
      tenant_id: TENANT_ID,
      hostname: 'loja.empresa.com',
      role: 'store',
      status: 'pending',
      verification_token: 'abc123token',
      verified_at: null,
      activated_at: null,
      last_check_at: null,
      last_error: null,
      created_at: '',
      updated_at: '',
    };
    query
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...row, status: 'active' }] });
    vi.mocked(dns.resolveTxt).mockResolvedValue([['abc123token']]);
    vi.mocked(dns.resolveCname).mockRejectedValue(new Error('ENODATA'));

    const result = await verifyTenantDomain({ tenantId: TENANT_ID, role: 'store' });
    expect(result.verified).toBe(true);
    expect(result.method).toBe('txt');
  });

  it('clearTenantDomain remove por role', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await clearTenantDomain({ tenantId: TENANT_ID, role: 'store' });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tenant_hosts'),
      [TENANT_ID, 'store']
    );
  });

  it('changeTenantHostRole troca store → support mantendo hostname', async () => {
    const row = {
      id: HOST_ID,
      tenant_id: TENANT_ID,
      hostname: 'loja.empresa.com',
      role: 'store',
      status: 'active',
      verification_token: 'tok',
      verified_at: null,
      activated_at: null,
      last_check_at: null,
      last_error: null,
      created_at: '',
      updated_at: '',
    };
    query
      .mockResolvedValueOnce({ rows: [{ account_type: 'platform_customer' }] })
      .mockResolvedValueOnce({ rows: [row] }) // fromRole
      .mockResolvedValueOnce({ rows: [] }) // toRole free
      .mockResolvedValueOnce({
        rows: [{ ...row, role: 'support' }],
      });

    const out = await changeTenantHostRole({
      tenantId: TENANT_ID,
      fromRole: 'store',
      toRole: 'support',
    });
    expect(out.role).toBe('support');
    expect(out.hostname).toBe('loja.empresa.com');
    expect(out.status).toBe('active');
  });

  it('setTenantDomain rejeita hostname de outro tenant', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ account_type: 'platform_customer' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'other-host', tenant_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
      });

    await expect(
      setTenantDomain({ tenantId: TENANT_ID, hostnameRaw: 'loja.outra.com', role: 'store' })
    ).rejects.toMatchObject({ code: 'DOMAIN_TAKEN' });
  });

  it('setTenantDomain rejeita mesmo hostname em outro papel (store↔support)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ account_type: 'platform_customer' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: HOST_ID, tenant_id: TENANT_ID }],
      });

    await expect(
      setTenantDomain({
        tenantId: TENANT_ID,
        hostnameRaw: 'loja.empresa.com',
        role: 'support',
      })
    ).rejects.toMatchObject({ code: 'DOMAIN_TAKEN_ROLE' });
  });

  it('changeTenantHostRole rejeita se destino já tem host', async () => {
    const storeRow = {
      id: HOST_ID,
      tenant_id: TENANT_ID,
      hostname: 'loja.empresa.com',
      role: 'store',
      status: 'active',
      verification_token: 'tok',
      verified_at: null,
      activated_at: null,
      last_check_at: null,
      last_error: null,
      created_at: '',
      updated_at: '',
    };
    query
      .mockResolvedValueOnce({ rows: [{ account_type: 'platform_customer' }] })
      .mockResolvedValueOnce({ rows: [storeRow] })
      .mockResolvedValueOnce({
        rows: [{ ...storeRow, id: 'other', role: 'support', hostname: 'suporte.empresa.com' }],
      });

    await expect(
      changeTenantHostRole({
        tenantId: TENANT_ID,
        fromRole: 'store',
        toRole: 'support',
      })
    ).rejects.toMatchObject({ code: 'DOMAIN_TAKEN_ROLE' });
  });

  it('verifyTenantDomain demove active → pending se DNS falhar', async () => {
    const row = {
      id: HOST_ID,
      tenant_id: TENANT_ID,
      hostname: 'loja.empresa.com',
      role: 'store',
      status: 'active',
      verification_token: 'abc123token',
      verified_at: null,
      activated_at: null,
      last_check_at: null,
      last_error: null,
      created_at: '',
      updated_at: '',
    };
    query
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...row, status: 'pending', last_error: 'DNS ainda não propagou (TXT/CNAME)' }],
      });
    vi.mocked(dns.resolveTxt).mockRejectedValue(new Error('ENODATA'));
    vi.mocked(dns.resolveCname).mockRejectedValue(new Error('ENODATA'));

    const result = await verifyTenantDomain({ tenantId: TENANT_ID, role: 'store' });
    expect(result.verified).toBe(false);
    expect(result.status).toBe('pending');
  });
});
