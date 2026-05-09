/** Cor padrão alinhada ao backend `DEFAULT_KANBAN_TAG_COLOR_UI`. */
export const DEFAULT_CHAT_TAG_COLOR = '#2563EB';

export const CHAT_TAG_COLOR_PALETTE = [
  { name: 'Azul', value: '#2563EB' },
  { name: 'Verde', value: '#16A34A' },
  { name: 'Amarelo', value: '#CA8A04' },
  { name: 'Laranja', value: '#EA580C' },
  { name: 'Vermelho', value: '#DC2626' },
  { name: 'Roxo', value: '#7C3AED' },
  { name: 'Rosa', value: '#DB2777' },
  { name: 'Cinza', value: '#64748B' },
] as const;

export function normalizeHexColor(input: string | null | undefined): string {
  if (!input?.trim()) return DEFAULT_CHAT_TAG_COLOR;
  const t = input.trim();
  if (/^#[0-9A-Fa-f]{3}$/.test(t) || /^#[0-9A-Fa-f]{6}$/.test(t)) return t;
  return DEFAULT_CHAT_TAG_COLOR;
}

/** Contraste simples (sRGB) para texto sobre fundo colorido. */
export function contrastingTextForBg(hex: string): string {
  const full = normalizeHexColor(hex).replace('#', '');
  const exp =
    full.length === 3
      ? full
          .split('')
          .map((c) => c + c)
          .join('')
      : full;
  const r = parseInt(exp.slice(0, 2), 16);
  const g = parseInt(exp.slice(2, 4), 16);
  const b = parseInt(exp.slice(4, 6), 16);
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.55 ? '#0f172a' : '#ffffff';
}
