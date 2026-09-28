import { PDFDocument, rgb, StandardFonts, type PDFImage, type PDFPage } from 'pdf-lib';
import { readBuffer, saveBuffer } from './media/mediaLocalStorageAdapter.js';
import { drawPdfSignatureDividerLine } from './contractSignatureDivider.js';
import { SIGNATURE_CARD_PT } from './pdfSignatureLayout.js';

export type PdfSignatureMeta = {
  name: string;
  email: string;
  taxId?: string | null;
  signedAtLabel?: string | null;
  ip?: string | null;
  methodLabel?: string | null;
  signatureId?: string | null;
};

export type PdfEmbedField = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fieldType: 'signature' | 'name' | 'date';
  value?: string;
  imagePngBase64?: string;
  signatureMeta?: PdfSignatureMeta;
  /** ID do campo em contract_signature_fields (rastreio / debug). */
  fieldId?: string;
  signerId?: string | null;
};

const PAGE_MARGIN = 40;
const META_SIZE = 7;
const META_LINE_H = 9;
const DIVIDER_BLOCK_H = 12;
const NAME_SIZE = 8;

function pctToRect(
  pageW: number,
  pageH: number,
  xPct: number,
  yPct: number,
  wPct: number,
  hPct: number,
): { x: number; y: number; width: number; height: number } {
  const width = (wPct / 100) * pageW;
  const height = (hPct / 100) * pageH;
  const x = (xPct / 100) * pageW;
  const y = pageH - (yPct / 100) * pageH - height;
  return { x, y, width, height };
}

function buildMetaDetailLines(m: PdfSignatureMeta): string[] {
  const lines: string[] = [];
  if (m.taxId) lines.push(`CPF: ${m.taxId}`);
  lines.push(`E-mail: ${m.email}`);
  if (m.signedAtLabel) lines.push(`Data da assinatura: ${m.signedAtLabel}`);
  if (m.ip) lines.push(`IP: ${m.ip}`);
  if (m.methodLabel) lines.push(`Método: ${m.methodLabel}`);
  if (m.signatureId) lines.push(`ID da assinatura: ${m.signatureId}`);
  return lines;
}

/**
 * Bloco padronizado (igual HTML/PDFKit): disclaimer → imagem → linha → nome → metadados.
 * Posiciona o bloco inteiro de forma visível, mesmo com o campo no rodapé do PDF enviado.
 */
function drawStandardSignatureCertificate(
  page: PDFPage,
  pageW: number,
  pageH: number,
  rect: { x: number; y: number; width: number; height: number },
  png: PDFImage,
  meta: PdfSignatureMeta,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontBold: Awaited<ReturnType<PDFDocument['embedFont']>>,
): void {
  const left = Math.max(PAGE_MARGIN, Math.min(rect.x, pageW - PAGE_MARGIN - 40));
  const blockW = Math.max(
    SIGNATURE_CARD_PT.width * 0.85,
    Math.min(rect.width, pageW - left - PAGE_MARGIN),
  );

  const aspect = png.width / Math.max(1, png.height);
  let drawW = Math.min(180, blockW);
  let drawH = drawW / aspect;
  if (drawH > 56) {
    drawH = 56;
    drawW = drawH * aspect;
  }

  const metaDetailLines = buildMetaDetailLines(meta);
  const metaBlockH = (metaDetailLines.length + 1) * META_LINE_H + 14;

  const desiredImgBottom = rect.y;
  const minImgBottom = PAGE_MARGIN + metaBlockH + 8;
  let imgBottom = Math.max(minImgBottom, desiredImgBottom);
  const maxImgTop = pageH - PAGE_MARGIN - DIVIDER_BLOCK_H - 6;
  if (imgBottom + drawH > maxImgTop) {
    imgBottom = Math.max(minImgBottom, maxImgTop - drawH);
  }

  const ruleW = Math.min(200, blockW);
  drawPdfSignatureDividerLine(page, left, imgBottom + drawH + 12, ruleW);
  page.drawImage(png, { x: left, y: imgBottom, width: drawW, height: drawH });

  let yBelow = imgBottom - 8;
  drawPdfSignatureDividerLine(page, left, yBelow, ruleW, 0.5);
  yBelow -= META_LINE_H + 2;

  page.drawText(meta.name, {
    x: left,
    y: yBelow,
    size: NAME_SIZE,
    font: fontBold,
    color: rgb(0.12, 0.15, 0.22),
    maxWidth: blockW,
  });
  yBelow -= META_LINE_H;

  for (const line of metaDetailLines) {
    if (yBelow < PAGE_MARGIN) break;
    page.drawText(line, {
      x: left,
      y: yBelow,
      size: META_SIZE,
      font,
      color: rgb(0.12, 0.15, 0.22),
      maxWidth: blockW,
    });
    yBelow -= META_LINE_H;
  }
}

async function embedFieldsIntoLoadedPdf(
  doc: Awaited<ReturnType<typeof PDFDocument.load>>,
  fields: PdfEmbedField[],
): Promise<void> {
  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pagesWithFullBlock = new Set<number>();

  for (const field of fields) {
    const pageIndex = Math.max(0, Math.min(pages.length - 1, field.page - 1));
    const page = pages[pageIndex];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();
    const rect = pctToRect(pw, ph, field.x, field.y, field.width, field.height);

    if (field.fieldType === 'signature' && field.imagePngBase64) {
      const imgBytes = Buffer.from(field.imagePngBase64, 'base64');
      const png = await doc.embedPng(imgBytes);

      if (field.signatureMeta) {
        drawStandardSignatureCertificate(page, pw, ph, rect, png, field.signatureMeta, font, fontBold);
        pagesWithFullBlock.add(pageIndex);
      } else {
        const aspect = png.width / Math.max(1, png.height);
        let drawW = Math.min(rect.width, 170);
        let drawH = drawW / aspect;
        const maxImgH = Math.max(24, rect.height * 0.9);
        if (drawH > maxImgH) {
          drawH = maxImgH;
          drawW = drawH * aspect;
        }
        const imgY = rect.y + rect.height - drawH;
        page.drawImage(png, { x: rect.x, y: imgY, width: drawW, height: drawH });
      }
      continue;
    }

    if (field.fieldType === 'name' || field.fieldType === 'date') {
      if (pagesWithFullBlock.has(pageIndex)) continue;
    }

    const text =
      field.value ??
      (field.fieldType === 'date'
        ? new Date().toLocaleDateString('pt-BR')
        : field.fieldType === 'name'
          ? ''
          : '');
    if (!text.trim()) continue;
    page.drawText(text, {
      x: rect.x + 2,
      y: rect.y + rect.height / 2 - 5,
      size: Math.min(11, rect.height * 0.4),
      font,
      color: rgb(0.1, 0.1, 0.1),
      maxWidth: rect.width - 4,
    });
  }
}

export async function embedFieldsInPdfFromBuffer(params: {
  pdfBytes: Buffer;
  destStorageKey: string;
  fields: PdfEmbedField[];
}): Promise<void> {
  const doc = await PDFDocument.load(params.pdfBytes);
  await embedFieldsIntoLoadedPdf(doc, params.fields);
  const out = await doc.save();
  await saveBuffer(params.destStorageKey, Buffer.from(out));
}

export async function embedFieldsInPdf(params: {
  sourceStorageKey: string;
  destStorageKey: string;
  fields: PdfEmbedField[];
}): Promise<void> {
  const pdfBytes = await readBuffer(params.sourceStorageKey);
  const doc = await PDFDocument.load(pdfBytes);
  await embedFieldsIntoLoadedPdf(doc, params.fields);
  const out = await doc.save();
  await saveBuffer(params.destStorageKey, Buffer.from(out));
}
