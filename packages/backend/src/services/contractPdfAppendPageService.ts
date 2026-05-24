import { PDFDocument } from 'pdf-lib';
import { pool } from '../utils/db.js';
import {
  contractOriginalPdfKey,
  readContractPdfByKey,
  saveContractOriginalPdf,
} from './contractPdfStorageService.js';
import { isDocumentFrozen } from './contractLifecycle.js';

export async function appendBlankPageToContractPdf(
  contractId: string,
  tenantId: string,
): Promise<{ pdf_page_count: number }> {
  const r = await pool.query<{
    original_pdf_storage_key: string | null;
    frozen_pdf_storage_key: string | null;
    status: string;
    document_kind: string;
  }>(
    `SELECT original_pdf_storage_key, frozen_pdf_storage_key, status::text AS status, document_kind
     FROM contracts WHERE id = $1`,
    [contractId],
  );
  const row = r.rows[0];
  if (!row?.original_pdf_storage_key) {
    throw new Error('CONTRACT_PDF_REQUIRED');
  }
  if (isDocumentFrozen(String(row.status))) {
    throw new Error('CONTRACT_FROZEN');
  }
  if (String(row.document_kind) !== 'pdf_signature') {
    throw new Error('CONTRACT_NOT_PDF_MODE');
  }

  const key = row.original_pdf_storage_key;
  const buf = await readContractPdfByKey(key);
  const doc = await PDFDocument.load(buf);
  const ref = doc.getPage(0);
  const { width, height } = ref.getSize();
  doc.addPage([width, height]);
  const out = Buffer.from(await doc.save());
  await saveContractOriginalPdf(tenantId, contractId, out);
  const pageCount = doc.getPageCount();

  await pool.query(
    `UPDATE contracts SET pdf_page_count = $2, updated_at = now() WHERE id = $1`,
    [contractId, pageCount],
  );

  return { pdf_page_count: pageCount };
}
