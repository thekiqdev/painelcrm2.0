import { Response } from 'express';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { isDocumentFrozen, isDraftStatus } from '../services/contractLifecycle.js';
import {
  contractSignedPdfKey,
  readContractPdfByKey,
  saveContractOriginalPdf,
} from '../services/contractPdfStorageService.js';
import {
  listSignatureFields,
  replaceSignatureFields,
  type SignatureFieldInput,
} from '../services/contractSignatureFieldsService.js';
import { appendExtraPage } from '../services/contractPdfExtraPagesService.js';
import { rebuildSignedPdfForContract } from '../services/contractSignedPdfBuilder.js';
import { isPdfSignatureDocumentKind } from '../services/contractLifecycle.js';

async function loadContractForUser(
  contractId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const r = await pool.query(
    `SELECT c.*, u.tenant_id
     FROM contracts c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
     WHERE c.id = $1`,
    [contractId, userId],
  );
  return (r.rows[0] as Record<string, unknown>) ?? null;
}

const fieldSchema = z.object({
  page: z.number().int().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  field_type: z.enum(['signature', 'name', 'date']),
  signer_type: z.enum(['CLIENT', 'INTERNAL']).optional(),
  contract_signer_id: z.string().uuid().nullable().optional(),
  required: z.boolean().optional(),
  label: z.string().max(120).nullable().optional(),
  sort_order: z.number().int().optional(),
});

const fieldsBodySchema = z.object({
  fields: z.array(fieldSchema),
  pdf_page_count: z.number().int().min(1).optional(),
});

export async function uploadContractPdf(req: AuthRequest, res: Response): Promise<void> {
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

    const file = req.file;
    if (!file?.buffer?.length) {
      res.status(400).json({ error: 'Envie um arquivo PDF.', code: 'CONTRACT_PDF_REQUIRED' });
      return;
    }

    const tenantId = String(row.tenant_id);
    let pageCount: number | null = null;
    try {
      const doc = await PDFDocument.load(file.buffer);
      pageCount = doc.getPageCount();
    } catch {
      res.status(400).json({ error: 'PDF inválido ou corrompido.', code: 'CONTRACT_PDF_INVALID' });
      return;
    }

    const saved = await saveContractOriginalPdf(tenantId, id, file.buffer);
    await pool.query(
      `UPDATE contracts SET
         document_kind = 'pdf_signature',
         original_pdf_storage_key = $2,
         source_pdf_page_count = $3,
         pdf_page_count = $3,
         updated_at = now()
       WHERE id = $1`,
      [id, saved.storageKey, pageCount],
    );

    res.json({
      document_kind: 'pdf_signature',
      original_pdf_storage_key: saved.storageKey,
      pdf_page_count: pageCount,
      sha256: saved.sha256,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'CONTRACT_PDF_TOO_LARGE') {
      res.status(400).json({ error: 'PDF excede o tamanho máximo.', code: 'CONTRACT_PDF_TOO_LARGE' });
      return;
    }
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('uploadContractPdf:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getContractSourcePdf(req: AuthRequest, res: Response): Promise<void> {
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

    const key =
      (row.frozen_pdf_storage_key as string | null) ||
      (row.original_pdf_storage_key as string | null);
    if (!key) {
      res.status(404).json({ error: 'PDF não encontrado.', code: 'CONTRACT_PDF_NOT_FOUND' });
      return;
    }
    const buf = await readContractPdfByKey(key);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contract-${id}.pdf"`);
    res.send(buf);
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('getContractSourcePdf:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function ensureSignedPdfKeyForContract(
  contractId: string,
  row: Record<string, unknown>,
): Promise<string | null> {
  const existing = row.signed_pdf_storage_key as string | null;
  if (existing?.trim()) return existing.trim();

  const docKind = String(row.document_kind || '');
  const frozen = row.frozen_pdf_storage_key as string | null;
  if (!isPdfSignatureDocumentKind(docKind) && !frozen?.trim()) return null;

  const signedCount = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM contract_signers WHERE contract_id = $1 AND signed_at IS NOT NULL`,
    [contractId],
  );
  if ((signedCount.rows[0]?.n ?? 0) < 1) return null;

  const tenantId = String(row.tenant_id);
  await rebuildSignedPdfForContract(contractId, tenantId);
  const refreshed = await pool.query<{ signed_pdf_storage_key: string | null }>(
    `SELECT signed_pdf_storage_key FROM contracts WHERE id = $1`,
    [contractId],
  );
  const key = refreshed.rows[0]?.signed_pdf_storage_key?.trim();
  return key || null;
}

export async function getContractSignedPdfArtifact(req: AuthRequest, res: Response): Promise<void> {
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

    const key = await ensureSignedPdfKeyForContract(id, row);
    if (!key) {
      res.status(404).json({ error: 'PDF assinado ainda não disponível.', code: 'CONTRACT_SIGNED_PDF_NOT_FOUND' });
      return;
    }
    const buf = await readContractPdfByKey(key);
    res.setHeader('Content-Type', 'application/pdf');
    const inline = req.query.inline === '1' || req.query.inline === 'true';
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="contract-signed-${id}.pdf"`,
    );
    res.send(buf);
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('getContractSignedPdfArtifact:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function postRebuildSignedPdf(req: AuthRequest, res: Response): Promise<void> {
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

    const tenantId = String(row.tenant_id);
    const hash = await rebuildSignedPdfForContract(id, tenantId);
    if (!hash) {
      res.status(400).json({
        error: 'Não foi possível gerar o PDF assinado (sem PDF ou sem assinaturas).',
        code: 'CONTRACT_SIGNED_PDF_BUILD_FAILED',
      });
      return;
    }
    const refreshed = await pool.query<{ signed_pdf_storage_key: string | null }>(
      `SELECT signed_pdf_storage_key FROM contracts WHERE id = $1`,
      [id],
    );
    res.json({
      ok: true,
      signed_pdf_storage_key: refreshed.rows[0]?.signed_pdf_storage_key ?? null,
      document_hash_sha256: hash,
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('postRebuildSignedPdf:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getContractSignatureFields(req: AuthRequest, res: Response): Promise<void> {
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
    const fields = await listSignatureFields(id);
    res.json({
      fields,
      pdf_page_count: row.pdf_page_count ?? null,
      document_kind: row.document_kind ?? 'html_editor',
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('getContractSignatureFields:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function putContractSignatureFields(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const body = fieldsBodySchema.parse(req.body ?? {});
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
    if (String(row.document_kind) !== 'pdf_signature') {
      res.status(400).json({ error: 'Contrato não é do tipo PDF com assinatura.', code: 'CONTRACT_NOT_PDF_MODE' });
      return;
    }
    if (!(row.original_pdf_storage_key as string | null)) {
      res.status(400).json({ error: 'Faça upload do PDF antes de salvar os campos.', code: 'CONTRACT_PDF_REQUIRED' });
      return;
    }

    const fields = await replaceSignatureFields(id, body.fields as SignatureFieldInput[]);
    if (body.pdf_page_count != null) {
      await pool.query(`UPDATE contracts SET pdf_page_count = $2, updated_at = now() WHERE id = $1`, [
        id,
        body.pdf_page_count,
      ]);
    }
    res.json({ fields });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos.', details: e.errors });
      return;
    }
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('putContractSignatureFields:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function postAppendContractPdfPage(req: AuthRequest, res: Response): Promise<void> {
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

    const tenantId = String(row.tenant_id);
    const result = await appendExtraPage(id);
    res.json({
      ok: true,
      source_pdf_page_count: result.source_pdf_page_count,
      pdf_page_count: result.pdf_page_count,
      page: result.page,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'CONTRACT_PDF_REQUIRED') {
      res.status(400).json({ error: 'Faça upload do PDF antes.', code: 'CONTRACT_PDF_REQUIRED' });
      return;
    }
    if (msg === 'CONTRACT_FROZEN') {
      res.status(409).json({ error: 'Contrato congelado.', code: 'CONTRACT_FROZEN' });
      return;
    }
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('postAppendContractPdfPage:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
