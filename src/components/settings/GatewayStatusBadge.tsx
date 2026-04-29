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
  /** `compact`: menor, abaixo do título nos cards de gateway. */
  variant?: "default" | "compact";
}

const CONFIG: Record<
  GatewayStatusType,
  { label: string; icon: React.ElementType; className: string }
> = {
  not_configured: {
    label: "Não configurado",
    icon: AlertCircle,
    className:
      "border-amber-200 bg-amber-500/10 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100",
  },
  pending: {
    label: "Em validação",
    icon: Clock,
    className:
      "border-border bg-muted text-muted-foreground dark:bg-muted/70 dark:text-foreground/90",
  },
  connected: {
    label: "Conectado",
    icon: CheckCircle,
    className:
      "border-emerald-200 bg-emerald-500/10 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/35 dark:text-emerald-200",
  },
  error: {
    label: "Erro",
    icon: XCircle,
    className:
      "border-red-200 bg-red-500/10 text-red-800 dark:border-red-800/60 dark:bg-red-950/35 dark:text-red-200",
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
  variant = "default",
}) => {
  const { label, icon: Icon, className: statusClass } = CONFIG[status];
  const isCompact = variant === "compact";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-medium",
        isCompact
          ? "gap-1 px-1.5 py-0.5 text-xs font-normal leading-tight"
          : "gap-1.5 px-2.5 py-1 text-sm",
        statusClass,
        className
      )}
    >
      <Icon className={cn("shrink-0", isCompact ? "h-3 w-3" : "h-4 w-4")} />
      {label}
    </span>
  );
};
