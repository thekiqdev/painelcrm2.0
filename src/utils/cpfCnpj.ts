/**
 * Formatação e validação de CPF/CNPJ.
 * Entrada para validação: apenas dígitos (11 = CPF, 14 = CNPJ).
 */

function cpfCheckDigit(base: string, factor: number): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    sum += parseInt(base[i]!, 10) * factor--;
  }
  const mod = (sum * 10) % 11;
  return mod === 10 ? 0 : mod;
}

export function isValidCpf(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const d1 = cpfCheckDigit(digits.slice(0, 9), 10);
  const d2 = cpfCheckDigit(digits.slice(0, 10), 11);
  return digits[9] === String(d1) && digits[10] === String(d2);
}

function cnpjCheckDigit(base: string, factors: number[]): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    sum += parseInt(base[i]!, 10) * factors[i]!;
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

export function isValidCnpj(digits: string): boolean {
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const f1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const f2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = cnpjCheckDigit(digits.slice(0, 12), f1);
  const d2 = cnpjCheckDigit(digits.slice(0, 13), f2);
  return digits[12] === String(d1) && digits[13] === String(d2);
}

/** Valida CPF (11 dígitos) ou CNPJ (14 dígitos) com dígitos verificadores. */
export function isValidCpfOrCnpj(digits: string): boolean {
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

export function formatCpfCnpjDisplay(value: string | null | undefined): string {
  if (value == null || typeof value !== "string") return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return digits.length > 0 ? value : "—";
}
