import { PDFDocument } from 'pdf-lib';
import PDFDocumentKit from 'pdfkit';
import { readContractPdfByKey } from './contractPdfStorageService.js';
import { htmlToPdfBodyBlocks, snapshotHtmlToFallbackPlain } from './contractPdfBodyLayout.js';
import { listExtraPages } from './contractPdfExtraPagesService.js';
import { pool } from '../utils/db.js';

type PdfKitDoc = InstanceType<typeof PDFDocumentKit>;

function renderBodyBlocks(doc: PdfKitDoc, blocks: ReturnType<typeof htmlToPdfBodyBlocks>, width: number): void {
  for (const b of blocks) {
    const text = b.text?.trim();
    if (!text) continue;
    doc.font('Helvetica').fontSize(11).fillColor('#000000');
    doc.text(text, { width, align: 'left', lineGap: 4 });
    doc.moveDown(0.5);
  }
}

/** Renderiza HTML de página extra para um PDF de uma folha A4. */
export async function renderExtraPageHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const snap = String(html || '').trim() || '<p></p>';
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocumentKit({
      size: 'A4',
      margin: 48,
      info: { Title: 'Página adicional', Author: 'PainelCRM' },
    });
    doc.on('data', (d: Buffer) => chunks.push(d));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let blocks = htmlToPdfBodyBlocks(snap);
    if (blocks.length === 0) {
      const plain = snapshotHtmlToFallbackPlain(snap);
      if (plain) blocks = [{ kind: 'p', text: plain }];
    }
    renderBodyBlocks(doc, blocks, doc.page.width - 96);
    doc.end();
  });
}

/**
 * Monta PDF composto: original (readonly) + páginas extras renderizadas do HTML.
 * Usado na exportação/assinatura — não altera o arquivo original armazenado.
 */
export async function buildCompositePdfBuffer(contractId: string): Promise<{
  buffer: Buffer;
  pageCount: number;
  sourcePageCount: number;
}> {
  const cr = await pool.query<{
    original_pdf_storage_key: string | null;
    frozen_pdf_storage_key: string | null;
    source_pdf_page_count: number | null;
  }>(
    `SELECT original_pdf_storage_key, frozen_pdf_storage_key, source_pdf_page_count
     FROM contracts WHERE id = $1`,
    [contractId],
  );
  const c = cr.rows[0];
  const sourceKey = c?.frozen_pdf_storage_key || c?.original_pdf_storage_key;
  if (!sourceKey) {
    throw new Error('CONTRACT_PDF_REQUIRED');
  }

  const sourceBytes = await readContractPdfByKey(sourceKey);
  const sourceDoc = await PDFDocument.load(sourceBytes);
  const sourcePageCount = Math.max(
    1,
    c?.source_pdf_page_count ?? sourceDoc.getPageCount(),
  );

  const merged = await PDFDocument.create();
  const srcPages = sourceDoc.getPages();
  const pagesToCopy = Math.min(sourcePageCount, srcPages.length);
  const copied = await merged.copyPages(
    sourceDoc,
    Array.from({ length: pagesToCopy }, (_, i) => i),
  );
  for (const p of copied) merged.addPage(p);

  const extras = await listExtraPages(contractId);
  for (const extra of extras) {
    const extraBuf = await renderExtraPageHtmlToPdfBuffer(extra.html_snapshot);
    const extraDoc = await PDFDocument.load(extraBuf);
    const [ep] = await merged.copyPages(extraDoc, [0]);
    merged.addPage(ep);
  }

  const buffer = Buffer.from(await merged.save());
  return {
    buffer,
    pageCount: merged.getPageCount(),
    sourcePageCount,
  };
}
