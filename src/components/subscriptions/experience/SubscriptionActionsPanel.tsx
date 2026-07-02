import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Wrench,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type SubscriptionActionsHandlers = {
  onGenerateNext?: () => void;
  onChangeNextBilling?: () => void;
  onEdit?: () => void;
  onUpgrade?: () => void;
  onDowngrade?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onReactivate?: () => void;
  onCancelEndOfPeriod?: () => void;
  onCancelImmediate?: () => void;
  onReprocess?: () => void;
  onOpenLogs?: () => void;
  onDiagnosis?: () => void;
};

export type SubscriptionActionsFlags = {
  status: string;
  canEditSubscription: boolean;
  canCancelSubscription: boolean;
  canEditContract: boolean;
  canReschedule: boolean;
  canViewInvoices: boolean;
  latestInvoiceId?: string | null;
  editHref?: string | null;
  showRenewalGenerate?: boolean;
};

type Props = {
  handlers: SubscriptionActionsHandlers;
  flags: SubscriptionActionsFlags;
  className?: string;
  variant?: 'panel' | 'fab';
};

function ActionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

export function SubscriptionActionsPanel({ handlers, flags, className, variant = 'panel' }: Props) {
  const isActive = flags.status === 'active';
  const isPaused = flags.status === 'paused';
  const isCancelled = flags.status === 'cancelled';

  const content = (
  <>
    <ActionGroup title="Cobrança">
      {flags.showRenewalGenerate && handlers.onGenerateNext ? (
        <Button type="button" size="sm" variant="outline" className="justify-start gap-2" onClick={handlers.onGenerateNext}>
          <Zap className="h-3.5 w-3.5" />
          Gerar próxima cobrança
        </Button>
      ) : null}
      {isActive && handlers.onChangeNextBilling ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-start gap-2"
          disabled={!flags.canEditSubscription || !flags.canReschedule}
          onClick={handlers.onChangeNextBilling}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Alterar próxima cobrança
        </Button>
      ) : null}
    </ActionGroup>

    <ActionGroup title="Assinatura">
      {isActive && handlers.onUpgrade ? (
        <Button type="button" size="sm" variant="outline" className="justify-start gap-2" disabled={!flags.canEditContract} onClick={handlers.onUpgrade}>
          <ArrowUp className="h-3.5 w-3.5" />
          Upgrade
        </Button>
      ) : null}
      {isActive && handlers.onDowngrade ? (
        <Button type="button" size="sm" variant="outline" className="justify-start gap-2" disabled={!flags.canEditContract} onClick={handlers.onDowngrade}>
          <ArrowDown className="h-3.5 w-3.5" />
          Downgrade
        </Button>
      ) : null}
      {(isActive || isPaused) && handlers.onEdit ? (
        <Button type="button" size="sm" variant="outline" className="justify-start gap-2" disabled={!flags.canEditContract} onClick={handlers.onEdit}>
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </Button>
      ) : null}
      {isActive && handlers.onPause ? (
        <Button type="button" size="sm" variant="outline" className="justify-start gap-2" disabled={!flags.canEditSubscription} onClick={handlers.onPause}>
          <Pause className="h-3.5 w-3.5" />
          Pausar
        </Button>
      ) : null}
      {isPaused && handlers.onResume ? (
        <Button type="button" size="sm" variant="default" className="justify-start gap-2" disabled={!flags.canEditSubscription} onClick={handlers.onResume}>
          <Play className="h-3.5 w-3.5" />
          Retomar
        </Button>
      ) : null}
      {isCancelled && handlers.onReactivate ? (
        <Button type="button" size="sm" variant="default" className="justify-start gap-2" disabled={!flags.canEditSubscription} onClick={handlers.onReactivate}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reativar
        </Button>
      ) : null}
      {isActive && (handlers.onCancelEndOfPeriod || handlers.onCancelImmediate) ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="justify-start gap-2 w-full" disabled={!flags.canCancelSubscription}>
              <MoreHorizontal className="h-3.5 w-3.5" />
              Cancelar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={handlers.onCancelEndOfPeriod}>Ao fim do período atual</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={handlers.onCancelImmediate}>
              Imediato
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </ActionGroup>

    <ActionGroup title="Avançado">
      {handlers.onReprocess ? (
        <Button type="button" size="sm" variant="ghost" className="justify-start gap-2" onClick={handlers.onReprocess}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reprocessar ciclo
        </Button>
      ) : null}
      {handlers.onOpenLogs ? (
        <Button type="button" size="sm" variant="ghost" className="justify-start gap-2" onClick={handlers.onOpenLogs}>
          <Wrench className="h-3.5 w-3.5" />
          Abrir logs
        </Button>
      ) : null}
      {handlers.onDiagnosis ? (
        <Button type="button" size="sm" variant="ghost" className="justify-start gap-2" onClick={handlers.onDiagnosis}>
          Ver diagnóstico
        </Button>
      ) : null}
      {flags.latestInvoiceId && flags.canViewInvoices ? (
        <Button type="button" size="sm" variant="ghost" className="justify-start gap-2" asChild>
          <Link to={`/customer-invoices/${flags.latestInvoiceId}`}>Ver fatura mais recente</Link>
        </Button>
      ) : null}
      {flags.editHref ? (
        <Button type="button" size="sm" variant="ghost" className="justify-start gap-2" asChild>
          <Link to={flags.editHref}>Editar última fatura</Link>
        </Button>
      ) : null}
    </ActionGroup>
  </>
  );

  if (variant === 'fab') {
    return (
      <div className={cn('fixed bottom-6 right-6 z-40 md:hidden', className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="lg" className="h-14 w-14 rounded-full shadow-lg p-0">
              <MoreHorizontal className="h-6 w-6" />
              <span className="sr-only">Ações</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-h-[70vh] overflow-y-auto">
            <DropdownMenuLabel>Ações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {flags.showRenewalGenerate && handlers.onGenerateNext ? (
              <DropdownMenuItem onSelect={handlers.onGenerateNext}>Gerar próxima cobrança</DropdownMenuItem>
            ) : null}
            {isActive && handlers.onChangeNextBilling ? (
              <DropdownMenuItem disabled={!flags.canReschedule} onSelect={handlers.onChangeNextBilling}>
                Alterar próxima cobrança
              </DropdownMenuItem>
            ) : null}
            {handlers.onEdit ? <DropdownMenuItem onSelect={handlers.onEdit}>Editar</DropdownMenuItem> : null}
            {handlers.onPause ? <DropdownMenuItem onSelect={handlers.onPause}>Pausar</DropdownMenuItem> : null}
            {handlers.onDiagnosis ? <DropdownMenuItem onSelect={handlers.onDiagnosis}>Ver diagnóstico</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <Card className={cn('border shadow-sm', className)}>
      <CardHeader className="bg-muted/30 border-b py-4">
        <CardTitle className="text-base font-medium">Ações</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-5">{content}</CardContent>
    </Card>
  );
}
