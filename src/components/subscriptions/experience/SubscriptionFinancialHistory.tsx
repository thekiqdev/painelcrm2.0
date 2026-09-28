import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { buildFinancialHistoryRows } from '@/lib/billingSubscriptionExperience';
import {
  filterAndSortHistory,
  focusRingClass,
  type HistoryFilter,
  type HistorySort,
} from '@/lib/billingSubscriptionExperiencePolish';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { formatExperienceAmount, formatExperienceYmd } from './subscriptionExperienceFormat';
import { SubscriptionExperienceEmptyState } from './SubscriptionExperienceEmptyState';
import { detectExperienceEmpty } from '@/lib/billingSubscriptionExperiencePolish';
import { cn } from '@/lib/utils';
import { FileText, Copy, Send, Download, Search } from 'lucide-react';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  canViewInvoices?: boolean;
  className?: string;
};

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'paid', label: 'Pagas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'cancelled', label: 'Canceladas' },
];

export function SubscriptionFinancialHistory({ detail, canViewInvoices = true, className }: Props) {
  const allRows = useMemo(() => buildFinancialHistoryRows(detail), [detail]);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<HistorySort>('due_desc');

  const rows = useMemo(
    () => filterAndSortHistory(allRows, { filter, search, sort }),
    [allRows, filter, search, sort]
  );

  const empty = detectExperienceEmpty('history', detail);

  if (empty === 'history') {
    return <SubscriptionExperienceEmptyState kind="history" className={className} />;
  }

  return (
    <Card className={cn('border shadow-sm overflow-hidden', className)}>
      <CardHeader className="bg-muted/30 border-b py-4 space-y-3">
        <CardTitle className="text-base font-medium">Histórico financeiro</CardTitle>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Buscar competência, invoice, valor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn('pl-9', focusRingClass())}
              aria-label="Buscar no histórico"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as HistorySort)}>
            <SelectTrigger className="w-full sm:w-[160px]" aria-label="Ordenar">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due_desc">Vencimento ↓</SelectItem>
              <SelectItem value="due_asc">Vencimento ↑</SelectItem>
              <SelectItem value="amount_desc">Valor ↓</SelectItem>
              <SelectItem value="amount_asc">Valor ↑</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar histórico">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={filter === f.value ? 'default' : 'outline'}
              className={cn('h-7 text-xs', focusRingClass())}
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-muted/20">
              <TableHead>Competência</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Gateway</TableHead>
              <TableHead className="text-right w-[140px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                  Nenhum resultado para os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-sm font-medium">{row.competence}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.amountCents != null ? formatExperienceAmount(row.amountCents) : '—'}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{formatExperienceYmd(row.dueYmd)}</TableCell>
                  <TableCell className="text-sm tabular-nums">{formatExperienceYmd(row.paidAt)}</TableCell>
                  <TableCell className="text-sm">{row.statusPt}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.gateway ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    {row.invoiceId && canViewInvoices ? (
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Abrir">
                          <Link to={`/customer-invoices/${row.invoiceId}`}>
                            <FileText className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Duplicar">
                          <Link to={`/customer-invoices/new?duplicateFrom=${row.invoiceId}`}>
                            <Copy className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Enviar novamente">
                          <Link to={`/customer-invoices/${row.invoiceId}?action=resend`}>
                            <Send className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Baixar PDF">
                          <Link to={`/customer-invoices/${row.invoiceId}?download=pdf`}>
                            <Download className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
