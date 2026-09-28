import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { drawPdfSignatureDividerLine } from './contractSignatureDivider.js';
import {
  CONTRACT_SIGNATURE_LEGAL_FOOTER,
  type ContractSignatureDisplayModel,
} from './contractSignatureDisplay.js';

const PAGE_W = 595.28;
const PAGE_H = 841.89;

/** Anexa uma página por signatário com o bloco padronizado de assinatura. */
export async function appendSignatureBlocksToPdf(
  pdfBytes: Buffer,
  models: ContractSignatureDisplayModel[],
): Promise<Buffer> {
  const signedModels = models.filter((m) => m.signed);
  if (signedModels.length === 0) return pdfBytes;

  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  const contentW = PAGE_W - margin * 2;

  for (const model of signedModels) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - margin;

    const drawCentered = (text: string, size: number, bold = false, color = rgb(0.2, 0.25, 0.35)) => {
      const f = bold ? fontBold : font;
      const tw = f.widthOfTextAtSize(text, size);
      page.drawText(text, { x: margin + (contentW - tw) / 2, y, size, font: f, color });
      y -= size + 6;
    };

    const drawLeft = (text: string, size: number, indent = 0) => {
      page.drawText(text, { x: margin + indent, y, size, font, color: rgb(0.15, 0.2, 0.28) });
      y -= size + 5;
    };

    y -= 8;
    page.drawText('ASSINATURA', {
      x: margin,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.12, 0.23, 0.37),
    });
    y -= 18;
    page.drawLine({
      start: { x: margin, y },
      end: { x: PAGE_W - margin, y },
      thickness: 0.5,
      color: rgb(0.82, 0.86, 0.9),
    });
    y -= 16;

    const ruleW = 200;
    const ruleX = margin + (contentW - ruleW) / 2;
    drawPdfSignatureDividerLine(page, ruleX, y, ruleW);
    y -= 14;

    if (model.signatureImagePngBase64) {
      try {
        const imgBytes = Buffer.from(model.signatureImagePngBase64, 'base64');
        const img = await doc.embedPng(imgBytes);
        const imgW = 180;
        const imgH = Math.min(56, (img.height / img.width) * imgW);
        page.drawImage(img, {
          x: margin + (contentW - imgW) / 2,
          y: y - imgH,
          width: imgW,
          height: imgH,
        });
        y -= imgH + 12;
      } catch {
        drawCentered('(Imagem da assinatura indisponível)', 8);
      }
    }

    drawPdfSignatureDividerLine(page, ruleX, y, ruleW, 0.5);
    y -= 14;

    drawCentered(model.name, 12, true, rgb(0.12, 0.23, 0.37));
    y -= 4;
    if (model.taxId) drawLeft(`CPF: ${model.taxId}`, 9, 40);
    drawLeft(`E-mail: ${model.email}`, 9, 40);
    if (model.signedAtLabel) drawLeft(`Data da assinatura: ${model.signedAtLabel}`, 9, 40);
    if (model.ip) drawLeft(`IP: ${model.ip}`, 9, 40);
    if (model.methodLabel) drawLeft(`Método: ${model.methodLabel}`, 9, 40);
    if (model.signatureId) drawLeft(`ID da assinatura: ${model.signatureId}`, 8, 40);

    y -= 12;
    const footer = `[ ASSINADO ]  ${CONTRACT_SIGNATURE_LEGAL_FOOTER}`;
    const footerLines = wrapText(footer, font, 7, contentW);
    for (const line of footerLines) {
      const tw = font.widthOfTextAtSize(line, 7);
      page.drawText(line, {
        x: margin + (contentW - tw) / 2,
        y,
        size: 7,
        font,
        color: rgb(0.4, 0.45, 0.5),
      });
      y -= 9;
    }
  }

  return Buffer.from(await doc.save());
}

function wrapText(text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
