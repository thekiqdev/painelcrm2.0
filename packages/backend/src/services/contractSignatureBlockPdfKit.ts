import type PDFDocument from 'pdfkit';
import type { ContractSignatureDisplayModel } from './contractSignatureDisplay.js';

const PDF_SIGNATURE_IMAGE_MAX_BYTES = 400_000;
type PdfDoc = InstanceType<typeof PDFDocument>;

/** Mesmo conteúdo da UI, alinhado à esquerda, sem caixa nem segundo título. */
export function renderSignatureBlockPdfKit(
  doc: PdfDoc,
  model: ContractSignatureDisplayModel,
  contentWidth: number,
  labels?: {
    imageUnavailable: string;
    waiting: string;
    taxId: string;
    email: string;
    signedAt: string;
    method: string;
    signatureId: string;
  },
): void {
  const L = labels ?? {
    imageUnavailable: '(Imagem da assinatura indisponível)',
    waiting: 'Aguardando assinatura',
    taxId: 'CPF',
    email: 'E-mail',
    signedAt: 'Data da assinatura',
    method: 'Método',
    signatureId: 'ID da assinatura',
  };

  const ml = doc.page.margins.left;
  const ruleW = Math.min(200, contentWidth * 0.5);
  doc.moveDown(0.5);
  const topRuleY = doc.y;
  doc.strokeColor('#94a3b8').lineWidth(0.75).moveTo(ml, topRuleY).lineTo(ml + ruleW, topRuleY).stroke();
  doc.moveDown(0.85);

  if (model.signed && model.signatureImagePngBase64) {
    try {
      const buf = Buffer.from(model.signatureImagePngBase64, 'base64');
      if (buf.length <= PDF_SIGNATURE_IMAGE_MAX_BYTES) {
        const imgW = Math.min(180, contentWidth * 0.45);
        const imgMaxH = 52;
        const imgY = doc.y;
        doc.image(buf, ml, imgY, { fit: [imgW, imgMaxH] });
        doc.y = imgY + imgMaxH + 8;
      }
    } catch {
      doc.fontSize(8.5).fillColor('#64748b').text(L.imageUnavailable, ml, doc.y, {
        width: contentWidth,
      });
      doc.moveDown(0.4);
    }
  } else if (!model.signed) {
    doc.fontSize(8.5).fillColor('#64748b').text(L.waiting, ml, doc.y, { width: contentWidth });
    doc.moveDown(0.5);
  }

  const lineY = doc.y + 4;
  doc.strokeColor('#94a3b8').lineWidth(0.5).moveTo(ml, lineY).lineTo(ml + ruleW, lineY).stroke();
  doc.moveDown(0.55);

  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111111').text(model.name, ml, doc.y, {
    width: contentWidth,
    lineGap: 1.8,
  });
  doc.moveDown(0.35);

  doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
  const metaLines: string[] = [];
  if (model.taxId) metaLines.push(`${L.taxId}: ${model.taxId}`);
  metaLines.push(`${L.email}: ${model.email}`);
  if (model.signedAtLabel) metaLines.push(`${L.signedAt}: ${model.signedAtLabel}`);
  if (model.ip) metaLines.push(`IP: ${model.ip}`);
  if (model.methodLabel) metaLines.push(`${L.method}: ${model.methodLabel}`);
  if (model.signatureId) metaLines.push(`${L.signatureId}: ${model.signatureId}`);

  for (const line of metaLines) {
    doc.text(line, ml, doc.y, { width: contentWidth, lineGap: 1.5 });
  }

  doc.fillColor('#000000').font('Helvetica');
  doc.moveDown(1);
  doc.x = ml;
}
