import { ArrowRight, Building2, MessageCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTIVATION_TIMELINE_STEPS } from './constants';

type Props = {
  className?: string;
};

/** Fluxo visual Empresa → Equipe → WhatsApp (mobile). */
export function ActivationProgressVisualization({ className }: Props) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/[0.06] bg-gradient-to-b from-primary/[0.06] to-transparent px-4 py-5 lg:hidden',
        className,
      )}
    >
      <p className="mb-4 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Construindo sua operação
      </p>
      <div className="flex items-center justify-center gap-1.5 sm:gap-2">
        {ACTIVATION_TIMELINE_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === ACTIVATION_TIMELINE_STEPS.length - 1;
          return (
            <div key={step.id} className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_24px_-8px_hsl(var(--primary)/0.5)]">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="text-[10px] font-medium text-foreground/90">{step.label}</span>
              </div>
              {!isLast ? (
                <ArrowRight className="mb-5 h-3.5 w-3.5 shrink-0 text-primary/50" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
