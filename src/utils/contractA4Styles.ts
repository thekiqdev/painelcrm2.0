import { cn } from '@/lib/utils';

/** Folha A4 compartilhada entre edição e visualização do contrato. */
export const CONTRACT_A4_SHEET_CLASS = cn(
  'contract-a4-sheet w-full max-w-[210mm] min-h-[297mm] bg-white text-[15px] leading-[1.75]',
  'shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-black/[0.06]',
  'px-[8mm] py-[10mm] sm:px-[14mm] sm:py-[16mm]',
  'text-zinc-950 [font-family:Georgia,"Times_New_Roman",Times,serif]',
  '[color-scheme:light]',
);

/** Tipografia do corpo HTML — mesma no editor e na leitura. */
export const CONTRACT_A4_PROSE_CLASS = cn(
  'prose prose-sm prose-neutral max-w-none contract-a4-prose text-zinc-900',
  '[font-family:Georgia,"Times_New_Roman",Times,serif]',
  '[&_p]:my-3 [&_p]:leading-[1.75] [&_p]:text-[15px]',
  '[&_div]:leading-[1.75] [&_span]:leading-[1.75]',
  '[&_li]:my-1 [&_li]:leading-[1.7]',
  '[&_h1]:text-xl [&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:leading-snug',
  '[&_h2]:text-lg [&_h2]:mt-6 [&_h2]:mb-2.5 [&_h2]:leading-snug',
  '[&_h3]:text-base [&_h3]:mt-5 [&_h3]:mb-2.5',
  '[&_ul]:pl-5 [&_ol]:pl-5 [&_ul]:my-3 [&_ol]:my-3',
  '[&_blockquote]:my-4 [&_blockquote]:pl-4 [&_blockquote]:border-l-2 [&_blockquote]:border-black/15',
  '[&_br]:leading-[1.75]',
  '[&_strong]:font-bold [&_b]:font-bold [&_em]:italic [&_i]:italic',
);
