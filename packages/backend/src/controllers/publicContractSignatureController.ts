import { Request, Response } from 'express';
import { z } from 'zod';
import {
  computePublicSignatureGetState,
  getPublicSignatureInvitePayload,
  loadSignatureInviteByTokenHash,
  submitPublicSignature,
} from '../services/contractSignatureInviteService.js';
import { readContractPdfByKey } from '../services/contractPdfStorageService.js';
import { loadStoredContractPdfBuffer } from '../services/contractStoredPdfService.js';
import { rebuildSignedPdfForContract } from '../services/contractSignedPdfBuilder.js';
import { isPdfSignatureDocumentKind } from '../services/contractLifecycle.js';
import { insertSignatureAudit } from '../services/contractSignatureFieldsService.js';
import { sha256Buffer } from '../services/contractPdfStorageService.js';
import { hashPublicViewToken } from '../services/contractPublicViewService.js';

const postBodySchema = z.object({
  accept_terms: z.literal(true),
  confirmed_name: z.string().min(2).max(200),
  // Base64 ≈ 4/3 do binário; teto alinhado a MAX_SIGNATURE_PNG_BYTES no serviço (~520 KiB)
  signature_image_base64: z.string().min(80).max(720_000),
});

export async function getPublicSignatureInvite(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const out = await getPublicSignatureInvitePayload(raw);
    if (!out) {
      res.status(404).json({ error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' });
      return;
    }
    res.status(out.httpStatus).json(out.body);
  } catch (e) {
    console.error('getPublicSignatureInvite:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPublicSignaturePdf(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    if (raw.length < 32) {
      res.status(404).json({ error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' });
      return;
    }
    const hash = hashPublicViewToken(raw);
    const row = await loadSignatureInviteByTokenHash(hash);
    const isPdf =
      isPdfSignatureDocumentKind(row?.document_kind) ||
      Boolean(row?.frozen_pdf_storage_key?.trim() || row?.original_pdf_storage_key?.trim());
    if (!row || !isPdf) {
      res.status(404).json({ error: 'PDF não disponível.', code: 'CONTRACT_PDF_NOT_FOUND' });
      return;
    }
    const st = computePublicSignatureGetState(row);
    if (st.kind === 'invalid') {
      res.status(404).json({ error: 'Convite inválido ou expirado.', code: 'SIGNATURE_INVITE_NOT_FOUND' });
      return;
    }
    let buf: Buffer;
    if (row.signer_signed_at || row.invite_consumed) {
      let signed = await loadStoredContractPdfBuffer(row.contract_id, 'signed');
      if (!signed) {
        await rebuildSignedPdfForContract(row.contract_id, row.tenant_id, {
          preferSignerId: row.signer_id,
        });
        signed = await loadStoredContractPdfBuffer(row.contract_id, 'signed');
      }
      if (signed) {
        buf = signed.buffer;
      } else {
        const key = row.frozen_pdf_storage_key || row.original_pdf_storage_key;
        if (!key) {
          res.status(404).json({ error: 'PDF não encontrado.', code: 'CONTRACT_PDF_NOT_FOUND' });
          return;
        }
        buf = await readContractPdfByKey(key);
      }
    } else {
      const key = row.frozen_pdf_storage_key || row.original_pdf_storage_key;
      if (!key) {
        res.status(404).json({ error: 'PDF não encontrado.', code: 'CONTRACT_PDF_NOT_FOUND' });
        return;
      }
      try {
        const { buildCompositePdfBuffer } = await import('../services/contractPdfCompositeService.js');
        const composite = await buildCompositePdfBuffer(row.contract_id);
        buf = composite.buffer;
      } catch {
        buf = await readContractPdfByKey(key);
      }
    }
    const ip =
      typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim().slice(0, 80)
        : req.socket.remoteAddress?.slice(0, 80) ?? null;
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : null;
    void insertSignatureAudit({
      contractId: row.contract_id,
      signerId: row.signer_id,
      eventType: 'VIEWED',
      clientIp: ip,
      userAgent: ua,
      documentHashSha256: sha256Buffer(buf),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buf);
  } catch (e) {
    console.error('getPublicSignaturePdf:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function postPublicSignature(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const body = postBodySchema.parse(req.body ?? {});
    const out = await submitPublicSignature({
      rawToken: raw,
      acceptTerms: body.accept_terms,
      confirmedName: body.confirmed_name,
      signatureImageBase64: body.signature_image_base64,
      req,
    });
    res.status(out.httpStatus).json(out.body);
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos.', code: 'SIGNATURE_VALIDATION', details: e.errors });
      return;
    }
    console.error('postPublicSignature:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
