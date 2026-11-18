export type BillingKind = "cpf" | "cnpj";

export function onlyDocumentDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function formatCpfTyping(value: string): string {
  const digits = onlyDocumentDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function formatCnpjTyping(value: string): string {
  const digits = onlyDocumentDigits(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function visibleBillingStar(
  cpf: string,
  cnpj: string,
  saved: BillingKind | null,
  choice: BillingKind | null,
): BillingKind | null {
  if (!cpf.trim() || !cnpj.trim()) return null;
  if (choice === "cpf" || choice === "cnpj") return choice;
  if (saved === "cpf" || saved === "cnpj") return saved;
  return "cpf";
}

export function clientDocumentWrite(input: {
  cpf: string;
  cnpj: string;
  rg: string;
  razaoSocial: string;
  billingChoice: BillingKind | null;
}): {
  cpf: string | null;
  cnpj: string | null;
  rg: string | null;
  razao_social: string | null;
  billing_document?: BillingKind;
} {
  const cpf = onlyDocumentDigits(input.cpf) || null;
  const cnpj = onlyDocumentDigits(input.cnpj) || null;
  const payload: {
    cpf: string | null;
    cnpj: string | null;
    rg: string | null;
    razao_social: string | null;
    billing_document?: BillingKind;
  } = {
    cpf,
    cnpj,
    rg: input.rg.trim() || null,
    razao_social: input.razaoSocial.trim() || null,
  };
  if (input.billingChoice === "cpf" && cpf) payload.billing_document = "cpf";
  if (input.billingChoice === "cnpj" && cnpj) payload.billing_document = "cnpj";
  return payload;
}

export function clientDocumentsFromRecord(client: {
  cpf?: string | null;
  cnpj?: string | null;
  cpf_cnpj?: string | null;
  rg?: string | null;
  razao_social?: string | null;
  billing_document?: string | null;
}): {
  cpf: string;
  cnpj: string;
  rg: string;
  razao_social: string;
  savedBilling: BillingKind | null;
} {
  const legacy = onlyDocumentDigits(client.cpf_cnpj);
  const cpfDigits = onlyDocumentDigits(client.cpf) || (legacy.length === 11 ? legacy : "");
  const cnpjDigits = onlyDocumentDigits(client.cnpj) || (legacy.length === 14 ? legacy : "");
  let savedBilling: BillingKind | null =
    client.billing_document === "cpf" || client.billing_document === "cnpj"
      ? client.billing_document
      : null;
  if (!savedBilling && cpfDigits && !cnpjDigits) savedBilling = "cpf";
  if (!savedBilling && cnpjDigits && !cpfDigits) savedBilling = "cnpj";
  return {
    cpf: cpfDigits ? formatCpfTyping(cpfDigits) : "",
    cnpj: cnpjDigits ? formatCnpjTyping(cnpjDigits) : "",
    rg: client.rg?.trim() || "",
    razao_social: client.razao_social?.trim() || "",
    savedBilling,
  };
}
