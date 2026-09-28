import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FinancialEventType } from '@/lib/financialEventTypes';
import {
  resolveInvoiceAvailableActions,
  type InvoiceActionHandlers,
} from '@/lib/invoiceAvailableActions';
import { invoiceCrmPath } from '@/lib/invoiceQuickActions';
import { invoiceOpensNewTabProps } from '@/lib/subscriptionFinancialRefinement';
import { focusRingClass } from './FinancialStatCard';
import { cn } from '@/lib/utils';
import { MoreVertical } from 'lucide-react';
import { executeInvoiceAction } from './invoiceActionHandlers';
import { ConfirmPaymentDialog } from './ConfirmPaymentDialog';
import { useFinancialTimeZone, usePaymentConfirmedHandler } from './FinancialEventStoreContext';
import { Button } from '@/components/ui/button';

type Props = {
  invoiceId?: string | null;
  paymentToken?: string | null;
  canViewInvoices?: boolean;
  eventType?: FinancialEventType | null;
  invoiceStatus?: string | null;
  gateway?: string | null;
  amountCents?: number | null;
  dueYmd?: string | null;
  handlers?: InvoiceActionHandlers;
  className?: string;
};

export function InvoiceActionsMenu({
  invoiceId,
  paymentToken,
  canViewInvoices = true,
  eventType = null,
  invoiceStatus = null,
  gateway = null,
  amountCents,
  dueYmd,
  handlers,
  className,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const timeZone = useFinancialTimeZone();
  const onPaymentConfirmed = usePaymentConfirmedHandler();

  const actions = resolveInvoiceAvailableActions(
    {
      invoiceId,
      paymentToken,
      canViewInvoices,
      eventType,
      invoiceStatus,
      gateway,
    },
    handlers
  );

  if (actions.length === 0) return null;

  const id = invoiceId ?? undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', focusRingClass(), className)}
            aria-label="Ações da cobrança"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
          {actions.map((action, idx) => {
            const isDestructive = action.id === 'reprocess';
            const showSep = idx > 0 && action.id === 'view_history';
            return (
              <div key={action.id}>
                {showSep ? <DropdownMenuSeparator /> : null}
                {action.id === 'open' && id ? (
                  <DropdownMenuItem asChild>
                    <a href={invoiceCrmPath(id)} {...invoiceOpensNewTabProps()}>
                      {action.label}
                    </a>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    className={isDestructive ? 'text-destructive focus:text-destructive' : undefined}
                    onClick={() => {
                      if (action.id === 'register_payment') {
                        setConfirmOpen(true);
                        return;
                      }
                      executeInvoiceAction(action, id, paymentToken, handlers);
                    }}
                  >
                    {action.label}
                  </DropdownMenuItem>
                )}
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {id ? (
        <ConfirmPaymentDialog
          invoiceId={id}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          amountCents={amountCents}
          dueYmd={dueYmd}
          gateway={gateway}
          timeZone={timeZone}
          onConfirmed={onPaymentConfirmed}
        />
      ) : null}
    </>
  );
}
