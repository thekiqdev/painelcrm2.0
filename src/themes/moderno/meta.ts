import type { StorefrontThemeId } from '@/themes/types';

/** Metadados admin + texto público do hero (alinhado ao layout Lovable "Novo Brilho"). */
export const modernoStoreMeta = {
  id: 'moderno' as const satisfies StorefrontThemeId,
  label: 'Moderno',
  shortDescription: 'Elegância que transforma',
  previewClassName: 'from-stone-700/30 via-rose-900/20 to-amber-100/40',
  /** Linha principal do hero (marketing); vitrine usa também como subtítulo quando não houver descrição longa. */
  publicTagline: 'Elegância que transforma',
} as const;
