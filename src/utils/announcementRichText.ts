import DOMPurify from "dompurify";

/** Conteúdo de página de atualizações (changelog): HTML do editor + imagens/links. */
const SANITIZE_OPTIONS: DOMPurify.Config = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "b",
    "i",
    "a",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "code",
    "pre",
    "div",
    "span",
    "img",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "style", "src", "alt", "class", "colspan", "rowspan"],
};

export function sanitizeAnnouncementHtml(html: string | null | undefined): string {
  const raw = html?.trim() ? String(html) : "";
  if (!raw) return "";
  return DOMPurify.sanitize(raw, SANITIZE_OPTIONS);
}

const HTML_LIKE = /<\/?[a-z][\s\S]*>/i;

export function isAnnouncementContentHtml(raw: string | null | undefined): boolean {
  return HTML_LIKE.test(String(raw ?? "").trim());
}
