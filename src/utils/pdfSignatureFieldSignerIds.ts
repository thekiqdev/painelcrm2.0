import type { PdfFieldDraft } from '@/components/contracts/ContractPdfSignatureEditor';
import type { PdfSignerDraft } from '@/components/contracts/ContractPdfSignersPanel';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Após sincronizar assinantes no servidor, campos ainda podem referenciar localId — remapeia para UUID. */
export function remapPdfFieldSignerIds(
  fields: PdfFieldDraft[],
  syncedSigners: PdfSignerDraft[],
): PdfFieldDraft[] {
  const idMap = new Map<string, string>();
  for (const s of syncedSigners) {
    if (!s.serverId) continue;
    idMap.set(s.localId, s.serverId);
    idMap.set(s.serverId, s.serverId);
  }

  return fields.map((f) => {
    const sid = f.contract_signer_id;
    if (!sid) return f;
    const mapped = idMap.get(sid);
    if (mapped) return { ...f, contract_signer_id: mapped };
    if (UUID_RE.test(sid)) return f;
    return { ...f, contract_signer_id: null };
  });
}

export function isUuidSignerId(id: string | null | undefined): boolean {
  return Boolean(id && UUID_RE.test(id));
}
