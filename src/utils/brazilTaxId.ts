export function normalizeBrazilTaxIdInput(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function isBrazilTaxIdDigits(digits: string): boolean {
  return digits.length === 11 || digits.length === 14;
}

/** Formatação simples para exibição (já normalizado ou com máscara). */
export function formatBrazilTaxIdDisplay(raw: string): string {
  const d = normalizeBrazilTaxIdInput(raw);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return raw;
}
