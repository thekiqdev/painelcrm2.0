/**
 * Ponto de entrada dos templates da loja pública.
 * Novos templates: ver comentários em `types.ts` e `registry.tsx`.
 */
export type {
  StorefrontThemeId,
  StorefrontThemeModule,
  StorefrontTemplateDefinition,
  StorefrontTemplateAdminMeta,
  StorefrontListThemeProps,
  StorefrontProductThemeProps,
} from '@/themes/types';

export {
  STOREFRONT_TEMPLATES,
  STOREFRONT_THEME_OPTIONS,
  resolveStorefrontTheme,
  getStorefrontTemplateDefinition,
} from '@/themes/registry';
