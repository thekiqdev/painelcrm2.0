import sanitizeHtml from 'sanitize-html';

const STRIP_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div',
  'span',
  'b',
  'i',
  'blockquote',
  'pre',
  'code',
] as const;

/**
 * Sanitiza HTML de páginas legais (evita XSS). Alinhado a `src/lib/sanitize.ts` no frontend.
 */
export function sanitizeLegalPageHtml(raw: string | null | undefined): string {
  const html = String(raw ?? '');
  return sanitizeHtml(html, {
    allowedTags: [...STRIP_TAGS],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href || '';
        const lower = href.trim().toLowerCase();
        const isHttp = lower.startsWith('http://') || lower.startsWith('https://');
        const isMail = lower.startsWith('mailto:');
        if (href && !isHttp && !isMail) {
          return { tagName: 'span', attribs: { class: attribs.class } };
        }
        const next: Record<string, string> = { ...attribs };
        if (next.target === '_blank') {
          next.rel = next.rel?.includes('noopener') ? next.rel : `${next.rel || ''} noopener noreferrer`.trim();
        } else {
          delete next.target;
        }
        return { tagName, attribs: next };
      },
    },
  });
}

/** Texto visível (sem tags) para validação de tamanho mínimo. */
export function stripHtmlToPlainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}
