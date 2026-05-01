import type { Request, Response } from 'express';
import {
  runAvatarFinalFieldRepairBatch,
  runWhatsappAvatarCacheBackfillBatch,
} from '../services/whatsappAvatarBackfillService.js';

/**
 * POST body/query: limit, mode (`backfill` | `repair`, default backfill).
 * - backfill: tenta cachear CDN → catálogo.
 * - repair: copia *_cached_url para campo final quando o final está CDN/proxy/vazio; limpa CDN em notificações.
 */
export async function postWhatsappAvatarCacheBackfill(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { limit?: unknown; mode?: unknown } | undefined;
    const raw = body?.limit ?? req.query?.limit;
    const modeRaw = body?.mode ?? req.query?.mode;
    const mode = String(modeRaw ?? 'backfill').toLowerCase();
    if (mode === 'repair') {
      const limit = Math.min(200, Math.max(1, parseInt(String(raw ?? '50'), 10)));
      const result = await runAvatarFinalFieldRepairBatch(limit);
      res.json({ ok: true, mode: 'repair', ...result });
      return;
    }
    const limit = Math.min(100, Math.max(1, parseInt(String(raw ?? '25'), 10)));
    const result = await runWhatsappAvatarCacheBackfillBatch(limit);
    res.json({ ok: true, mode: 'backfill', ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'backfill_failed';
    res.status(500).json({ error: msg });
  }
}
