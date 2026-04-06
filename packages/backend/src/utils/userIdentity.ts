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
