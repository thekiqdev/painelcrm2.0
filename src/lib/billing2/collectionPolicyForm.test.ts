import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLLECTION_POLICY_FORM,
  buildActionsAfterFail,
  buildCollectionPolicyPreview,
  validateCollectionPolicyForm,
} from './collectionPolicyForm';

describe('collectionPolicyForm (Sprint 4)', () => {
  it('defaults alinhados ao PRD §18', () => {
    const d = DEFAULT_COLLECTION_POLICY_FORM;
    expect(d.renew_card_auto).toBe(false);
    expect(d.generate_pix_auto).toBe(true);
    expect(d.pix_automatic_enabled).toBe(false);
    expect(d.auto_suspend_enabled).toBe(false);
    expect(d.auto_cancel_enabled).toBe(false);
    expect(d.reactivate_on_paid).toBe(true);
    expect(d.max_attempts).toBe(3);
  });

  it('valida tentativas ≥ 1 e suspender ≤ cancelar', () => {
    expect(validateCollectionPolicyForm(DEFAULT_COLLECTION_POLICY_FORM)).toEqual({ ok: true });
    expect(
      validateCollectionPolicyForm({ ...DEFAULT_COLLECTION_POLICY_FORM, max_attempts: 0 }).ok
    ).toBe(false);
    expect(
      validateCollectionPolicyForm({
        ...DEFAULT_COLLECTION_POLICY_FORM,
        suspend_after_days: 40,
        cancel_after_days: 30,
      }).ok
    ).toBe(false);
  });

  it('policy só WhatsApp+Email não inclui charge_card em actions_after_fail', () => {
    const actions = buildActionsAfterFail({
      ...DEFAULT_COLLECTION_POLICY_FORM,
      renew_card_auto: false,
      generate_pix_auto: false,
      generate_pix_after_failure: false,
      notify_whatsapp: true,
      notify_email: true,
    });
    expect(actions).toEqual(['notify_whatsapp', 'notify_email']);
    expect(actions.includes('charge_card')).toBe(false);
  });

  it('preview menciona canais e suspensão OFF', () => {
    const text = buildCollectionPolicyPreview(DEFAULT_COLLECTION_POLICY_FORM);
    expect(text).toMatch(/WhatsApp/i);
    expect(text).toMatch(/suspensão automática desligada/i);
    expect(text).toMatch(/PIX/i);
    expect(text).toMatch(/não renovamos cartão automaticamente/i);
    expect(text).not.toMatch(/^Com esta config, na renovação tentamos cartão/i);
  });
});
