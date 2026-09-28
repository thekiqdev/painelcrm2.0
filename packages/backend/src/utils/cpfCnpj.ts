/**
 * Normalização e validação de CPF/CNPJ (apenas dígitos).
 */

export function onlyDigits(value: string | null | undefined): string {
  if (value == null || typeof value !== 'string') return '';
  return value.replace(/\D/g, '');
}

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

export function isValidCpfOrCnpj(digits: string): boolean {
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}
