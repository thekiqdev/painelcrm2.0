import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { isDocumentFrozen } from '../services/contractLifecycle.js';
import { listSignatureFields } from '../services/contractSignatureFieldsService.js';
import {
  appendExtraPage,
  listExtraPages,
  updateExtraPage,
  virtualPageForExtra,
  getSourcePageCount,
} from '../services/contractPdfExtraPagesService.js';
import { pool } from '../utils/db.js';

async function loadContractForUser(contractId: string, userId: string) {
  const r = await pool.query(
    `SELECT c.*, u.tenant_id
     FROM contracts c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
     WHERE c.id = $1`,
    [contractId, userId],
  );
  return (r.rows[0] as Record<string, unknown>) ?? null;
}

export async function getContractPdfEditorState(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const row = await loadContractForUser(id, userId);
    if (!row) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    await assertModulePermission(userId, 'contracts', 'view', {
      ownerId: row.user_id as string,
      assigneeId: (row.responsible_id as string | null) ?? null,
    }, req);

    const sourcePageCount = await getSourcePageCount(id);
    const extras = await listExtraPages(id);
    const fields = await listSignatureFields(id);

    res.json({
      source_pdf_page_count: sourcePageCount,
      pdf_page_count: sourcePageCount + extras.length,
      extra_pages: extras.map((p) => ({
        id: p.id,
        page_order: p.page_order,
        virtual_page: virtualPageForExtra(sourcePageCount, p.page_order),
        html_snapshot: p.html_snapshot,
        editor_json: p.editor_json,
      })),
      fields,
      document_kind: row.document_kind ?? 'html_editor',
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('getContractPdfEditorState:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const extraPagePatchSchema = z.object({
  html_snapshot: z.string().optional(),
  editor_json: z.record(z.unknown()).optional(),
});

export async function patchContractPdfExtraPage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id, pageId } = req.params;
    const body = extraPagePatchSchema.parse(req.body ?? {});
    const row = await loadContractForUser(id, userId);
    if (!row) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    await assertModulePermission(userId, 'contracts', 'edit', {
      ownerId: row.user_id as string,
      assigneeId: (row.responsible_id as string | null) ?? null,
    }, req);
    if (isDocumentFrozen(String(row.status))) {
      res.status(409).json({ error: 'Contrato congelado.', code: 'CONTRACT_FROZEN' });
      return;
    }

    const updated = await updateExtraPage(id, pageId, body);
    if (!updated) {
      res.status(404).json({ error: 'Página não encontrada' });
      return;
    }
    const source = await getSourcePageCount(id);
    res.json({
      page: {
        ...updated,
        virtual_page: virtualPageForExtra(source, updated.page_order),
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos.' });
      return;
    }
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('patchContractPdfExtraPage:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function postContractPdfExtraPage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const row = await loadContractForUser(id, userId);
    if (!row) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    await assertModulePermission(userId, 'contracts', 'edit', {
      ownerId: row.user_id as string,
      assigneeId: (row.responsible_id as string | null) ?? null,
    }, req);
    if (isDocumentFrozen(String(row.status))) {
      res.status(409).json({ error: 'Contrato congelado.', code: 'CONTRACT_FROZEN' });
      return;
    }
    if (!(row.original_pdf_storage_key as string | null)) {
      res.status(400).json({ error: 'Faça upload do PDF antes.', code: 'CONTRACT_PDF_REQUIRED' });
      return;
    }

    const result = await appendExtraPage(id, '<p>Conteúdo da página adicional. Edite livremente.</p>');
    res.status(201).json({
      ok: true,
      source_pdf_page_count: result.source_pdf_page_count,
      pdf_page_count: result.pdf_page_count,
      page: {
        ...result.page,
        virtual_page: virtualPageForExtra(result.source_pdf_page_count, result.page.page_order),
      },
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('postContractPdfExtraPage:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
