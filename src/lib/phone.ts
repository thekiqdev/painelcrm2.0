/** Telefone BR — máscara no portal e normalização leve no cliente. */

export function onlyDigits(input: string): string {
  return String(input ?? "").replace(/\D/g, "");
}

export function normalizeBrazilianNationalDigits(input: string): string {
  let d = onlyDigits(input);
  if (d.length >= 12 && d.startsWith("55")) {
    d = d.slice(2);
  }
  return d.replace(/^0+/, "");
}

export function isBrazilianNationalPhoneValid(digitsNational: string): boolean {
  const n = digitsNational.length;
  return n === 10 || n === 11;
}

/** Máscara (AA) NNNNN-NNNN ou (AA) NNNN-NNNN enquanto digita. */
export function formatBrazilianPhoneInput(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}
