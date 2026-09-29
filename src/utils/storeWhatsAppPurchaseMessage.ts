/** Mensagem padrão de compra via WhatsApp (vitrine). */
export const DEFAULT_STORE_WHATSAPP_PURCHASE_MESSAGE =
  'Olá! Gostaria de solicitar um orçamento para o {{product_type}} "{{product_name}}"{{variant}}. Pode me ajudar?';

const MAX_MESSAGE_LEN = 1000;

export type StoreWhatsAppMessageContext = {
  productName: string;
  productType: 'product' | 'service' | string;
  variantLabel?: string | null;
  storeName?: string | null;
};

/** Template efetivo: customizado ou padrão. */
export function resolveStoreWhatsAppPurchaseTemplate(
  custom: string | null | undefined
): string {
  const t = String(custom ?? '').trim();
  return t || DEFAULT_STORE_WHATSAPP_PURCHASE_MESSAGE;
}

export function productTypeLabel(type: string | null | undefined): string {
  return type === 'service' ? 'serviço' : 'produto';
}

/**
 * Monta a mensagem final substituindo placeholders.
 * `{{variant}}` vira ` (rótulo)` ou string vazia.
 */
export function buildStoreWhatsAppPurchaseMessage(
  template: string | null | undefined,
  ctx: StoreWhatsAppMessageContext
): string {
  const raw = resolveStoreWhatsAppPurchaseTemplate(template);
  const variant = ctx.variantLabel?.trim()
    ? ` (${ctx.variantLabel.trim()})`
    : '';
  const filled = raw
    .replace(/\{\{\s*product_name\s*\}\}/gi, ctx.productName.trim() || 'produto')
    .replace(/\{\{\s*product_type\s*\}\}/gi, productTypeLabel(ctx.productType))
    .replace(/\{\{\s*variant\s*\}\}/gi, variant)
    .replace(/\{\{\s*store_name\s*\}\}/gi, (ctx.storeName || '').trim() || 'loja')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return filled.slice(0, MAX_MESSAGE_LEN);
}

/** Preview na config: usa exemplo se não houver produto real. */
export function previewStoreWhatsAppPurchaseMessage(
  template: string | null | undefined
): string {
  return buildStoreWhatsAppPurchaseMessage(template, {
    productName: 'Nome do produto',
    productType: 'product',
    variantLabel: 'Cor × Tamanho',
    storeName: 'Minha Loja',
  });
}
