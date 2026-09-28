/**
 * Regras de ciclo de vida do contrato (Etapa 2 — snapshot e travas).
 *
 * Fonte da verdade do documento exibido: `content_snapshot_html` quando preenchido;
 * caso contrário `content_html` (legado / rascunho).
 *
 * Congelamento: documento e signatários ficam editáveis em DRAFT e PENDING_SIGNATURE
 * (enviado, ainda sem nenhuma assinatura). A partir da primeira assinatura
 * (PARTIALLY_SIGNED / ACTIVE) ou de estados finais, o contrato congela.
 */

export type ContractStatus =
  | 'DRAFT'
  | 'PENDING_SIGNATURE'
  | 'PARTIALLY_SIGNED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'CANCELLED';

/** Regra de negócio para exclusão definitiva de contrato. */
export const CONTRACT_DELETE_ALLOWED_STATUSES: ReadonlySet<string> = new Set(['CANCELLED', 'INACTIVE']);

/** Rascunho: documento e estrutura editáveis; ainda não enviado. */
export function isDraftStatus(status: string): boolean {
  return status === 'DRAFT';
}

/** Enviado para assinatura, ainda sem nenhuma assinatura capturada. */
export function isPendingSignatureStatus(status: string): boolean {
  return status === 'PENDING_SIGNATURE';
}

/**
 * Revisão permitida: rascunho ou enviado aguardando a primeira assinatura.
 * Depois de qualquer assinatura (ou cancelado/encerrado), o documento congela.
 */
export function isContractRevisionAllowed(status: string): boolean {
  return isDraftStatus(status) || isPendingSignatureStatus(status);
}

/** Documento congelado: não editar corpo/template/signatários/campos estruturais via API. */
export function isDocumentFrozen(status: string): boolean {
  return !isContractRevisionAllowed(status);
}

/** HTML com texto útil (não só tags vazias). */
export function hasMeaningfulDocumentHtml(html: string | null | undefined): boolean {
  if (html == null || !String(html).trim()) return false;
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length >= 3;
}

export function isPdfSignatureDocumentKind(kind: string | null | undefined): boolean {
  return String(kind || '').trim() === 'pdf_signature';
}

export function hasMeaningfulPdfDocument(storageKey: string | null | undefined): boolean {
  return Boolean(storageKey && String(storageKey).trim().length > 0);
}

/** Documento válido para envio: HTML ou PDF conforme o modo. */
export function hasMeaningfulContractDocument(params: {
  documentKind?: string | null;
  contentHtml?: string | null;
  originalPdfStorageKey?: string | null;
}): boolean {
  if (isPdfSignatureDocumentKind(params.documentKind)) {
    return hasMeaningfulPdfDocument(params.originalPdfStorageKey);
  }
  return hasMeaningfulDocumentHtml(params.contentHtml);
}

const TRANSITIONS: Record<string, Set<string>> = {
  DRAFT: new Set(['PENDING_SIGNATURE', 'ACTIVE', 'CANCELLED', 'INACTIVE']),
  PENDING_SIGNATURE: new Set(['PARTIALLY_SIGNED', 'ACTIVE', 'CANCELLED', 'INACTIVE', 'EXPIRED']),
  PARTIALLY_SIGNED: new Set(['ACTIVE', 'CANCELLED', 'INACTIVE', 'EXPIRED', 'PENDING_SIGNATURE']),
  ACTIVE: new Set(['INACTIVE', 'CANCELLED', 'EXPIRED']),
  INACTIVE: new Set(['ACTIVE', 'CANCELLED']),
  EXPIRED: new Set(['ACTIVE', 'CANCELLED']),
  CANCELLED: new Set([]),
};

export function canTransitionStatus(from: string, to: string): boolean {
  if (from === to) return true;
  const set = TRANSITIONS[from];
  if (!set) return false;
  return set.has(to);
}

/** Estados que exigem snapshot na primeira entrada a partir de DRAFT. */
export function statusFreezesDocument(status: string): boolean {
  return status === 'PENDING_SIGNATURE' || status === 'ACTIVE';
}

/** Exclusão definitiva só em estados encerrados/fora de operação. */
export function canDeleteContractStatus(status: string): boolean {
  return CONTRACT_DELETE_ALLOWED_STATUSES.has(status);
}
