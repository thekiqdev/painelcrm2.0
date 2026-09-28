import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { getOnboardingPlanPricing } from '../onboardingPricing';
import type { PublicAcquisitionPlan } from '../types';

type Props = {
  plans: PublicAcquisitionPlan[];
  selectedId: string;
  usersCount: number;
  onSelect: (id: string) => void;
};

export function OperationPlanFoundation({ plans, selectedId, usersCount, onSelect }: Props) {
  if (plans.length <= 1) {
    const plan = plans[0];
    if (!plan) return null;
    const pricing = getOnboardingPlanPricing(plan, usersCount);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-foreground lg:rounded-lg lg:px-3 lg:py-1.5 lg:text-xs">
          {pricing.title}
        </span>
      </div>
    );
  }

  return (
    <section className="space-y-2" aria-label="Base do workspace">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Base do workspace
      </p>
      <div className="flex flex-wrap gap-2">
        {plans.map((p) => {
          const selected = p.id === selectedId;
          const pricing = getOnboardingPlanPricing(p, usersCount);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300',
                selected
                  ? 'border-primary/45 bg-primary/10 text-foreground shadow-[0_0_20px_-10px_hsl(var(--primary)/0.4)]'
                  : 'border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/18',
              )}
            >
              {selected ? <Check className="h-3 w-3 text-primary" /> : null}
              {pricing.title}
            </button>
          );
        })}
      </div>
    </section>
  );
}
