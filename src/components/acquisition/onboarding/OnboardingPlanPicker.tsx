import { cn } from '@/lib/utils';
import { Check, Minus, Plus } from 'lucide-react';
import { getOnboardingPlanPricing } from './onboardingPricing';
import type { PublicAcquisitionPlan } from './types';

type Props = {
  plans: PublicAcquisitionPlan[];
  loading: boolean;
  selectedId: string;
  usersCount: number;
  onSelect: (id: string) => void;
  onUsersCountChange: (count: number) => void;
};

export function OnboardingPlanPicker({
  plans,
  loading,
  selectedId,
  usersCount,
  onSelect,
  onUsersCountChange,
}: Props) {
  const selectedPlan = plans.find((p) => p.id === selectedId);
  const isCustomSelected = selectedPlan?.plan_type === 'custom';

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-transparent"
          />
        ))}
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-muted-foreground">
        Nenhum plano disponível no momento. Tente novamente em instantes.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3" role="listbox" aria-label="Planos">
        {plans.map((p) => {
          const pricing = getOnboardingPlanPricing(p, p.id === selectedId ? usersCount : 1);
          const selected = selectedId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(p.id)}
              className={cn(
                'group relative w-full overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300',
                'hover:border-white/25 hover:bg-white/[0.04] hover:shadow-[0_0_24px_-8px_hsl(var(--primary)/0.35)]',
                selected
                  ? 'border-primary/50 bg-gradient-to-br from-primary/[0.12] via-white/[0.02] to-transparent shadow-[0_0_32px_-12px_hsl(var(--primary)/0.45)] ring-1 ring-primary/25'
                  : 'border-white/10 bg-white/[0.02]',
              )}
            >
              {pricing.isDefault ? (
                <span className="absolute right-4 top-4 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  Recomendado
                </span>
              ) : null}

              <div className="flex items-start gap-3 pr-16">
                <div
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-white/20 bg-transparent group-hover:border-white/40',
                  )}
                >
                  {selected ? <Check className="h-3 w-3" /> : null}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold tracking-tight text-foreground">{pricing.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">{pricing.subtext}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-x-2 gap-y-1 pl-8">
                {pricing.pricePrefix ? (
                  <span className="text-xs text-muted-foreground">{pricing.pricePrefix.trim()}</span>
                ) : null}
                <span className="font-display text-2xl font-bold tabular-nums tracking-tight text-foreground">
                  {pricing.primaryPrice}
                </span>
                <span className="pb-0.5 text-sm text-muted-foreground">/{pricing.periodLabel}</span>
              </div>

              {pricing.extraUserLine ? (
                <p className="mt-1.5 pl-8 text-[11px] text-muted-foreground">{pricing.extraUserLine}</p>
              ) : null}
            </button>
          );
        })}
      </div>

      {isCustomSelected && selectedPlan ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="mb-3 text-xs text-muted-foreground">Usuários no workspace (sem criar tenant ainda)</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Menos usuários"
              disabled={usersCount <= 1}
              onClick={() => onUsersCountChange(Math.max(1, usersCount - 1))}
              className="rounded-lg border border-white/10 p-2 text-muted-foreground transition-colors hover:bg-white/5 disabled:opacity-40"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-[2rem] text-center text-lg font-semibold tabular-nums">{usersCount}</span>
            <button
              type="button"
              aria-label="Mais usuários"
              onClick={() => onUsersCountChange(usersCount + 1)}
              className="rounded-lg border border-white/10 p-2 text-muted-foreground transition-colors hover:bg-white/5"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
