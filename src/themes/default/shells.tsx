import type { ReactNode } from 'react';
import type { StorefrontListThemeProps, StorefrontProductThemeProps } from '@/themes/types';

export function DefaultListShell({
  storeProfile,
  bannerUrl,
  logoUrl,
  children,
}: StorefrontListThemeProps) {
  return (
    <div className="min-h-screen bg-background storefront-theme-default">
      {bannerUrl ? (
        <div className="w-full h-40 sm:h-52 md:h-64 overflow-hidden bg-muted">
          <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
        </div>
      ) : null}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center max-w-2xl mx-auto">
            {logoUrl ? (
              <div className="flex justify-center mb-4">
                <img
                  src={logoUrl}
                  alt={storeProfile.store_name}
                  className="max-h-20 object-contain"
                />
              </div>
            ) : null}
            <h1 className="text-3xl font-bold mb-4">{storeProfile.store_name}</h1>
            {storeProfile.store_description ? (
              <p className="text-lg text-muted-foreground mb-6">{storeProfile.store_description}</p>
            ) : null}
          </div>
        </div>
      </div>
      {children as ReactNode}
    </div>
  );
}

export function DefaultProductShell({ children }: StorefrontProductThemeProps) {
  return <div className="min-h-screen bg-background storefront-theme-default">{children}</div>;
}
