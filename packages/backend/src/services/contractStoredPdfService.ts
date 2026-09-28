import { pool } from '../utils/db.js';
import { isPdfSignatureDocumentKind } from './contractLifecycle.js';
import { readContractPdfByKey } from './contractPdfStorageService.js';

function sanitizeFilenamePart(s: string): string {
  return String(s || 'contrato')
    .replace(/[^\w\s.-áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/gi, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'contrato';
}

export type StoredPdfPreference = 'signed' | 'view' | 'original';

/**
 * Carrega PDF armazenado para contratos pdf_signature.
 * view = frozen ou original; signed = PDF final assinado quando existir.
 */
export async function loadStoredContractPdfBuffer(
  contractId: string,
  preference: StoredPdfPreference = 'view',
): Promise<{ buffer: Buffer; filename: string } | null> {
  const r = await pool.query<{
    title: string;
    contract_number: string;
    document_kind: string | null;
    signed_pdf_storage_key: string | null;
    frozen_pdf_storage_key: string | null;
    original_pdf_storage_key: string | null;
  }>(
    `SELECT title, contract_number, document_kind, signed_pdf_storage_key, frozen_pdf_storage_key, original_pdf_storage_key
     FROM contracts WHERE id = $1`,
    [contractId],
  );
  const c = r.rows[0];
  if (!c || !isPdfSignatureDocumentKind(c.document_kind)) return null;

  let key: string | null = null;
  let suffix = '';
  if (preference === 'signed' && c.signed_pdf_storage_key?.trim()) {
    key = c.signed_pdf_storage_key.trim();
    suffix = '-assinado';
  } else if (preference === 'original' && c.original_pdf_storage_key?.trim()) {
    key = c.original_pdf_storage_key.trim();
  } else {
    key = (c.frozen_pdf_storage_key || c.original_pdf_storage_key || '').trim() || null;
  }
  if (!key) return null;

  const buffer = await readContractPdfByKey(key);
  const filename = `${sanitizeFilenamePart(c.title)}-${c.contract_number}${suffix}.pdf`;
  return { buffer, filename };
}
