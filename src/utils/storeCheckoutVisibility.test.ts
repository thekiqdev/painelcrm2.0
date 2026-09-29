import { describe, expect, it } from 'vitest';
import {
  canUseStoreCheckout,
  canUseStoreWhatsAppPurchase,
} from './storeCheckoutVisibility';

describe('canUseStoreCheckout', () => {
  it('exige loja ativa e flag ligada', () => {
    expect(canUseStoreCheckout({ is_active: true, store_checkout_enabled: true })).toBe(true);
    expect(canUseStoreCheckout({ is_active: true, store_checkout_enabled: false })).toBe(false);
    expect(canUseStoreCheckout({ is_active: false, store_checkout_enabled: true })).toBe(false);
  });
});

describe('canUseStoreWhatsAppPurchase', () => {
  it('liga com número e flag (default true se ausente)', () => {
    expect(
      canUseStoreWhatsAppPurchase({
        is_active: true,
        contact_whatsapp: '11999998888',
      })
    ).toBe(true);
    expect(
      canUseStoreWhatsAppPurchase({
        is_active: true,
        contact_whatsapp: '11999998888',
        store_whatsapp_purchase_enabled: true,
      })
    ).toBe(true);
  });

  it('desliga com flag false ou sem número', () => {
    expect(
      canUseStoreWhatsAppPurchase({
        is_active: true,
        contact_whatsapp: '11999998888',
        store_whatsapp_purchase_enabled: false,
      })
    ).toBe(false);
    expect(
      canUseStoreWhatsAppPurchase({
        is_active: true,
        contact_whatsapp: '',
        store_whatsapp_purchase_enabled: true,
      })
    ).toBe(false);
  });
});
