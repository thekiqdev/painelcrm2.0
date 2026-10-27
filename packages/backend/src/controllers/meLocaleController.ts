import type { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { canonicalizeStoredLocale, localeErrorMessage } from '../i18n/appLocale.js';
import { getRequestLocale } from '../middleware/localeMiddleware.js';

const bodySchema = z.object({
  locale: z.string().max(32).nullable(),
});

/**
 * PATCH /api/me/locale
 * Grava profiles.locale sem o código de edição do WhatsApp (não é dado sensível do perfil).
 */
export async function patchMeLocale(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = bodySchema.parse(req.body ?? {});
    const parsed = canonicalizeStoredLocale(body.locale);
    if (!parsed.ok || parsed.locale == null) {
      const locale = getRequestLocale(req);
      res.status(400).json({
        error: localeErrorMessage(locale, 'invalid_locale'),
        code: 'INVALID_LOCALE',
      });
      return;
    }

    const updated = await pool.query(
      `UPDATE profiles SET locale = $2, updated_at = now() WHERE id = $1`,
      [userId, parsed.locale]
    );
    if ((updated.rowCount ?? 0) === 0) {
      await pool.query(
        `INSERT INTO profiles (id, whatsapp_number, locale)
         VALUES ($1, COALESCE((SELECT whatsapp_number FROM users WHERE id = $1), ''), $2)`,
        [userId, parsed.locale]
      );
    }

    res.json({ locale: parsed.locale });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const locale = getRequestLocale(req);
      res.status(400).json({
        error: localeErrorMessage(locale, 'invalid_locale'),
        code: 'INVALID_LOCALE',
      });
      return;
    }
    console.error('[me/locale] patch', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
