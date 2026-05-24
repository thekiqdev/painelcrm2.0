const SIGNATURE_HEADING_TEXT =
  /^(?:assinaturas?(?:\s+e\s+evid[eê]ncias?)?|assinatura)$/i;

/** Ver `src/utils/contractDocumentHtml.ts` — mesma regra no backend para PDF snapshot. */
export function stripTrailingSignatureSectionFromHtml(html: string): string {
  const src = String(html || '').trim();
  if (!src) return src;

  const headingRe = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  let lastIdx = -1;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(src)) !== null) {
    const inner = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (SIGNATURE_HEADING_TEXT.test(inner)) {
      lastIdx = m.index;
    }
  }
  if (lastIdx < 0) return src;
  return src.slice(0, lastIdx).trimEnd();
}
