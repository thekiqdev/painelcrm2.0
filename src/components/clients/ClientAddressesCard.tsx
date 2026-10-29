import { useCallback, useEffect, useState } from "react";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { clientAddressesService } from "@/services/clientAddresses";
import type { ClientAddress } from "@/types/clientAddresses";
import { formatClientAddressLine } from "@/types/clientAddresses";
import {
  ClientAddressFormFields,
  emptyClientAddressForm,
  type ClientAddressFormValues,
} from "./ClientAddressFormFields";

type Props = {
  clientId: string;
};

function toForm(a: ClientAddress): ClientAddressFormValues {
  return {
    label: a.label || "Principal",
    postal_code: a.postal_code || "",
    street: a.street || "",
    number: a.number || "",
    complement: a.complement || "",
    neighborhood: a.neighborhood || "",
    city: a.city || "",
    state: a.state || "",
    is_default: a.is_default,
  };
}

export function ClientAddressesCard({ clientId }: Props) {
  const { canView, canEdit } = useModulePermissions();
  const canSee = canView("clients");
  const canMutate = canEdit("clients");

  const [rows, setRows] = useState<ClientAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientAddressFormValues>(emptyClientAddressForm);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!canSee || !clientId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await clientAddressesService.list(clientId);
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar endereços");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canSee, clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canSee) return null;

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyClientAddressForm(),
      label: rows.length === 0 ? "Principal" : `Endereço ${rows.length + 1}`,
      is_default: rows.length === 0,
    });
    setOpen(true);
  };

  const openEdit = (a: ClientAddress) => {
    setEditingId(a.id);
    setForm(toForm(a));
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        label: form.label.trim() || "Principal",
        postal_code: form.postal_code.trim() || null,
        street: form.street.trim() || null,
        number: form.number.trim() || null,
        complement: form.complement.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        is_default: form.is_default,
      };
      if (editingId) {
        await clientAddressesService.update(clientId, editingId, body);
        toast.success("Endereço atualizado");
      } else {
        await clientAddressesService.create(clientId, body);
        toast.success("Endereço cadastrado");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar endereço");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: ClientAddress) => {
    if (!window.confirm(`Excluir endereço “${a.label}”?`)) return;
    try {
      await clientAddressesService.remove(clientId, a.id);
      toast.success("Endereço excluído");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  };

  return (
    <>
      <Card className="max-md:border-dashed max-md:bg-muted/25 max-md:shadow-none md:bg-card">
        <CardHeader className="max-md:py-3 md:py-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="max-md:text-sm max-md:font-semibold">Endereços</CardTitle>
            {canMutate ? (
              <Button type="button" size="sm" variant="outline" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando endereços…</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed px-4 py-6">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhum endereço cadastrado. Cadastre um ou mais para usar em ordens de serviço.
              </p>
              {canMutate ? (
                <Button type="button" size="sm" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar endereço
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2.5"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{a.label}</span>
                      {a.is_default ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                          <Star className="h-3 w-3" />
                          Padrão
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{formatClientAddressLine(a)}</p>
                  </div>
                  {canMutate ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label="Editar endereço"
                        onClick={() => openEdit(a)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        aria-label="Excluir endereço"
                        onClick={() => void remove(a)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar endereço" : "Novo endereço"}</DialogTitle>
          </DialogHeader>
          <ClientAddressFormFields value={form} onChange={setForm} disabled={busy} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void save()} disabled={busy}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
