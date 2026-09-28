/** Espelho de src/lib/pdfSignatureLayout.ts — manter valores idênticos. */
export const PDF_A4_PT = { width: 595.28, height: 841.89 } as const;
export const SIGNATURE_CARD_PT = { width: 220, height: 110 } as const;

export function getSignatureFieldPercentSize(): { width: number; height: number } {
  return {
    width: Math.round((SIGNATURE_CARD_PT.width / PDF_A4_PT.width) * 10000) / 100,
    height: Math.round((SIGNATURE_CARD_PT.height / PDF_A4_PT.height) * 10000) / 100,
  };
}
