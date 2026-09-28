/**
 * Converte HTML do snapshot em blocos tipográficos para o PDF (sem motor HTML completo).
 * Preserva hierarquia básica: headings, parágrafos, listas, citações, quebras de linha.
 */

export type PdfBodyBlockKind = 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'li' | 'quote';

export type PdfBodyBlock = {
  kind: PdfBodyBlockKind;
  /** Texto já sem tags; pode conter \n vindos de <br>. */
  text: string;
};

function decodeEntities(s: string): string {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

/** Texto entre tags: preserva <br>, remove outras tags, normaliza espaços por linha. */
export function htmlFragmentToPlain(fragment: string): string {
  const withBr = String(fragment || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(withBr)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripOuterNoise(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(ul|ol)[^>]*>/gi, '')
    .replace(/<hr\s*\/?>/gi, '\n');
}

type Pattern = { re: RegExp; kind: PdfBodyBlockKind };

/** Do mais específico ao mais genérico para evitar “comer” headings dentro de divs. */
const BLOCK_PATTERNS: Pattern[] = [
  { re: /<h4[^>]*>([\s\S]*?)<\/h4>/gi, kind: 'h4' },
  { re: /<h3[^>]*>([\s\S]*?)<\/h3>/gi, kind: 'h3' },
  { re: /<h2[^>]*>([\s\S]*?)<\/h2>/gi, kind: 'h2' },
  { re: /<h1[^>]*>([\s\S]*?)<\/h1>/gi, kind: 'h1' },
  { re: /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, kind: 'quote' },
  { re: /<li[^>]*>([\s\S]*?)<\/li>/gi, kind: 'li' },
  { re: /<p[^>]*>([\s\S]*?)<\/p>/gi, kind: 'p' },
  /** Por último: evita “comer” o documento inteiro quando há <div> wrapper com <p> no interior. */
  { re: /<div[^>]*>([\s\S]*?)<\/div>/gi, kind: 'p' },
];

type Earliest = { kind: PdfBodyBlockKind; inner: string; start: number; end: number };

function findEarliestBlock(html: string): Earliest | null {
  let best: Earliest | null = null;
  for (const { re, kind } of BLOCK_PATTERNS) {
    const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    rx.lastIndex = 0;
    const m = rx.exec(html);
    if (!m) continue;
    const start = m.index;
    const end = start + m[0].length;
    const inner = m[1] ?? '';
    if (!best || start < best.start) {
      best = { kind, inner, start, end };
    }
  }
  return best;
}

/**
 * Extrai blocos na ordem do documento, intercalando parágrafos soltos entre blocos estruturados.
 */
export function htmlToPdfBodyBlocks(html: string): PdfBodyBlock[] {
  let remainder = stripOuterNoise(html).trim();
  const blocks: PdfBodyBlock[] = [];

  const pushParagraph = (raw: string) => {
    const t = htmlFragmentToPlain(raw);
    if (!t) return;
    blocks.push({ kind: 'p', text: t });
  };

  while (remainder.length > 0) {
    const best = findEarliestBlock(remainder);
    if (!best) {
      pushParagraph(remainder);
      break;
    }
    if (best.start > 0) {
      pushParagraph(remainder.slice(0, best.start));
    }
    let inner = htmlFragmentToPlain(best.inner);
    if (best.kind === 'li' && inner.length > 0) {
      inner = `• ${inner}`;
    }
    if (inner.length > 0) {
      blocks.push({ kind: best.kind, text: inner });
    }
    remainder = remainder.slice(best.end).replace(/^\s+/, '');
  }

  return blocks;
}

/**
 * Fallback quando o HTML não contém blocos típicos (ex.: só texto ou markup invulgar).
 * Equivalente ao antigo fluxo “achatado”, mas ainda passa por normalização de entidades.
 */
export function snapshotHtmlToFallbackPlain(html: string): string {
  return htmlFragmentToPlain(
    stripOuterNoise(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|blockquote)>/gi, '\n\n')
      .replace(/<\/(li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
}
