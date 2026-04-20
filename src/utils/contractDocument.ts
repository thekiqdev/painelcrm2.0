import type { Contract } from '@/types/contracts';

/** Corpo exibido: snapshot congelado quando existir; senão HTML do rascunho. */
export function getContractDocumentHtml(c: Pick<Contract, 'content_snapshot_html' | 'content_html'>): string {
  const snap = c.content_snapshot_html?.trim();
  if (snap) return c.content_snapshot_html as string;
  return c.content_html ?? '';
}

export function isContractDraft(status: Contract['status']): boolean {
  return status === 'DRAFT';
}

/** Alinhado ao backend: texto útil dentro do HTML. */
export function hasMeaningfulDocumentHtml(html: string | null | undefined): boolean {
  if (html == null || !String(html).trim()) return false;
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length >= 3;
}
