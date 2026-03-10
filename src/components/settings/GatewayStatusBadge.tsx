/**
 * Badge de status do gateway (Fase 7 — PLANO-EVOLUCAO-PAYMENT-GATEWAYS-PANEL).
 * Estados: Não configurado | Pendente | Conectado | Erro | Desativado.
 */
import React from "react";
import { CheckCircle, XCircle, AlertCircle, Clock, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

export type GatewayStatusType =
  | "not_configured"
  | "pending"
  | "connected"
  | "error"
  | "disabled";

interface GatewayStatusBadgeProps {
  status: GatewayStatusType;
  className?: string;
}

const CONFIG: Record<
  GatewayStatusType,
  { label: string; icon: React.ElementType; className: string }
> = {
  not_configured: {
    label: "Não configurado",
    icon: AlertCircle,
    className: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
  },
  pending: {
    label: "Pendente",
    icon: Clock,
    className: "text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700",
  },
  connected: {
    label: "Conectado",
    icon: CheckCircle,
    className: "text-green-600 bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
  },
  error: {
    label: "Erro",
    icon: XCircle,
    className: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
  },
  disabled: {
    label: "Desativado",
    icon: Ban,
    className: "text-muted-foreground bg-muted border-border",
  },
};

/** Converte item da API (configured, status, connection_status) para GatewayStatusType. */
export function toGatewayStatusType(item: {
  configured: boolean;
  status: string | null;
  connection_status: string | null;
}): GatewayStatusType {
  if (!item.configured) return "not_configured";
  if (item.status === "disabled") return "disabled";
  if (item.status === "error" || item.connection_status === "auth_error" || item.connection_status === "error")
    return "error";
  if (item.connection_status === "ok") return "connected";
  return "pending";
}

export const GatewayStatusBadge: React.FC<GatewayStatusBadgeProps> = ({
  status,
  className,
}) => {
  const { label, icon: Icon, className: statusClass } = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium",
        statusClass,
        className
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </span>
  );
};
