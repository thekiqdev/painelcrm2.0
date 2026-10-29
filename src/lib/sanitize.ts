import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML content to prevent XSS attacks
 * Only allows safe HTML tags and attributes
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'b', 'i',
      'blockquote', 'pre', 'code'
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  });
}

/** Snapshots antigos: remove nome só no layout legado `.os-header-brand` + logo. */
function stripOsBrandNameWhenLogoPresent(html: string): string {
  if (!html || !/\bos-logo\b/i.test(html) || !/\bos-header-brand\b/i.test(html)) return html;
  return html.replace(
    /(<div\b[^>]*\bos-header-brand\b[^>]*>[\s\S]*?)<p\b[^>]*\bos-brand\b[^>]*>[\s\S]*?<\/p>/gi,
    '$1',
  );
}

/** Documento A4 da OS (tabelas + imagens de assinatura/logo em data URL). */
export function sanitizeServiceOrderDocumentHtml(html: string): string {
  if (!html) return '';

  const cleaned = stripOsBrandNameWhenLogoPresent(html);

  return DOMPurify.sanitize(cleaned, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'b', 'i',
      'blockquote', 'pre', 'code',
      'article', 'header', 'section', 'footer',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'img',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style', 'src', 'alt', 'colspan', 'rowspan', 'width', 'height'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/** Texto visível aproximado (validação client-side alinhada ao backend). */
export function stripVisibleTextFromHtml(html: string): string {
  if (!html) return '';
  const s = sanitizeHtml(html);
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
