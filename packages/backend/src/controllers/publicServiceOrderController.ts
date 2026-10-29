import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  getPublicServiceOrderSignPdfBuffer,
  getPublicServiceOrderSignaturePayload,
  getPublicServiceOrderViewPayload,
  getPublicServiceOrderViewPdfBuffer,
  submitPublicServiceOrderSignature,
} from '../services/serviceOrderSignatureService.js';
import { rewriteStoredCatalogMediaUrlForClient } from '../utils/catalogMediaPublicSignedUrl.js';

function rewriteTenantLogosInBody(req: Request, body: Record<string, unknown>): Record<string, unknown> {
  const tenant = body.tenant;
  if (!tenant || typeof tenant !== 'object') return body;
  const t = tenant as Record<string, unknown>;
  return {
    ...body,
    tenant: {
      ...t,
      logo_url: rewriteStoredCatalogMediaUrlForClient(req, (t.logo_url as string | null) ?? null),
      logo_light_url: rewriteStoredCatalogMediaUrlForClient(
        req,
        (t.logo_light_url as string | null) ?? null,
      ),
      logo_dark_url: rewriteStoredCatalogMediaUrlForClient(
        req,
        (t.logo_dark_url as string | null) ?? null,
      ),
    },
  };
}

export async function getPublicServiceOrderView(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const out = await getPublicServiceOrderViewPayload(raw);
    if (!out) {
      res.status(404).json({ error: 'Link inválido.', code: 'VIEW_TOKEN_NOT_FOUND' });
      return;
    }
    res.status(out.httpStatus).json(rewriteTenantLogosInBody(req, out.body));
  } catch (e) {
    console.error('getPublicServiceOrderView:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPublicServiceOrderViewPdf(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const buf = await getPublicServiceOrderViewPdfBuffer(raw);
    if (!buf) {
      res.status(404).json({ error: 'PDF não disponível.', code: 'PDF_NOT_FOUND' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="ordem-servico.pdf"');
    res.send(buf);
  } catch (e) {
    console.error('getPublicServiceOrderViewPdf:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPublicServiceOrderSign(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const out = await getPublicServiceOrderSignaturePayload(raw);
    if (!out) {
      res.status(404).json({ error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' });
      return;
    }
    res.status(out.httpStatus).json(rewriteTenantLogosInBody(req, out.body));
  } catch (e) {
    console.error('getPublicServiceOrderSign:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPublicServiceOrderSignPdf(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const buf = await getPublicServiceOrderSignPdfBuffer(raw);
    if (!buf) {
      res.status(404).json({ error: 'PDF não disponível.', code: 'PDF_NOT_FOUND' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="ordem-servico.pdf"');
    res.send(buf);
  } catch (e) {
    console.error('getPublicServiceOrderSignPdf:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const postBodySchema = z.object({
  accept_terms: z.literal(true),
  confirmed_name: z.string().min(2).max(200),
  signature_image_base64: z.string().min(80).max(720_000),
});

export async function postPublicServiceOrderSign(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const body = postBodySchema.parse(req.body ?? {});
    const out = await submitPublicServiceOrderSignature({
      rawToken: raw,
      acceptTerms: body.accept_terms,
      confirmedName: body.confirmed_name,
      signatureImageBase64: body.signature_image_base64,
      req,
    });
    res.status(out.httpStatus).json(out.body);
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: e.errors });
      return;
    }
    console.error('postPublicServiceOrderSign:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
