/** Paleta visual por signatário no editor PDF (estilo DocuSign). */
export const PDF_SIGNER_COLOR_PALETTE = [
  {
    border: 'border-violet-500',
    bg: 'bg-violet-500/12',
    text: 'text-violet-800 dark:text-violet-200',
    ring: 'ring-violet-500/40',
    dot: 'bg-violet-500',
  },
  {
    border: 'border-sky-500',
    bg: 'bg-sky-500/12',
    text: 'text-sky-800 dark:text-sky-200',
    ring: 'ring-sky-500/40',
    dot: 'bg-sky-500',
  },
  {
    border: 'border-emerald-500',
    bg: 'bg-emerald-500/12',
    text: 'text-emerald-800 dark:text-emerald-200',
    ring: 'ring-emerald-500/40',
    dot: 'bg-emerald-500',
  },
  {
    border: 'border-amber-500',
    bg: 'bg-amber-500/12',
    text: 'text-amber-900 dark:text-amber-200',
    ring: 'ring-amber-500/40',
    dot: 'bg-amber-500',
  },
  {
    border: 'border-rose-500',
    bg: 'bg-rose-500/12',
    text: 'text-rose-800 dark:text-rose-200',
    ring: 'ring-rose-500/40',
    dot: 'bg-rose-500',
  },
  {
    border: 'border-indigo-500',
    bg: 'bg-indigo-500/12',
    text: 'text-indigo-800 dark:text-indigo-200',
    ring: 'ring-indigo-500/40',
    dot: 'bg-indigo-500',
  },
] as const;

export function pdfSignerColorIndex(seed: string, fallback = 0): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * 17) % PDF_SIGNER_COLOR_PALETTE.length;
  return h || fallback % PDF_SIGNER_COLOR_PALETTE.length;
}
