import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { FinancialEventType } from '@/lib/financialEventTypes';
import {
  resolveInvoiceAvailableActions,
  type InvoiceAction,
  type InvoiceActionHandlers,
  type InvoiceActionId,
} from '@/lib/invoiceAvailableActions';
import { invoiceCrmPath, openInvoiceInNewTab } from '@/lib/invoiceQuickActions';
import { invoiceOpensNewTabProps } from '@/lib/subscriptionFinancialRefinement';
import { focusRingClass } from './FinancialStatCard';
import { InvoiceActionsMenu } from './InvoiceActionsMenu';
import { executeInvoiceAction } from './invoiceActionHandlers';
import { cn } from '@/lib/utils';
import {
  ClipboardCopy,
  Download,
  Eye,
  FileText,
  History,
  Mail,
  Pencil,
  RefreshCw,
  Wrench,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';

type Props = {
  invoiceId?: string | null;
  paymentToken?: string | null;
  canViewInvoices?: boolean;
  layout?: 'menu' | 'icons' | 'buttons';
  eventType?: FinancialEventType | null;
  invoiceStatus?: string | null;
  gateway?: string | null;
  amountCents?: number | null;
  dueYmd?: string | null;
  handlers?: InvoiceActionHandlers;
  className?: string;
};

function actionIcon(id: InvoiceActionId): ReactNode {
  switch (id) {
    case 'open':
      return <Eye className="h-4 w-4" />;
    case 'copy_public_link':
      return <ClipboardCopy className="h-4 w-4" />;
    case 'send_again':
      return <Mail className="h-4 w-4" />;
    case 'download_pdf':
      return <Download className="h-4 w-4" />;
    case 'register_payment':
      return <FileText className="h-4 w-4" />;
    case 'view_history':
      return <History className="h-4 w-4" />;
    case 'generate_now':
      return <Zap className="h-4 w-4" />;
    case 'change_due':
      return <Pencil className="h-4 w-4" />;
    case 'resolve':
      return <Wrench className="h-4 w-4" />;
    case 'reprocess':
      return <RefreshCw className="h-4 w-4" />;
    case 'add_note':
      return <Pencil className="h-4 w-4" />;
    default:
      return <Eye className="h-4 w-4" />;
  }
}

function ActionIconButton({
  action,
  invoiceId,
  paymentToken,
  handlers,
}: {
  action: InvoiceAction;
  invoiceId?: string;
  paymentToken?: string | null;
  handlers?: InvoiceActionHandlers;
}) {
  const crmPath = invoiceId ? invoiceCrmPath(invoiceId) : undefined;
  const useLink = action.id === 'open' && crmPath;

  const inner = (
    <Button
      type="button"
      variant={action.primary ? 'default' : 'ghost'}
      size="icon"
      className={cn('h-8 w-8', focusRingClass())}
      aria-label={action.label}
      onClick={useLink ? undefined : () => executeInvoiceAction(action, invoiceId, paymentToken, handlers)}
      asChild={Boolean(useLink)}
    >
      {useLink ? (
        <a href={crmPath} {...invoiceOpensNewTabProps()} onClick={(e) => e.stopPropagation()}>
          {actionIcon(action.id)}
        </a>
      ) : (
        actionIcon(action.id)
      )}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="top">{action.label}</TooltipContent>
    </Tooltip>
  );
}

export function InvoiceQuickActions({
  invoiceId,
  paymentToken,
  canViewInvoices = true,
  layout = 'menu',
  eventType = null,
  invoiceStatus = null,
  gateway = null,
  amountCents,
  dueYmd,
  handlers,
  className,
}: Props) {
  if (layout === 'menu') {
    return (
      <InvoiceActionsMenu
        invoiceId={invoiceId}
        paymentToken={paymentToken}
        canViewInvoices={canViewInvoices}
        eventType={eventType}
        invoiceStatus={invoiceStatus}
        gateway={gateway}
        amountCents={amountCents}
        dueYmd={dueYmd}
        handlers={handlers}
        className={className}
      />
    );
  }

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

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn('inline-flex items-center gap-0.5', className)}
        role="toolbar"
        aria-label="Ações da cobrança"
      >
        {actions.map((action) => (
          <ActionIconButton
            key={action.id}
            action={action}
            invoiceId={invoiceId ?? undefined}
            paymentToken={paymentToken}
            handlers={handlers}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}

export function InvoiceOpenLink({
  invoiceId,
  children,
  className,
}: {
  invoiceId: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={invoiceCrmPath(invoiceId)}
      className={className}
      {...invoiceOpensNewTabProps()}
      onClick={(e) => {
        e.preventDefault();
        openInvoiceInNewTab(invoiceId);
      }}
    >
      {children}
    </Link>
  );
}
