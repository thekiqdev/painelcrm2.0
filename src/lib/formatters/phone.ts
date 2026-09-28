import { normalizeBrazilianNationalDigits, onlyDigits } from "@/lib/phone";

/** Exibição legível: (11) 92007-9901 */
export function formatBrazilianPhone(input: string | null | undefined): string | null {
  const d = normalizeBrazilianNationalDigits(String(input ?? ""));
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
  }
  if (d.length > 0 && d.length < 10) {
    return input?.trim() || null;
  }
  return null;
}

/** Nome parece ser só telefone sem formatação. */
export function isDisplayNameLikelyRawPhone(name: string | null | undefined): boolean {
  const t = name?.trim();
  if (!t) return false;
  const digits = onlyDigits(t);
  if (digits.length < 10) return false;
  const nonDigit = t.replace(/[\d\s()+\-./]/g, "").length;
  return nonDigit <= 1;
}

export function resolveEntityDisplayName(params: {
  name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
}): string {
  const { name, phone, whatsapp } = params;
  const trimmedName = name?.trim();
  if (trimmedName && !isDisplayNameLikelyRawPhone(trimmedName)) {
    return trimmedName;
  }
  const fromContact = formatBrazilianPhone(phone || whatsapp || trimmedName);
  if (fromContact) return fromContact;
  if (trimmedName) return trimmedName;
  return "Sem identificação";
}
