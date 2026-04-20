import type { StorefrontThemeId } from '@/themes/types';

export const minimalStoreMeta = {
  id: 'minimal' as const satisfies StorefrontThemeId,
  label: 'Minimal',
  shortDescription:
    'Visual mais limpo e espaçado, com foco no conteúdo. Bom para catálogos enxutos ou serviços.',
  previewClassName: 'from-slate-500/25 to-slate-900/10',
} as const;
