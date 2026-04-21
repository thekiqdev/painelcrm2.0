import DOMPurify from "dompurify";

/** Mesmo perfil de sanitização do `RichTextEditor` (conteúdo comercial da proposta). */
const SANITIZE_OPTIONS: DOMPurify.Config = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "div", "span"],
  ALLOWED_ATTR: ["href", "target", "style"],
};

export function sanitizeProposalHtml(html: string | null | undefined): string {
  const raw = html?.trim() ? String(html) : "";
  if (!raw) return "";
  return DOMPurify.sanitize(raw, SANITIZE_OPTIONS);
}

/** Texto plano para busca (remove tags). */
export function proposalDescriptionPlainText(html: string | null | undefined): string {
  if (!html?.trim()) return "";
  const s = sanitizeProposalHtml(html);
  if (typeof document === "undefined") return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const d = document.createElement("div");
  d.innerHTML = s;
  return (d.textContent || d.innerText || "").replace(/\s+/g, " ").trim();
}

const HTML_LIKE = /<\/?[a-z][\s\S]*>/i;

/** Conteúdo legado em texto plano vs HTML do editor rico. */
export function isProposalDescriptionHtml(raw: string | null | undefined): boolean {
  return HTML_LIKE.test(String(raw ?? "").trim());
}
