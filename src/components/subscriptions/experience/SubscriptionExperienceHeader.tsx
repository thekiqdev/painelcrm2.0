import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ClientEntityLink } from '@/components/entities';
import {
  clientInitials,
  formatAmountPerInterval,
  formatNextChargePremium,
  premiumHeaderStatusDot,
} from '@/lib/billingSubscriptionExperiencePolish';
import { subscriptionExperienceHeaderLines, subscriptionHeadlineStatus } from '@/lib/billingSubscriptionExperience';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { cn } from '@/lib/utils';
import { focusRingClass } from '@/lib/billingSubscriptionExperiencePolish';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  className?: string;
};

export function SubscriptionExperienceHeader({ detail, className }: Props) {
  const lines = subscriptionExperienceHeaderLines(detail);
  const head = subscriptionHeadlineStatus(detail);
  const s = detail.subscription;
  const nextPremium = formatNextChargePremium(s.next_billing_date?.slice(0, 10));

  return (
    <header
      className={cn(
        'rounded-2xl border bg-gradient-to-br from-card via-card to-muted/20 shadow-sm overflow-hidden',
        className
      )}
      aria-label="Resumo da assinatura"
    >
      <div className="px-5 py-6 sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <Avatar className="h-14 w-14 border-2 border-background shadow-md shrink-0">
              <AvatarFallback className="bg-crm-primary/15 text-crm-primary text-lg font-semibold">
                {clientInitials(detail.client_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight truncate">{lines.planName}</h1>
              <div className="text-sm text-muted-foreground">
                {s.customer_id && detail.client_name?.trim() ? (
                  <ClientEntityLink
                    clientId={s.customer_id}
                    name={detail.client_name}
                    variant="inline"
                    className={cn('text-sm font-medium text-foreground', focusRingClass())}
                  />
                ) : (
                  <span>{lines.clientLabel}</span>
                )}
              </div>
              <p className="text-xl font-bold tabular-nums tracking-tight pt-1">
                {formatAmountPerInterval(s.amount_cents, s.billing_interval)}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-3 shrink-0">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium bg-background/80"
              role="status"
            >
              <span aria-hidden>{premiumHeaderStatusDot(s.status)}</span>
              {head.label}
            </span>
            <div className="text-left sm:text-right">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Próxima cobrança
              </p>
              <p className="text-3xl font-bold tabular-nums tracking-tight text-crm-primary">{nextPremium}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
