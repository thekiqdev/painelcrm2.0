import type { StorefrontThemeId } from '@/themes/types';

export const luzmodasStoreMeta = {
  id: 'luzmodas' as const satisfies StorefrontThemeId,
  label: 'Luzmodas',
  shortDescription: 'Descubra peças que combinam elegância e conforto para todos os momentos.',
  previewClassName: 'from-pink-300/40 via-rose-200/30 to-fuchsia-100/50',
} as const;
