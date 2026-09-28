/**
 * M5 S2 — Auth shell com marca Partner (host) ou Platform.
 */
import React from 'react';
import { usePartnerBrand } from '@/contexts/PartnerBrandContext';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  const { displayName, tagline, logoUrl, isPartnerHost } = usePartnerBrand();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-background via-background to-muted/30 lg:flex-row lg:bg-crm-light">
      <div className="relative hidden shrink-0 lg:flex lg:min-h-[100dvh] lg:w-1/2 lg:bg-gradient-to-br lg:from-crm-primary lg:to-crm-accent">
        <div className="flex h-full w-full flex-col justify-center p-10 xl:p-14">
          <div className="max-w-lg text-white">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="mb-6 max-h-14 w-auto max-w-[220px] object-contain"
              />
            ) : null}
            <h1 className="font-display text-3xl font-bold tracking-tight xl:text-4xl">
              {displayName}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-white/85">{tagline}</p>
            {!isPartnerHost ? (
              <div className="mt-10 grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                  <div className="text-2xl font-bold">+50%</div>
                  <div className="mt-1 text-white/75">Conversões</div>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                  <div className="text-2xl font-bold">−30%</div>
                  <div className="mt-1 text-white/75">Ciclo de vendas</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex min-h-[100dvh] flex-1 flex-col lg:justify-center lg:overflow-y-auto lg:p-8">
        <div className="flex w-full flex-1 flex-col px-4 pb-[max(5.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:mx-auto lg:max-w-md lg:justify-center lg:pb-8 lg:pt-8">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
