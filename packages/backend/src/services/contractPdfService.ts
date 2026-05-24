/**
 * PDF simples do contrato a partir do snapshot congelado (Etapa 5).
 * Uso autenticado (painel) e público (token de visualização) partilham o mesmo layout.
 */
import PDFDocument from 'pdfkit';
import { pool } from '../utils/db.js';
import { findContractInTenant } from '../utils/contractAccess.js';
import { assertModulePermission } from '../permissions/index.js';
import type { AuthRequest } from '../middleware/auth.js';
import {
  htmlToPdfBodyBlocks,
  snapshotHtmlToFallbackPlain,
  type PdfBodyBlock,
} from './contractPdfBodyLayout.js';
import { loadStoredContractPdfBuffer } from './contractStoredPdfService.js';
import { parseSignerSignatureDisplay } from './contractSignatureDisplay.js';
import { renderSignatureBlockPdfKit } from './contractSignatureBlockPdfKit.js';
import { stripTrailingSignatureSectionFromHtml } from './contractDocumentHtml.js';

type PdfDoc = InstanceType<typeof PDFDocument>;

/** Composição tipográfica do corpo: blocos extraídos do HTML → estilos distintos (próximo da view A4). */
function renderContractBodyForPdf(doc: PdfDoc, blocks: PdfBodyBlock[], contentWidth: number): void {
  for (const b of blocks) {
    const text = b.text?.trim();
    if (!text) continue;

    switch (b.kind) {
      case 'h1':
        doc.moveDown(0.35);
        doc.font('Helvetica-Bold').fontSize(17).fillColor('#111111');
        doc.text(text, { width: contentWidth, lineGap: 3.2, align: 'left' });
        doc.font('Helvetica').fillColor('#000000');
        doc.moveDown(1.05);
        break;
      case 'h2':
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(14.5).fillColor('#151515');
        doc.text(text, { width: contentWidth, lineGap: 3, align: 'left' });
        doc.font('Helvetica').fillColor('#000000');
        doc.moveDown(0.95);
        break;
      case 'h3':
        doc.moveDown(0.28);
        doc.font('Helvetica-Bold').fontSize(12.5).fillColor('#1a1a1a');
        doc.text(text, { width: contentWidth, lineGap: 2.8, align: 'left' });
        doc.font('Helvetica').fillColor('#000000');
        doc.moveDown(0.85);
        break;
      case 'h4':
        doc.moveDown(0.22);
        doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#222222');
        doc.text(text, { width: contentWidth, lineGap: 2.6, align: 'left' });
        doc.font('Helvetica').fillColor('#000000');
        doc.moveDown(0.75);
        break;
      case 'li':
        doc.font('Helvetica').fontSize(11).fillColor('#000000');
        doc.text(text, {
          width: contentWidth - 20,
          indent: 20,
          align: 'justify',
          lineGap: 4,
        });
        doc.moveDown(0.55);
        break;
      case 'quote':
        doc.font('Helvetica').fontSize(10.5).fillColor('#333333');
        doc.text(text, {
          width: contentWidth - 16,
          indent: 16,
          align: 'left',
          lineGap: 4,
        });
        doc.fillColor('#000000');
        doc.moveDown(0.85);
        break;
      case 'p':
        doc.font('Helvetica').fontSize(11).fillColor('#000000');
        doc.text(text, {
          width: contentWidth,
          align: 'justify',
          lineGap: 4.6,
        });
        doc.moveDown(0.95);
        break;
    }
  }
}

/** Evita embutir PNGs anormalmente grandes em PDF (registos antigos ou anomalias). */
const PDF_SIGNATURE_IMAGE_MAX_BYTES = 520_000;

function safeFilenamePart(s: string): string {
  return String(s || 'contrato')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .slice(0, 80);
}

export type ContractPdfMetaRow = {
  title: string;
  contract_number: string;
  content_snapshot_html: string | null;
  status: string;
  document_frozen_at: string | null;
  tenant_name: string | null;
};

export type ContractSignerPdfRow = {
  name: string;
  email: string;
  tax_id: string | null;
  signed_at: string | null;
  signature_data: unknown;
};

function formatBrazilTaxIdDisplay(input: string | null | undefined): string {
  const d = String(input || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d;
}

/** Gera o PDF a partir do snapshot em texto simples e das linhas de signatários (mesma fonte que o painel). */
export async function buildPdfBufferFromContractSnapshot(
  c: ContractPdfMetaRow,
  signers: ContractSignerPdfRow[],
): Promise<{ buffer: Buffer; filename: string }> {
  const snapRaw = String(c.content_snapshot_html || '').trim();
  const snap =
    signers.length > 0 ? stripTrailingSignatureSectionFromHtml(snapRaw) : snapRaw;
  const filename = `contrato-${safeFilenamePart(c.contract_number)}.pdf`;

  const marginSide = 52;
  const textWidth = 595.28 - marginSide * 2;

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      margin: marginSide,
      info: {
        Title: c.title,
        Author: c.tenant_name || 'PainelCRM',
        Subject: `Contrato ${c.contract_number} (snapshot)`,
      },
    });
    doc.on('data', (d: Buffer) => chunks.push(d));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text(c.title, { align: 'center', lineGap: 2.8 });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10.5).fillColor('#444444').text(`Nº ${c.contract_number}`, { align: 'center', lineGap: 1.8 });
    if (c.tenant_name) doc.moveDown(0.28);
    if (c.tenant_name) doc.text(String(c.tenant_name), { align: 'center', lineGap: 1.6 });
    doc.moveDown(0.75);
    const ml = doc.page.margins.left;
    const lineEnd = ml + textWidth;
    doc.strokeColor('#dddddd').lineWidth(0.5).moveTo(ml, doc.y).lineTo(lineEnd, doc.y).stroke();
    doc.moveDown(0.9);

    let bodyBlocks = htmlToPdfBodyBlocks(snap);
    if (bodyBlocks.length === 0 && snap) {
      const plain = snapshotHtmlToFallbackPlain(snap);
      if (plain) bodyBlocks = [{ kind: 'p', text: plain }];
    }
    renderContractBodyForPdf(doc, bodyBlocks, textWidth);

    const bottomReserve = 220;
    if (doc.y > doc.page.height - marginSide - bottomReserve) {
      doc.addPage();
    }
    doc.moveDown(2.45);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('Assinatura', {
      width: textWidth,
      lineGap: 2,
    });
    doc.font('Helvetica').fillColor('#000000');
    doc.moveDown(0.85);
    if (!signers.length) {
      doc.fontSize(9.5).fillColor('#555555').text('Nenhum signatário configurado para este contrato.', {
        width: textWidth,
        lineGap: 1.75,
      });
      doc.fillColor('#000000');
    }
    for (const s of signers) {
      const model = parseSignerSignatureDisplay({
        id: s.email,
        name: s.name,
        email: s.email,
        tax_id: s.tax_id,
        signed_at: s.signed_at,
        signature_data: s.signature_data,
      });
      renderSignatureBlockPdfKit(doc, model, textWidth);
      doc.moveDown(1.2);
    }

    doc.end();
  });

  return { buffer, filename };
}

async function loadSignersForPdf(contractId: string): Promise<ContractSignerPdfRow[]> {
  const signersR = await pool.query<ContractSignerPdfRow>(
    `SELECT name, email, tax_id, signed_at, signature_data
     FROM contract_signers WHERE contract_id = $1
     ORDER BY signing_order NULLS LAST, created_at`,
    [contractId],
  );
  return signersR.rows;
}

export async function buildContractPdfBuffer(params: {
  contractId: string;
  requestUserId: string;
  req: AuthRequest;
}): Promise<{ buffer: Buffer; filename: string } | null> {
  const contract = await findContractInTenant(params.contractId, params.requestUserId);
  if (!contract) return null;

  await assertModulePermission(
    params.requestUserId,
    'contracts',
    'view',
    { ownerId: contract.user_id, assigneeId: contract.responsible_id },
    params.req,
  );

  const storedSigned = await loadStoredContractPdfBuffer(params.contractId, 'signed');
  if (storedSigned) return storedSigned;
  const storedView = await loadStoredContractPdfBuffer(params.contractId, 'view');
  if (storedView) return storedView;

  const row = await pool.query<ContractPdfMetaRow>(
    `SELECT c.title, c.contract_number, c.content_snapshot_html, c.status::text AS status,
            c.document_frozen_at, t.name AS tenant_name
     FROM contracts c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
     LEFT JOIN tenants t ON t.id = u.tenant_id
     WHERE c.id = $1`,
    [params.contractId, params.requestUserId],
  );
  const c = row.rows[0];
  if (!c) return null;

  const snap = String(c.content_snapshot_html || '').trim();
  if (!snap) {
    throw new Error('CONTRACT_PDF_NO_SNAPSHOT');
  }

  const signers = await loadSignersForPdf(params.contractId);
  return buildPdfBufferFromContractSnapshot(c, signers);
}

/**
 * PDF pelo mesmo snapshot e mesma secção de signatários que o painel, sem autenticação.
 * Só deve ser chamado após validar o token público de visualização (mesmo contrato).
 */
export async function buildContractPdfBufferForPublicView(contractId: string): Promise<{
  buffer: Buffer;
  filename: string;
} | null> {
  const storedSigned = await loadStoredContractPdfBuffer(contractId, 'signed');
  if (storedSigned) return storedSigned;

  const storedView = await loadStoredContractPdfBuffer(contractId, 'view');
  if (storedView) return storedView;

  const row = await pool.query<ContractPdfMetaRow>(
    `SELECT c.title, c.contract_number, c.content_snapshot_html, c.status::text AS status,
            c.document_frozen_at, t.name AS tenant_name
     FROM contracts c
     INNER JOIN users u ON u.id = c.user_id
     LEFT JOIN tenants t ON t.id = u.tenant_id
     WHERE c.id = $1`,
    [contractId],
  );
  const c = row.rows[0];
  if (!c) return null;

  const snap = String(c.content_snapshot_html || '').trim();
  if (!snap) {
    throw new Error('CONTRACT_PDF_NO_SNAPSHOT');
  }

  const signers = await loadSignersForPdf(contractId);
  return buildPdfBufferFromContractSnapshot(c, signers);
}
