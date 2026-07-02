import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { FinancialHistoryFilter, FinancialHistorySort } from '@/lib/subscriptionFinancialExperience';
import { FINANCIAL_CARD_BODY, FINANCIAL_CARD_HEADER, FINANCIAL_CARD_SHELL } from '@/lib/subscriptionFinancialOverview';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import { FinancialHistoryRow } from './FinancialHistoryRow';
import { focusRingClass } from './FinancialStatCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

type Props = {
  canViewInvoices?: boolean;
  filter?: FinancialHistoryFilter;
  onFilterChange?: (filter: FinancialHistoryFilter) => void;
  generatingRowId?: string | null;
  onGenerateBilling?: (row: import('@/lib/billingSubscriptionExperience').FinancialHistoryRow) => void;
  className?: string;
};

const FILTERS: { value: FinancialHistoryFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'paid', label: 'Pagas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'refunded', label: 'Reembolsadas' },
];

export function FinancialHistory({
  canViewInvoices = true,
  filter: controlledFilter,
  onFilterChange,
  generatingRowId,
  onGenerateBilling,
  className,
}: Props) {
  const store = useFinancialEventStore();
  const isMobile = useIsMobile();
  const [internalFilter, setInternalFilter] = useState<FinancialHistoryFilter>('all');
  const filter = controlledFilter ?? internalFilter;
  const setFilter = onFilterChange ?? setInternalFilter;
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<FinancialHistorySort>('due_desc');

  const rows = store.filterHistory(filter, search, sort);

  return (
    <Card className={cn(FINANCIAL_CARD_SHELL, className)} id="financial-history">
      <CardHeader className={cn(FINANCIAL_CARD_HEADER, 'py-3 space-y-2')}>
        <CardTitle className="text-base font-medium">Histórico financeiro</CardTitle>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Buscar competência, valor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn('pl-9 h-9', focusRingClass())}
              aria-label="Buscar histórico"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as FinancialHistorySort)}>
            <SelectTrigger className="w-full sm:w-[160px] h-9" aria-label="Ordenar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due_desc">Vencimento ↓</SelectItem>
              <SelectItem value="due_asc">Vencimento ↑</SelectItem>
              <SelectItem value="amount_desc">Valor ↓</SelectItem>
              <SelectItem value="amount_asc">Valor ↑</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={filter === f.value ? 'default' : 'outline'}
              className="h-7 text-xs"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className={cn('p-0 overflow-x-hidden', isMobile && 'p-3 space-y-2')}>
        {isMobile ? (
          rows.length === 0 ? (
            <p className="text-center py-6 text-sm text-muted-foreground">Nenhum resultado.</p>
          ) : (
            rows.map((row) => (
              <FinancialHistoryRow
                key={row.id}
                row={row}
                canViewInvoices={canViewInvoices}
                generatingRowId={generatingRowId}
                onGenerateBilling={onGenerateBilling}
                variant="card"
              />
            ))
          )
        ) : (
          <Table className="table-fixed w-full text-sm">
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-muted/20 h-8">
                <TableHead className="w-[18%] py-2">Competência</TableHead>
                <TableHead className="text-right w-[14%] py-2">Valor</TableHead>
                <TableHead className="w-[14%] py-2">Vencimento</TableHead>
                <TableHead className="w-[14%] py-2">Pagamento</TableHead>
                <TableHead className="w-[20%] py-2">Status</TableHead>
                <TableHead className="text-right w-[20%] py-2 sr-only">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum resultado.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <FinancialHistoryRow
                    key={row.id}
                    row={row}
                    canViewInvoices={canViewInvoices}
                    generatingRowId={generatingRowId}
                onGenerateBilling={onGenerateBilling}
                    variant="table"
                  />
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
