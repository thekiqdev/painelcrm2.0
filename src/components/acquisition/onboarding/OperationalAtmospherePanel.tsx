import { useEffect, useState } from 'react';
import { Bot, MessageCircle, Sparkles, Workflow, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActivationBadge } from './ActivationBadge';
import { ONBOARDING_STEPS } from './constants';

const PULSE_ACTIVITIES = [
  { id: 1, text: 'Playbook de qualificação em standby', tag: 'Automação' },
  { id: 2, text: 'IA Assist pronto para sugerir próximos passos', tag: 'AI Assist' },
  { id: 3, text: 'Canal WhatsApp aguardando conexão', tag: 'Operação' },
  { id: 4, text: 'Recovery e onboarding assistido habilitados', tag: 'Ativação' },
];

type Props = {
  activeStepIndex: number;
  className?: string;
};

/** Coluna esquerda desktop — atmosfera operacional, sem dashboard. */
export function OperationalAtmospherePanel({ activeStepIndex, className }: Props) {
  const [activityIdx, setActivityIdx] = useState(0);
  const step = ONBOARDING_STEPS[activeStepIndex] ?? ONBOARDING_STEPS[0]!;

  useEffect(() => {
    const id = window.setInterval(() => {
      setActivityIdx((i) => (i + 1) % PULSE_ACTIVITIES.length);
    }, 3800);
    return () => window.clearInterval(id);
  }, []);

  const activity = PULSE_ACTIVITIES[activityIdx];

  return (
    <div className={cn('flex h-full flex-col justify-center px-10 py-12 xl:px-14 xl:py-16', className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/90">PainelCRM</p>

      <h2 className="mt-4 font-display text-3xl font-semibold leading-[1.15] tracking-tight text-foreground xl:text-[2.35rem]">
        Ative sua
        <span className="block bg-gradient-to-r from-slate-100 via-slate-200 to-slate-500 bg-clip-text text-transparent">
          operação inteligente.
        </span>
      </h2>

      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        CRM operacional com IA, WhatsApp e automações — configurado para ativação rápida, não para
        formulários intermináveis.
      </p>

      <div className="relative mt-10 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 shadow-[0_0_80px_-24px_hsl(var(--primary)/0.35)]">
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/20 blur-[48px]"
          aria-hidden
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/50 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
            </span>
            <span className="text-xs text-muted-foreground">Sistema operacional online</span>
          </div>
          <div className="flex gap-1.5">
            <ActivationBadge variant="ai">
              <Bot className="h-3 w-3" />
              IA Assist
            </ActivationBadge>
            <ActivationBadge variant="default">
              <Sparkles className="h-3 w-3" />
              Copilot
            </ActivationBadge>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Workflow className="h-3.5 w-3.5 text-primary/80" />
            <span>Automações preparadas</span>
            <span className="ml-auto font-mono text-[11px] tabular-nums text-foreground/80">standby</span>
          </div>

          <div
            key={activity.id}
            className="animate-in fade-in slide-in-from-bottom-1 flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3 duration-500"
          >
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/90" />
            <div className="min-w-0">
              <p className="text-sm leading-snug text-foreground/95">{activity.text}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{activity.tag}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-violet-500/15 bg-violet-500/[0.06] px-3 py-2.5">
            <Zap className="h-4 w-4 shrink-0 text-violet-300/90" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-violet-200/90">Etapa atual:</span> {step.short} — foco em
              ativação, não em cadastro legado.
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-1">
          {ONBOARDING_STEPS.slice(0, 3).map((s, i) => (
            <div
              key={s.id}
              className={cn(
                'h-1 flex-1 rounded-full transition-all duration-500',
                i <= activeStepIndex ? 'bg-primary/70 shadow-[0_0_12px_hsl(var(--primary)/0.5)]' : 'bg-white/10',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
