import { describe, it, expect } from 'vitest';
import {
  tenantUserIdsSubquery,
  whereUserInTenant,
  joinUserTenant,
  tenantIdFromUserSubquery,
  joinUserTenantByUserId,
  whereUserInTenantFromUserId,
  assertTenantId,
  getTenantIdOrNull,
  ensureTenantIdForInsert,
  ensureUserIdForInsert,
  stripTenantIdFromBody,
} from './tenantScope.js';

describe('tenantScope', () => {
  describe('tenantUserIdsSubquery', () => {
    it('gera subquery com índice do parâmetro correto', () => {
      expect(tenantUserIdsSubquery(1)).toBe('(SELECT id FROM users WHERE tenant_id = $1)');
      expect(tenantUserIdsSubquery(2)).toBe('(SELECT id FROM users WHERE tenant_id = $2)');
    });
  });

  describe('whereUserInTenant', () => {
    it('gera WHERE com coluna e índice', () => {
      expect(whereUserInTenant('user_id', 1)).toBe(
        'user_id IN (SELECT id FROM users WHERE tenant_id = $1)'
      );
      expect(whereUserInTenant('p.user_id', 3)).toBe(
        'p.user_id IN (SELECT id FROM users WHERE tenant_id = $3)'
      );
    });
  });

  describe('joinUserTenant', () => {
    it('gera JOIN por tenant_id', () => {
      expect(joinUserTenant('p', 'user_id', 1)).toBe(
        'INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1'
      );
    });
  });

  describe('tenantIdFromUserSubquery', () => {
    it('gera subquery tenant_id a partir de user_id', () => {
      expect(tenantIdFromUserSubquery(2)).toBe('(SELECT tenant_id FROM users WHERE id = $2)');
    });
  });

  describe('joinUserTenantByUserId', () => {
    it('gera JOIN que deriva tenant do userId', () => {
      const j = joinUserTenantByUserId('e', 'user_id', 2);
      expect(j).toContain('INNER JOIN users u ON u.id = e.user_id');
      expect(j).toContain('(SELECT tenant_id FROM users WHERE id = $2)');
    });
  });

  describe('whereUserInTenantFromUserId', () => {
    it('gera WHERE user_id no tenant derivado do userId', () => {
      const w = whereUserInTenantFromUserId('user_id', 2);
      expect(w).toContain('user_id IN (SELECT id FROM users WHERE tenant_id =');
      expect(w).toContain('(SELECT tenant_id FROM users WHERE id = $2)');
    });
  });

  describe('assertTenantId', () => {
    it('não lança quando tenantId é string não vazia', () => {
      expect(() => assertTenantId('uuid-aqui')).not.toThrow();
    });
    it('lança quando tenantId é null', () => {
      expect(() => assertTenantId(null)).toThrow('Tenant required');
    });
    it('lança quando tenantId é undefined', () => {
      expect(() => assertTenantId(undefined)).toThrow('Tenant required');
    });
    it('lança quando tenantId é string vazia', () => {
      expect(() => assertTenantId('')).toThrow('Tenant required');
    });
  });

  describe('getTenantIdOrNull', () => {
    it('retorna o valor quando definido', () => {
      expect(getTenantIdOrNull('tid')).toBe('tid');
      expect(getTenantIdOrNull('')).toBe('');
    });
    it('retorna null para null/undefined', () => {
      expect(getTenantIdOrNull(null)).toBe(null);
      expect(getTenantIdOrNull(undefined)).toBe(null);
    });
  });

  describe('ensureTenantIdForInsert', () => {
    it('retorna tenantId quando presente', () => {
      expect(ensureTenantIdForInsert({ tenantId: 't1' })).toBe('t1');
      expect(ensureTenantIdForInsert({ userId: 'u1', tenantId: 't2' })).toBe('t2');
    });
    it('lança quando tenantId é null/undefined', () => {
      expect(() => ensureTenantIdForInsert({ userId: 'u1' })).toThrow('Tenant required');
      expect(() => ensureTenantIdForInsert({ tenantId: null })).toThrow('Tenant required');
    });
  });

  describe('ensureUserIdForInsert', () => {
    it('retorna userId quando presente', () => {
      expect(ensureUserIdForInsert({ userId: 'u1' })).toBe('u1');
      expect(ensureUserIdForInsert({ userId: 'u2', tenantId: 't1' })).toBe('u2');
    });
    it('lança quando userId é null/undefined', () => {
      expect(() => ensureUserIdForInsert({ tenantId: 't1' })).toThrow('Authentication required');
      expect(() => ensureUserIdForInsert({})).toThrow('Authentication required');
    });
  });

  describe('stripTenantIdFromBody', () => {
    it('remove tenant_id do body', () => {
      const body = { name: 'x', tenant_id: 't1' };
      const out = stripTenantIdFromBody(body);
      expect(out).not.toHaveProperty('tenant_id');
      expect(out).toEqual({ name: 'x' });
    });
    it('mantém demais campos', () => {
      const body = { a: 1, b: 'y', tenant_id: 't1' };
      const out = stripTenantIdFromBody(body);
      expect(out).toEqual({ a: 1, b: 'y' });
    });
    it('não quebra se body não tem tenant_id', () => {
      const body = { name: 'z' };
      expect(stripTenantIdFromBody(body)).toEqual({ name: 'z' });
    });
  });
});
