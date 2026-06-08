import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

type Props = {
  children: ReactNode;
  header: ReactNode;
  footer?: ReactNode;
  /** Coluna fixa à esquerda (perfil + jornada) em desktop */
  aside?: ReactNode;
  className?: string;
  /** Footer fixo no rodapé em mobile (ex.: provision). */
  mobileFixedFooter?: boolean;
  /** Espaço inferior no scroll para não cobrir conteúdo com footer fixo. */
  reserveMobileFooterSpace?: boolean;
  /** Reduz padding vertical do conteúdo (etapas densas como Empresa). */
  compactVertical?: boolean;
};

/** Shell onboarding operacional — full focus, 100vh, sem sidebar. */
export function OperationalOnboardingFocusLayout({
  children,
  header,
  footer,
  aside,
  className,
  mobileFixedFooter = false,
  reserveMobileFooterSpace = false,
  compactVertical = false,
}: Props) {
  return (
    <div className="dark relative flex h-[100dvh] flex-col overflow-hidden bg-[hsl(228,32%,4%)] text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[min(65vh,480px)] w-[min(90vw,640px)] -translate-x-1/2 rounded-full bg-[hsl(221,65%,48%)]/[0.08] blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-[35vh] w-[45vw] max-w-sm rounded-full bg-slate-500/[0.05] blur-[80px]" />
      </div>

      <header className="relative z-10 shrink-0 border-b border-white/[0.06] bg-[hsl(228,32%,4%)]/85 backdrop-blur-xl">
        <div
          className={cn(
            'mx-auto flex items-center justify-between gap-4 px-4 py-4 sm:px-6',
            aside ? 'max-w-5xl' : 'max-w-2xl',
          )}
        >
          <Link
            to="/"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/90 transition-opacity hover:opacity-80"
          >
            PainelCRM
          </Link>
        </div>
        <div className={cn('mx-auto px-4 pb-4 sm:px-6', aside ? 'max-w-5xl' : 'max-w-2xl')}>{header}</div>
      </header>

      <main
        className={cn(
          'relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto',
          reserveMobileFooterSpace && 'max-lg:pb-32',
          className,
        )}
      >
        <div
          className={cn(
            'mx-auto flex w-full flex-1 flex-col px-4 sm:px-6',
            compactVertical ? 'py-4 sm:py-5' : 'py-6 sm:py-8',
            aside ? (compactVertical ? 'max-w-5xl lg:py-6' : 'max-w-5xl lg:py-10') : 'max-w-lg justify-center sm:py-10',
          )}
        >
          {aside ? (
            <div className="flex min-h-0 flex-1 flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,260px)_1fr] lg:items-start lg:gap-10">
              <aside className="shrink-0 lg:sticky lg:top-6 lg:self-start">{aside}</aside>
              <div className="min-w-0 flex-1 animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both lg:pt-0.5">
                {children}
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both">{children}</div>
          )}
        </div>
      </main>

      {footer ? (
        <footer
          className={cn(
            'relative z-10 shrink-0 border-t border-white/[0.06] bg-[hsl(228,32%,4%)]/90 backdrop-blur-xl',
            mobileFixedFooter &&
              'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:border-t max-lg:border-white/[0.07]',
          )}
        >
          <div
            className={cn(
              'mx-auto sm:px-6',
              mobileFixedFooter ? 'max-lg:px-0 max-lg:py-0' : 'px-4 py-4',
              aside ? 'max-w-5xl' : 'max-w-lg',
            )}
          >
            {footer}
          </div>
        </footer>
      ) : null}
    </div>
  );
}
