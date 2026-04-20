/**
 * Registro central de templates da vitrine.
 *
 * Para adicionar um template novo (ex.: Lovable):
 * 1. Pasta `src/themes/<slug>/` com `meta.ts` + `shells.tsx`.
 * 2. Inclua o slug em `StorefrontThemeId` (types.ts) e em `THEME_KEYS` no backend.
 * 3. Importe os shells e o meta aqui; acrescente em STOREFRONT_TEMPLATES e em REGISTRY.
 */
import type {
  StorefrontThemeId,
  StorefrontTemplateDefinition,
  StorefrontThemeModule,
} from '@/themes/types';
import { defaultStoreMeta } from '@/themes/default/meta';
import { minimalStoreMeta } from '@/themes/minimal/meta';
import { modernoStoreMeta } from '@/themes/moderno/meta';
import { luzmodasStoreMeta } from '@/themes/luzmodas/meta';
import { DefaultListShell, DefaultProductShell } from '@/themes/default/shells';
import { MinimalListShell, MinimalProductShell } from '@/themes/minimal/shells';
import { ModernListShell, ModernProductShell } from '@/themes/moderno/shells';
import { LuzmodasListShell, LuzmodasProductShell } from '@/themes/luzmodas/shells';

const defaultModule: StorefrontThemeModule = {
  id: 'default',
  label: defaultStoreMeta.label,
  ListShell: DefaultListShell,
  ProductShell: DefaultProductShell,
};

const minimalModule: StorefrontThemeModule = {
  id: 'minimal',
  label: minimalStoreMeta.label,
  ListShell: MinimalListShell,
  ProductShell: MinimalProductShell,
};

const modernoModule: StorefrontThemeModule = {
  id: 'moderno',
  label: modernoStoreMeta.label,
  ListShell: ModernListShell,
  ProductShell: ModernProductShell,
};

const luzmodasModule: StorefrontThemeModule = {
  id: 'luzmodas',
  label: luzmodasStoreMeta.label,
  ListShell: LuzmodasListShell,
  ProductShell: LuzmodasProductShell,
};

const defaultDefinition: StorefrontTemplateDefinition = {
  ...defaultStoreMeta,
  module: defaultModule,
};

const minimalDefinition: StorefrontTemplateDefinition = {
  ...minimalStoreMeta,
  module: minimalModule,
};

const modernoDefinition: StorefrontTemplateDefinition = {
  ...modernoStoreMeta,
  module: modernoModule,
};

const luzmodasDefinition: StorefrontTemplateDefinition = {
  ...luzmodasStoreMeta,
  module: luzmodasModule,
};

/** Lista ordenada para o admin e documentação. */
export const STOREFRONT_TEMPLATES: StorefrontTemplateDefinition[] = [
  defaultDefinition,
  minimalDefinition,
  modernoDefinition,
  luzmodasDefinition,
];

/** @deprecated Prefira STOREFRONT_TEMPLATES; mantido para compat. */
export const STOREFRONT_THEME_OPTIONS: { id: StorefrontThemeId; label: string }[] =
  STOREFRONT_TEMPLATES.map((t) => ({ id: t.id, label: t.label }));

const REGISTRY: Record<StorefrontThemeId, StorefrontThemeModule> = {
  default: defaultModule,
  minimal: minimalModule,
  moderno: modernoModule,
  luzmodas: luzmodasModule,
};

export function getStorefrontTemplateDefinition(
  id: string | null | undefined
): StorefrontTemplateDefinition | undefined {
  if (id === 'default' || id === 'minimal' || id === 'moderno' || id === 'luzmodas') {
    return STOREFRONT_TEMPLATES.find((t) => t.id === id);
  }
  return undefined;
}

/** Resolve o módulo de tema para a vitrine; chave inválida → default. */
export function resolveStorefrontTheme(themeKey: string | null | undefined): StorefrontThemeModule {
  const k =
    themeKey === 'minimal' || themeKey === 'moderno' || themeKey === 'luzmodas' || themeKey === 'default'
      ? themeKey
      : 'default';
  return REGISTRY[k];
}
