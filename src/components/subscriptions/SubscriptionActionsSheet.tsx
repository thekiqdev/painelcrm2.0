import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { CrmSubscriptionListItem } from "@/services/crmSubscriptions";
import {
  Ban,
  Bell,
  ChevronRight,
  FilePlus,
  History,
  Pencil,
} from "lucide-react";
import { formatAmount, intervalLabel } from "./subscriptionsListUtils";

type Props = {
  row: CrmSubscriptionListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canCreateInvoice: boolean;
  canEditSubscription: boolean;
  canCancelSubscription: boolean;
  canViewInvoices: boolean;
};

type ActionItem = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
};

export function SubscriptionActionsSheet({
  row,
  open,
  onOpenChange,
  canCreateInvoice,
  canEditSubscription,
  canCancelSubscription,
  canViewInvoices,
}: Props) {
  const navigate = useNavigate();

  if (!row) return null;

  const plan = row.plan_label?.trim() || intervalLabel(row.billing_interval);
  const isActive = row.status === "active";

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const actions: ActionItem[] = [
    {
      id: "history",
      label: "Ver histórico",
      description: "Timeline de ciclos e faturas",
      icon: <History className="h-5 w-5" />,
      onSelect: () => go(`/crm-subscriptions/${row.id}`),
    },
    {
      id: "notify",
      label: "Reenviar notificação",
      description: "Abrir fatura para reenviar aviso",
      icon: <Bell className="h-5 w-5" />,
      disabled: !canViewInvoices || !isActive,
      onSelect: () => go(`/crm-subscriptions/${row.id}`),
    },
    {
      id: "invoice",
      label: "Gerar fatura agora",
      description: "Nova cobrança ou assinatura",
      icon: <FilePlus className="h-5 w-5" />,
      disabled: !canCreateInvoice,
      onSelect: () => {
        const q = new URLSearchParams();
        if (row.client_id) q.set("client_id", row.client_id);
        q.set("billing", "subscription");
        go(`/customer-invoices/new?${q.toString()}`);
      },
    },
    {
      id: "edit",
      label: "Editar assinatura",
      description: "Ciclos, datas e configurações",
      icon: <Pencil className="h-5 w-5" />,
      disabled: !canEditSubscription || !isActive,
      onSelect: () => go(`/crm-subscriptions/${row.id}`),
    },
    {
      id: "cancel",
      label: "Cancelar assinatura",
      description: "Encerrar ou agendar cancelamento",
      icon: <Ban className="h-5 w-5" />,
      disabled: !canCancelSubscription || !isActive,
      destructive: true,
      onSelect: () => go(`/crm-subscriptions/${row.id}`),
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))] md:hidden max-h-[88vh] overflow-y-auto"
      >
        <SheetHeader className="text-left pb-2">
          <SheetTitle className="text-base leading-snug pr-6">
            {row.client_name?.trim() || "Assinatura"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {plan} · {formatAmount(row.amount_cents)}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-2 space-y-1">
          {actions.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant="ghost"
              disabled={action.disabled}
              className="w-full h-auto min-h-[3.25rem] justify-between gap-3 px-3 py-3 rounded-xl"
              onClick={action.onSelect}
            >
              <span className="flex items-center gap-3 min-w-0 text-left">
                <span
                  className={
                    action.destructive
                      ? "text-destructive shrink-0"
                      : "text-muted-foreground shrink-0"
                  }
                >
                  {action.icon}
                </span>
                <span className="min-w-0">
                  <span
                    className={
                      action.destructive
                        ? "block text-sm font-medium text-destructive"
                        : "block text-sm font-medium"
                    }
                  >
                    {action.label}
                  </span>
                  <span className="block text-xs text-muted-foreground font-normal truncate">
                    {action.description}
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
