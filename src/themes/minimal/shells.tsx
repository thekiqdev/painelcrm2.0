import type { ReactNode } from 'react';
import type { StorefrontListThemeProps, StorefrontProductThemeProps } from '@/themes/types';

/** Tema alternativo simples: tipografia mais leve e faixa superior discreta. */
export function MinimalListShell({
  storeProfile,
  bannerUrl,
  logoUrl,
  children,
}: StorefrontListThemeProps) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 storefront-theme-minimal">
      {bannerUrl ? (
        <div className="w-full h-36 sm:h-44 overflow-hidden border-b border-stone-200">
          <img src={bannerUrl} alt="" className="w-full h-full object-cover opacity-95" />
        </div>
      ) : (
        <div className="h-2 bg-stone-200" />
      )}
      <header className="border-b border-stone-200 bg-white">
        <div className="container mx-auto px-4 py-10 max-w-3xl">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={storeProfile.store_name}
                className="h-14 w-auto object-contain self-start sm:self-center"
              />
            ) : null}
            <div>
              <h1 className="text-2xl font-light tracking-tight">{storeProfile.store_name}</h1>
              {storeProfile.store_description ? (
                <p className="text-sm text-stone-600 mt-2 leading-relaxed">
                  {storeProfile.store_description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      {children as ReactNode}
    </div>
  );
}

export function MinimalProductShell({ children }: StorefrontProductThemeProps) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 storefront-theme-minimal">
      {children}
    </div>
  );
}
