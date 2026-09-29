import type { StoreProfile } from "@/types/products";

/** Valor ligado (true / "true" / "1"); ausente ≠ ligado no checkout. */
function isEnabledFlag(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string" && (v.toLowerCase() === "true" || v === "1")) return true;
  return false;
}

/** Desligado só se explicitamente false (ausente = ligado, compat). */
function isExplicitlyDisabled(v: unknown): boolean {
  if (v === false) return true;
  if (typeof v === "string" && (v.toLowerCase() === "false" || v === "0")) return true;
  return false;
}

/**
 * Checkout da loja na vitrine: só a configuração da loja importa
 * (`is_active` + `store_checkout_enabled`). Sem flags globais de ambiente.
 * O botão Comprar ainda exige preço válido no produto (camada de página).
 */
export function canUseStoreCheckout(
  store: Pick<StoreProfile, "is_active" | "store_checkout_enabled"> | null | undefined
): boolean {
  if (!store || !store.is_active) return false;
  return isEnabledFlag(store.store_checkout_enabled);
}

/**
 * Compra via WhatsApp na vitrine:
 * loja ativa + chave ligada (default true se ausente) + número configurado.
 * Pode coexistir com checkout online.
 */
export function canUseStoreWhatsAppPurchase(
  store:
    | Pick<
        StoreProfile,
        "is_active" | "store_whatsapp_purchase_enabled" | "contact_whatsapp"
      >
    | null
    | undefined
): boolean {
  if (!store || !store.is_active) return false;
  const phone = String(store.contact_whatsapp ?? "").replace(/\D/g, "");
  if (phone.length < 8) return false;
  if (isExplicitlyDisabled(store.store_whatsapp_purchase_enabled)) return false;
  return true;
}
