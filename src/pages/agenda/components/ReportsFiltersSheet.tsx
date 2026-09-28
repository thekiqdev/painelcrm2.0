import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format, startOfMonth, subDays, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type ReportsPreset = 'last30' | 'thisMonth' | 'custom';

export type ReportsFiltersDraft = {
  preset: ReportsPreset;
  dateFrom: Date;
  dateTo: Date;
  responsibleUserId: string;
  typeFilter: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Array<{ id: string; name: string }>;
  typeFilterOptions: Array<{ value: string; label: string }>;
  applied: ReportsFiltersDraft;
  onApply: (next: ReportsFiltersDraft) => void;
  onClear: () => void;
};

function applyPresetToDates(p: ReportsPreset, draft: ReportsFiltersDraft): { from: Date; to: Date } {
  const now = new Date();
  if (p === 'last30') {
    return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
  }
  if (p === 'thisMonth') {
    return { from: startOfMonth(now), to: endOfDay(now) };
  }
  return { from: draft.dateFrom, to: draft.dateTo };
}

export const ReportsFiltersSheet = React.memo(function ReportsFiltersSheet({
  open,
  onOpenChange,
  members,
  typeFilterOptions,
  applied,
  onApply,
  onClear,
}: Props) {
  const [draft, setDraft] = useState<ReportsFiltersDraft>(applied);
  const prevOpen = useRef(open);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setDraft({ ...applied });
    }
    prevOpen.current = open;
  }, [open, applied]);

  const setPreset = useCallback((p: ReportsPreset) => {
    setDraft((d) => {
      const { from, to } = applyPresetToDates(p, d);
      return { ...d, preset: p, dateFrom: from, dateTo: to };
    });
  }, []);

  const apply = useCallback(() => {
    onApply(draft);
    onOpenChange(false);
  }, [draft, onApply, onOpenChange]);

  const clear = useCallback(() => {
    onClear();
    onOpenChange(false);
  }, [onClear, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 md:hidden"
        aria-describedby={undefined}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" aria-hidden />
        <SheetHeader className="space-y-1 px-4 pb-2 pt-3 text-left">
          <SheetTitle className="text-lg">Filtros</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Período</Label>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={draft.preset === 'last30' ? 'default' : 'outline'}
                className="h-9 text-xs"
                onClick={() => setPreset('last30')}
              >
                Últimos 30 dias
              </Button>
              <Button
                type="button"
                size="sm"
                variant={draft.preset === 'thisMonth' ? 'default' : 'outline'}
                className="h-9 text-xs"
                onClick={() => setPreset('thisMonth')}
              >
                Este mês
              </Button>
              <Button
                type="button"
                size="sm"
                variant={draft.preset === 'custom' ? 'default' : 'outline'}
                className="h-9 text-xs"
                onClick={() => setDraft((d) => ({ ...d, preset: 'custom' }))}
              >
                Personalizado
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">De</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 w-full justify-start text-left text-sm font-normal"
                    disabled={draft.preset !== 'custom'}
                  >
                    {format(draft.dateFrom, 'P', { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={draft.dateFrom}
                    onSelect={(d) => {
                      if (!d) return;
                      setDraft((x) => ({
                        ...x,
                        preset: 'custom',
                        dateFrom: startOfDay(d),
                      }));
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Até</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 w-full justify-start text-left text-sm font-normal"
                    disabled={draft.preset !== 'custom'}
                  >
                    {format(draft.dateTo, 'P', { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={draft.dateTo}
                    onSelect={(d) => {
                      if (!d) return;
                      setDraft((x) => ({
                        ...x,
                        preset: 'custom',
                        dateTo: endOfDay(d),
                      }));
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Responsável</Label>
            <Select
              value={draft.responsibleUserId || '__all__'}
              onValueChange={(v) => setDraft((d) => ({ ...d, responsibleUserId: v === '__all__' ? '' : v }))}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select
              value={draft.typeFilter || '__all__'}
              onValueChange={(v) => setDraft((d) => ({ ...d, typeFilter: v === '__all__' ? '' : v }))}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {typeFilterOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter
          className={cn(
            'mt-auto flex flex-row gap-2 border-t border-border/60 bg-background/95 px-4',
            'pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3 supports-[backdrop-filter]:backdrop-blur-sm',
          )}
        >
          <Button type="button" variant="outline" className="flex-1" onClick={clear}>
            Limpar
          </Button>
          <Button type="button" className="flex-1" onClick={apply}>
            Aplicar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
});
