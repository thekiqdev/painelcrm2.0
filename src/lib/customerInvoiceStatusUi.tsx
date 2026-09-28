/**
 * Rótulos e estilos de status de fatura de cliente — listagem, detalhe e página pública (consistência UX).
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Classes do chip (neutro / sucesso / alerta / desabilitado conforme plano premium UX). */
export const customerInvoiceStatusBadgeClass: Record<string, string> = {
  pending: "bg-slate-500/12 text-slate-700 dark:text-slate-300 border border-slate-500/20",
  waiting_payment:
    "bg-slate-500/12 text-slate-700 dark:text-slate-300 border border-slate-500/20",
  processing: "bg-slate-500/12 text-slate-700 dark:text-slate-300 border border-slate-500/20",
  paid: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border border-emerald-500/25",
  overdue: "bg-amber-500/18 text-amber-900 dark:text-amber-400 border border-amber-500/30",
  cancelled: "bg-muted/80 text-muted-foreground border border-border opacity-90",
  failed: "bg-red-500/12 text-red-800 dark:text-red-400 border border-red-500/20",
  refunded: "bg-sky-500/12 text-sky-900 dark:text-sky-300 border border-sky-500/20",
};

export const customerInvoiceStatusLabel: Record<string, string> = {
  pending: "Pendente",
  waiting_payment: "Aguardando pagamento",
  processing: "Processando",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
  failed: "Falhou",
  refunded: "Reembolsado",
};

export function getCustomerInvoiceStatusLabel(status: string): string {
  return customerInvoiceStatusLabel[status] ?? status;
}

export function CustomerInvoiceStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-medium",
        customerInvoiceStatusBadgeClass[status] ?? "bg-muted text-muted-foreground border border-border"
      )}
    >
      {getCustomerInvoiceStatusLabel(status)}
    </Badge>
  );
}

/** Cores do texto de status na página pública (alinhadas à mesma semântica). */
export function customerInvoicePublicStatusTextClass(status: string, isPaid: boolean, canPay: boolean): string {
  if (isPaid) return "text-emerald-600 dark:text-emerald-400";
  if (status === "overdue") return "text-amber-700 dark:text-amber-400";
  if (status === "cancelled" || status === "failed") return "text-muted-foreground";
  if (canPay) return "text-slate-600 dark:text-slate-400";
  return "text-muted-foreground";
}
