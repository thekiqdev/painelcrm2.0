import { Headset } from 'lucide-react';
import { cn } from '@/lib/utils';

type SupportHeroProps = {
  online: boolean;
  className?: string;
};

export function SupportHero({ online, className }: SupportHeroProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-card to-card px-6 py-8 shadow-sm',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -left-8 top-0 h-32 w-32 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />
      <GlowOrb className="right-0 top-0 translate-x-1/3 -translate-y-1/3" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
            <Headset className="h-6 w-6" aria-hidden />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Central de Suporte
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Fale com nossa equipe sobre dúvidas, bugs, integrações e suporte técnico.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm',
              online
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : 'border-border/60 bg-muted/50 text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                online ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/50',
              )}
              aria-hidden
            />
            {online ? 'Online agora' : 'Fora do horário'}
          </span>
          <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
            Tempo médio: ~15min
          </span>
          <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
            Sistema operacional
          </span>
        </div>
      </div>
    </section>
  );
}

function GlowOrb({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute h-32 w-32 rounded-full bg-primary/10 blur-3xl',
        className,
      )}
      aria-hidden
    />
  );
}
