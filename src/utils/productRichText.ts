import { sanitizeHtml } from '@/lib/sanitize';

const HTML_LIKE = /<\/?[a-z][\s\S]*>/i;

/** Conteúdo legado em texto plano vs HTML do SystemRichEditor. */
export function isProductDescriptionHtml(raw: string | null | undefined): boolean {
  return HTML_LIKE.test(String(raw ?? '').trim());
}

function escapePlainText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Prepara HTML seguro para exibição (prose / SystemRichEditorReadOnly).
 * Texto plano legado vira parágrafos com quebras preservadas.
 */
export function productDescriptionDisplayHtml(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (isProductDescriptionHtml(t)) return sanitizeHtml(t);
  const paragraphs = t
    .split(/\n{2,}/)
    .map((p) => `<p>${escapePlainText(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return sanitizeHtml(paragraphs);
}

/** Texto plano para cards/listas (remove tags). */
export function productDescriptionPlainText(raw: string | null | undefined): string {
  if (!raw?.trim()) return '';
  return sanitizeHtml(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
