import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfDay, endOfDay, addDays, parse as parseDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { getMyTenantUsers, type TenantUser } from "@/services/tenantLimits";
import {
  listAvailabilityBlocks,
  createAvailabilityBlock,
  patchAvailabilityBlock,
  cancelAvailabilityBlock,
  type AvailabilityBlock,
  type AvailabilityBlockType,
  type AvailabilityBlockScope,
} from "@/services/appointmentAvailabilityBlocks";
import { QK_APPOINTMENTS } from "@/pages/agenda/agendaConstants";

const BLOCK_TYPES: { value: AvailabilityBlockType; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "holiday", label: "Feriado" },
  { value: "vacation", label: "Folga / férias" },
  { value: "external_meeting", label: "Reunião externa" },
  { value: "maintenance", label: "Manutenção" },
  { value: "other", label: "Outro" },
];

const QK_BLOCKS = ["appointment_availability_blocks"];

function localDatetimeInput(iso: string): string {
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function AgendaAvailabilityBlocksTab() {
  const { user } = useAuth();
  const { permissions, canCreate, canEdit } = useModulePermissions();
  const qc = useQueryClient();
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [periodFrom, setPeriodFrom] = useState(() => format(startOfDay(addDays(new Date(), -7)), "yyyy-MM-dd"));
  const [periodTo, setPeriodTo] = useState(() => format(endOfDay(addDays(new Date(), 60)), "yyyy-MM-dd"));
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");

  const elevated = useMemo(
    () => user?.role === "admin" || user?.role === "manager" || !!user?.is_tenant_admin,
    [user?.role, user?.is_tenant_admin],
  );
  const canTenantBlock = elevated || permissions.settings?.can_edit === true;
  const canPickOtherUsers = canTenantBlock;
  const canAgendaCreate = canCreate("agenda");
  const canAgendaEdit = canEdit("agenda");
  const canAddAnyBlock = canTenantBlock || canAgendaCreate;

  const listParams = useMemo(() => {
    const from = startOfDay(parseDate(periodFrom, "yyyy-MM-dd", new Date())).toISOString();
    const to = endOfDay(parseDate(periodTo, "yyyy-MM-dd", new Date())).toISOString();
    const uid =
      !canPickOtherUsers && user?.id ? user.id : filterUserId || undefined;
    return {
      date_from: from,
      date_to: to,
      user_id: uid,
      block_type: (filterType as AvailabilityBlockType) || undefined,
    };
  }, [periodFrom, periodTo, filterUserId, filterType, canPickOtherUsers, user?.id]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: [...QK_BLOCKS, listParams],
    queryFn: () => listAvailabilityBlocks(listParams),
  });
  const blocks = useMemo(
    () => (data?.blocks ?? []).filter((b) => !b.cancelled_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [data?.blocks],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AvailabilityBlock | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<AvailabilityBlockScope>("user");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [blockType, setBlockType] = useState<AvailabilityBlockType>("manual");
  const [allDay, setAllDay] = useState(false);
  const [startsLocal, setStartsLocal] = useState("");
  const [endsLocal, setEndsLocal] = useState("");
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setTitle("");
    setDescription("");
    setScope("user");
    setTargetUserId(user?.id ?? "");
    setBlockType("manual");
    setAllDay(false);
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0);
    setStartsLocal(localDatetimeInput(s.toISOString()));
    setEndsLocal(localDatetimeInput(e.toISOString()));
    setDialogOpen(true);
  };

  const openEdit = (b: AvailabilityBlock) => {
    setEditing(b);
    setTitle(b.title);
    setDescription(b.description ?? "");
    setScope(b.block_scope);
    setTargetUserId(b.user_id ?? user?.id ?? "");
    setBlockType(b.block_type);
    setAllDay(b.all_day);
    setStartsLocal(localDatetimeInput(b.starts_at));
    setEndsLocal(localDatetimeInput(b.ends_at));
    setDialogOpen(true);
  };

  useEffect(() => {
    let alive = true;
    void getMyTenantUsers().then((u) => {
      if (alive) setTenantUsers(u);
    });
    return () => {
      alive = false;
    };
  }, []);

  const invalidateBlocks = useCallback(() => {
    void qc.invalidateQueries({ queryKey: QK_BLOCKS });
    void qc.invalidateQueries({ queryKey: [...QK_APPOINTMENTS] });
  }, [qc]);

  const onSave = async () => {
    if (!title.trim()) {
      toast.error("Informe o título.");
      return;
    }
    let startsAt = fromDatetimeLocal(startsLocal);
    let endsAt = fromDatetimeLocal(endsLocal);
    if (allDay) {
      const d = parseISO(startsAt);
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const endDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      startsAt = day.toISOString();
      endsAt = endDay.toISOString();
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      toast.error("O fim deve ser depois do início.");
      return;
    }
    if (scope === "user" && !targetUserId) {
      toast.error("Selecione o utilizador.");
      return;
    }
    if (editing) {
      if (editing.block_scope === "tenant" && !canTenantBlock) {
        toast.error("Sem permissão para alterar bloqueios da empresa.");
        return;
      }
      if (editing.block_scope === "user" && editing.user_id === user?.id && !canAgendaEdit) {
        toast.error("Sem permissão para editar este bloqueio.");
        return;
      }
      if (
        editing.block_scope === "user" &&
        editing.user_id &&
        editing.user_id !== user?.id &&
        !canPickOtherUsers
      ) {
        toast.error("Sem permissão para editar bloqueios de outros utilizadores.");
        return;
      }
    } else {
      if (scope === "tenant" && !canTenantBlock) {
        toast.error("Sem permissão para bloqueio da empresa.");
        return;
      }
      if (scope === "user") {
        const uid = targetUserId || user?.id || "";
        if (uid === user?.id && !canAgendaCreate) {
          toast.error("Sem permissão para criar bloqueios na agenda.");
          return;
        }
        if (uid && uid !== user?.id && !canPickOtherUsers) {
          toast.error("Sem permissão para criar bloqueio para este utilizador.");
          return;
        }
      }
    }
    setSaving(true);
    try {
      if (editing) {
        await patchAvailabilityBlock(editing.id, {
          title: title.trim(),
          description: description.trim() || null,
          starts_at: startsAt,
          ends_at: endsAt,
          all_day: allDay,
          block_scope: scope,
          user_id: scope === "tenant" ? null : targetUserId,
          block_type: blockType,
        });
        toast.success("Bloqueio atualizado.");
      } else {
        await createAvailabilityBlock({
          title: title.trim(),
          description: description.trim() || null,
          starts_at: startsAt,
          ends_at: endsAt,
          all_day: allDay,
          block_scope: scope,
          user_id: scope === "tenant" ? null : targetUserId,
          block_type: blockType,
        });
        toast.success("Bloqueio criado.");
      }
      setDialogOpen(false);
      await refetch();
      invalidateBlocks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  const onCancelBlock = async (b: AvailabilityBlock) => {
    if (!window.confirm("Cancelar este bloqueio? O horário voltará a ficar disponível.")) return;
    try {
      await cancelAvailabilityBlock(b.id);
      toast.success("Bloqueio cancelado.");
      await refetch();
      invalidateBlocks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cancelar");
    }
  };

  const canEditRow = (b: AvailabilityBlock) => {
    if (b.block_scope === "tenant") return canTenantBlock;
    if (b.user_id === user?.id) return canAgendaEdit;
    return canPickOtherUsers;
  };

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          <strong className="text-foreground">Empresa:</strong> bloqueia horários para todos os responsáveis.{" "}
          <strong className="text-foreground">Utilizador:</strong> bloqueia apenas para o utilizador selecionado.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Filtros</CardTitle>
          <CardDescription>Período listado, utilizador e tipo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1">
            <Label>De</Label>
            <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Até</Label>
            <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Utilizador</Label>
            {canPickOtherUsers ? (
              <Select value={filterUserId || "__all__"} onValueChange={(v) => setFilterUserId(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {tenantUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">Os meus bloqueios</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={filterType || "__all__"} onValueChange={(v) => setFilterType(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {BLOCK_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Atualizar lista
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Bloqueios no período</h3>
        <Button type="button" size="sm" className="gap-1" onClick={openCreate} disabled={!canAddAnyBlock}>
          <Plus className="h-4 w-4" />
          Novo bloqueio
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : blocks.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Nenhum bloqueio cadastrado neste período.
        </p>
      ) : (
        <ul className="space-y-2">
          {blocks.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-2 rounded-lg border border-border/80 bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{b.title}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {BLOCK_TYPES.find((x) => x.value === b.block_type)?.label ?? b.block_type}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {b.block_scope === "tenant" ? "Empresa" : "Utilizador"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {b.all_day
                    ? `${format(parseISO(b.starts_at), "d MMM yyyy", { locale: ptBR })} — dia inteiro`
                    : `${format(parseISO(b.starts_at), "d MMM yyyy HH:mm", { locale: ptBR })} – ${format(
                        parseISO(b.ends_at),
                        "HH:mm",
                        { locale: ptBR },
                      )}`}
                </div>
                {b.description ? <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p> : null}
              </div>
              {canEditRow(b) ? (
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(b)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => void onCancelBlock(b)}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar bloqueio" : "Novo bloqueio"}</DialogTitle>
            <DialogDescription>Horários não aparecem como disponíveis na remarcação pública.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Folga" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={blockType} onValueChange={(v) => setBlockType(v as AvailabilityBlockType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Escopo</Label>
              <Select
                value={scope}
                onValueChange={(v) => setScope(v as AvailabilityBlockScope)}
                disabled={!!editing && !canTenantBlock}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user" disabled={false}>
                    Utilizador
                  </SelectItem>
                  <SelectItem value="tenant" disabled={!canTenantBlock}>
                    Empresa
                  </SelectItem>
                </SelectContent>
              </Select>
              {!canTenantBlock && scope === "tenant" ? (
                <p className="text-xs text-muted-foreground">
                  Bloqueios da empresa exigem permissão de edição em Configurações ou papel de gestor.
                </p>
              ) : null}
            </div>
            {scope === "user" ? (
              <div className="space-y-2">
                <Label>Utilizador</Label>
                <Select value={targetUserId} onValueChange={setTargetUserId} disabled={!canPickOtherUsers}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canPickOtherUsers ? (
                  <p className="text-xs text-muted-foreground">A configurar o seu bloqueio pessoal.</p>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Dia inteiro</p>
                <p className="text-xs text-muted-foreground">Usa o dia da data de início.</p>
              </div>
              <Switch checked={allDay} onCheckedChange={setAllDay} />
            </div>
            {!allDay ? (
              <>
                <div className="space-y-2">
                  <Label>Início</Label>
                  <Input type="datetime-local" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fim</Label>
                  <Input type="datetime-local" value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={startsLocal.slice(0, 10)}
                  onChange={(e) => {
                    const d = e.target.value;
                    setStartsLocal(`${d}T09:00`);
                    setEndsLocal(`${d}T18:00`);
                  }}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
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
