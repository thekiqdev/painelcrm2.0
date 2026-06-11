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

type Props = {
  preview: ContactPreviewState;
  timelineStage: ActivationTimelineStage;
  subStep?: LeadCaptureSubStep;
  phoneVerified?: boolean;
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
    stateOverrides: timelineStateOverrides,
  });

  const accessRequested = phoneDigits.length >= 10;
  const phoneDisplay = formatSignupPhoneE164(preview.phone);
  const emailDisplay = isDisplayableSignupEmail(preview.email) ? preview.email.trim() : null;
  const adminName = preview.name.trim() || null;

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.09]',
        'bg-gradient-to-b from-white/[0.05] to-white/[0.02] backdrop-blur-xl',
        compact ? 'p-3.5' : 'p-4 lg:sticky lg:top-4',
        !compact && 'shadow-[0_0_64px_-24px_hsl(var(--primary)/0.45)]',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/12 blur-[48px]"
        aria-hidden
      />

      <header className="relative mb-4 space-y-0.5">
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
          compact ? 'px-3 py-3' : 'px-4 py-4',
          accessRequested && 'border-emerald-500/20 shadow-[0_0_28px_-14px_rgba(52,211,153,0.35)]',
        )}
        aria-label="Acesso solicitado"
      >
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
      </section>

      <section className="relative mt-4" aria-label="Progresso da preparação">
        <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Progresso da preparação
        </p>
        <ul className="relative flex flex-col">
          {entries.map((entry, index) => {
            const isLast = index === entries.length - 1;
            const lineActive = entry.state === 'completed';

            return (
              <li
                key={entry.id}
                className={cn(
                  'relative flex items-start gap-2.5 transition-all duration-500',
                  compact ? 'py-1.5 text-[11px]' : 'py-2 text-xs',
                  entry.state === 'completed' && 'text-foreground',
                  entry.state === 'in_progress' && 'text-foreground/95',
                  entry.state === 'future' && 'text-muted-foreground/80',
                )}
              >
                {!isLast ? (
                  <span
                    className={cn(
                      'absolute left-[6px] top-[20px] w-px transition-colors duration-500',
                      lineActive ? 'bg-emerald-500/30' : 'bg-white/10',
                    )}
                    style={{ height: 'calc(100% - 8px)' }}
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
