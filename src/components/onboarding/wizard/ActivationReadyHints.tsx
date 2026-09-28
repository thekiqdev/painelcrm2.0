import { Bot, Sparkles, Workflow, Zap } from 'lucide-react';

const HINTS = [
  { icon: Sparkles, label: 'Automações em standby', sub: 'Prontas após ativação' },
  { icon: Bot, label: 'Copilot operacional', sub: 'Disponível no painel' },
  { icon: Workflow, label: 'Workflows inicializados', sub: 'Foundation ativa' },
  { icon: Zap, label: 'Activation ready', sub: 'Central inteligente' },
] as const;

export function ActivationReadyHints() {
  return (
    <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {HINTS.map(({ icon: Icon, label, sub }) => (
        <div
          key={label}
          className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2.5 text-center transition-colors hover:border-white/10"
        >
          <Icon className="mx-auto mb-1.5 h-3.5 w-3.5 text-primary/70" />
          <p className="text-[10px] font-medium leading-tight text-foreground/80">{label}</p>
          <p className="text-[9px] text-muted-foreground">{sub}</p>
        </div>
      ))}
    </div>
  );
}
