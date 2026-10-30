import { Loader2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ServiceOrderStatus } from "@/types/serviceOrders";
import {
  SERVICE_ORDER_MANUAL_STATUSES,
  SERVICE_ORDER_STATUS_CLASS,
  isServiceOrderFlowStatus,
} from "@/utils/serviceOrdersStatus";

type Props = {
  status: ServiceOrderStatus;
  label: (s: ServiceOrderStatus) => string;
  disabled?: boolean;
  busy?: boolean;
  canCancel?: boolean;
  onChange: (next: ServiceOrderStatus) => void | Promise<void>;
  className?: string;
  /** Estilo compacto para célula de tabela */
  compact?: boolean;
};

export function ServiceOrderStatusMenu({
  status,
  label,
  disabled = false,
  busy = false,
  canCancel = true,
  onChange,
  className,
  compact = false,
}: Props) {
  if (disabled) {
    return (
      <span
        className={cn(
          "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
          SERVICE_ORDER_STATUS_CLASS[status],
          className,
        )}
      >
        {label(status)}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium hover:opacity-90 disabled:opacity-60",
            SERVICE_ORDER_STATUS_CLASS[status],
            compact ? "max-w-full" : "",
            className,
          )}
          aria-label="Alterar status"
          onClick={(e) => e.stopPropagation()}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          <span className="truncate">{label(status)}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Status da OS</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SERVICE_ORDER_MANUAL_STATUSES.map((st) => {
          const disabledCancel = st === "cancelled" && !canCancel;
          return (
            <DropdownMenuItem
              key={st}
              disabled={busy || st === status || disabledCancel}
              onClick={() => void onChange(st)}
            >
              {label(st)}
              {st === status ? " · atual" : ""}
            </DropdownMenuItem>
          );
        })}
        {isServiceOrderFlowStatus(status) ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              {label(status)} · via fluxo
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
