import { useMemo } from "react";
import LeadKanbanBoard, { type LeadKanbanLead, type LeadKanbanStatus } from "@/components/leads/LeadKanbanBoard";
import { formatAppMoney } from "@/lib/i18n/formatApp";
import { toast } from "@/components/ui/sonner";
import type { ServiceOrder, ServiceOrderStatus } from "@/types/serviceOrders";
import {
  SERVICE_ORDER_KANBAN_DOT,
  SERVICE_ORDER_STATUS_KEYS,
  isServiceOrderManualStatus,
} from "@/utils/serviceOrdersStatus";

export type ServiceOrdersKanbanBoardProps = {
  orders: ServiceOrder[];
  statusLabel: (s: ServiceOrderStatus) => string;
  loading?: boolean;
  onMoveOrder: (orderId: string, status: ServiceOrderStatus) => void | Promise<void>;
  canMoveOrder: (order: ServiceOrder) => boolean;
  moveBlockedReason: (order: ServiceOrder) => string | null;
  onOpenOrder: (order: ServiceOrder) => void;
};

type OsKanbanCard = LeadKanbanLead & {
  __os_status: ServiceOrderStatus;
};

export function ServiceOrdersKanbanBoard({
  orders,
  statusLabel,
  loading = false,
  onMoveOrder,
  canMoveOrder,
  moveBlockedReason,
  onOpenOrder,
}: ServiceOrdersKanbanBoardProps) {
  const labelByStatus = useMemo(() => {
    const m = new Map<ServiceOrderStatus, string>();
    for (const s of SERVICE_ORDER_STATUS_KEYS) m.set(s, statusLabel(s));
    return m;
  }, [statusLabel]);

  const statusByLabel = useMemo(() => {
    const m = new Map<string, ServiceOrderStatus>();
    for (const s of SERVICE_ORDER_STATUS_KEYS) m.set(statusLabel(s), s);
    return m;
  }, [statusLabel]);

  const statuses: LeadKanbanStatus[] = useMemo(
    () =>
      SERVICE_ORDER_STATUS_KEYS.map((s) => ({
        id: s,
        name: labelByStatus.get(s) ?? s,
        color: SERVICE_ORDER_KANBAN_DOT[s],
      })),
    [labelByStatus],
  );

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const cards = useMemo((): OsKanbanCard[] => {
    return orders.map((o) => {
      const label = labelByStatus.get(o.status) ?? o.status;
      const total = formatAppMoney(Number(o.total_cents) || 0, o.currency || "BRL");
      const client = o.client_name?.trim() || null;
      return {
        id: o.id,
        name: `#${o.service_order_number}`,
        company: client ? `${client} · ${total}` : total,
        status: label,
        updated_at: o.updated_at ?? o.created_at,
        created_at: o.created_at,
        __os_status: o.status,
      };
    });
  }, [orders, labelByStatus]);

  const getStatusVariant = (statusName: string) => {
    const key = statusByLabel.get(statusName);
    return { color: key ? SERVICE_ORDER_KANBAN_DOT[key] : "#94a3b8" };
  };

  return (
    <LeadKanbanBoard
      leads={cards}
      statuses={statuses}
      loading={loading}
      getStatusVariant={getStatusVariant}
      showQuickActions={false}
      emptyColumnTitle="Nenhuma OS nesta etapa."
      loadingLabel="Carregando Kanban de ordens de serviço…"
      onOpenLead={(card) => {
        const order = orderById.get(card.id);
        if (order) onOpenOrder(order);
      }}
      onQuickAction={() => undefined}
      onStatusChange={async (card, nextStatusName) => {
        const order = orderById.get(card.id);
        if (!order) return;
        if (!canMoveOrder(order)) {
          toast.error(moveBlockedReason(order) || "Não é possível mover esta OS.");
          throw new Error("blocked");
        }
        const next = statusByLabel.get(nextStatusName);
        if (!next) throw new Error("invalid_status");
        if (next === order.status) return;
        if (!isServiceOrderManualStatus(next)) {
          toast.error("Este status só muda pelo fluxo de assinatura ou fatura.");
          throw new Error("flow_status");
        }
        await onMoveOrder(order.id, next);
      }}
    />
  );
}
