/** Normaliza CPF/CNPJ para apenas dígitos. */
export function normalizeBrazilTaxIdInput(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function isBrazilTaxIdDigits(digits: string): boolean {
  return digits.length === 11 || digits.length === 14;
}
