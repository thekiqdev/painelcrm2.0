/**
 * Alinha métodos de fatura (PIX | BOLETO | CREDIT_CARD) com a config do gateway (slugs).
 */

export type InvoicePaymentMethodUi = "PIX" | "BOLETO" | "CREDIT_CARD";

export type GatewayPaymentMethodSlug = "pix" | "boleto" | "credit_card";

const SLUG_TO_PM: Record<GatewayPaymentMethodSlug, InvoicePaymentMethodUi> = {
  pix: "PIX",
  boleto: "BOLETO",
  credit_card: "CREDIT_CARD",
};

export function invoiceMethodsFromGatewaySlugs(slugs: GatewayPaymentMethodSlug[]): InvoicePaymentMethodUi[] {
  const out: InvoicePaymentMethodUi[] = [];
  for (const s of slugs) {
    const m = SLUG_TO_PM[s];
    if (m && !out.includes(m)) out.push(m);
  }
  return out.length > 0 ? out : ["PIX", "BOLETO", "CREDIT_CARD"];
}

/** Igual ao link público: combina o gravado na fatura com o que o gateway permite hoje. */
export function effectiveLinkPaymentMethods(
  stored: InvoicePaymentMethodUi[] | null | undefined,
  gatewayEnabled: InvoicePaymentMethodUi[]
): InvoicePaymentMethodUi[] {
  const ge = gatewayEnabled.length > 0 ? gatewayEnabled : ["PIX", "BOLETO", "CREDIT_CARD"];
  if (!stored || stored.length === 0) {
    return [...ge];
  }
  const g = new Set(ge);
  const hit = stored.filter((m) => g.has(m));
  return hit.length > 0 ? hit : [...ge];
}

const PM_LABEL: Record<InvoicePaymentMethodUi, string> = {
  PIX: "PIX",
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de crédito",
};

export function formatInvoicePaymentMethodLabel(pm: string | null | undefined): string {
  if (pm === "PIX" || pm === "BOLETO" || pm === "CREDIT_CARD") return PM_LABEL[pm];
  return pm?.trim() ? String(pm) : "—";
}
