import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STORE_WHATSAPP_PURCHASE_MESSAGE,
  buildStoreWhatsAppPurchaseMessage,
  resolveStoreWhatsAppPurchaseTemplate,
} from './storeWhatsAppPurchaseMessage';

describe('storeWhatsAppPurchaseMessage', () => {
  it('usa padrão quando custom vazio', () => {
    expect(resolveStoreWhatsAppPurchaseTemplate('')).toBe(
      DEFAULT_STORE_WHATSAPP_PURCHASE_MESSAGE
    );
  });

  it('substitui placeholders e variante', () => {
    const msg = buildStoreWhatsAppPurchaseMessage(null, {
      productName: 'Boné',
      productType: 'product',
      variantLabel: 'Azul × M',
      storeName: 'Demo',
    });
    expect(msg).toContain('produto');
    expect(msg).toContain('"Boné"');
    expect(msg).toContain('(Azul × M)');
  });

  it('omite variante quando vazia', () => {
    const msg = buildStoreWhatsAppPurchaseMessage(
      'Quero o {{product_name}}{{variant}}',
      { productName: 'Camisa', productType: 'product' }
    );
    expect(msg).toBe('Quero o Camisa');
  });
});
