import type { Contract, ContractDocumentKind } from '@/types/contracts';

/** Corpo exibido: snapshot congelado quando existir; senão HTML do rascunho. */
export function getContractDocumentHtml(c: Pick<Contract, 'content_snapshot_html' | 'content_html'>): string {
  const snap = c.content_snapshot_html?.trim();
  if (snap) return c.content_snapshot_html as string;
  return c.content_html ?? '';
}

export function isContractDraft(status: Contract['status']): boolean {
  return status === 'DRAFT';
}

export function isPdfSignatureContract(
  c: Pick<Contract, 'document_kind'> | null | undefined,
): boolean {
  return c?.document_kind === 'pdf_signature';
}

/** PDF com ficheiro armazenado (inclui fallback se document_kind estiver desatualizado). */
export function resolvePdfSignatureContract(
  c:
    | Pick<
        Contract,
        | 'document_kind'
        | 'original_pdf_storage_key'
        | 'frozen_pdf_storage_key'
        | 'signed_pdf_storage_key'
      >
    | null
    | undefined,
): boolean {
  if (!c) return false;
  if (isPdfSignatureContract(c) && hasMeaningfulPdfContract(c)) return true;
  return Boolean(
    c.original_pdf_storage_key?.trim() ||
      c.frozen_pdf_storage_key?.trim() ||
      c.signed_pdf_storage_key?.trim(),
  );
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

export function hasMeaningfulPdfContract(
  c: Pick<Contract, 'document_kind' | 'original_pdf_storage_key' | 'frozen_pdf_storage_key'>,
): boolean {
  if (!isPdfSignatureContract(c)) return false;
  return Boolean(c.original_pdf_storage_key?.trim() || c.frozen_pdf_storage_key?.trim());
}

/** Nome do ficheiro PDF → título legível (sem extensão). */
export function contractTitleFromPdfFilename(fileName: string): string {
  let base = String(fileName || '').trim();
  if (!base) return '';
  base = base.replace(/\.pdf$/i, '');
  base = base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base;
}

export function hasMeaningfulContractDocument(
  c: Pick<Contract, 'document_kind' | 'content_html' | 'content_snapshot_html' | 'original_pdf_storage_key' | 'frozen_pdf_storage_key'>,
): boolean {
  if (isPdfSignatureContract(c)) return hasMeaningfulPdfContract(c);
  return hasMeaningfulDocumentHtml(getContractDocumentHtml(c));
}
