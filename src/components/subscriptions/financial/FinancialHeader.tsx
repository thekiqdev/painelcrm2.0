import { useMemo } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ClientEntityLink } from '@/components/entities';
import { buildFinancialHeaderData } from '@/lib/subscriptionFinancialExperience';
import { clientInitials } from '@/lib/billingSubscriptionExperiencePolish';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { cn } from '@/lib/utils';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  className?: string;
};

export function FinancialHeader({ detail, className }: Props) {
  const data = useMemo(() => buildFinancialHeaderData(detail), [detail]);
  const s = detail.subscription;

  return (
    <header
      className={cn('rounded-2xl border bg-card shadow-sm overflow-hidden', className)}
      aria-label="Centro financeiro da assinatura"
    >
      <div className="px-5 py-6 sm:px-8 space-y-5">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12 border-2 border-background shadow shrink-0">
            <AvatarFallback className="bg-crm-primary/15 text-crm-primary font-semibold">
              {clientInitials(data.clientName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{data.clientName}</p>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{data.planName}</h1>
            <p className="text-lg font-bold tabular-nums mt-1">{data.amountLabel}</p>
          </div>
          {s.customer_id && detail.client_name?.trim() ? (
            <ClientEntityLink
              clientId={s.customer_id}
              name={detail.client_name}
              variant="inline"
              className="sr-only"
            />
          ) : null}
        </div>

        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center gap-2">
            <span aria-hidden>{data.statusEmoji}</span>
            <span className="font-medium" role="status">
              {data.statusLabel}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Último pagamento</p>
              <p className="font-semibold tabular-nums">{data.lastPaymentLabel}</p>
              {data.lastPaymentAmount ? (
                <p className="text-xs text-muted-foreground">{data.lastPaymentAmount}</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Próximo recebimento</p>
              <p className="font-semibold tabular-nums text-crm-primary">{data.nextReceiptLabel}</p>
              {data.nextReceiptAmount ? (
                <p className="text-xs text-muted-foreground">{data.nextReceiptAmount}</p>
              ) : null}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs text-muted-foreground mb-0.5">Receita anual prevista</p>
              <p className="font-semibold tabular-nums">{data.annualForecastLabel}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
