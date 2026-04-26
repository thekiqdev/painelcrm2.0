import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { announcementsAdminService, type AnnouncementGroup } from '@/services/announcementsAdmin';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/hooks/use-toast';

type TenantRow = { id: string; name: string; status?: string };

export default function SuperAdminAnnouncementGroups() {
  const [groups, setGroups] = useState<AnnouncementGroup[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementGroup | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [selectedTenants, setSelectedTenants] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = () => {
    Promise.all([
      announcementsAdminService.listGroups(),
      apiClient.get<TenantRow[]>('/api/superadmin/tenants'),
    ])
      .then(([g, tRes]) => {
        setGroups(g);
        if (tRes.data) setTenants(tRes.data);
      })
      .catch((e) => toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setActive(true);
    setSelectedTenants(new Set());
    setDialogOpen(true);
  };

  const openEdit = async (g: AnnouncementGroup) => {
    setEditing(g);
    setName(g.name);
    setDescription(g.description ?? '');
    setActive(g.is_active);
    try {
      const { tenant_ids } = await announcementsAdminService.getGroupMembers(g.id);
      setSelectedTenants(new Set(tenant_ids));
    } catch {
      setSelectedTenants(new Set());
    }
    setDialogOpen(true);
  };

  const toggleTenant = (id: string, checked: boolean) => {
    setSelectedTenants((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const saveGroup = async () => {
    if (!name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      let gid = editing?.id;
      if (!gid) {
        const { id } = await announcementsAdminService.createGroup({
          name: name.trim(),
          description: description.trim() || null,
          is_active: active,
        });
        gid = id;
      } else {
        await announcementsAdminService.patchGroup(gid, {
          name: name.trim(),
          description: description.trim() || null,
          is_active: active,
        });
      }
      await announcementsAdminService.putGroupMembers(gid, Array.from(selectedTenants));
      toast({ title: 'Grupo guardado' });
      setDialogOpen(false);
      load();
    } catch (e) {
      toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Grupos de clientes</h1>
          <p className="text-sm text-muted-foreground">Segmentação para envios e visibilidade de atualizações.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/superadmin/announcements">Anúncios</Link>
          </Button>
          <Button onClick={openNew}>Novo grupo</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Grupos</CardTitle>
          <CardDescription>Membros = tenants (empresas)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Membros</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell>{g.member_count}</TableCell>
                    <TableCell>{g.is_active ? 'sim' : 'não'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(g)}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar grupo' : 'Novo grupo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} id="g-act" />
              <Label htmlFor="g-act">Ativo</Label>
            </div>
            <div className="space-y-2">
              <Label>Tenants</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-2">
                {tenants.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedTenants.has(t.id)}
                      onCheckedChange={(c) => toggleTenant(t.id, c === true)}
                    />
                    <span className="truncate">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveGroup} disabled={saving}>
              {saving ? 'A guardar…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
