import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Member } from '@/services/members';
import type { AgendaLayoutMode } from '../agendaConstants';

export type ConfirmationFilterValue =
  | ''
  | 'pending'
  | 'confirmed'
  | 'not_confirmed'
  | 'needs_reschedule'
  | 'declined'
  | 'no_show';

type Draft = {
  responsible: string;
  status: string;
  type: string;
  confirmation: ConfirmationFilterValue;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layoutMode: AgendaLayoutMode;
  dateFrom: Date;
  dateTo: Date;
  onPickDateFrom: (d: Date | undefined) => void;
  onPickDateTo: (d: Date | undefined) => void;
  members: Member[];
  typeOptionsForFilter: Array<{ value: string; label: string }>;
  responsibleFilter: string;
  statusFilter: string;
  typeFilter: string;
  confirmationFilter: ConfirmationFilterValue;
  onApply: (draft: Draft) => void;
  onClear: () => void;
};

function sheetFooterShadow() {
  return 'border-t border-border/60 bg-background/95 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3 supports-[backdrop-filter]:backdrop-blur-sm';
}

export const AgendaFiltersSheet = React.memo(function AgendaFiltersSheet({
  open,
  onOpenChange,
  layoutMode,
  dateFrom,
  dateTo,
  onPickDateFrom,
  onPickDateTo,
  members,
  typeOptionsForFilter,
  responsibleFilter,
  statusFilter,
  typeFilter,
  confirmationFilter,
  onApply,
  onClear,
}: Props) {
  const [draft, setDraft] = useState<Draft>({
    responsible: '',
    status: '',
    type: '',
    confirmation: '',
  });
  const prevOpen = useRef(open);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setDraft({
        responsible: responsibleFilter,
        status: statusFilter,
        type: typeFilter,
        confirmation: confirmationFilter,
      });
    }
    prevOpen.current = open;
  }, [open, responsibleFilter, statusFilter, typeFilter, confirmationFilter]);

  const apply = useCallback(() => {
    onApply(draft);
    onOpenChange(false);
  }, [draft, onApply, onOpenChange]);

  const clear = useCallback(() => {
    onClear();
    onOpenChange(false);
  }, [onClear, onOpenChange]);

  const listModeDates = useMemo(() => layoutMode === 'list', [layoutMode]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[80vh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 md:hidden"
        aria-describedby={undefined}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" aria-hidden />
        <SheetHeader className="space-y-1 px-4 pb-2 pt-3 text-left">
          <SheetTitle className="text-lg">Filtros</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-2">
          {listModeDates ? (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Datas</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Data inicial</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-10 w-full justify-start text-left font-normal"
                        aria-label="Data inicial do período"
                      >
                        {format(dateFrom, 'P', { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dateFrom} onSelect={onPickDateFrom} locale={ptBR} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Data final</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-10 w-full justify-start text-left font-normal"
                        aria-label="Data final do período"
                      >
                        {format(dateTo, 'P', { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dateTo} onSelect={onPickDateTo} locale={ptBR} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Responsável</Label>
            <Select
              value={draft.responsible || '__all__'}
              onValueChange={(v) => setDraft((d) => ({ ...d, responsible: v === '__all__' ? '' : v }))}
            >
              <SelectTrigger className="h-11 w-full" aria-label="Responsável">
                <SelectValue placeholder="Responsável" />
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
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={draft.status || '__all__'}
              onValueChange={(v) => setDraft((d) => ({ ...d, status: v === '__all__' ? '' : v }))}
            >
              <SelectTrigger className="h-11 w-full" aria-label="Status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="scheduled">Agendado</SelectItem>
                <SelectItem value="done">Concluído</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select
              value={draft.type || '__all__'}
              onValueChange={(v) => setDraft((d) => ({ ...d, type: v === '__all__' ? '' : v }))}
            >
              <SelectTrigger className="h-11 w-full" aria-label="Tipo">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {typeOptionsForFilter.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Confirmação</Label>
            <Select
              value={draft.confirmation || '__all__'}
              onValueChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  confirmation:
                    v === '__all__'
                      ? ''
                      : (v as Exclude<ConfirmationFilterValue, ''>),
                }))
              }
            >
              <SelectTrigger className="h-11 w-full" aria-label="Confirmação">
                <SelectValue placeholder="Confirmação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="pending">Aguardando confirmação</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="not_confirmed">Não confirmado</SelectItem>
                <SelectItem value="needs_reschedule">Precisa remarcar</SelectItem>
                <SelectItem value="declined">Recusado</SelectItem>
                <SelectItem value="no_show">Não compareceu</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter className={`mt-auto flex flex-row gap-2 px-4 ${sheetFooterShadow()}`}>
          <Button type="button" variant="outline" className="flex-1" onClick={clear}>
            Limpar filtros
          </Button>
          <Button type="button" className="flex-1" onClick={apply}>
            Aplicar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
});
