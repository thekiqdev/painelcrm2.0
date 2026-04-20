import type { StoreProfile } from "@/types/products";

/** Valor vindo da API (boolean ou serialização eventual). */
function isCheckoutEnabledValue(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string" && (v.toLowerCase() === "true" || v === "1")) return true;
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
  return isCheckoutEnabledValue(store.store_checkout_enabled);
}
