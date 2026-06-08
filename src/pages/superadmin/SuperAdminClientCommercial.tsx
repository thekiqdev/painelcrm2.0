import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { useTenantDetail } from '@/contexts/TenantDetailContext';
import {
  createTenantCommercialOverride,
  disableTenantCommercialOverride,
  fetchTenantCommercialOverrides,
  fetchTenantCommercialSummary,
  formatBrlCents,
  OVERRIDE_STATUS_LABELS,
  OVERRIDE_TYPE_LABELS,
  patchTenantCommercialOverride,
  simulateTenantCommercialPrice,
  type CommercialOverrideInput,
  type CommercialOverrideItem,
  type CommercialOverrideType,
  type TenantCommercialSummary,
} from '@/services/superadminTenantCommercial';
import { ArrowDown, Loader2, Plus, Receipt, Sparkles } from 'lucide-react';

const INTERVAL_OPTIONS = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semi_annual', label: 'Semestral' },
  { value: 'yearly', label: 'Anual' },
] as const;

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const emptyForm: CommercialOverrideInput = {
  override_type: 'fixed_price',
  value_cents: null,
  percent_off: null,
  valid_from: new Date().toISOString(),
  valid_until: null,
  reason: '',
  plan_id: null,
  billing_interval: null,
};

export default function SuperAdminClientCommercial() {
  const { id: tenantId } = useParams<{ id: string }>();
  const { tenant } = useTenantDetail();
  const [summary, setSummary] = useState<TenantCommercialSummary | null>(null);
  const [history, setHistory] = useState<CommercialOverrideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<CommercialOverrideItem | null>(null);
  const [editing, setEditing] = useState<CommercialOverrideItem | null>(null);
  const [form, setForm] = useState<CommercialOverrideInput>(emptyForm);
  const [draftSimulation, setDraftSimulation] = useState<TenantCommercialSummary['simulation'] | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [sumRes, histRes] = await Promise.all([
      fetchTenantCommercialSummary(tenantId),
      fetchTenantCommercialOverrides(tenantId),
    ]);
    if (sumRes.error) toast.error(sumRes.error);
    else if (sumRes.data) setSummary(sumRes.data);
    if (histRes.error) toast.error(histRes.error);
    else if (histRes.data) setHistory(histRes.data.items);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runDraftSimulation = useCallback(async () => {
    if (!tenantId || !dialogOpen) return;
    setSimulating(true);
    const res = await simulateTenantCommercialPrice(tenantId, form);
    setSimulating(false);
    if (res.error) return;
    if (res.data?.simulation) setDraftSimulation(res.data.simulation);
  }, [tenantId, dialogOpen, form]);

  useEffect(() => {
    if (!dialogOpen) return;
    const t = setTimeout(() => void runDraftSimulation(), 300);
    return () => clearTimeout(t);
  }, [dialogOpen, form, runDraftSimulation]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      valid_from: new Date().toISOString(),
      plan_id: tenant?.plan_id ?? null,
    });
    setDraftSimulation(null);
    setDialogOpen(true);
  };

  const openEdit = (item: CommercialOverrideItem) => {
    setEditing(item);
    setForm({
      override_type: item.override_type,
      value_cents: item.value_cents,
      percent_off: item.percent_off,
      valid_from: item.valid_from,
      valid_until: item.valid_until,
      reason: item.reason,
      plan_id: item.plan_id,
      billing_interval: item.billing_interval,
    });
    setDraftSimulation(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    const payload: CommercialOverrideInput = {
      ...form,
      reason: form.reason?.trim() || null,
      valid_from: form.valid_from ?? new Date().toISOString(),
    };
    const res = editing
      ? await patchTenantCommercialOverride(tenantId, editing.id, payload)
      : await createTenantCommercialOverride(tenantId, payload);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(editing ? 'Override atualizado.' : 'Override criado.');
    setDialogOpen(false);
    void load();
  };

  const handleDisable = async (item: CommercialOverrideItem) => {
    if (!tenantId) return;
    if (!window.confirm('Desativar este override comercial?')) return;
    const res = await disableTenantCommercialOverride(tenantId, item.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Override desativado.');
    void load();
  };

  const simulation = useMemo(() => {
    if (dialogOpen && draftSimulation) return draftSimulation;
    return summary?.simulation ?? null;
  }, [dialogOpen, draftSimulation, summary]);

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Comercial</h2>
          <p className="text-sm text-muted-foreground">
            Condições comerciais individuais sem alterar o catálogo global de planos.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo override
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Plano atual</CardDescription>
            <CardTitle className="text-xl">{summary?.plan.name ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Preço catálogo</CardDescription>
            <CardTitle className="text-xl">
              {summary ? formatBrlCents(summary.catalog_price_cents) : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Preço efetivo</CardDescription>
            <CardTitle className="text-xl text-crm-primary">
              {summary ? formatBrlCents(summary.effective_price_cents) : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Origem</CardDescription>
            <CardTitle className="text-base font-medium">
              <Badge variant={summary?.price_source === 'Override Comercial' ? 'default' : 'secondary'}>
                {summary?.price_source ?? '—'}
              </Badge>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Simular próxima cobrança
          </CardTitle>
          <CardDescription>Calculado pelo backend via resolveTenantCommercialPrice()</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {simulation ? (
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-muted-foreground">Preço catálogo</p>
                <p className="text-lg font-semibold">{formatBrlCents(simulation.catalog_price_cents)}</p>
              </div>
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground">Desconto / ajuste</p>
                <p className="text-lg font-semibold">
                  {simulation.discount_cents > 0
                    ? formatBrlCents(simulation.discount_cents)
                    : '—'}
                </p>
              </div>
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground">Valor final</p>
                <p className="text-lg font-bold text-crm-primary">
                  {formatBrlCents(simulation.final_price_cents)}
                </p>
              </div>
              <Badge variant="outline" className="ml-auto">
                {simulation.source}
              </Badge>
            </div>
          ) : (
            <p className="text-muted-foreground">Sem dados de simulação.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" />
            Histórico de overrides
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Catálogo</TableHead>
                <TableHead>Final</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado por</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhum override registrado.
                  </TableCell>
                </TableRow>
              ) : (
                history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{new Date(item.created_at).toLocaleString('pt-BR')}</TableCell>
                    <TableCell>{OVERRIDE_TYPE_LABELS[item.override_type]}</TableCell>
                    <TableCell>{formatBrlCents(item.catalog_price_cents)}</TableCell>
                    <TableCell>{formatBrlCents(item.final_price_cents)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.status === 'active'
                            ? 'default'
                            : item.status === 'expired'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {OVERRIDE_STATUS_LABELS[item.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.created_by_email ?? '—'}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setDetailItem(item)}>
                        Detalhes
                      </Button>
                      {item.status === 'active' ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                            Editar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void handleDisable(item)}>
                            Desativar
                          </Button>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar override' : 'Novo override comercial'}</DialogTitle>
            <DialogDescription>
              O valor efetivo é calculado no backend; o catálogo global permanece inalterado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={form.override_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, override_type: v as CommercialOverrideType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OVERRIDE_TYPE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.override_type === 'fixed_price' ? (
              <div className="space-y-2">
                <Label>Preço final (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.value_cents != null ? (form.value_cents / 100).toFixed(2) : ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      value_cents: Math.round(parseFloat(e.target.value || '0') * 100),
                    }))
                  }
                />
              </div>
            ) : null}

            {form.override_type === 'percent_discount' ? (
              <div className="space-y-2">
                <Label>Percentual (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.percent_off ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, percent_off: parseFloat(e.target.value || '0') }))
                  }
                />
              </div>
            ) : null}

            {form.override_type === 'amount_discount' ? (
              <div className="space-y-2">
                <Label>Desconto em reais (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.value_cents != null ? (form.value_cents / 100).toFixed(2) : ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      value_cents: Math.round(parseFloat(e.target.value || '0') * 100),
                    }))
                  }
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Motivo</Label>
              <Textarea
                value={form.reason ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Validade inicial</Label>
                <Input
                  type="datetime-local"
                  value={toDatetimeLocalValue(form.valid_from)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, valid_from: fromDatetimeLocalValue(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Validade final (opcional)</Label>
                <Input
                  type="datetime-local"
                  value={toDatetimeLocalValue(form.valid_until)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, valid_until: fromDatetimeLocalValue(e.target.value) }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Intervalo específico (opcional)</Label>
              <Select
                value={form.billing_interval ?? '__any'}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    billing_interval: v === '__any' ? null : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer intervalo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">Qualquer intervalo</SelectItem>
                  {INTERVAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {draftSimulation ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Prévia da simulação</p>
                <p>
                  Catálogo: {formatBrlCents(draftSimulation.catalog_price_cents)} → Final:{' '}
                  {formatBrlCents(draftSimulation.final_price_cents)}
                </p>
              </div>
            ) : null}
            {simulating ? (
              <p className="text-xs text-muted-foreground">Simulando…</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailItem != null} onOpenChange={(o) => !o && setDetailItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do override</DialogTitle>
          </DialogHeader>
          {detailItem ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Tipo:</span>{' '}
                {OVERRIDE_TYPE_LABELS[detailItem.override_type]}
              </p>
              <p>
                <span className="text-muted-foreground">Status:</span>{' '}
                {OVERRIDE_STATUS_LABELS[detailItem.status]}
              </p>
              <p>
                <span className="text-muted-foreground">Catálogo / Final:</span>{' '}
                {formatBrlCents(detailItem.catalog_price_cents)} →{' '}
                {formatBrlCents(detailItem.final_price_cents)}
              </p>
              <p>
                <span className="text-muted-foreground">Motivo:</span> {detailItem.reason ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Válido de:</span>{' '}
                {new Date(detailItem.valid_from).toLocaleString('pt-BR')}
              </p>
              <p>
                <span className="text-muted-foreground">Válido até:</span>{' '}
                {detailItem.valid_until
                  ? new Date(detailItem.valid_until).toLocaleString('pt-BR')
                  : 'Sem término'}
              </p>
              <p>
                <span className="text-muted-foreground">Criado por:</span>{' '}
                {detailItem.created_by_email ?? '—'}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
