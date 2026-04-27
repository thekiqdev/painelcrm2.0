import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getLegalPageAdmin,
  publishLegalPage,
  saveLegalPageDraft,
  type LegalPageType,
} from '../services/legalPagesService.js';

function parseType(segment: string): LegalPageType | null {
  if (segment === 'privacy-policy') return 'privacy_policy';
  if (segment === 'terms-of-service') return 'terms_of_service';
  return null;
}

const draftBodySchema = z.object({
  html: z.string(),
});

const publishBodySchema = z.object({
  html: z.string().optional(),
});

function adminJson(row: Awaited<ReturnType<typeof getLegalPageAdmin>>) {
  return {
    ok: true,
    type: row.type,
    content_draft: row.content_draft,
    content_published: row.content_published,
    status: row.status,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    published_at: row.published_at,
    published_by: row.published_by,
    has_unpublished_changes: row.has_unpublished_changes,
  };
}

export async function getSuperadminLegalPage(req: AuthRequest, res: Response): Promise<void> {
  const segment = String(req.params.page || '');
  const type = parseType(segment);
  if (!type) {
    res.status(404).json({ ok: false, error: 'Página não encontrada.' });
    return;
  }
  try {
    const row = await getLegalPageAdmin(type);
    res.json(adminJson(row));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao carregar página legal.';
    console.error('[superadmin/legal GET]', e);
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function putSuperadminLegalDraft(req: AuthRequest, res: Response): Promise<void> {
  const segment = String(req.params.page || '');
  const type = parseType(segment);
  if (!type) {
    res.status(404).json({ ok: false, error: 'Página não encontrada.' });
    return;
  }
  const parsed = draftBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'Corpo inválido: envie { "html": "..." }.' });
    return;
  }
  try {
    const row = await saveLegalPageDraft(type, parsed.data.html, req.userId);
    res.json(adminJson(row));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao guardar rascunho.';
    const status = /limite/i.test(msg) ? 400 : 500;
    console.error('[superadmin/legal PUT draft]', e);
    res.status(status).json({ ok: false, error: msg });
  }
}

export async function postSuperadminLegalPublish(req: AuthRequest, res: Response): Promise<void> {
  const segment = String(req.params.page || '');
  const type = parseType(segment);
  if (!type) {
    res.status(404).json({ ok: false, error: 'Página não encontrada.' });
    return;
  }
  const parsed = publishBodySchema.safeParse(req.body ?? {});
  const htmlFromBody = parsed.success ? parsed.data.html : undefined;
  try {
    const row = await publishLegalPage(type, req.userId, htmlFromBody);
    res.json(adminJson(row));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao publicar.';
    const status =
      /pelo menos|vazio|limite/i.test(msg) ? 400 : 500;
    console.error('[superadmin/legal POST publish]', e);
    res.status(status).json({ ok: false, error: msg });
  }
}
