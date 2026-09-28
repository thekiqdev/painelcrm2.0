import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  listAppointmentTypeSettings,
  createAppointmentTypeSetting,
  patchAppointmentTypeSetting,
  disableAppointmentTypeSetting,
  type AppointmentTypeSetting,
} from "@/services/appointmentTypeSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Plus } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { QK_APPOINTMENT_TYPE_SETTINGS } from "@/pages/agenda/agendaConstants";

type Props = {
  canEdit: boolean;
};

const emptyCreate = () => ({
  type_key: "",
  label: "",
  description: "",
  default_duration_minutes: 30,
  sort_order: 0,
});

export function AgendaAppointmentTypesTab({ canEdit }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AppointmentTypeSetting[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [saving, setSaving] = useState(false);
  const [editRow, setEditRow] = useState<AppointmentTypeSetting | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAppointmentTypeSettings();
      setItems(data.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar tipos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async () => {
    if (!canEdit) return;
    const key = createForm.type_key.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(key)) {
      toast.error("Chave inválida: use minúsculas, números e _ (ex.: minha_reuniao).");
      return;
    }
    setSaving(true);
    try {
      await createAppointmentTypeSetting({
        type_key: key,
        label: createForm.label.trim() || key,
        description: createForm.description.trim() || null,
        default_duration_minutes: Math.min(480, Math.max(5, createForm.default_duration_minutes)),
        sort_order: createForm.sort_order,
      });
      toast.success("Tipo criado.");
      setCreateOpen(false);
      setCreateForm(emptyCreate());
      await queryClient.invalidateQueries({ queryKey: [...QK_APPOINTMENT_TYPE_SETTINGS] });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setSaving(false);
    }
  };

  const onDisable = async (id: string) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await disableAppointmentTypeSetting(id);
      toast.success("Tipo desativado. Compromissos antigos mantêm o tipo.");
      await queryClient.invalidateQueries({ queryKey: [...QK_APPOINTMENT_TYPE_SETTINGS] });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao desativar");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editRow || !canEdit) return;
    setSaving(true);
    try {
      await patchAppointmentTypeSetting(editRow.id, {
        label: editRow.label,
        description: editRow.description,
        default_duration_minutes: editRow.default_duration_minutes,
        is_active: editRow.is_active,
        sort_order: editRow.sort_order,
      });
      toast.success("Alterações guardadas.");
      setEditRow(null);
      await queryClient.invalidateQueries({ queryKey: [...QK_APPOINTMENT_TYPE_SETTINGS] });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Tipos de compromisso</CardTitle>
          <CardDescription>
            Duração padrão por tipo na criação na agenda. Tipos desativados não aparecem em novos compromissos.
          </CardDescription>
        </div>
        {canEdit ? (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Novo tipo
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-border/80 bg-muted/20">
          <AlertDescription className="text-xs">
            Chaves fixas (type_key) não devem ser alteradas para não afetar relatórios. Desative um tipo em vez de o apagar.
          </AlertDescription>
        </Alert>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chave</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Duração (min)</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ordem</TableHead>
                {canEdit ? <TableHead className="w-[120px]" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.type_key}</TableCell>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="text-right">{row.default_duration_minutes}</TableCell>
                  <TableCell>{row.is_active ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-right">{row.sort_order}</TableCell>
                  {canEdit ? (
                    <TableCell className="text-right space-x-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditRow({ ...row })}>
                        Editar
                      </Button>
                      {row.is_active ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => void onDisable(row.id)}>
                          Desativar
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo tipo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Chave (slug)</Label>
              <Input
                value={createForm.type_key}
                onChange={(e) => setCreateForm((f) => ({ ...f, type_key: e.target.value }))}
                placeholder="ex.: consultoria"
              />
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={createForm.label}
                onChange={(e) => setCreateForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Duração padrão (minutos)</Label>
              <Input
                type="number"
                min={5}
                max={480}
                value={createForm.default_duration_minutes}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, default_duration_minutes: parseInt(e.target.value, 10) || 30 }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={createForm.sort_order}
                onChange={(e) => setCreateForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                rows={2}
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void onCreate()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar tipo</DialogTitle>
          </DialogHeader>
          {editRow ? (
            <>
              <div className="grid gap-3 py-2">
                <p className="text-sm text-muted-foreground font-mono">{editRow.type_key}</p>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={editRow.label}
                    onChange={(e) => setEditRow((r) => (r ? { ...r, label: e.target.value } : r))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duração padrão (minutos)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={480}
                    value={editRow.default_duration_minutes}
                    onChange={(e) =>
                      setEditRow((r) =>
                        r ? { ...r, default_duration_minutes: parseInt(e.target.value, 10) || 30 } : r,
                      )
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm">Ativo</span>
                  <Switch
                    checked={editRow.is_active}
                    onCheckedChange={(v) => setEditRow((r) => (r ? { ...r, is_active: v } : r))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editRow.sort_order}
                    onChange={(e) =>
                      setEditRow((r) => (r ? { ...r, sort_order: parseInt(e.target.value, 10) || 0 } : r))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    rows={2}
                    value={editRow.description ?? ""}
                    onChange={(e) => setEditRow((r) => (r ? { ...r, description: e.target.value || null } : r))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditRow(null)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={() => void saveEdit()} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
