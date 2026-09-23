import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';
import { formatCpfCnpjDigits } from '@/lib/brazilInputMasks';
import { isValidCpfOrCnpj } from '@/utils/cpfCnpj';

type WholesalePlan = {
  id: string;
  name: string;
  slug: string;
  status: string;
  seats_included: number;
  price_cents: number;
  billing_interval: string;
};

function brlToCents(raw: string): number {
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
}

function intervalLabel(i: string): string {
  if (i === 'yearly') return 'ano';
  if (i === 'semi_annual') return 'semestre';
  if (i === 'quarterly') return 'trimestre';
  return 'mês';
}

const NONE_PLAN = '__none__';

export default function SuperAdminPartnerNew() {
  const navigate = useNavigate();
  const [wholesalePlans, setWholesalePlans] = useState<WholesalePlan[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    public_name: '',
    product_name: '',
    cpf_cnpj: '',
    admin_email: '',
    admin_name: '',
    admin_password: '',
    wholesale_plan_id: '',
    purchased_seats: '0',
    floor_brl: '99',
    unit_cost_brl: '49',
  });

  useEffect(() => {
    void (async () => {
      const res = await apiClient.get<WholesalePlan[]>('/api/superadmin/partner-wholesale-plans');
      if (res.data?.length) {
        setWholesalePlans(res.data.filter((p) => p.status === 'active' || p.status === 'draft'));
      }
    })();
  }, []);

  const handleSlugFromName = () => {
    const slug =
      (form.name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'partner';
    setForm((f) => ({
      ...f,
      slug,
      public_name: f.public_name || f.name,
      product_name: f.product_name || f.name,
    }));
  };

  const selectedWholesale = wholesalePlans.find((p) => p.id === form.wholesale_plan_id) ?? null;

  const save = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Nome e slug são obrigatórios');
      return;
    }
    if (!form.admin_email.trim()) {
      toast.error('E-mail do admin é obrigatório');
      return;
    }
    const seats = Number(form.purchased_seats);
    const floor = brlToCents(form.floor_brl);
    const unit = brlToCents(form.unit_cost_brl);
    if (!form.wholesale_plan_id && (!Number.isInteger(seats) || seats < 0)) {
      toast.error('Grant inicial de licenças deve ser inteiro ≥ 0');
      return;
    }
    if (!Number.isFinite(floor) || !Number.isFinite(unit)) {
      toast.error('Piso e custo unitário inválidos');
      return;
    }
    const docDigits = onlyDigits(form.cpf_cnpj);
    if (docDigits && !isValidCpfOrCnpj(docDigits)) {
      toast.error('CPF/CNPJ inválido');
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      public_name: (form.public_name || form.name).trim(),
      product_name: (form.product_name || form.name).trim(),
      admin_email: form.admin_email.trim(),
      admin_name: form.admin_name.trim() || undefined,
      admin_password: form.admin_password.trim() || undefined,
      program_type: 'license_pool' as const,
      purchased_seats: form.wholesale_plan_id ? 0 : seats,
      floor_price_cents: floor,
      unit_cost_cents: unit,
      wholesale_plan_id: form.wholesale_plan_id || null,
      cpf_cnpj: docDigits || null,
    };
    const res = await apiClient.post<{ id: string }>('/api/superadmin/partners', payload);
    setSaving(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao criar Partner');
      return;
    }
    toast.success(
      form.wholesale_plan_id
        ? 'Partner criado com plano atacado atrelado'
        : 'Partner criado — ele escolhe o plano no painel'
    );
    navigate(`/superadmin/partners/${res.data!.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" onClick={() => navigate('/superadmin/partners')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Voltar
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Novo Partner</CardTitle>
          <CardDescription>
            Cadastro do canal. O plano atacado é opcional: se não escolher, o Partner contrata em
            Plano Platform no próprio painel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold">Identidade</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome interno</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onBlur={handleSlugFromName}
                  placeholder="Razão social / nome operacional"
                />
              </div>
              <div className="space-y-2">
                <Label>Slug (URL do canal)</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="minha-revenda"
                />
              </div>
              <div className="space-y-2">
                <Label>CPF ou CNPJ</Label>
                <Input
                  inputMode="numeric"
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  value={form.cpf_cnpj}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cpf_cnpj: formatCpfCnpjDigits(onlyDigits(e.target.value)),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Nome público</Label>
                <Input
                  value={form.public_name}
                  onChange={(e) => setForm((f) => ({ ...f, public_name: e.target.value }))}
                  placeholder="Como aparece no white-label"
                />
              </div>
              <div className="space-y-2">
                <Label>Nome do produto</Label>
                <Input
                  value={form.product_name}
                  onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
                  placeholder="Nome do CRM do Partner"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold">Admin do canal</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.admin_email}
                  onChange={(e) => setForm((f) => ({ ...f, admin_email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={form.admin_name}
                  onChange={(e) => setForm((f) => ({ ...f, admin_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Senha (opcional)</Label>
                <Input
                  type="password"
                  value={form.admin_password}
                  onChange={(e) => setForm((f) => ({ ...f, admin_password: e.target.value }))}
                  placeholder="Mín. 8 se informada"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Plano Platform (atacado)</h2>
              <p className="text-xs text-muted-foreground">
                Selecione para atrelar agora (grant, sem cobrança). Vazio = o Partner escolhe e paga
                em /partner/platform-plan.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Plano atacado</Label>
              <Select
                value={form.wholesale_plan_id || NONE_PLAN}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, wholesale_plan_id: v === NONE_PLAN ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Partner escolhe depois" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_PLAN}>Partner escolhe depois</SelectItem>
                  {wholesalePlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.seats_included} seats · R${' '}
                      {(p.price_cents / 100).toFixed(2)}/{intervalLabel(p.billing_interval)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedWholesale ? (
                <p className="text-[11px] text-muted-foreground">
                  Grant: {selectedWholesale.seats_included} licenças do pacote. Envelope técnico vem
                  do plano atacado.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Sem plano: pool começa em 0. O Partner contrata no próprio painel.
                </p>
              )}
            </div>
            {!form.wholesale_plan_id ? (
              <div className="space-y-2">
                <Label>Grant inicial de licenças (opcional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.purchased_seats}
                  onChange={(e) => setForm((f) => ({ ...f, purchased_seats: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Cortesia sem plano. 0 = Partner só vende depois de contratar.
                </p>
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Regras de revenda</h2>
              <p className="text-xs text-muted-foreground">
                Piso do plano que o Partner vende ao cliente final e custo interno da licença.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Piso de venda (R$)</Label>
                <Input
                  value={form.floor_brl}
                  onChange={(e) => setForm((f) => ({ ...f, floor_brl: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Custo/licença Platform (R$)</Label>
                <Input
                  value={form.unit_cost_brl}
                  onChange={(e) => setForm((f) => ({ ...f, unit_cost_brl: e.target.value }))}
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate('/superadmin/partners')}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Criando…' : 'Criar Partner'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
