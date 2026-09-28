import { Request, Response } from 'express';
import { getPlatformTrackingSettings } from '../services/platformTrackingSettingsService.js';

export async function getPublicPlatformTrackingSettings(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getPlatformTrackingSettings();
    if (!data.meta_pixel_enabled || !data.meta_pixel_id) {
      res.json({
        meta_pixel_enabled: false,
        meta_pixel_id: null,
        meta_track_page_view: false,
        meta_track_lead: false,
        meta_track_complete_registration: false,
      });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
      meta_pixel_enabled: true,
      meta_pixel_id: data.meta_pixel_id,
      meta_track_page_view: data.meta_track_page_view,
      meta_track_lead: data.meta_track_lead,
      meta_track_complete_registration: data.meta_track_complete_registration,
    });
  } catch (e: unknown) {
    console.error('[public/tracking-settings] get', e);
    res.status(500).json({ error: 'Erro ao carregar configuração de tracking.' });
  }
}
