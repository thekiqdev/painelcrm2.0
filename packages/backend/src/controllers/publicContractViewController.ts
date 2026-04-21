/**
 * GET público read-only: visualização do contrato por token opaco (Etapa 3).
 * PDF e signatários públicos: mesmas regras de elegibilidade do token de visualização.
 */
import { Request, Response } from 'express';
import {
  getPublicContractViewByRawToken,
  resolveContractIdForPublicViewToken,
} from '../services/contractPublicViewService.js';
import { buildContractPdfBufferForPublicView } from '../services/contractPdfService.js';
import { rewriteStoredCatalogMediaUrlForClient } from '../utils/catalogMediaPublicSignedUrl.js';

function statusLabelPt(status: string): string {
  const m: Record<string, string> = {
    DRAFT: 'Rascunho',
    PENDING_SIGNATURE: 'Pendente de assinatura',
    PARTIALLY_SIGNED: 'Assinatura parcial',
    ACTIVE: 'Ativo',
    INACTIVE: 'Inativo',
    EXPIRED: 'Expirado',
    CANCELLED: 'Cancelado',
  };
  return m[status] ?? status;
}

const VIEW_DISCLAIMER =
  'Este é um link público de visualização do contrato. O documento abaixo está em modo somente leitura e inclui, no final da folha, a secção de signatários alinhada ao PDF. Para assinar, utilize o link de assinatura enviado separadamente (não é esta página).';

export async function getPublicContractView(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const payload = await getPublicContractViewByRawToken(raw);
    if (!payload) {
      res.status(404).json({
        error: 'Link inválido, revogado ou expirado.',
        code: 'CONTRACT_PUBLIC_VIEW_NOT_FOUND',
      });
      return;
    }
    res.json({
      kind: 'contract_public_view',
      title: payload.title,
      status: payload.status,
      status_label: statusLabelPt(payload.status),
      contract_number: payload.contract_number,
      document_html: payload.document_html,
      client_name: payload.client_name,
      tenant: {
        name: payload.tenant_name,
        logo_url: rewriteStoredCatalogMediaUrlForClient(req, payload.tenant_logo_url),
        logo_light_url: rewriteStoredCatalogMediaUrlForClient(req, payload.tenant_logo_light_url),
        logo_dark_url: rewriteStoredCatalogMediaUrlForClient(req, payload.tenant_logo_dark_url),
      },
      responsible_display_name: payload.responsible_display_name,
      signers: payload.signers.map((s) => ({
        name: s.name,
        email: s.email,
        tax_id: s.tax_id,
        signed: s.signed,
        signed_at: s.signed_at,
        signature_image_png_base64: s.signature_image_png_base64,
      })),
      disclaimer: VIEW_DISCLAIMER,
    });
  } catch (e) {
    console.error('getPublicContractView:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPublicContractPdf(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const contractId = await resolveContractIdForPublicViewToken(raw);
    if (!contractId) {
      res.status(404).json({
        error: 'Link inválido, revogado ou expirado.',
        code: 'CONTRACT_PUBLIC_VIEW_NOT_FOUND',
      });
      return;
    }
    const result = await buildContractPdfBufferForPublicView(contractId);
    if (!result) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'CONTRACT_PDF_NO_SNAPSHOT') {
      res.status(400).json({
        error: 'Não é possível gerar PDF sem documento congelado (snapshot).',
        code: 'CONTRACT_PDF_NO_SNAPSHOT',
      });
      return;
    }
    console.error('getPublicContractPdf:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
