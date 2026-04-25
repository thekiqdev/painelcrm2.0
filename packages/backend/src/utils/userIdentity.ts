/** Normalização de e-mail e WhatsApp para unicidade global na plataforma. */

export const MIN_WHATSAPP_DIGITS_FOR_UNIQUENESS = 8;

export function normalizeEmailForUniqueness(email: string): string {
  return email.trim().toLowerCase();
}

/** Retorna apenas dígitos ou null se vazio / abaixo do mínimo para política de unicidade. */
export function normalizeWhatsappDigits(whatsapp: string | null | undefined): string | null {
  if (whatsapp == null || whatsapp === '') return null;
  const d = whatsapp.replace(/\D/g, '');
  if (d.length < MIN_WHATSAPP_DIGITS_FOR_UNIQUENESS) return null;
  return d;
}

/**
 * Variantes só com dígitos para comparar com `users.whatsapp_number` já gravado (com ou sem DDI 55).
 * Ex.: entrada `11999998888` → `['11999998888','5511999998888']`; entrada `5511999998888` → ambas também.
 * Não altera dados na BD — só expande a busca.
 */
export function buildWhatsappLookupDigitVariants(inputDigits: string): string[] {
  const d = (inputDigits || '').replace(/\D/g, '');
  const out = new Set<string>();
  if (d.length >= MIN_WHATSAPP_DIGITS_FOR_UNIQUENESS) out.add(d);
  if (d.startsWith('55') && d.length >= 12) {
    out.add(d.slice(2));
  }
  if (!d.startsWith('55') && (d.length === 10 || d.length === 11)) {
    out.add(`55${d}`);
  }
  return [...out].filter((x) => x.length >= MIN_WHATSAPP_DIGITS_FOR_UNIQUENESS);
}

/**
 * Número para envio WhatsApp (DDI 55 + DDD + assinante) quando o cadastro guardou só parte nacional.
 */
export function toBrazilWhatsappDialDigits(storedDigits: string): string {
  const d = (storedDigits || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}
