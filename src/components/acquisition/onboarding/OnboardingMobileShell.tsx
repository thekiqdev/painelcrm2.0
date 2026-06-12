import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ONBOARDING_STEPS } from './constants';

type Props = {
  activeStepIndex: number;
  children: ReactNode;
  footer?: ReactNode;
  compactHeader?: boolean;
  reserveBottomSpace?: boolean;
  hideFooterStepDots?: boolean;
  /** Desktop Operação: sem scroll na área principal */
  lockViewport?: boolean;
  /** E2.5.2 — barra compacta 25% + etapa atual (admin mobile) */
  adminStepMobile?: boolean;
};

export function OnboardingMobileShell({
  activeStepIndex,
  children,
  footer,
  compactHeader = false,
  reserveBottomSpace = false,
  hideFooterStepDots = false,
  lockViewport = false,
  adminStepMobile = false,
}: Props) {
  const progress = Math.round(((activeStepIndex + 1) / ONBOARDING_STEPS.length) * 100);
  const step = ONBOARDING_STEPS[activeStepIndex] ?? ONBOARDING_STEPS[0]!;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header
        className={cn(
          'shrink-0 border-b border-white/[0.05] bg-[hsl(228,32%,4%)]/95 backdrop-blur-xl lg:hidden',
          adminStepMobile
            ? 'px-5 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]'
            : cn(
                'px-4',
                compactHeader
                  ? 'max-h-[80px] pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]'
                  : 'pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]',
              ),
        )}
      >
        {adminStepMobile ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Status de ativação
              </p>
              <span className="font-mono text-xs font-semibold tabular-nums text-primary">{progress}%</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-primary/90 transition-all duration-700 ease-out"
                style={{ width: `${Math.max(progress, 6)}%` }}
              />
            </div>
            <p className="mt-1 text-xs font-semibold text-foreground">{step.short}</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <Link
                to="/"
                className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/85"
              >
                PainelCRM
              </Link>
              <span className="font-mono text-[10px] tabular-nums text-primary">{progress}%</span>
            </div>
            <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-primary/90 transition-all duration-700 ease-out"
                style={{ width: `${Math.max(progress, 6)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs font-medium text-foreground">{step.short}</p>
            {!compactHeader ? (
              <p className="text-[11px] text-muted-foreground">{step.description}</p>
            ) : null}
          </>
        )}
      </header>

      <div
        className={cn(
          'min-h-0 flex-1 overflow-x-hidden',
          adminStepMobile
            ? 'overflow-y-auto overscroll-contain touch-pan-y'
            : lockViewport
              ? 'overflow-hidden lg:overflow-hidden'
              : 'overflow-y-auto overscroll-contain',
          adminStepMobile ? 'px-0 py-0 lg:px-0 lg:py-0' : 'px-4 py-3 lg:overflow-hidden lg:px-0 lg:py-0',
          reserveBottomSpace &&
            (adminStepMobile
              ? 'pb-[calc(10.5rem+env(safe-area-inset-bottom))]'
              : 'pb-[min(42vh,220px)]'),
        )}
      >
        {children}
      </div>

      {footer ? (
        <footer
          className={cn(
            'shrink-0 lg:hidden',
            reserveBottomSpace
              ? 'fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.06] bg-[hsl(228,32%,4%)]/95 px-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl'
              : 'border-t border-white/[0.06] bg-[hsl(228,32%,4%)]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl',
          )}
        >
          {!hideFooterStepDots && !reserveBottomSpace && !adminStepMobile ? (
            <div className="mb-3 flex justify-center gap-1.5">
              {ONBOARDING_STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className={cn(
                    'h-1 rounded-full transition-all duration-300',
                    i === activeStepIndex ? 'w-6 bg-primary' : 'w-1.5',
                    i < activeStepIndex ? 'bg-primary/50' : i > activeStepIndex ? 'bg-white/15' : '',
                  )}
                  aria-hidden
                />
              ))}
            </div>
          ) : null}
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
