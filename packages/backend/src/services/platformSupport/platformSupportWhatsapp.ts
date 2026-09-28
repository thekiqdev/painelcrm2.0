/** Normaliza entrada BR para dígitos wa.me (55 + DDD + número). */
export function normalizeBrazilWhatsappNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, '');
  if (!digits) return null;
  while (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith('55')) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

export function maskBrazilWhatsappNumber(digits: string | null | undefined): string | null {
  const n = normalizeBrazilWhatsappNumber(digits);
  if (!n) return null;
  const local = n.slice(2);
  if (local.length < 10) return null;
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  const visibleTail = rest.slice(-4);
  const maskedMid = rest.length > 4 ? '****' : '****';
  return `(${ddd}) ${maskedMid}-${visibleTail}`;
}

export function buildWhatsappUrl(numberDigits: string, message: string): string {
  const text = encodeURIComponent(message);
  return `https://wa.me/${numberDigits}?text=${text}`;
}

export function applyWhatsappTemplate(template: string, vars: { tenant_name?: string }): string {
  const name = vars.tenant_name?.trim() || 'minha empresa';
  return template.replace(/\{\{\s*tenant_name\s*\}\}/gi, name);
}
