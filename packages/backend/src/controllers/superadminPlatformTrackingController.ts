import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import {
  getPlatformTrackingSettings,
  updatePlatformTrackingSettings,
  validatePlatformTrackingUpdate,
  sanitizeMetaPixelId,
} from '../services/platformTrackingSettingsService.js';

const putBodySchema = z
  .object({
    meta_pixel_enabled: z.boolean().optional(),
    meta_pixel_id: z.union([z.string().max(32), z.null()]).optional(),
    meta_track_page_view: z.boolean().optional(),
    meta_track_lead: z.boolean().optional(),
    meta_track_complete_registration: z.boolean().optional(),
  })
  .strict();

export async function getSuperadminPlatformTrackingSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await getPlatformTrackingSettings();
    res.json({ ok: true, ...data });
  } catch (e: unknown) {
    console.error('[superadmin/tracking-settings] get', e);
    res.status(500).json({ ok: false, error: 'Erro ao carregar configuração de tracking.' });
  }
}

export async function putSuperadminPlatformTrackingSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = putBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const payload = {
      ...parsed.data,
      meta_pixel_id:
        parsed.data.meta_pixel_id !== undefined
          ? sanitizeMetaPixelId(parsed.data.meta_pixel_id)
          : undefined,
    };
    const err = validatePlatformTrackingUpdate(payload);
    if (err) {
      res.status(400).json({ ok: false, error: err });
      return;
    }
    const data = await updatePlatformTrackingSettings(payload);
    res.json({ ok: true, ...data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao guardar configuração de tracking.';
    console.error('[superadmin/tracking-settings] put', e);
    res.status(msg.includes('obrigatório') || msg.includes('números') ? 400 : 500).json({ ok: false, error: msg });
  }
}

export async function postSuperadminPlatformTrackingTest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await getPlatformTrackingSettings();
    const err = validatePlatformTrackingUpdate(data);
    if (err) {
      res.status(400).json({ ok: false, error: err });
      return;
    }
    res.json({
      ok: true,
      message:
        'Pixel ativo. Eventos serão disparados nas páginas públicas e em /signup-success.',
      settings: data,
    });
  } catch (e: unknown) {
    console.error('[superadmin/tracking-settings] test', e);
    res.status(500).json({ ok: false, error: 'Erro ao validar configuração de tracking.' });
  }
}
