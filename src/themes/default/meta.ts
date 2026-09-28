import type { StorefrontThemeId } from '@/themes/types';

/** Metadados do template (admin). Layout em `shells.tsx`. */
export const defaultStoreMeta = {
  id: 'default' as const satisfies StorefrontThemeId,
  label: 'Clássico',
  shortDescription:
    'Layout padrão com hierarquia clara, banner e área de produtos em grade. Ideal para a maioria das lojas.',
  /** Sugestão visual para preview no admin (sem imagem de asset ainda). */
  previewClassName: 'from-primary/20 to-muted',
} as const;
