import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBrazilTaxIdDisplay } from '@/utils/brazilTaxId';

export const CONTRACT_SIGNATURE_LEGAL_FOOTER =
  'Documento assinado eletronicamente com validade jurídica conforme MP 2.200-2/2001 e Lei 14.063/2020.';

const METHOD_LABELS: Record<string, string> = {
  public_invite_esign_v1: 'Assinatura manuscrita (e-sign)',
};

export type ContractSignatureDisplayModel = {
  signerId: string;
  name: string;
  email: string;
  taxId: string | null;
  signed: boolean;
  signedAtLabel: string | null;
  signatureImagePngBase64: string | null;
  ip: string | null;
  methodLabel: string | null;
  signatureId: string | null;
};

export type ContractSignatureDisplayInput = {
  id: string;
  name: string;
  email: string;
  tax_id?: string | null;
  signed_at?: string | null;
  signature_data?: Record<string, unknown> | null;
};

function readString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function formatContractSignatureMethod(method: string | null | undefined): string | null {
  if (!method) return null;
  return METHOD_LABELS[method] ?? method;
}

export function formatContractSignatureDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

/** Modelo único para UI (admin, público, apêndice A4, diálogos). */
export function parseContractSignerSignatureDisplay(
  signer: ContractSignatureDisplayInput,
): ContractSignatureDisplayModel {
  const sig =
    signer.signature_data && typeof signer.signature_data === 'object'
      ? signer.signature_data
      : null;

  const signed = Boolean(signer.signed_at);
  const b64 = sig ? readString(sig, 'signature_image_png_base64') : null;
  const confirmedName = sig ? readString(sig, 'confirmed_name') : null;
  const signedAtIso = signer.signed_at ?? (sig ? readString(sig, 'signed_at') : null);
  const method = sig ? readString(sig, 'method') : null;
  const inviteId = sig ? readString(sig, 'invite_id') : null;

  const taxRaw = signer.tax_id?.trim() || null;
  const taxDisplay = taxRaw ? formatBrazilTaxIdDisplay(taxRaw) : null;

  return {
    signerId: signer.id,
    name: confirmedName || signer.name,
    email: signer.email,
    taxId: taxDisplay,
    signed,
    signedAtLabel: formatContractSignatureDate(signedAtIso),
    signatureImagePngBase64: b64,
    ip: sig ? readString(sig, 'client_ip') : null,
    methodLabel: formatContractSignatureMethod(method),
    signatureId: inviteId || signer.id,
  };
}

/** Compatível com `ContractA4SignerAppendixItem`. */
export function signatureDisplayFromAppendixItem(
  item: {
    name: string;
    email: string;
    tax_id?: string | null;
    signed: boolean;
    signed_at: string | null;
    signature_image_png_base64: string | null;
  },
  signerId = item.email,
  signature_data?: Record<string, unknown> | null,
): ContractSignatureDisplayModel {
  return parseContractSignerSignatureDisplay({
    id: signerId,
    name: item.name,
    email: item.email,
    tax_id: item.tax_id,
    signed_at: item.signed_at,
    signature_data: signature_data ?? (item.signature_image_png_base64
      ? { signature_image_png_base64: item.signature_image_png_base64 }
      : null),
  });
}
