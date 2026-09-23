/**
 * M5-W Block Sprint 1/S3 — partner_wholesale_block_after_days settings + eligibility.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...args: unknown[]) => query(...args) },
}));

vi.mock('../services/auditLogService.js', () => ({
  logSuperAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/collectionPolicy/billingAuditEventWriter.js', () => ({
  writeBillingAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./partnerWholesalePastDueNotifyService.js', () => ({
  notifyPartnerWholesalePastDue: vi.fn().mockResolvedValue({ sent: false }),
}));

import {
  DEFAULT_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS,
  getPartnerWholesaleBlockSettings,
  isPartnerWholesaleBlockEligible,
  resolveWholesaleBlockAfterDaysForSubscription,
  updatePartnerWholesaleBlockSettings,
} from './partnerWholesaleBlockSettingsService.js';
import { markPartnerWholesalePastDueBySubscription } from './partnerWholesaleStatusService.js';
import { writeBillingAuditEvent } from '../services/collectionPolicy/billingAuditEventWriter.js';

const SUB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('partnerWholesaleBlockSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getPartnerWholesaleBlockSettings usa default se vazio', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const s = await getPartnerWholesaleBlockSettings();
    expect(s.block_after_days).toBe(DEFAULT_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS);
  });

  it('getPartnerWholesaleBlockSettings lê valor persistido', async () => {
    query.mockResolvedValueOnce({ rows: [{ value: '7' }] });
    const s = await getPartnerWholesaleBlockSettings();
    expect(s.block_after_days).toBe(7);
  });

  it('updatePartnerWholesaleBlockSettings rejeita fora do range', async () => {
    await expect(updatePartnerWholesaleBlockSettings({ block_after_days: 91 })).rejects.toMatchObject({
      code: 'BLOCK_AFTER_DAYS_INVALID',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('updatePartnerWholesaleBlockSettings persiste inteiro válido', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const s = await updatePartnerWholesaleBlockSettings({ block_after_days: 5 }, 'actor-1');
    expect(s.block_after_days).toBe(5);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO superadmin_settings'),
      expect.arrayContaining(['partner_wholesale_block_after_days', '5'])
    );
  });

  it('isPartnerWholesaleBlockEligible true quando há fatura vencida >= N', async () => {
    query.mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 });
    await expect(isPartnerWholesaleBlockEligible(SUB_ID, 3)).resolves.toBe(true);
    const args = query.mock.calls[0][1] as unknown[];
    expect(args[0]).toBe(SUB_ID);
    expect(args[2]).toBe(3);
  });

  it('isPartnerWholesaleBlockEligible false quando sem match', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(isPartnerWholesaleBlockEligible(SUB_ID, 3)).resolves.toBe(false);
  });

  it('resolveWholesaleBlockAfterDaysForSubscription usa override do Partner', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ value: '3' }] }) // global
      .mockResolvedValueOnce({
        rows: [{ partner_tenant_id: PARTNER_ID, wholesale_block_after_days: 7 }],
      });
    const r = await resolveWholesaleBlockAfterDaysForSubscription(SUB_ID);
    expect(r).toMatchObject({
      days: 7,
      source: 'override',
      partnerTenantId: PARTNER_ID,
      override_days: 7,
    });
  });

  it('resolveWholesaleBlockAfterDaysForSubscription cai no global se NULL', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ value: '5' }] })
      .mockResolvedValueOnce({
        rows: [{ partner_tenant_id: PARTNER_ID, wholesale_block_after_days: null }],
      });
    const r = await resolveWholesaleBlockAfterDaysForSubscription(SUB_ID);
    expect(r).toMatchObject({ days: 5, source: 'global', override_days: null });
  });
});

describe('markPartnerWholesalePastDueBySubscription (eligibility)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não marca se não elegível (dias < N)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ partner_tenant_id: PARTNER_ID }] })
      // resolve for eligibility: global + profile
      .mockResolvedValueOnce({ rows: [{ value: '3' }] })
      .mockResolvedValueOnce({
        rows: [{ partner_tenant_id: PARTNER_ID, wholesale_block_after_days: null }],
      })
      // eligibility billing
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const r = await markPartnerWholesalePastDueBySubscription(SUB_ID);
    expect(r.updated).toBe(false);
    expect(r.eligible).toBe(false);
    expect(writeBillingAuditEvent).not.toHaveBeenCalled();
  });

  it('marca past_due quando elegível + audita', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ partner_tenant_id: PARTNER_ID }] })
      .mockResolvedValueOnce({ rows: [{ value: '3' }] })
      .mockResolvedValueOnce({
        rows: [{ partner_tenant_id: PARTNER_ID, wholesale_block_after_days: null }],
      })
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ partner_tenant_id: PARTNER_ID }], rowCount: 1 })
      // resolve again for log/audit
      .mockResolvedValueOnce({ rows: [{ value: '3' }] })
      .mockResolvedValueOnce({
        rows: [{ partner_tenant_id: PARTNER_ID, wholesale_block_after_days: null }],
      });

    const r = await markPartnerWholesalePastDueBySubscription(SUB_ID);
    expect(r.updated).toBe(true);
    expect(r.partnerTenantId).toBe(PARTNER_ID);
    expect(writeBillingAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'partner_wholesale.past_due',
        entity_id: PARTNER_ID,
      })
    );
  });
});
