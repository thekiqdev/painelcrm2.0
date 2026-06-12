import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActivationLiveStateIcon } from './ActivationLiveStateIcon';
import type { ActivationTimelineItemId } from './activationPreviewTypes';
import type { ActivationTimelineStage } from './activationPreviewTypes';
import { deriveLiveTimelineEntries, formatSignupPhoneE164, isDisplayableSignupEmail } from './activationPreviewState';
import type { LeadCaptureSubStep } from './ContactSetupStep';

export type ContactPreviewState = {
  name: string;
  email: string;
  phone: string;
};

function adminInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0]}${p[1][0]}`.toUpperCase();
  return (p[0]?.[0] ?? 'A').toUpperCase();
}

type Props = {
  preview: ContactPreviewState;
  timelineStage: ActivationTimelineStage;
  subStep?: LeadCaptureSubStep;
  phoneVerified?: boolean;
  avatarUrl?: string | null;
  adminFormComplete?: boolean;
  compact?: boolean;
  /** Override futuro — estados por item (provisionamento real). */
  timelineStateOverrides?: Partial<
    Record<ActivationTimelineItemId, import('./activationPreviewTypes').ActivationLiveState>
  >;
  className?: string;
};

export function ContactLivePreview({
  preview,
  timelineStage,
  subStep = 'identity',
  phoneVerified = false,
  avatarUrl = null,
  adminFormComplete = false,
  compact = false,
  timelineStateOverrides,
  className,
}: Props) {
  const phoneDigits = preview.phone.replace(/\D/g, '');
  const entries = deriveLiveTimelineEntries(timelineStage, {
    phoneDigits,
    phoneVerified,
    subStep,
    name: preview.name,
    email: preview.email,
    adminFormComplete,
    stateOverrides: timelineStateOverrides,
  });

  const isAdminStep = subStep === 'admin';
  const accessRequested = phoneDigits.length >= 10;
  const phoneDisplay = formatSignupPhoneE164(preview.phone);
  const emailDisplay = isDisplayableSignupEmail(preview.email) ? preview.email.trim() : null;
  const adminName = preview.name.trim() || null;
  const displayAdminName = adminName ?? 'Responsável';

  const denseAdmin = isAdminStep && !compact;

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.09]',
        'bg-gradient-to-b from-white/[0.05] to-white/[0.02] backdrop-blur-xl',
        compact ? 'p-3.5' : denseAdmin ? 'p-3 lg:sticky lg:top-4' : 'p-4 lg:sticky lg:top-4',
        !compact && 'shadow-[0_0_64px_-24px_hsl(var(--primary)/0.45)]',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/12 blur-[48px]"
        aria-hidden
      />

      <header className={cn('relative space-y-0.5', denseAdmin ? 'mb-2' : 'mb-4')}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Status da ativação
        </p>
        <p className={cn('font-medium text-foreground/90', compact ? 'text-xs' : 'text-sm')}>
          Preparando seu ambiente
        </p>
      </header>

      <section
        className={cn(
          'relative rounded-xl border border-white/[0.08] bg-black/25 transition-all duration-500',
          compact ? 'px-3 py-2.5' : denseAdmin ? 'px-3 py-2.5' : 'px-4 py-4',
          (isAdminStep || accessRequested) &&
            'border-emerald-500/20 shadow-[0_0_28px_-14px_rgba(52,211,153,0.35)]',
        )}
        aria-label={isAdminStep ? 'Administrador principal' : 'Acesso solicitado'}
      >
        {isAdminStep ? (
          <>
            <p
              className={cn(
                'font-semibold text-foreground',
                compact || denseAdmin ? 'text-sm' : 'text-[15px]',
              )}
            >
              Administrador principal
            </p>
            <div className={cn('flex items-start gap-2.5', denseAdmin ? 'mt-2' : 'mt-3')}>
              <div
                className={cn(
                  'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-primary/10',
                  compact ? 'h-11 w-11' : 'h-14 w-14',
                )}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-primary">{adminInitials(displayAdminName)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-medium text-foreground">{displayAdminName}</p>
                {phoneDisplay ? (
                  <p className="truncate text-[11px] tabular-nums text-muted-foreground">{phoneDisplay}</p>
                ) : null}
                {emailDisplay ? (
                  <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0 text-primary/80" />
                    <span className="truncate font-medium text-foreground/90">{emailDisplay}</span>
                  </div>
                ) : null}
                <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                  Administrador inicial
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full transition-colors duration-500',
                  accessRequested ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-muted-foreground/40',
                )}
                aria-hidden
              />
              <p className={cn('font-semibold text-foreground', compact ? 'text-sm' : 'text-[15px]')}>
                {accessRequested ? 'Acesso solicitado' : 'Aguardando WhatsApp'}
              </p>
            </div>

            {phoneDisplay ? (
              <p
                className={cn(
                  'mt-2 font-medium tabular-nums text-foreground transition-opacity duration-300',
                  compact ? 'text-sm' : 'text-base',
                )}
              >
                {phoneDisplay}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Informe seu WhatsApp para solicitar acesso.</p>
            )}

            {emailDisplay ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0 text-primary/80" />
                <span className="truncate font-medium text-foreground">{emailDisplay}</span>
              </div>
            ) : adminName ? (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{adminName}</span>
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className={cn('relative', denseAdmin ? 'mt-3' : 'mt-4')} aria-label="Progresso da preparação">
        <p
          className={cn(
            'text-[10px] font-medium uppercase tracking-wider text-muted-foreground',
            denseAdmin ? 'mb-2' : 'mb-2.5',
          )}
        >
          Progresso da preparação
        </p>
        <ul
          className={cn(
            'relative flex flex-col',
            denseAdmin ? 'gap-3' : compact ? 'gap-2' : 'gap-0',
          )}
        >
          {entries.map((entry, index) => {
            const isLast = index === entries.length - 1;
            const lineActive = entry.state === 'completed';

            return (
              <li
                key={entry.id}
                className={cn(
                  'relative flex items-start gap-2 transition-all duration-500',
                  denseAdmin ? 'text-[11px]' : compact ? 'py-1.5 text-[11px]' : 'py-2 text-xs',
                  entry.state === 'completed' && 'text-foreground',
                  entry.state === 'in_progress' && 'text-foreground/95',
                  entry.state === 'future' && 'text-muted-foreground/80',
                )}
              >
                {!isLast ? (
                  <span
                    className={cn(
                      'absolute left-[6px] w-px transition-colors duration-500',
                      denseAdmin ? 'top-[16px]' : 'top-[20px]',
                      lineActive ? 'bg-emerald-500/30' : 'bg-white/10',
                    )}
                    style={{ height: denseAdmin ? 'calc(100% + 4px)' : 'calc(100% - 8px)' }}
                    aria-hidden
                  />
                ) : null}
                <ActivationLiveStateIcon state={entry.state} />
                <span
                  className={cn(
                    'leading-snug transition-all duration-500',
                    entry.state === 'in_progress' && 'animate-pulse',
                  )}
                >
                  {entry.label}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
