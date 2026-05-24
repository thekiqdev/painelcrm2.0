import { pool } from '../utils/db.js';
import { isPdfSignatureDocumentKind } from './contractLifecycle.js';
import { contractSignedPdfKey, readContractPdfByKey, sha256Buffer } from './contractPdfStorageService.js';
import { embedFieldsInPdfFromBuffer, type PdfEmbedField } from './contractPdfEmbedService.js';
import { buildCompositePdfBuffer } from './contractPdfCompositeService.js';
import { listSignatureFields } from './contractSignatureFieldsService.js';
import { parseSignerSignatureDisplay } from './contractSignatureDisplay.js';
import type { PdfSignatureMeta } from './contractPdfEmbedService.js';

type SignerRow = {
  id: string;
  role: string;
  name: string;
  email: string;
  tax_id: string | null;
  signed_at: string | null;
  signature_data: Record<string, unknown> | null;
};

function signerPngBase64(signatureData: Record<string, unknown> | null): string | null {
  if (!signatureData || typeof signatureData !== 'object') return null;
  const b64 = signatureData.signature_image_png_base64;
  return typeof b64 === 'string' && b64.length > 80 ? b64 : null;
}

function signerHasPng(s: SignerRow): boolean {
  return Boolean(s.signed_at && signerPngBase64(s.signature_data));
}

/**
 * Resolve o signatário dono de um campo. Nunca reutiliza a assinatura de outro signatário.
 * - Com contract_signer_id: só o dono, e apenas se já assinou.
 * - Legado (sem id): preferSignerId só no primeiro campo compatível; ou único assinado da mesma role.
 */
function pickSignerForField(
  signers: SignerRow[],
  signerType: string,
  preferSignerId: string | null | undefined,
  fieldSignerId: string | null | undefined,
  legacyPreferConsumed: { value: boolean },
): SignerRow | null {
  if (fieldSignerId) {
    const owner = signers.find((s) => s.id === fieldSignerId);
    return owner && signerHasPng(owner) ? owner : null;
  }

  const signed = signers.filter(signerHasPng);
  const role = signerType === 'INTERNAL' ? 'INTERNAL' : 'CLIENT';

  if (preferSignerId && !legacyPreferConsumed.value) {
    const preferred = signed.find((s) => s.id === preferSignerId && s.role === role);
    if (preferred) {
      legacyPreferConsumed.value = true;
      return preferred;
    }
  }

  const roleSigned = signed.filter((s) => s.role === role);
  if (roleSigned.length === 1) return roleSigned[0];
  return null;
}

function appendDefaultEmbedFields(
  embedInputs: PdfEmbedField[],
  signers: SignerRow[],
  pageCount: number,
): void {
  const signed = signers.filter((s) => s.signed_at && signerPngBase64(s.signature_data));
  if (signed.length === 0) return;
  const page = Math.max(1, pageCount);
  let yOffset = 72;
  for (const signer of signed) {
    const png = signerPngBase64(signer.signature_data);
    if (!png) continue;
    const display = parseSignerSignatureDisplay({
      id: signer.id,
      name: signer.name,
      email: signer.email,
      tax_id: signer.tax_id,
      signed_at: signer.signed_at,
      signature_data: signer.signature_data,
    });
    embedInputs.push({
      page,
      x: 8,
      y: yOffset,
      width: 52,
      height: 18,
      fieldType: 'signature',
      imagePngBase64: png,
      signatureMeta: {
        name: display.name,
        email: display.email,
        taxId: display.taxId,
        signedAtLabel: display.signedAtLabel,
        ip: display.ip,
        methodLabel: display.methodLabel,
        signatureId: display.signatureId,
      },
    });
    yOffset += 36;
  }
}

/** Gera/atualiza PDF assinado a partir do PDF congelado e campos + assinaturas já capturadas. */
export async function rebuildSignedPdfForContract(
  contractId: string,
  tenantId: string,
  options?: { preferSignerId?: string | null },
): Promise<string | null> {
  const cr = await pool.query<{
    document_kind: string;
    frozen_pdf_storage_key: string | null;
    original_pdf_storage_key: string | null;
  }>(`SELECT document_kind, frozen_pdf_storage_key, original_pdf_storage_key FROM contracts WHERE id = $1`, [
    contractId,
  ]);
  const c = cr.rows[0];
  if (!c || !isPdfSignatureDocumentKind(c.document_kind)) return null;

  if (!c.original_pdf_storage_key && !c.frozen_pdf_storage_key) return null;

  let composite: { buffer: Buffer; pageCount: number };
  try {
    composite = await buildCompositePdfBuffer(contractId);
  } catch {
    return null;
  }

  const fields = await listSignatureFields(contractId);
  const preferSignerId = options?.preferSignerId ?? null;
  const sr = await pool.query<SignerRow & { email: string; tax_id: string | null }>(
    `SELECT id, role, name, email, tax_id, signed_at, signature_data FROM contract_signers WHERE contract_id = $1
     ORDER BY signing_order NULLS LAST, created_at`,
    [contractId],
  );
  const signers = sr.rows.map((r) => ({
    ...r,
    signature_data:
      typeof r.signature_data === 'object' && r.signature_data !== null
        ? (r.signature_data as Record<string, unknown>)
        : null,
  }));

  const embedInputs: PdfEmbedField[] = [];
  const legacyPreferConsumed = { value: false };
  const sortedFields = [...fields].sort(
    (a, b) => a.page - b.page || (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  for (const f of sortedFields) {
    if (f.field_type === 'signature') {
      const signer = pickSignerForField(
        signers,
        f.signer_type,
        preferSignerId,
        f.contract_signer_id,
        legacyPreferConsumed,
      );
      const png = signer ? signerPngBase64(signer.signature_data) : null;
      if (!png) continue;
      const display = signer
        ? parseSignerSignatureDisplay({
            id: signer.id,
            name: signer.name,
            email: signer.email,
            tax_id: signer.tax_id,
            signed_at: signer.signed_at,
            signature_data: signer.signature_data,
          })
        : null;
      const meta: PdfSignatureMeta | undefined = display
        ? {
            name: display.name,
            email: display.email,
            taxId: display.taxId,
            signedAtLabel: display.signedAtLabel,
            ip: display.ip,
            methodLabel: display.methodLabel,
            signatureId: display.signatureId,
          }
        : undefined;
      embedInputs.push({
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        fieldType: 'signature',
        imagePngBase64: png,
        signatureMeta: meta,
        fieldId: f.id,
        signerId: signer?.id ?? f.contract_signer_id,
      });
    } else if (f.field_type === 'name') {
      const signer = pickSignerForField(
        signers,
        f.signer_type,
        preferSignerId,
        f.contract_signer_id,
        { value: false },
      );
      embedInputs.push({
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        fieldType: 'name',
        value: signer?.name ?? '',
      });
    } else if (f.field_type === 'date') {
      const signer = pickSignerForField(
        signers,
        f.signer_type,
        preferSignerId,
        f.contract_signer_id,
        { value: false },
      );
      const d = signer?.signed_at ? new Date(signer.signed_at).toLocaleDateString('pt-BR') : '';
      embedInputs.push({
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        fieldType: 'date',
        value: d,
      });
    }
  }

  if (embedInputs.length === 0) {
    appendDefaultEmbedFields(embedInputs, signers, composite.pageCount);
  }

  if (embedInputs.length === 0) return null;

  const destKey = contractSignedPdfKey(tenantId, contractId);
  await embedFieldsInPdfFromBuffer({
    pdfBytes: composite.buffer,
    destStorageKey: destKey,
    fields: embedInputs,
  });

  const buf = await readContractPdfByKey(destKey);
  const hash = sha256Buffer(buf);
  await pool.query(
    `UPDATE contracts SET signed_pdf_storage_key = $2, updated_at = now() WHERE id = $1`,
    [contractId, destKey],
  );
  return hash;
}
