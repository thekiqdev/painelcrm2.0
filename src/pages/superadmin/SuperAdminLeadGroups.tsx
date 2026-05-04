import { useEffect, useMemo, useState } from 'react';
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
import {
  superadminLeadsService,
  type SuperadminLeadGroupRow,
  type SuperadminLeadPickerRow,
} from '@/services/superadminLeads';
import { toast } from '@/hooks/use-toast';

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasUsablePhone(phone: string | null | undefined): boolean {
  if (!phone?.trim()) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8;
}

function hasValidEmail(email: string | null | undefined): boolean {
  const e = email?.trim();
  return Boolean(e && EMAIL_OK.test(e));
}

export default function SuperAdminLeadGroups() {
  const [groups, setGroups] = useState<SuperadminLeadGroupRow[]>([]);
  const [picker, setPicker] = useState<SuperadminLeadPickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SuperadminLeadGroupRow | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    Promise.all([superadminLeadsService.listGroups(), superadminLeadsService.listPicker()])
      .then(([g, p]) => {
        setGroups(g);
        setPicker(p);
      })
      .catch((e) => toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filteredPicker = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return picker;
    return picker.filter(
      (x) =>
        x.name.toLowerCase().includes(q) ||
        (x.phone ?? '').includes(q) ||
        (x.email ?? '').toLowerCase().includes(q) ||
        (x.company ?? '').toLowerCase().includes(q),
    );
  }, [picker, filter]);

  const openNew = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setActive(true);
    setSelectedLeads(new Set());
    setFilter('');
    setDialogOpen(true);
  };

  const openEdit = async (g: SuperadminLeadGroupRow) => {
    setEditing(g);
    setName(g.name);
    setDescription(g.description ?? '');
    setActive(g.is_active);
    setFilter('');
    try {
      const { lead_ids } = await superadminLeadsService.getGroupMembers(g.id);
      setSelectedLeads(new Set(lead_ids));
    } catch {
      setSelectedLeads(new Set());
    }
    setDialogOpen(true);
  };

  const toggleLead = (id: string, checked: boolean) => {
    setSelectedLeads((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const addIdsToSelection = (ids: string[]) => {
    setSelectedLeads((prev) => {
      const n = new Set(prev);
      for (const id of ids) n.add(id);
      return n;
    });
  };

  /** Inclui na seleção todos os contactos que correspondem ao filtro (lista completa se o filtro estiver vazio). */
  const selectAllFiltered = () => {
    addIdsToSelection(filteredPicker.map((x) => x.id));
  };

  const selectFilteredWithPhone = () => {
    addIdsToSelection(filteredPicker.filter((x) => hasUsablePhone(x.phone)).map((x) => x.id));
  };

  const selectFilteredWithEmail = () => {
    addIdsToSelection(filteredPicker.filter((x) => hasValidEmail(x.email)).map((x) => x.id));
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
        const { id } = await superadminLeadsService.createGroup({
          name: name.trim(),
          description: description.trim() || null,
          is_active: active,
        });
        gid = id;
      } else {
        await superadminLeadsService.patchGroup(gid, {
          name: name.trim(),
          description: description.trim() || null,
          is_active: active,
        });
      }
      await superadminLeadsService.putGroupMembers(gid, Array.from(selectedLeads));
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
          <h1 className="text-2xl font-bold tracking-tight">Grupos de leads</h1>
          <p className="text-sm text-muted-foreground">
            Segmentação dos contactos da plataforma — utilizável nos disparos de anúncios (WhatsApp).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/superadmin/leads">Leads</Link>
          </Button>
          <Button onClick={openNew}>Novo grupo</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Grupos</CardTitle>
          <CardDescription>Membros = leads importados ou criados manualmente</CardDescription>
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
              <Switch checked={active} onCheckedChange={setActive} id="lg-act" />
              <Label htmlFor="lg-act">Ativo</Label>
            </div>
            <div className="space-y-2">
              <Label>Filtrar leads</Label>
              <Input placeholder="Nome, telefone, e-mail…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Os botões abaixo aplicam-se aos contactos desta lista filtrada (sem filtro = todos os carregados).
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <Label className="sm:mb-0">Leads ({selectedLeads.size} selecionados)</Label>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="secondary" size="sm" onClick={selectAllFiltered}>
                    Selecionar todos
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={selectFilteredWithPhone}>
                    Com telefone
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={selectFilteredWithEmail}>
                    Com e-mail
                  </Button>
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto rounded-md border p-2 space-y-2">
                {filteredPicker.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem resultados.</p>
                ) : (
                  filteredPicker.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedLeads.has(t.id)}
                        onCheckedChange={(c) => toggleLead(t.id, c === true)}
                      />
                      <span className="truncate flex-1">{t.name}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[100px]">{t.phone ?? '—'}</span>
                    </label>
                  ))
                )}
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
