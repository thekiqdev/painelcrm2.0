import { describe, expect, it } from 'vitest';
import { toPublicPixAutomaticStatus, type PixAutomaticAuthRow } from './crmPixAutomaticStore.js';

describe('crmPixAutomaticStore helpers (CRM1)', () => {
  it('toPublicPixAutomaticStatus normaliza QR para data URL', () => {
    const row: PixAutomaticAuthRow = {
      subscription_id: 's1',
      tenant_id: 't1',
      authorization_id: 'a1',
      status: 'pending',
      gateway: 'asaas',
      authorized_at: null,
      cancelled_at: null,
      contract_id: null,
      qr_payload: 'payload',
      qr_image: 'rawbase64',
      conciliation_id: 'c1',
    };
    const pub = toPublicPixAutomaticStatus(row);
    expect(pub?.qr_image).toBe('data:image/png;base64,rawbase64');
    expect(pub?.has_active).toBe(false);
  });

  it('toPublicPixAutomaticStatus limpa QR quando active', () => {
    const row: PixAutomaticAuthRow = {
      subscription_id: 's1',
      tenant_id: 't1',
      authorization_id: 'a1',
      status: 'active',
      gateway: 'asaas',
      authorized_at: null,
      cancelled_at: null,
      contract_id: null,
      qr_payload: 'payload',
      qr_image: 'raw',
      conciliation_id: 'c1',
    };
    const pub = toPublicPixAutomaticStatus(row);
    expect(pub?.qr_payload).toBeNull();
    expect(pub?.qr_image).toBeNull();
    expect(pub?.has_active).toBe(true);
  });
});
