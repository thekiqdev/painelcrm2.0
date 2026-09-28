/**
 * WC1: plano personalizado exige quantidade contratada de conexões WhatsApp.
 * Fonte: tenants.max_whatsapp_instances_override (não reutilizar seats).
 */
export const CUSTOM_WHATSAPP_QUANTITY_REQUIRED_MSG =
  'Plano personalizado exige a quantidade contratada de conexões WhatsApp (número ≥ 0).';

export const CUSTOM_WHATSAPP_BELOW_USAGE_MSG =
  'A quantidade contratada de conexões WhatsApp não pode ser menor que o uso atual.';

/** Retorna mensagem de erro ou null se válido. */
export function validateCustomWhatsAppOverride(
  override: number | null | undefined,
): string | null {
  if (override == null || typeof override !== 'number' || !Number.isFinite(override)) {
    return CUSTOM_WHATSAPP_QUANTITY_REQUIRED_MSG;
  }
  if (!Number.isInteger(override) || override < 0) {
    return CUSTOM_WHATSAPP_QUANTITY_REQUIRED_MSG;
  }
  return null;
}

export function validateCustomWhatsAppOverrideAgainstUsage(
  override: number,
  currentUsage: number,
): string | null {
  if (override < currentUsage) {
    return CUSTOM_WHATSAPP_BELOW_USAGE_MSG;
  }
  return null;
}
