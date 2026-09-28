/**
 * Validação de e-mail e WhatsApp para fluxo de checkout (reutilizável).
 * Mantém mesma semântica de unicidade que registerOrganizationController.
 */
import { pool } from '../utils/db.js';
import { normalizeEmailForUniqueness, normalizeWhatsappDigits } from '../utils/userIdentity.js';

export async function assertAdminEmailAvailableForCheckout(normalizedEmail: string): Promise<void> {
  const r = await pool.query('SELECT 1 FROM users WHERE lower(btrim(email)) = $1 LIMIT 1', [normalizedEmail]);
  if (r.rows.length > 0) {
    const err = new Error('EMAIL_ALREADY_REGISTERED_USE_LOGIN');
    (err as Error & { code?: string }).code = 'EMAIL_ALREADY_REGISTERED_USE_LOGIN';
    throw err;
  }
}

export async function assertAdminWhatsappAvailableForCheckout(digits: string): Promise<void> {
  if (digits.length < 8) return;
  const r = await pool.query(
    `SELECT 1 FROM users
     WHERE length(regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g')) >= 8
       AND regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g') = $1
     LIMIT 1`,
    [digits]
  );
  if (r.rows.length > 0) {
    const err = new Error('WHATSAPP_ALREADY_REGISTERED_USE_LOGIN');
    (err as Error & { code?: string }).code = 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN';
    throw err;
  }
}

export { normalizeEmailForUniqueness, normalizeWhatsappDigits };
