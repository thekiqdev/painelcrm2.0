export const CONTRACT_SIGNATURE_LEGAL_FOOTER =
  'Documento assinado eletronicamente com validade jurídica conforme MP 2.200-2/2001 e Lei 14.063/2020.';

const METHOD_LABELS: Record<string, string> = {
  public_invite_esign_v1: 'Assinatura manuscrita (e-sign)',
};

export type ContractSignatureDisplayModel = {
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

export type SignerSignatureInput = {
  id: string;
  name: string;
  email: string;
  tax_id: string | null;
  signed_at: Date | string | null;
  signature_data: unknown;
};

function formatBrazilTaxIdDisplay(input: string | null | undefined): string {
  const d = String(input || '').replace(/\D/g, '');
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return d || '';
}

function formatPtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseSignerSignatureDisplay(signer: SignerSignatureInput): ContractSignatureDisplayModel {
  const signed = signer.signed_at != null;
  let sig: Record<string, unknown> | null = null;
  if (signer.signature_data && typeof signer.signature_data === 'object' && !Array.isArray(signer.signature_data)) {
    sig = signer.signature_data as Record<string, unknown>;
  }

  const b64 =
    typeof sig?.signature_image_png_base64 === 'string' && sig.signature_image_png_base64.trim().length > 80
      ? sig.signature_image_png_base64.trim()
      : null;
  const confirmedName =
    typeof sig?.confirmed_name === 'string' && sig.confirmed_name.trim() ? sig.confirmed_name.trim() : null;
  const signedAtIso =
    signer.signed_at instanceof Date
      ? signer.signed_at.toISOString()
      : typeof signer.signed_at === 'string'
        ? signer.signed_at
        : typeof sig?.signed_at === 'string'
          ? sig.signed_at
          : null;
  const method = typeof sig?.method === 'string' ? sig.method : null;
  const inviteId = typeof sig?.invite_id === 'string' ? sig.invite_id : null;
  const taxRaw = signer.tax_id?.trim() || null;

  return {
    name: confirmedName || signer.name,
    email: signer.email,
    taxId: taxRaw ? formatBrazilTaxIdDisplay(taxRaw) : null,
    signed,
    signedAtLabel: formatPtDate(signedAtIso),
    signatureImagePngBase64: b64,
    ip: typeof sig?.client_ip === 'string' ? sig.client_ip : null,
    methodLabel: method ? (METHOD_LABELS[method] ?? method) : null,
    signatureId: inviteId || signer.id,
  };
}
