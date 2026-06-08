import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEAM_VALUE_MESSAGES } from './operationBuilderConstants';

type Props = {
  usersCount: number;
  maxUsers: number;
  onChange: (count: number) => void;
};

export function OperationTeamSection({ usersCount, maxUsers, onChange }: Props) {
  const dec = () => onChange(Math.max(1, usersCount - 1));
  const inc = () => onChange(Math.min(maxUsers, usersCount + 1));
  const label = usersCount === 1 ? 'operador' : 'operadores';

  return (
    <section className="space-y-2 lg:space-y-3" aria-labelledby="op-team-heading">
      <div className="lg:flex lg:items-baseline lg:justify-between lg:gap-3">
        <div>
          <h2 id="op-team-heading" className="text-sm font-semibold text-foreground">
            Usuários da operação
          </h2>
          <p className="text-[11px] text-muted-foreground lg:text-xs">
            <span className="lg:hidden">Equipe inicial do workspace</span>
            <span className="hidden lg:inline">Tamanho inicial da equipe</span>
          </p>
        </div>
      </div>

      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03]',
          'px-3 py-2.5 lg:px-4 lg:py-3',
        )}
      >
        <button
          type="button"
          aria-label="Menos usuários"
          onClick={dec}
          disabled={usersCount <= 1}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 text-muted-foreground transition-all active:scale-95 hover:border-primary/30 hover:bg-primary/5 disabled:opacity-35 lg:h-10 lg:w-10"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p
            key={usersCount}
            className="font-display text-2xl font-semibold tabular-nums text-foreground animate-in zoom-in-95 duration-200 lg:text-3xl"
          >
            {usersCount}
          </p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
        <button
          type="button"
          aria-label="Mais usuários"
          onClick={inc}
          disabled={usersCount >= maxUsers}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 text-muted-foreground transition-all active:scale-95 hover:border-primary/30 hover:bg-primary/5 disabled:opacity-35 lg:h-10 lg:w-10"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <ul className="hidden gap-1 lg:grid lg:grid-cols-2">
        {TEAM_VALUE_MESSAGES.slice(0, 2).map((msg) => (
          <li key={msg} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-1 w-1 shrink-0 rounded-full bg-primary/70" />
            {msg}
          </li>
        ))}
      </ul>
    </section>
  );
}
