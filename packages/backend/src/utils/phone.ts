/** Normalização e máscara BR — usado em portal de suporte e matching. */

export function onlyDigits(input: string): string {
  return String(input ?? '').replace(/\D/g, '');
}

/**
 * Dígitos nacionais (DDD + número), sem 55.
 * Aceita entrada com ou sem código do país.
 */
export function normalizeBrazilianNationalDigits(input: string): string {
  let d = onlyDigits(input);
  if (d.length >= 12 && d.startsWith('55')) {
    d = d.slice(2);
  }
  d = d.replace(/^0+/, '');
  return d;
}

/** true se tiver 10 (fixo) ou 11 (celular com 9ª) dígitos nacionais. */
export function isBrazilianNationalPhoneValid(digitsNational: string): boolean {
  const n = digitsNational.length;
  return n === 10 || n === 11;
}

/**
 * Chaves para igualdade com telefones gravados (foco BR: prefixo 55).
 * Espelha a lógica usada em suporte público.
 */
export function brPhoneSearchKeys(raw: string): string[] {
  const d = onlyDigits(raw);
  if (d.length < 8) return [];
  const keys = new Set<string>();
  keys.add(d);
  const trimmedLeadingZeros = d.replace(/^0+/, '');
  const x = trimmedLeadingZeros.length >= 8 ? trimmedLeadingZeros : d;
  keys.add(x);
  if (x.length === 10 || x.length === 11) {
    if (!x.startsWith('55')) keys.add(`55${x}`);
  }
  if (x.startsWith('55') && (x.length === 12 || x.length === 13)) {
    keys.add(x);
    const national = x.slice(2);
    if (national.length >= 10) keys.add(national);
  }
  if (x.length >= 11 && !x.startsWith('55')) {
    keys.add(`55${x}`);
  }
  return [...keys].filter((k) => k.length >= 8);
}

/** Variantes para busca: inclui normalização nacional de cada chave. */
export function brPhoneSearchKeysExpanded(raw: string): string[] {
  const keys = new Set<string>();
  for (const k of brPhoneSearchKeys(raw)) {
    keys.add(k);
    const nat = normalizeBrazilianNationalDigits(k);
    if (nat.length >= 8) keys.add(nat);
    if (k.startsWith('55') && k.length >= 12) keys.add(k.slice(2));
    if ((nat.length === 10 || nat.length === 11) && !nat.startsWith('55')) keys.add(`55${nat}`);
  }
  return [...keys].filter((k) => k.length >= 8);
}
