import type { ServiceOrderStatus } from '@/types/serviceOrders';

export const SERVICE_ORDER_STATUS_KEYS: ServiceOrderStatus[] = [
  'draft',
  'scheduled',
  'in_progress',
  'sent',
  'awaiting_signature',
  'signed',
  'invoiced',
  'completed',
  'cancelled',
];

/** Statuses alteráveis via PATCH manual (lista / detalhe / kanban). */
export const SERVICE_ORDER_MANUAL_STATUSES: ServiceOrderStatus[] = [
  'draft',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
];

/** Statuses só pelo fluxo de envio/assinatura/fatura — não selecionáveis como destino. */
export const SERVICE_ORDER_FLOW_STATUSES: ServiceOrderStatus[] = [
  'sent',
  'awaiting_signature',
  'signed',
  'invoiced',
];

export const SERVICE_ORDER_STATUS_CLASS: Record<ServiceOrderStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border/60',
  scheduled: 'bg-sky-100 text-sky-950 border-sky-200/80 dark:bg-sky-950/35 dark:text-sky-100',
  in_progress: 'bg-amber-100 text-amber-950 border-amber-200/80 dark:bg-amber-950/35 dark:text-amber-100',
  sent: 'bg-cyan-100 text-cyan-950 border-cyan-200/80 dark:bg-cyan-950/35 dark:text-cyan-100',
  awaiting_signature:
    'bg-violet-100 text-violet-950 border-violet-200/80 dark:bg-violet-950/35 dark:text-violet-100',
  signed: 'bg-emerald-100 text-emerald-950 border-emerald-200/80 dark:bg-emerald-950/35 dark:text-emerald-100',
  invoiced: 'bg-blue-100 text-blue-950 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-100',
  completed: 'bg-emerald-100 text-emerald-950 border-emerald-200/80',
  cancelled: 'bg-red-100 text-red-900 border-red-200/80 dark:bg-red-950/40 dark:text-red-100',
};

export const SERVICE_ORDER_KANBAN_DOT: Record<ServiceOrderStatus, string> = {
  draft: '#94a3b8',
  scheduled: '#0ea5e9',
  in_progress: '#f59e0b',
  sent: '#06b6d4',
  awaiting_signature: '#8b5cf6',
  signed: '#10b981',
  invoiced: '#3b82f6',
  completed: '#059669',
  cancelled: '#ef4444',
};

export function isServiceOrderManualStatus(status: ServiceOrderStatus): boolean {
  return SERVICE_ORDER_MANUAL_STATUSES.includes(status);
}

export function isServiceOrderFlowStatus(status: ServiceOrderStatus): boolean {
  return SERVICE_ORDER_FLOW_STATUSES.includes(status);
}
