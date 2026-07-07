import { useMemo } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ClientEntityLink } from '@/components/entities';
import { clientInitials } from '@/lib/billingSubscriptionExperiencePolish';
import { useEntityNavigation } from '@/hooks/useEntityNavigation';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { isValidEntityId } from '@/lib/entityNavigation';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { cn } from '@/lib/utils';
import { useFinancialEventStore } from './FinancialEventStoreContext';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  className?: string;
};

export function FinancialHeader({ detail, className }: Props) {
  const store = useFinancialEventStore();
  const data = useMemo(() => store.getHeaderData(), [store]);
  if (!data) return null;
  const s = detail.subscription;
  const { openClient } = useEntityNavigation();
  const { canView, loading } = useModulePermissions();
  const clientId = s.customer_id?.trim() ?? '';
  const canOpenClient = Boolean(clientId && isValidEntityId(clientId) && !loading && canView('clients'));

  return (
    <header
      className={cn('rounded-2xl border bg-card shadow-sm overflow-hidden', className)}
      aria-label="Centro financeiro da assinatura"
    >
      <div className="px-5 py-6 sm:px-8 space-y-5">
        <div className="flex items-start gap-4">
          {canOpenClient ? (
            <button
              type="button"
              className="shrink-0 rounded-full border-0 bg-transparent p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Abrir cliente"
              aria-label="Abrir cliente"
              onClick={() => openClient(clientId, { mode: 'drawer' })}
            >
              <Avatar className="h-12 w-12 border-2 border-background shadow">
                <AvatarFallback className="bg-crm-primary/15 text-crm-primary font-semibold">
                  {clientInitials(data.clientName)}
                </AvatarFallback>
              </Avatar>
            </button>
          ) : (
            <Avatar className="h-12 w-12 border-2 border-background shadow shrink-0">
              <AvatarFallback className="bg-crm-primary/15 text-crm-primary font-semibold">
                {clientInitials(data.clientName)}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0 flex-1">
            {canOpenClient ? (
              <ClientEntityLink
                clientId={clientId}
                name={detail.client_name}
                variant="inline"
                openMode="route"
                className="text-sm text-muted-foreground p-0"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{data.clientName}</p>
            )}
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{data.planName}</h1>
            <p className="text-lg font-bold tabular-nums mt-1">{data.amountLabel}</p>
          </div>
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
