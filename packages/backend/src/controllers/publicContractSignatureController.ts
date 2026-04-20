import { Request, Response } from 'express';
import { z } from 'zod';
import {
  getPublicSignatureInvitePayload,
  submitPublicSignature,
} from '../services/contractSignatureInviteService.js';

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
