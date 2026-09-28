import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Archive } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';

const INTERVALS = [
  { key: 'monthly', label: 'Mensal' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'semi_annual', label: 'Semestral' },
  { key: 'yearly', label: 'Anual' },
] as const;

type WholesaleStatus = 'draft' | 'active' | 'archived';

type WholesalePlan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: WholesaleStatus;
  seats_included: number;
  price_cents: number;
  billing_interval: string;
  envelope_plan_id: string | null;
  envelope_plan_name?: string | null;
  unit_overage_cents: number | null;
  sort_order: number;
};

type EnvelopePlan = { id: string; name: string };

function centsToBrl(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function brlToCents(raw: string): number {
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

/** Média do pacote: preço do plano ÷ seats incluídos. */
function averagePerSeatCents(priceCents: number, seats: number): number | null {
  if (!Number.isFinite(priceCents) || !Number.isFinite(seats) || seats <= 0) return null;
  return Math.round(priceCents / seats);
}

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  status: 'draft' as WholesaleStatus,
  seats_included: '10',
  price_brl: '499',
  billing_interval: 'monthly',
  envelope_plan_id: '',
  unit_overage_brl: '',
  sort_order: '0',
};

export default function SuperAdminPartnerWholesalePlans() {
  const [items, setItems] = useState<WholesalePlan[]>([]);
  const [envelopes, setEnvelopes] = useState<EnvelopePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WholesalePlan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [blockAfterDays, setBlockAfterDays] = useState('3');
  const [blockLoaded, setBlockLoaded] = useState(false);
  const [savingBlock, setSavingBlock] = useState(false);
  const [syncingBlock, setSyncingBlock] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const q = includeArchived ? '?include_archived=1' : '';
    const res = await apiClient.get<WholesalePlan[]>(`/api/superadmin/partner-wholesale-plans${q}`);
    setLoading(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao listar planos atacado');
      setItems([]);
      return;
    }
    setItems(Array.isArray(res.data) ? res.data : []);
  }, [includeArchived]);

  const reloadBlockSettings = useCallback(async () => {
    const res = await apiClient.get<{ block_after_days: number }>(
      '/api/superadmin/partner-wholesale-plans/settings/block'
    );
    if (res.error) {
      toast.error(res.error || 'Falha ao carregar bloqueio');
      return;
    }
    setBlockAfterDays(String(res.data?.block_after_days ?? 3));
    setBlockLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void reloadBlockSettings();
  }, [reloadBlockSettings]);

  useEffect(() => {
    void (async () => {
      const res = await apiClient.get<EnvelopePlan[]>('/api/superadmin/plans');
      if (res.data?.length) setEnvelopes(res.data);
    })();
  }, []);

  const saveBlockSettings = async () => {
    const n = Math.floor(Number(blockAfterDays));
    if (!Number.isFinite(n) || n < 0 || n > 90) {
      toast.error('Dias após vencimento: inteiro entre 0 e 90');
      return;
    }
    setSavingBlock(true);
    const res = await apiClient.put<{ block_after_days: number }>(
      '/api/superadmin/partner-wholesale-plans/settings/block',
      { block_after_days: n }
    );
    setSavingBlock(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao salvar');
      return;
    }
    setBlockAfterDays(String(res.data?.block_after_days ?? n));
    toast.success('Bloqueio atualizado');
  };

  const syncPastDue = async () => {
    setSyncingBlock(true);
    const res = await apiClient.post<{ scanned: number; marked: number; block_after_days: number }>(
      '/api/superadmin/partner-wholesale-plans/settings/block/sync',
      {}
    );
    setSyncingBlock(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao sincronizar');
      return;
    }
    toast.success(
      `Sync: ${res.data?.marked ?? 0} marcado(s) past_due de ${res.data?.scanned ?? 0} vistos (N=${res.data?.block_after_days})`
    );
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      envelope_plan_id: envelopes[0]?.id || '',
    });
    setDialogOpen(true);
  };

  const openEdit = (p: WholesalePlan) => {
    setEditing(p);
    setForm({
      name: p.name,
      slug: p.slug,
      description: p.description || '',
      status: p.status,
      seats_included: String(p.seats_included),
      price_brl: centsToBrl(p.price_cents),
      billing_interval: p.billing_interval,
      envelope_plan_id: p.envelope_plan_id || '',
      unit_overage_brl:
        p.unit_overage_cents == null ? '' : centsToBrl(p.unit_overage_cents),
      sort_order: String(p.sort_order ?? 0),
    });
    setDialogOpen(true);
  };

  const slugFromName = () => {
    const slug = (form.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setForm((f) => ({ ...f, slug: f.slug || slug }));
  };

  const save = async () => {
    const seats = Number(form.seats_included);
    const price = brlToCents(form.price_brl);
    const overageRaw = form.unit_overage_brl.trim();
    const overage = overageRaw === '' ? null : brlToCents(overageRaw);
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Nome e slug são obrigatórios');
      return;
    }
    if (!Number.isInteger(seats) || seats < 0) {
      toast.error('Seats deve ser inteiro ≥ 0');
      return;
    }
    if (!Number.isFinite(price)) {
      toast.error('Preço inválido');
      return;
    }
    if (overage != null && !Number.isFinite(overage)) {
      toast.error('Custo avulso inválido');
      return;
    }

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      description: form.description.trim() || null,
      status: form.status,
      seats_included: seats,
      price_cents: price,
      billing_interval: form.billing_interval,
      envelope_plan_id: form.envelope_plan_id || null,
      unit_overage_cents: overage,
      sort_order: Number(form.sort_order) || 0,
    };

    setSaving(true);
    const res = editing
      ? await apiClient.put(`/api/superadmin/partner-wholesale-plans/${editing.id}`, payload)
      : await apiClient.post('/api/superadmin/partner-wholesale-plans', payload);
    setSaving(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao salvar');
      return;
    }
    toast.success(editing ? 'Plano atualizado' : 'Plano criado');
    setDialogOpen(false);
    await reload();
  };

  const archive = async (p: WholesalePlan) => {
    if (!window.confirm(`Arquivar o plano "${p.name}"?`)) return;
    const res = await apiClient.delete(`/api/superadmin/partner-wholesale-plans/${p.id}`);
    if (res.error) {
      toast.error(res.error || 'Falha ao arquivar');
      return;
    }
    toast.success('Plano arquivado');
    await reload();
  };

  const statusBadge = (s: WholesaleStatus) => {
    if (s === 'active') return <Badge>Ativo</Badge>;
    if (s === 'draft') return <Badge variant="secondary">Rascunho</Badge>;
    return <Badge variant="outline">Arquivado</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planos Partner (atacado)</h1>
          <p className="text-sm text-muted-foreground">
            Planos que o Partner contrata da Platform (M5-W). Checkout na Sprint 2.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIncludeArchived((v) => !v)}
          >
            {includeArchived ? 'Ocultar arquivados' : 'Incluir arquivados'}
          </Button>
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo plano
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bloqueio por inadimplência</CardTitle>
          <CardDescription>
            Dias após o vencimento da fatura Platform para marcar o canal como past_due (congela
            crescimento). Não bloqueia no dia do vencimento. Paywall do painel Partner: Sprint 2.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="block-after-days">Dias após vencimento</Label>
            <Input
              id="block-after-days"
              type="number"
              min={0}
              max={90}
              className="w-32"
              disabled={!blockLoaded}
              value={blockAfterDays}
              onChange={(e) => setBlockAfterDays(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={savingBlock || !blockLoaded}
            onClick={() => void saveBlockSettings()}
          >
            {savingBlock ? 'Salvando…' : 'Salvar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={syncingBlock}
            onClick={() => void syncPastDue()}
          >
            {syncingBlock ? 'Sincronizando…' : 'Sincronizar past_due agora'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>Seats incluídos, preço e envelope técnico (features).</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum plano atacado cadastrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Média/usuário</TableHead>
                  <TableHead>Intervalo</TableHead>
                  <TableHead>Envelope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.slug}</div>
                    </TableCell>
                    <TableCell>{p.seats_included}</TableCell>
                    <TableCell>R$ {centsToBrl(p.price_cents)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {averagePerSeatCents(p.price_cents, p.seats_included) != null
                        ? `R$ ${centsToBrl(averagePerSeatCents(p.price_cents, p.seats_included)!)}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {INTERVALS.find((i) => i.key === p.billing_interval)?.label ||
                        p.billing_interval}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.envelope_plan_name || '—'}
                    </TableCell>
                    <TableCell>{statusBadge(p.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(p)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {p.status !== 'archived' ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => void archive(p)}
                            title="Arquivar"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar plano atacado' : 'Novo plano atacado'}</DialogTitle>
            <DialogDescription>
              Define o pacote de seats e o preço que a Platform cobra do Partner.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={slugFromName}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as WholesaleStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="archived">Arquivado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Seats incluídos</Label>
              <Input
                type="number"
                min={0}
                value={form.seats_included}
                onChange={(e) => setForm((f) => ({ ...f, seats_included: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Preço (R$)</Label>
              <Input
                value={form.price_brl}
                onChange={(e) => setForm((f) => ({ ...f, price_brl: e.target.value }))}
              />
            </div>
            {(() => {
              const seats = Number(form.seats_included);
              const price = brlToCents(form.price_brl);
              const avg = averagePerSeatCents(price, seats);
              if (avg == null) return null;
              return (
                <div className="sm:col-span-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">
                  Média:{' '}
                  <strong>R$ {centsToBrl(avg)}</strong> por usuário incluso
                  <span className="text-muted-foreground">
                    {' '}
                    (R$ {form.price_brl || '0'} ÷ {seats} seats)
                  </span>
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label>Intervalo</Label>
              <Select
                value={form.billing_interval}
                onValueChange={(v) => setForm((f) => ({ ...f, billing_interval: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((i) => (
                    <SelectItem key={i.key} value={i.key}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Custo seat avulso (R$)</Label>
              <Input
                placeholder="Obrigatório para vender extras"
                value={form.unit_overage_brl}
                onChange={(e) => setForm((f) => ({ ...f, unit_overage_brl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Preço de cada seat extra em Licenças. Sem este valor o Partner não consegue
                comprar avulsas.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Plano envelope (features)</Label>
              <Select
                value={form.envelope_plan_id || '__none__'}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    envelope_plan_id: v === '__none__' ? '' : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {envelopes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
