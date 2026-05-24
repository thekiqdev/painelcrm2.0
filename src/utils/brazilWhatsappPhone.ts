/** Formata dígitos BR (55…) para exibição em inputs e cards. */
export function formatBrazilWhatsappDisplay(input: string): string {
  const d = String(input ?? '').replace(/\D/g, '');
  if (!d) return '';
  const n = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  if (n.length === 11) {
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  }
  if (n.length === 10) {
    return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  }
  return d;
}

export function normalizeBrazilWhatsappDigits(input: string): string {
  let d = String(input ?? '').replace(/\D/g, '');
  if (!d) return '';
  while (d.startsWith('0') && d.length > 1) d = d.slice(1);
  if (d.length >= 12 && d.startsWith('55')) return d;
  if (d.length === 10 || d.length === 11) return `55${d.length === 10 ? `${d.slice(0, 2)}9${d.slice(2)}` : d}`;
  return d;
}

export function isPlausibleBrazilWhatsapp(input: string): boolean {
  const d = normalizeBrazilWhatsappDigits(input);
  return /^55\d{10,11}$/.test(d);
}
