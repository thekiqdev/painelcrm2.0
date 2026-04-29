import { useCallback, useMemo, useState } from "react";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import {
  listAppointmentHolidays,
  createAppointmentHoliday,
  patchAppointmentHoliday,
  disableAppointmentHoliday,
  type AppointmentHolidayApi,
} from "@/services/appointmentHolidays";
import { QK_APPOINTMENTS } from "@/pages/agenda/agendaConstants";

const QK_HOLIDAYS = ["appointment_holidays"];

export function AgendaHolidaysTab() {
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const qc = useQueryClient();
  const yearNow = new Date().getFullYear();
  const [listYear, setListYear] = useState(yearNow);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentHolidayApi | null>(null);
  const [name, setName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [blocksAvail, setBlocksAvail] = useState(true);
  const [saving, setSaving] = useState(false);

  const myRole = user?.role ?? null;
  const canManage = myRole === "admin" || myRole === "manager" || user?.is_tenant_admin;

  const { data, isLoading, refetch } = useQuery({
    queryKey: [...QK_HOLIDAYS, listYear],
    queryFn: () =>
      listAppointmentHolidays({
        year_from: listYear,
        year_to: listYear,
        active: true,
      }),
  });

  const holidays = useMemo(() => {
    const rows = data?.holidays ?? [];
    const seen = new Set<string>();
    const dedup: AppointmentHolidayApi[] = [];
    for (const h of rows) {
      const dd = (h.display_date || h.holiday_date).slice(0, 10);
      const k = `${h.id}:${dd}`;
      if (seen.has(k)) continue;
      seen.add(k);
      dedup.push({ ...h, display_date: dd });
    }
    dedup.sort((a, b) => (a.display_date || "").localeCompare(b.display_date || ""));
    return dedup;
  }, [data?.holidays]);

  const invalidateAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: QK_HOLIDAYS });
    void qc.invalidateQueries({ queryKey: [...QK_APPOINTMENTS] });
  }, [qc]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setHolidayDate(`${listYear}-01-01`);
    setRecurring(false);
    setBlocksAvail(true);
    setDialogOpen(true);
  };

  const openEdit = (h: AppointmentHolidayApi) => {
    if (h.scope === "global") return;
    setEditing(h);
    setName(h.name);
    setHolidayDate((h.display_date || h.holiday_date).slice(0, 10));
    setRecurring(h.is_recurring_yearly);
    setBlocksAvail(h.blocks_availability);
    setDialogOpen(true);
  };

  const onSave = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await patchAppointmentHoliday(editing.id, {
          name: name.trim(),
          holiday_date: holidayDate,
          is_recurring_yearly: recurring,
          blocks_availability: blocksAvail,
        });
        toast.success("Feriado atualizado.");
      } else {
        await createAppointmentHoliday({
          name: name.trim(),
          holiday_date: holidayDate,
          is_recurring_yearly: recurring,
          blocks_availability: blocksAvail,
        });
        toast.success("Feriado criado.");
      }
      setDialogOpen(false);
      await refetch();
      invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  const onDisable = async (h: AppointmentHolidayApi) => {
    if (h.scope === "global") return;
    if (!window.confirm("Desativar este feriado personalizado?")) return;
    try {
      await disableAppointmentHoliday(h.id);
      toast.success("Feriado desativado.");
      await refetch();
      invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <div className="space-y-4">
      <AlertNote />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Lista por ano</CardTitle>
          <CardDescription>Feriados do sistema (Brasil) e feriados da empresa.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Ano</Label>
            <Input
              type="number"
              min={2000}
              max={2100}
              className="w-28"
              value={listYear}
              onChange={(e) => setListYear(parseInt(e.target.value, 10) || yearNow)}
            />
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void refetch()}>
            Atualizar
          </Button>
          {canManage ? (
            <Button type="button" size="sm" className="gap-1" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Feriado personalizado
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : holidays.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Nenhum feriado ativo neste ano.
        </p>
      ) : (
        <ul className="space-y-2">
          {holidays.map((h) => (
            <li
              key={`${h.id}-${h.display_date}`}
              className="flex flex-col gap-2 rounded-lg border border-border/80 bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{h.name}</span>
                  {h.is_system_default ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Padrão do sistema
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Empresa
                    </Badge>
                  )}
                  {h.is_recurring_yearly ? (
                    <Badge variant="outline" className="text-[10px]">
                      Recorrente
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(`${(h.display_date || h.holiday_date).slice(0, 10)}T12:00:00`), "d 'de' MMMM yyyy", {
                    locale: ptBR,
                  })}
                  {!h.blocks_availability ? " — não bloqueia slots" : null}
                </p>
              </div>
              {canManage && h.scope === "tenant" ? (
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(h)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => void onDisable(h)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar feriado" : "Novo feriado"}</DialogTitle>
            <DialogDescription>Feriados da empresa podem sobrepor o calendário nacional no mesmo dia.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Recorrente todos os anos</p>
                <p className="text-xs text-muted-foreground">Repete no mesmo dia/mês.</p>
              </div>
              <Switch checked={recurring} onCheckedChange={setRecurring} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Bloquear disponibilidade</p>
                <p className="text-xs text-muted-foreground">Remove slots públicos neste dia.</p>
              </div>
              <Switch checked={blocksAvail} onCheckedChange={setBlocksAvail} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Fechar
            </Button>
            <Button type="button" onClick={() => void onSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AlertNote() {
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
        Feriados móveis (Carnaval, Páscoa, Corpus Christi) não são calculados nesta versão. Apenas datas fixas e
        feriados nacionais fixos do Brasil (seed).
      </div>
      <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Feriados padrão do sistema não podem ser editados ou desativados pelo tenant.
      </div>
    </div>
  );
}
