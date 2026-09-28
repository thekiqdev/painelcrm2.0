/**
 * Formato visual de telefone BR para texto (merge fields), alinhado ao frontend `formatPhoneBrDigits`.
 */
export function formatBrazilPhoneDigitsForDisplay(rawDigits: string): string {
  let d = String(rawDigits ?? '')
    .replace(/\D/g, '')
    .slice(0, 13);
  if (d.startsWith('55') && d.length >= 12) {
    d = d.slice(2);
  }
  d = d.slice(0, 11);
  if (d.length === 0) return '';
  if (d.length === 1) return `(${d}`;
  if (d.length === 2) return `(${d})`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
