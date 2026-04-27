import { marked } from 'marked';
import { sanitizeHtml } from '@/lib/sanitize';

marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Converte Markdown para HTML já sanitizado para o domínio das páginas legais.
 */
export function markdownToLegalHtml(markdown: string): string {
  const trimmed = markdown?.trim() ?? '';
  if (!trimmed) return '';
  const raw = marked.parse(trimmed, { async: false }) as string;
  return sanitizeHtml(raw);
}
