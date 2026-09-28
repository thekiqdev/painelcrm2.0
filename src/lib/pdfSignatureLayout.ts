/**
 * Dimensões do bloco de assinatura alinhadas ao PDF final (A4, card ~220×110 pt).
 * Coordenadas em percentual da página (origem topo-esquerda no editor).
 */

export const PDF_A4_PT = { width: 595.28, height: 841.89 } as const;
export const SIGNATURE_CARD_PT = { width: 220, height: 110 } as const;

export const PAGE_LAYOUT_MARGIN_PCT = 4;
export const PAGE_LAYOUT_BOTTOM_RESERVE_PCT = 6;
export const FIELD_GAP_PCT = 1.5;

export function getSignatureFieldPercentSize(): { width: number; height: number } {
  return {
    width: Math.round((SIGNATURE_CARD_PT.width / PDF_A4_PT.width) * 10000) / 100,
    height: Math.round((SIGNATURE_CARD_PT.height / PDF_A4_PT.height) * 10000) / 100,
  };
}

export type PdfFieldRect = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  id?: string;
};

export function rectsOverlap(a: PdfFieldRect, b: PdfFieldRect, gap = FIELD_GAP_PCT): boolean {
  if (a.page !== b.page) return false;
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

export function clampFieldToPage(
  rect: Pick<PdfFieldRect, 'x' | 'y' | 'width' | 'height'>,
): { x: number; y: number } {
  const maxX = 100 - PAGE_LAYOUT_MARGIN_PCT - rect.width;
  const maxY = 100 - PAGE_LAYOUT_BOTTOM_RESERVE_PCT - rect.height;
  return {
    x: Math.max(PAGE_LAYOUT_MARGIN_PCT, Math.min(maxX, rect.x)),
    y: Math.max(PAGE_LAYOUT_MARGIN_PCT, Math.min(maxY, rect.y)),
  };
}

function fitsOnPage(y: number, height: number): boolean {
  return y + height <= 100 - PAGE_LAYOUT_BOTTOM_RESERVE_PCT;
}

/**
 * Posiciona campo de assinatura evitando sobreposição e rodapé.
 * Move para próxima página se necessário.
 */
export function resolveSignaturePlacement(params: {
  pageCount: number;
  preferPage: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  existing: PdfFieldRect[];
  excludeId?: string;
}): { page: number; x: number; y: number; movedToNextPage: boolean } {
  const { width: w, height: h } = { width: params.width, height: params.height };
  let page = Math.max(1, Math.min(params.pageCount, params.preferPage));
  let movedToNextPage = false;

  let x = params.centerX - w / 2;
  let y = params.centerY - h / 2;
  ({ x, y } = clampFieldToPage({ x, y, width: w, height: h }));

  if (!fitsOnPage(y, h) && page < params.pageCount) {
    page += 1;
    y = PAGE_LAYOUT_MARGIN_PCT;
    movedToNextPage = true;
  }

  const others = params.existing.filter((f) => f.id !== params.excludeId);

  for (let attempt = 0; attempt < 40; attempt++) {
    const rect: PdfFieldRect = { page, x, y, width: w, height: h };
    const collision = others.some((o) => rectsOverlap(rect, o));
    if (!collision && fitsOnPage(y, h)) {
      return { page, x, y, movedToNextPage };
    }

    y += h + FIELD_GAP_PCT;
    if (!fitsOnPage(y, h)) {
      if (page < params.pageCount) {
        page += 1;
        y = PAGE_LAYOUT_MARGIN_PCT;
        movedToNextPage = true;
      } else {
        y = PAGE_LAYOUT_MARGIN_PCT;
        for (const slot of stackSlotsOnPage(page, others, w, h)) {
          const trial = { page, x: slot.x, y: slot.y, width: w, height: h };
          if (!others.some((o) => rectsOverlap(trial, o))) {
            return { page, x: slot.x, y: slot.y, movedToNextPage };
          }
        }
        ({ x, y } = clampFieldToPage({ x, y, width: w, height: h }));
        return { page, x, y, movedToNextPage };
      }
    }
    ({ x, y } = clampFieldToPage({ x, y, width: w, height: h }));
  }

  return { page, x, y, movedToNextPage };
}

/** Empilha campos na página a partir da margem superior. */
export function stackSlotsOnPage(
  page: number,
  existing: PdfFieldRect[],
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  const slots: Array<{ x: number; y: number }> = [];
  let y = PAGE_LAYOUT_MARGIN_PCT;
  const x = PAGE_LAYOUT_MARGIN_PCT;
  while (fitsOnPage(y, height)) {
    slots.push({ x, y });
    y += height + FIELD_GAP_PCT;
  }
  const used = existing.filter((f) => f.page === page);
  return slots.filter((slot) => {
    const trial = { page, x: slot.x, y: slot.y, width, height };
    return !used.some((u) => rectsOverlap(trial, u));
  });
}

/** Próxima posição automática para novo assinante (empilhamento vertical). */
export function suggestAutoPlacement(
  pageCount: number,
  existing: PdfFieldRect[],
): { page: number; x: number; y: number } {
  const { width, height } = getSignatureFieldPercentSize();
  for (let p = 1; p <= pageCount; p++) {
    const slots = stackSlotsOnPage(p, existing, width, height);
    if (slots[0]) return { page: p, ...slots[0] };
  }
  return { page: pageCount, x: PAGE_LAYOUT_MARGIN_PCT, y: PAGE_LAYOUT_MARGIN_PCT };
}

export function existingRectsFromFields(
  fields: Array<{
    _localId?: string;
    id?: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    field_type?: string;
  }>,
): PdfFieldRect[] {
  const { width: defaultW, height: defaultH } = getSignatureFieldPercentSize();
  return fields
    .filter((f) => f.field_type === 'signature' || f.field_type === undefined)
    .map((f) => ({
      id: f._localId ?? f.id,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width > 0 ? f.width : defaultW,
      height: f.height > 0 ? f.height : defaultH,
    }));
}
