import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { formatBrlFromCents } from '@/components/chat/ChatContactProfileSummary';
import { customerInvoicesService } from '@/services/customerInvoices';

function formatInvoiceShortDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function invoiceStatusPt(status: string): string {
  const m: Record<string, string> = {
    pending: 'Pendente',
    paid: 'Pago',
    overdue: 'Vencida',
    cancelled: 'Cancelada',
  };
  return m[status] ?? status;
}

export function ChatContactInvoiceHistorySection({
  clientId,
  enabled,
  onViewAll,
}: {
  clientId: string | null;
  enabled: boolean;
  onViewAll?: () => void;
}) {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['customer-invoices-chat-preview', clientId],
    queryFn: () => customerInvoicesService.list({ client_id: clientId!, limit: 12 }),
    enabled: Boolean(enabled && clientId),
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => {
    return [...invoices]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [invoices]);

  if (!enabled || !clientId) return null;

  return (
    <section className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Faturas recentes</p>
        {onViewAll ? (
          <Button type="button" variant="link" className="h-auto min-h-0 shrink-0 px-0 py-0 text-xs font-medium" onClick={onViewAll}>
            Ver todas
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <p className="mt-2 text-xs text-muted-foreground">A carregar…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Sem faturas.</p>
      ) : (
        <ul className="mt-2 space-y-2 border-t border-border/40 pt-2">
          {rows.map((inv) => (
            <li key={inv.id} className="flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium leading-snug">
                  {inv.invoice_number ? `#${inv.invoice_number}` : 'Sem número'}{' '}
                  <span className="font-normal text-muted-foreground">· {formatInvoiceShortDate(inv.due_date)}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">{invoiceStatusPt(inv.status)}</p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatBrlFromCents(inv.amount_cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
