import React, { useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Filter, ArrowDownUp } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { COMMERCIAL_FILTERS_PANEL } from '@/lib/commercialListUi';

const SORT_FIELDS = [
  { value: 'name', label: 'Nome' },
  { value: 'company', label: 'Empresa' },
  { value: 'email', label: 'E-mail' },
  { value: 'status', label: 'Status' },
  { value: 'source', label: 'Origem' },
  { value: 'updated_at', label: 'Última atualização' },
] as const;

interface LeadFiltersProps {
  activeStatusFilter: string;
  setActiveStatusFilter: (value: string) => void;
  leadStatuses: { id: string; name: string; color: string }[];
  sortField: string;
  setSortField: (v: string) => void;
  sortDirection: 'asc' | 'desc';
  setSortDirection: (v: 'asc' | 'desc') => void;
}

const LeadFilters: React.FC<LeadFiltersProps> = ({
  activeStatusFilter,
  setActiveStatusFilter,
  leadStatuses,
  sortField,
  setSortField,
  sortDirection,
  setSortDirection,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);

  const middleStatuses = useMemo(
    () =>
      (leadStatuses || []).filter((s) => {
        const n = (s.name || '').toLowerCase();
        return n !== 'novo' && n !== 'convertido';
      }),
    [leadStatuses],
  );

  const sortBlock = (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="lead-sort-field">Ordenar por</Label>
        <Select value={sortField} onValueChange={setSortField}>
          <SelectTrigger id="lead-sort-field" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_FIELDS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Ordem</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={sortDirection === 'asc' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setSortDirection('asc')}
          >
            Crescente
          </Button>
          <Button
            type="button"
            variant={sortDirection === 'desc' ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setSortDirection('desc')}
          >
            Decrescente
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn(COMMERCIAL_FILTERS_PANEL, 'space-y-4')}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between xl:gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="hidden text-xs font-medium uppercase tracking-wide text-muted-foreground md:block">
            Estágio do funil
          </p>
          <Tabs value={activeStatusFilter} onValueChange={setActiveStatusFilter} className="w-full min-w-0">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-background/80 p-1 md:min-h-11">
              <TabsTrigger value="all" className="touch-manipulation px-3 text-xs sm:text-sm">
                Todos
              </TabsTrigger>
              <TabsTrigger value="novo" className="touch-manipulation px-3 text-xs sm:text-sm">
                Novos
              </TabsTrigger>
              {middleStatuses.map((status) => (
                <TabsTrigger
                  key={status.id}
                  value={status.name.toLowerCase()}
                  className="touch-manipulation px-2.5 text-xs sm:text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: status.color }}
                    />
                    {status.name}
                  </span>
                </TabsTrigger>
              ))}
              <TabsTrigger value="convertidos" className="touch-manipulation px-3 text-xs sm:text-sm">
                Convertidos
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 border-border/50 sm:flex-row sm:items-center xl:w-auto xl:border-l xl:pl-6">
          <div className={cn('hidden w-full flex-col gap-1.5 md:flex md:min-w-[280px]')}>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ordenação</span>
            <div className="flex items-center gap-2">
              <ArrowDownUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <Select value={sortField} onValueChange={setSortField}>
                <SelectTrigger className="h-10 w-full min-w-[200px] max-w-[260px]">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 px-3"
                onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              >
                {sortDirection === 'asc' ? 'A → Z' : 'Z → A'}
              </Button>
            </div>
          </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-2 md:hidden">
              <Filter className="h-4 w-4" />
              Filtros avançados
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[90vh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
          >
            <SheetHeader className="text-left">
              <SheetTitle>Ordenação</SheetTitle>
              <SheetDescription>Defina como a lista de leads é ordenada neste dispositivo.</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-6">{sortBlock}</div>
            <SheetClose asChild>
              <Button type="button" className="mt-6 w-full">
                Concluir
              </Button>
            </SheetClose>
          </SheetContent>
        </Sheet>
        </div>
      </div>
    </div>
  );
};

export default LeadFilters;
