import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addClient } from "@/utils/clients-helpers";
import { clientsService } from "@/services/clients";
import type { Client } from "@/services/clients";
import { toast } from "@/components/ui/sonner";

export interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após criar o cliente com sucesso; recebe o cliente criado. */
  onSuccess: (client: Client) => void;
  /** Nome inicial para preencher o campo nome (ex.: texto digitado na busca). */
  initialName?: string;
}

const defaultForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  status: "Ativo",
  group_id: "",
  notes: "",
};

export function AddClientDialog({
  open,
  onOpenChange,
  onSuccess,
  initialName = "",
}: AddClientDialogProps) {
  const [form, setForm] = useState(defaultForm);
  const [clientGroups, setClientGroups] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setForm(defaultForm);
    else setForm({ ...defaultForm, name: initialName || "" });
  }, [open, initialName]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        const groups = await clientsService.getClientGroups();
        setClientGroups(groups || []);
      } catch {
        setClientGroups([]);
      }
    };
    load();
  }, [open]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setForm((f) => ({ ...f, [id]: value }));
  };

  const handleSelectChange = (field: "status" | "group_id", value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await addClient({
        name: form.name.trim(),
        company: form.company?.trim() || undefined,
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        status: form.status || undefined,
        group_id: form.group_id || undefined,
        notes: form.notes?.trim() || undefined,
      });

      if (!result.success || !result.data) {
        throw new Error((result as { error?: { message?: string } }).error?.message || "Erro ao criar cliente");
      }

      const created = result.data as Client;
      toast.success("Cliente criado com sucesso!");
      onSuccess(created);
      onOpenChange(false);
      setForm(defaultForm);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao criar cliente";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>
            Preencha os dados para adicionar um novo cliente. Ele será vinculado ao projeto.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  placeholder="Nome completo"
                  required
                  value={form.name}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Empresa</Label>
                <Input
                  id="company"
                  placeholder="Nome da empresa"
                  value={form.company}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={form.email}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  placeholder="(00) 00000-0000"
                  value={form.phone}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={form.status} onValueChange={(v) => handleSelectChange("status", v)}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="group_id">Grupo</Label>
                <Select value={form.group_id} onValueChange={(v) => handleSelectChange("group_id", v)}>
                  <SelectTrigger id="group_id">
                    <SelectValue placeholder="Selecione um grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Adicione informações relevantes"
                value={form.notes}
                onChange={handleChange}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
