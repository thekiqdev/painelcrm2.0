import type { StorefrontThemeId, StorefrontThemeModule } from '@/themes/types';
import { DefaultListShell, DefaultProductShell } from '@/themes/default/shells';
import { MinimalListShell, MinimalProductShell } from '@/themes/minimal/shells';

const defaultTheme: StorefrontThemeModule = {
  id: 'default',
  label: 'Clássico',
  ListShell: DefaultListShell,
  ProductShell: DefaultProductShell,
};

const minimalTheme: StorefrontThemeModule = {
  id: 'minimal',
  label: 'Minimal',
  ListShell: MinimalListShell,
  ProductShell: MinimalProductShell,
};

const REGISTRY: Record<StorefrontThemeId, StorefrontThemeModule> = {
  default: defaultTheme,
  minimal: minimalTheme,
};

export const STOREFRONT_THEME_OPTIONS: { id: StorefrontThemeId; label: string }[] = [
  { id: 'default', label: defaultTheme.label },
  { id: 'minimal', label: minimalTheme.label },
];

export function resolveStorefrontTheme(themeKey: string | null | undefined): StorefrontThemeModule {
  if (themeKey === 'minimal') return minimalTheme;
  return defaultTheme;
}
