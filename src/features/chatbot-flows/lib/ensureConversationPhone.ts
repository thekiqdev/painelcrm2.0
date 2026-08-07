/**
 * Preview de normalização BR (espelha BE flowEnsureConversation — só dígitos / 55).
 * Usado no editor; runtime real está no backend.
 */
export function previewNormalizePhoneBr(raw: string, normalizeBr = true): string {
  let digits = String(raw || '').replace(/\D/g, '');
  while (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('5555') && digits.length > 13) digits = digits.slice(2);
  if (normalizeBr && !digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  if (!digits || digits.length < 10 || digits.length > 15) return '';
  if (normalizeBr && digits.startsWith('55')) {
    const rest = digits.slice(2);
    if (rest.length < 10 || rest.length > 11) return '';
  }
  return `+${digits}`;
}
