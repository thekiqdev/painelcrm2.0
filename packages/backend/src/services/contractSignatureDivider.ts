import { rgb, type PDFPage } from 'pdf-lib';

/** Cor padrão do separador do bloco de assinatura (slate-400). */
export const SIGNATURE_DIVIDER_RGB = rgb(0.58, 0.64, 0.72);

/** Linha horizontal real — substitui texto "---------------------". */
export function drawPdfSignatureDividerLine(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  thickness = 0.75,
): void {
  if (width <= 0) return;
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness,
    color: SIGNATURE_DIVIDER_RGB,
  });
}
