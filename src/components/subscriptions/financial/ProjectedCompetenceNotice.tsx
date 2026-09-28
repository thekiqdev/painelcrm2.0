import type { FinancialEvent } from '@/lib/financialEventTypes';
import { isProjectedFinancialEvent } from '@/lib/subscriptionFinancialProjection';

const PROJECTED_AUTO_MESSAGE =
  'Esta cobrança será criada automaticamente quando chegar a competência.';

type Props = {
  ev: FinancialEvent;
};

export function ProjectedCompetenceNotice({ ev }: Props) {
  if (!isProjectedFinancialEvent(ev)) return null;
  return (
    <p className="text-xs text-muted-foreground leading-relaxed border-t pt-3">
      {PROJECTED_AUTO_MESSAGE}
    </p>
  );
}

export { PROJECTED_AUTO_MESSAGE };
