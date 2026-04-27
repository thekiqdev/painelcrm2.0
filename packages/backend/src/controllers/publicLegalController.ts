import type { Request, Response } from 'express';
import { isLegalPagesPublicApiEnabled } from '../config/legalPagesEnv.js';
import { getLegalPagePublished, type LegalPageType } from '../services/legalPagesService.js';

function parseType(segment: string): LegalPageType | null {
  if (segment === 'privacy-policy') return 'privacy_policy';
  if (segment === 'terms-of-service') return 'terms_of_service';
  return null;
}

export async function getPublicLegalPage(req: Request, res: Response): Promise<void> {
  if (!isLegalPagesPublicApiEnabled()) {
    res.status(404).json({ ok: false, error: 'Páginas legais desativadas.', code: 'legal_pages_disabled' });
    return;
  }
  const segment = String(req.params.page || '');
  const type = parseType(segment);
  if (!type) {
    res.status(404).json({ ok: false, error: 'Página não encontrada.' });
    return;
  }
  try {
    const row = await getLegalPagePublished(type);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.json({
      ok: true,
      type,
      html: row.html,
      published_at: row.published_at,
      updated_at: row.updated_at,
      status: row.status,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao carregar página legal.';
    console.error('[public/legal]', e);
    res.status(500).json({ ok: false, error: msg });
  }
}
