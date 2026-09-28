import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';
import { formatCpfCnpjDigits } from '@/lib/brazilInputMasks';
import { formatCpfCnpjDisplay, isValidCpfOrCnpj } from '@/utils/cpfCnpj';

type PartnerDetail = {
  id: string;
  name: string;
  slug: string;
  public_name: string;
  product_name: string;
  program_type: string;
  partner_status: string;
  purchased_seats: number;
  used_seats_cache: number;
  unit_cost_cents: number;
  floor_price_cents: number | null;
  admin_email: string | null;
  cpf_cnpj: string | null;
  wholesale_plan_id: string | null;
  wholesale_status: string;
  wholesale_plan_name: string | null;
  wholesale_block_after_days: number | null;
  memberships: Array<{
    id: string;
    role: string;
    status: string;
    email: string | null;
  }>;
};

type WholesalePlanOption = {
  id: string;
  name: string;
  slug: string;
  seats_included: number;
  price_cents: number;
  status: string;
};

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
}

function centsToBrl(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  return (cents / 100).toFixed(2);
}

function brlToCents(raw: string): number {
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

export default function SuperAdminPartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const [addSeats, setAddSeats] = useState('5');
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [editForm, setEditForm] = useState({
    name: '',
    public_name: '',
    product_name: '',
    cpf_cnpj: '',
    floor_brl: '',
    unit_cost_brl: '',
  });
  const [events, setEvents] = useState<
    Array<{
      id: string;
      reason: string | null;
      customers_migrated: number;
      price_overrides_created: number;
      created_at: string;
    }>
  >([]);
  const [customers, setCustomers] = useState<
    Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
      admin_email: string | null;
      sell_plan_name: string | null;
      users_count: number;
    }>
  >([]);
  const [ledger, setLedger] = useState<
    Array<{
      id: string;
      delta_seats: number;
      balance_after: number;
      reason: string;
      note: string | null;
      created_at: string;
    }>
  >([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [wholesalePlans, setWholesalePlans] = useState<WholesalePlanOption[]>([]);
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignMode, setAssignMode] = useState<'grant' | 'charge'>('grant');
  const [blockAfterDays, setBlockAfterDays] = useState('');
  const [savingBlock, setSavingBlock] = useState(false);

  const syncEditForm = (d: PartnerDetail) => {
    setEditForm({
      name: d.name || '',
      public_name: d.public_name || '',
      product_name: d.product_name || '',
      cpf_cnpj: d.cpf_cnpj ? formatCpfCnpjDigits(onlyDigits(d.cpf_cnpj)) : '',
      floor_brl: centsToBrl(d.floor_price_cents),
      unit_cost_brl: centsToBrl(d.unit_cost_cents),
    });
  };

  const reload = async () => {
    if (!id) return;
    const res = await apiClient.get<PartnerDetail>(`/api/superadmin/partners/${id}`);
    if (res.error) {
      toast.error(res.error || 'Partner não encontrado');
      setDetail(null);
      return;
    }
    setDetail(res.data);
    if (res.data) {
      syncEditForm(res.data);
      setBlockAfterDays(
        res.data.wholesale_block_after_days == null
          ? ''
          : String(res.data.wholesale_block_after_days)
      );
    }
    setCustomersLoading(true);
    const [ev, cust, led, plans] = await Promise.all([
      apiClient.get<typeof events>(`/api/superadmin/partners/${id}/suspension-events`),
      apiClient.get<typeof customers>(`/api/superadmin/partners/${id}/customers`),
      apiClient.get<typeof ledger>(`/api/superadmin/partners/${id}/license-ledger?limit=20`),
      apiClient.get<WholesalePlanOption[]>('/api/superadmin/partner-wholesale-plans'),
    ]);
    if (!ev.error && ev.data) setEvents(ev.data);
    if (!led.error && Array.isArray(led.data)) setLedger(led.data);
    else setLedger([]);
    if (!plans.error && Array.isArray(plans.data)) {
      const active = plans.data.filter((p) => p.status === 'active' || p.status === 'draft');
      setWholesalePlans(active);
      if (!assignPlanId && active[0]) setAssignPlanId(active[0].id);
    }
    if (cust.error) {
      toast.error(cust.error || 'Falha ao listar clientes do canal');
      setCustomers([]);
    } else {
      setCustomers(Array.isArray(cust.data) ? cust.data : []);
    }
    setCustomersLoading(false);
  };

  useEffect(() => {
    void reload();
  }, [id]);

  const saveProfile = async () => {
    if (!id) return;
    if (!editForm.name.trim() || !editForm.public_name.trim() || !editForm.product_name.trim()) {
      toast.error('Nome interno, público e produto são obrigatórios');
      return;
    }
    const floor = brlToCents(editForm.floor_brl);
    const unit = brlToCents(editForm.unit_cost_brl);
    if (!Number.isFinite(floor) || !Number.isFinite(unit)) {
      toast.error('Piso e custo unitário inválidos');
      return;
    }
    const docDigits = onlyDigits(editForm.cpf_cnpj);
    if (docDigits && !isValidCpfOrCnpj(docDigits)) {
      toast.error('CPF/CNPJ inválido');
      return;
    }

    setSavingProfile(true);
    const res = await apiClient.patch(`/api/superadmin/partners/${id}`, {
      name: editForm.name.trim(),
      public_name: editForm.public_name.trim(),
      product_name: editForm.product_name.trim(),
      floor_price_cents: floor,
      unit_cost_cents: unit,
      cpf_cnpj: docDigits || null,
    });
    setSavingProfile(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao salvar cadastro');
      return;
    }
    toast.success('Cadastro atualizado');
    await reload();
  };

  const topUp = async () => {
    if (!id) return;
    const n = Number(addSeats);
    if (!Number.isInteger(n) || n < 1) {
      toast.error('Informe um inteiro ≥ 1');
      return;
    }
    setSaving(true);
    const res = await apiClient.patch(`/api/superadmin/partners/${id}`, { add_seats: n });
    setSaving(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao alocar');
      return;
    }
    toast.success(`+${n} licenças alocadas`);
    await reload();
  };

  const saveBlockOverride = async () => {
    if (!id) return;
    const raw = blockAfterDays.trim();
    let wholesale_block_after_days: number | null = null;
    if (raw !== '') {
      const n = Math.floor(Number(raw));
      if (!Number.isFinite(n) || n < 0 || n > 90) {
        toast.error('Dias de bloqueio: inteiro 0–90 (vazio = global)');
        return;
      }
      wholesale_block_after_days = n;
    }
    setSavingBlock(true);
    const res = await apiClient.patch(`/api/superadmin/partners/${id}`, {
      wholesale_block_after_days,
    });
    setSavingBlock(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao salvar override');
      return;
    }
    toast.success(
      wholesale_block_after_days == null
        ? 'Override removido — usa setting global'
        : `Override: bloqueia após ${wholesale_block_after_days} dia(s)`
    );
    await reload();
  };

  const assignWholesale = async () => {
    if (!id || !assignPlanId) {
      toast.error('Selecione um plano atacado');
      return;
    }
    setSaving(true);
    const res = await apiClient.post<{
      mode: string;
      seats_credited?: number;
      settled?: boolean;
      paymentUrls?: { invoiceUrl?: string; pixCopyPaste?: string } | null;
      error?: string;
    }>(`/api/superadmin/partners/${id}/wholesale/assign`, {
      wholesale_plan_id: assignPlanId,
      mode: assignMode,
      payment_method: 'PIX',
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao atrelar plano');
      return;
    }
    if (assignMode === 'grant') {
      toast.success(`Plano atrelado (grant). +${res.data?.seats_credited ?? 0} seats`);
    } else if (res.data?.settled) {
      toast.success('Cobrança R$ 0 liquidada — plano ativo');
    } else {
      toast.success('Cobrança Platform criada — Partner pode pagar no painel');
    }
    await reload();
  };

  const suspend = async () => {
    if (!id) return;
    const ok = window.confirm(
      'Suspender este Partner? Clientes do canal migrarão para a Platform mantendo o preço atual (D15).'
    );
    if (!ok) return;
    setSaving(true);
    const res = await apiClient.post<{
      customers_migrated: number;
      price_overrides_created: number;
      error?: string;
    }>(`/api/superadmin/partners/${id}/suspend`, {
      reason: suspendReason.trim() || undefined,
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao suspender');
      return;
    }
    toast.success(
      `Suspenso. Migrados: ${res.data?.customers_migrated ?? 0} · overrides: ${res.data?.price_overrides_created ?? 0}`
    );
    await reload();
  };

  if (!detail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/superadmin/partners')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" asChild>
        <Link to="/superadmin/partners">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Partners
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{detail.public_name}</h1>
          <p className="text-sm text-muted-foreground">
            {detail.slug} · {detail.product_name}
            {detail.cpf_cnpj ? ` · ${formatCpfCnpjDisplay(detail.cpf_cnpj)}` : ''}
          </p>
          {detail.admin_email ? (
            <p className="text-xs text-muted-foreground">Admin: {detail.admin_email}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{detail.program_type}</Badge>
          <Badge>{detail.partner_status}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadastro do Partner</CardTitle>
          <CardDescription>Visualize e edite dados comerciais / fiscais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome interno</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={detail.slug} disabled />
            </div>
            <div className="space-y-2">
              <Label>Nome público</Label>
              <Input
                value={editForm.public_name}
                onChange={(e) => setEditForm((f) => ({ ...f, public_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do produto</Label>
              <Input
                value={editForm.product_name}
                onChange={(e) => setEditForm((f) => ({ ...f, product_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>CPF ou CNPJ</Label>
              <Input
                inputMode="numeric"
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                value={editForm.cpf_cnpj}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    cpf_cnpj: formatCpfCnpjDigits(onlyDigits(e.target.value)),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Piso de venda (R$)</Label>
              <Input
                value={editForm.floor_brl}
                onChange={(e) => setEditForm((f) => ({ ...f, floor_brl: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Custo/licença Platform (R$)</Label>
              <Input
                value={editForm.unit_cost_brl}
                onChange={(e) => setEditForm((f) => ({ ...f, unit_cost_brl: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={savingProfile || !detail}
              onClick={() => detail && syncEditForm(detail)}
            >
              Descartar
            </Button>
            <Button onClick={() => void saveProfile()} disabled={savingProfile}>
              {savingProfile ? 'Salvando…' : 'Salvar cadastro'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pool de licenças</CardTitle>
          <CardDescription>1 licença = 1 usuário nos clientes do canal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Usados <strong>{detail.used_seats_cache}</strong> / comprados{' '}
            <strong>{detail.purchased_seats}</strong>
            {detail.floor_price_cents != null ? (
              <>
                {' '}
                · piso R$ {(detail.floor_price_cents / 100).toFixed(2)} · custo R${' '}
                {(detail.unit_cost_cents / 100).toFixed(2)}
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Alocar mais licenças</Label>
              <Input
                type="number"
                min={1}
                className="w-32"
                value={addSeats}
                onChange={(e) => setAddSeats(e.target.value)}
              />
            </div>
            <Button onClick={() => void topUp()} disabled={saving}>
              {saving ? 'Salvando…' : 'Alocar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plano atacado (Platform)</CardTitle>
          <CardDescription>
            Atrela Partner a um plano wholesale — grant (sem Asaas) ou gera cobrança Platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Status{' '}
            <Badge variant="outline">{detail.wholesale_status || 'none'}</Badge>
            {detail.wholesale_plan_name ? (
              <>
                {' '}
                · plano <strong>{detail.wholesale_plan_name}</strong>
              </>
            ) : (
              <span className="text-muted-foreground"> · nenhum plano ativo</span>
            )}
          </p>
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3">
            <div className="space-y-2">
              <Label htmlFor="block-override">Bloqueio após vencimento (dias)</Label>
              <Input
                id="block-override"
                type="number"
                min={0}
                max={90}
                className="w-28"
                placeholder="Global"
                value={blockAfterDays}
                onChange={(e) => setBlockAfterDays(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Vazio = setting global Super Admin. Override 0–90 só para este Partner.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={savingBlock}
              onClick={() => void saveBlockOverride()}
            >
              {savingBlock ? 'Salvando…' : 'Salvar bloqueio'}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] space-y-2">
              <Label>Plano</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={assignPlanId}
                onChange={(e) => setAssignPlanId(e.target.value)}
              >
                {wholesalePlans.length === 0 ? (
                  <option value="">Nenhum plano cadastrado</option>
                ) : (
                  wholesalePlans.map((p) => {
                    const avg =
                      p.seats_included > 0
                        ? (Math.round(p.price_cents / p.seats_included) / 100)
                            .toFixed(2)
                            .replace('.', ',')
                        : null;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.seats_included} seats · R${' '}
                        {(p.price_cents / 100).toFixed(2)}
                        {avg ? ` · R$ ${avg}/usuário` : ''}
                      </option>
                    );
                  })
                )}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Modo</Label>
              <select
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={assignMode}
                onChange={(e) => setAssignMode(e.target.value as 'grant' | 'charge')}
              >
                <option value="grant">Grant (sem cobrança)</option>
                <option value="charge">Cobrar (Asaas Platform)</option>
              </select>
            </div>
            <Button
              onClick={() => void assignWholesale()}
              disabled={saving || !assignPlanId}
            >
              {saving ? 'Processando…' : 'Atrelar plano'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ledger de licenças</CardTitle>
          <CardDescription>Auditoria de grants e ajustes (M5-W)</CardDescription>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lançamento ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {ledger.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                >
                  <span>
                    <Badge variant="outline" className="mr-2 font-mono text-[10px]">
                      {row.reason}
                    </Badge>
                    <span className={row.delta_seats >= 0 ? 'text-emerald-700' : 'text-destructive'}>
                      {row.delta_seats >= 0 ? '+' : ''}
                      {row.delta_seats}
                    </span>
                    <span className="text-muted-foreground"> → saldo {row.balance_after}</span>
                    {row.note ? (
                      <span className="ml-2 text-xs text-muted-foreground">{row.note}</span>
                    ) : null}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(row.created_at).toLocaleString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes do canal</CardTitle>
          <CardDescription>
            Customer tenants deste Partner. Não entram na lista Empresas (venda direta).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customersLoading ? (
            <p className="text-sm text-muted-foreground">Carregando carteira…</p>
          ) : customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente no canal ainda.</p>
          ) : (
            <div className="divide-y rounded-md border text-sm">
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                  onClick={() => navigate(`/superadmin/clients/${c.id}`)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.admin_email || c.slug} · {c.sell_plan_name || 'sem plano'} · {c.status}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.users_count} usuário{c.users_count === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Memberships</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {detail.memberships.map((m) => (
            <div key={m.id} className="flex justify-between border-b py-2 last:border-0">
              <span>{m.email || m.id}</span>
              <span className="text-muted-foreground">
                {m.role} · {m.status}
              </span>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">
            Admin: {detail.admin_email || '—'} · painel Partner em <code>/partner</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suspensão / migração D15</CardTitle>
          <CardDescription>
            Clientes continuam ativos na Platform com o preço que pagavam (override fixed_price).
            WL e login Partner são bloqueados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.partner_status === 'suspended' ? (
            <Badge variant="destructive">Já suspenso</Badge>
          ) : null}
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Input
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Contrato encerrado, inadimplência…"
              disabled={detail.partner_status === 'suspended' && events.length > 0}
            />
          </div>
          <Button
            variant="destructive"
            disabled={saving}
            onClick={() => void suspend()}
          >
            {detail.partner_status === 'suspended'
              ? 'Reexecutar migração (idempotente)'
              : 'Suspender e migrar clientes'}
          </Button>
          {events.length > 0 ? (
            <div className="divide-y rounded-md border text-sm">
              {events.map((e) => (
                <div key={e.id} className="px-3 py-2">
                  <div className="font-medium">{new Date(e.created_at).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    migrados {e.customers_migrated} · overrides {e.price_overrides_created}
                    {e.reason ? ` · ${e.reason}` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
