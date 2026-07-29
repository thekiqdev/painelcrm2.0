import { describe, expect, it } from 'vitest';

/**
 * CRM3 — contrato mínimo do bloco `pix_automatic` no GET pay
 * (espelha a lógica de enrich em publicCustomerInvoicesController).
 */
function buildPixAutomaticBlock(opts: {
  offerAvailable: boolean;
  requested: boolean;
  pref: {
    status: string | null;
    has_active: boolean;
    user_opted_off: boolean;
    authorization_id: string | null;
    qr_payload: string | null;
    qr_image: string | null;
  } | null;
  clientHasCpf: boolean;
  subscriptionId: string | null;
  metaCopyPaste?: string | null;
  metaQr?: string | null;
}) {
  const hasAuthState = Boolean(
    opts.pref && (opts.pref.status || opts.pref.has_active || opts.pref.authorization_id)
  );
  const availableGate = opts.offerAvailable || hasAuthState || opts.requested;
  if (!availableGate) return null;
  const status = opts.pref?.status ?? null;
  const has_active = opts.pref?.has_active ?? false;
  const user_opted_off = opts.pref?.user_opted_off ?? false;
  const switch_on =
    !user_opted_off &&
    (has_active ||
      status === 'pending' ||
      (opts.requested && (status == null || status === '') && !user_opted_off));
  return {
    available: opts.offerAvailable || hasAuthState,
    status,
    has_active,
    switch_on,
    user_opted_off,
    authorization_id: opts.pref?.authorization_id ?? null,
    qr_payload:
      status === 'pending'
        ? opts.pref?.qr_payload ?? opts.metaCopyPaste ?? null
        : null,
    qr_image:
      status === 'pending' ? opts.pref?.qr_image ?? opts.metaQr ?? null : null,
    requested: opts.requested,
    client_has_cpf: opts.clientHasCpf,
    subscription_id: opts.subscriptionId,
  };
}

describe('CRM3 GET pay pix_automatic contract', () => {
  it('default ON quando requested e status null', () => {
    const block = buildPixAutomaticBlock({
      offerAvailable: true,
      requested: true,
      pref: {
        status: null,
        has_active: false,
        user_opted_off: false,
        authorization_id: null,
        qr_payload: null,
        qr_image: null,
      },
      clientHasCpf: true,
      subscriptionId: 'sub-1',
    });
    expect(block?.switch_on).toBe(true);
    expect(block?.available).toBe(true);
  });

  it('OFF persistido quando user_opted_off', () => {
    const block = buildPixAutomaticBlock({
      offerAvailable: true,
      requested: true,
      pref: {
        status: 'cleared',
        has_active: false,
        user_opted_off: true,
        authorization_id: null,
        qr_payload: null,
        qr_image: null,
      },
      clientHasCpf: true,
      subscriptionId: 'sub-1',
    });
    expect(block?.switch_on).toBe(false);
  });

  it('expõe QR composto em pending', () => {
    const block = buildPixAutomaticBlock({
      offerAvailable: true,
      requested: true,
      pref: {
        status: 'pending',
        has_active: false,
        user_opted_off: false,
        authorization_id: 'auth-1',
        qr_payload: 'payload-composto',
        qr_image: 'data:image/png;base64,xxx',
      },
      clientHasCpf: true,
      subscriptionId: 'sub-1',
    });
    expect(block?.qr_payload).toBe('payload-composto');
    expect(block?.switch_on).toBe(true);
  });

  it('null quando gate off e sem request/auth', () => {
    const block = buildPixAutomaticBlock({
      offerAvailable: false,
      requested: false,
      pref: null,
      clientHasCpf: false,
      subscriptionId: null,
    });
    expect(block).toBeNull();
  });
});
