import type { ReactNode } from 'react';
import type { StorefrontListThemeProps, StorefrontProductThemeProps } from '@/themes/types';
import '@/themes/moderno/moderno.css';
import { ModernHero } from '@/themes/moderno/ModernHero';
import { ModernStoreHeader } from '@/themes/moderno/ModernStoreHeader';
import { ModernCategoryShowcase } from '@/themes/moderno/ModernCategoryShowcase';
import { ModernBrandHighlights } from '@/themes/moderno/ModernBrandHighlights';
import { ModernStoreFooter } from '@/themes/moderno/ModernStoreFooter';
import { ModernBestSellers, ModernNewArrivals } from '@/themes/moderno/ModernProductGrid';

/** Etapa visual: tema Moderno mockado e fiel ao template Lovable original. */
export function ModernListShell({
  storeProfile,
  bannerUrl,
  logoUrl,
  children: _children,
}: StorefrontListThemeProps) {
  const storePath = storeProfile.store_slug?.trim() ? `/${storeProfile.store_slug}/loja` : '/';

  return (
    <div className="min-h-screen bg-[#faf8f5] storefront-theme-moderno">
      <ModernStoreHeader storeProfile={storeProfile} logoUrl={logoUrl} />
      <main>
        <ModernHero storeProfile={storeProfile} bannerUrl={bannerUrl} />
        <ModernNewArrivals baseProductPath={`${storePath}/produto`} />
        <ModernCategoryShowcase />
        <ModernBestSellers baseProductPath={`${storePath}/produto`} />
        <ModernBrandHighlights />
      </main>
      <ModernStoreFooter storeProfile={storeProfile} />
    </div>
  );
}

/**
 * Detalhe: chrome do tema + conteúdo real de PublicProduct (inclui seletor de variantes).
 */
export function ModernProductShell({ storeProfile, children }: StorefrontProductThemeProps) {
  return (
    <div className="min-h-screen bg-[#faf8f5] storefront-theme-moderno">
      <ModernStoreHeader
        storeProfile={storeProfile}
        logoUrl={storeProfile.store_logo?.trim() || null}
      />
      {children as ReactNode}
      <ModernStoreFooter storeProfile={storeProfile} />
    </div>
  );
}
