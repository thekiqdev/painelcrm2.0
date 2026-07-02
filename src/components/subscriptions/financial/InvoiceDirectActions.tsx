import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { FinancialEventType } from '@/lib/financialEventTypes';
import type { InvoiceActionHandlers } from '@/lib/invoiceAvailableActions';
import {
  orderedDirectActions,
  resolveDirectInvoiceActions,
} from '@/lib/subscriptionActionExperience';
import { invoiceCrmPath, openInvoiceInNewTab } from '@/lib/invoiceQuickActions';
import { invoiceOpensNewTabProps } from '@/lib/subscriptionFinancialRefinement';
import { executeInvoiceAction } from './invoiceActionHandlers';
import { ConfirmPaymentDialog } from './ConfirmPaymentDialog';
import { focusRingClass } from './FinancialStatCard';
import { cn } from '@/lib/utils';
import { Banknote, ClipboardCopy, Eye, Zap } from 'lucide-react';

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
  onPaymentConfirmed?: () => void | Promise<void>;
  timeZone?: string | null;
  className?: string;
};

function ActionIcon({ id }: { id: string }) {
  switch (id) {
    case 'open':
      return <Eye className="h-4 w-4" />;
    case 'copy_public_link':
      return <ClipboardCopy className="h-4 w-4" />;
    case 'register_payment':
      return <Banknote className="h-4 w-4" />;
    case 'generate_now':
      return <Zap className="h-4 w-4" />;
    default:
      return <Eye className="h-4 w-4" />;
  }
}

export function InvoiceDirectActions({
  invoiceId,
  paymentToken,
  canViewInvoices = true,
  eventType = null,
  invoiceStatus = null,
  gateway = null,
  amountCents,
  dueYmd,
  handlers,
  onPaymentConfirmed,
  timeZone,
  className,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const actions = orderedDirectActions(
    resolveDirectInvoiceActions(
      {
        invoiceId,
        paymentToken,
        canViewInvoices,
        eventType,
        invoiceStatus,
        gateway,
      },
      handlers
    )
  );

  if (actions.length === 0) return null;

  const id = invoiceId ?? undefined;

  const runAction = (actionId: string) => {
    const action = actions.find((a) => a.id === actionId);
    if (!action) return;
    if (action.id === 'register_payment') {
      setConfirmOpen(true);
      return;
    }
    executeInvoiceAction(action, id, paymentToken, handlers);
  };

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <div
          className={cn('inline-flex items-center gap-0.5', className)}
          role="toolbar"
          aria-label="Ações da cobrança"
        >
          {actions.map((action) => {
            const useLink = action.id === 'open' && id;
            const inner = (
              <Button
                type="button"
                variant={action.primary ? 'default' : 'ghost'}
                size="icon"
                className={cn('h-7 w-7', focusRingClass())}
                aria-label={action.label}
                onClick={
                  useLink
                    ? undefined
                    : (e) => {
                        e.stopPropagation();
                        runAction(action.id);
                      }
                }
                asChild={Boolean(useLink)}
              >
                {useLink ? (
                  <a href={invoiceCrmPath(id!)} {...invoiceOpensNewTabProps()} onClick={(e) => e.stopPropagation()}>
                    <ActionIcon id={action.id} />
                  </a>
                ) : (
                  <ActionIcon id={action.id} />
                )}
              </Button>
            );
            return (
              <Tooltip key={action.id}>
                <TooltipTrigger asChild>{inner}</TooltipTrigger>
                <TooltipContent side="top">{action.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
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
