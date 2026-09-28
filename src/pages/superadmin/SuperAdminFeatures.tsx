import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';

interface SystemFeature {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const defaultForm = { key: '', name: '', description: '', sort_order: 0 };

export default function SuperAdminFeatures() {
  const [list, setList] = useState<SystemFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await apiClient.get<SystemFeature[]>('/api/superadmin/features');
    if (res.data) setList(res.data);
    if (res.error) toast.error(res.error);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (row: SystemFeature) => {
    setEditingId(row.id);
    setForm({
      key: row.key,
      name: row.name,
      description: row.description ?? '',
      sort_order: row.sort_order,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!form.key.trim()) {
      toast.error('Key é obrigatória');
      return;
    }
    setSaving(true);
    if (editingId) {
      const res = await apiClient.put<SystemFeature>(`/api/superadmin/features/${editingId}`, {
        key: form.key,
        name: form.name,
        description: form.description || null,
        sort_order: form.sort_order,
      });
      if (res.error) {
        toast.error(res.error);
        setSaving(false);
        return;
      }
      toast.success('Recurso atualizado');
    } else {
      const res = await apiClient.post<SystemFeature>('/api/superadmin/features', {
        key: form.key.trim().toLowerCase().replace(/\s+/g, '_'),
        name: form.name,
        description: form.description || null,
        sort_order: form.sort_order,
      });
      if (res.error) {
        toast.error(res.error);
        setSaving(false);
        return;
      }
      toast.success('Recurso criado');
    }
    setDialogOpen(false);
    setSaving(false);
    load();
  };

  const remove = async (row: SystemFeature) => {
    if (!confirm(`Excluir o recurso "${row.name}" (${row.key})?`)) return;
    const res = await apiClient.delete(`/api/superadmin/features/${row.id}`);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Recurso excluído');
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recursos do sistema</h1>
          <p className="text-muted-foreground">Keys usadas em plan_features e overrides por empresa.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo recurso
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista</CardTitle>
          <CardDescription>Edite nome, descrição e ordem. A key não deve ser alterada se já estiver em uso.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : list.length === 0 ? (
            <p className="text-muted-foreground">Nenhum recurso. Execute a migration 29 para popular o seed.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Ordem</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">{row.key}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{row.description ?? '—'}</TableCell>
                    <TableCell>{row.sort_order}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(row)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar recurso' : 'Novo recurso'}</DialogTitle>
            <DialogDescription>Key: apenas letras minúsculas, números e underscore.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Key</Label>
              <Input
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                placeholder="ex: novo_recurso"
                disabled={!!editingId}
              />
            </div>
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome exibido"
              />
            </div>
            <div className="grid gap-2">
              <Label>Descrição (opcional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descrição"
              />
            </div>
            <div className="grid gap-2">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
