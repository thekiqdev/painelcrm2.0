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

interface Plan {
  id: string;
  name: string;
  slug: string;
}

function brlToCents(raw: string): number {
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

export default function SuperAdminPartnerNew() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    public_name: '',
    product_name: '',
    admin_email: '',
    admin_name: '',
    admin_password: '',
    plan_id: '',
    purchased_seats: '10',
    floor_brl: '99',
    unit_cost_brl: '49',
  });

  useEffect(() => {
    void (async () => {
      const res = await apiClient.get<Plan[]>('/api/superadmin/plans');
      if (res.data?.length) {
        setPlans(res.data);
        setForm((f) => ({ ...f, plan_id: f.plan_id || res.data![0].id }));
      }
    })();
  }, []);

  const handleSlugFromName = () => {
    const slug = (form.name || '')
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
    if (!Number.isInteger(seats) || seats < 1) {
      toast.error('Licenças (usuários) deve ser inteiro ≥ 1');
      return;
    }
    if (!Number.isFinite(floor) || !Number.isFinite(unit)) {
      toast.error('Piso e custo unitário inválidos');
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
      purchased_seats: seats,
      floor_price_cents: floor,
      unit_cost_cents: unit,
      plan_id: form.plan_id || null,
    };
    const res = await apiClient.post<{ id: string }>('/api/superadmin/partners', payload);
    setSaving(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao criar Partner');
      return;
    }
    toast.success('Partner criado');
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
            Programa MVP: pool de licenças (1 licença = 1 usuário). Cria admin + membership.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome interno</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={handleSlugFromName}
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
              <Label>Plano base (features)</Label>
              <Select
                value={form.plan_id}
                onValueChange={(v) => setForm((f) => ({ ...f, plan_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome público</Label>
              <Input
                value={form.public_name}
                onChange={(e) => setForm((f) => ({ ...f, public_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do produto</Label>
              <Input
                value={form.product_name}
                onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Licenças (usuários)</Label>
              <Input
                type="number"
                min={1}
                value={form.purchased_seats}
                onChange={(e) => setForm((f) => ({ ...f, purchased_seats: e.target.value }))}
              />
            </div>
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
            <div className="space-y-2 sm:col-span-2">
              <Label>E-mail admin Partner</Label>
              <Input
                type="email"
                value={form.admin_email}
                onChange={(e) => setForm((f) => ({ ...f, admin_email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome admin</Label>
              <Input
                value={form.admin_name}
                onChange={(e) => setForm((f) => ({ ...f, admin_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Senha admin (opcional)</Label>
              <Input
                type="password"
                value={form.admin_password}
                onChange={(e) => setForm((f) => ({ ...f, admin_password: e.target.value }))}
                placeholder="Mín. 8 se informada"
              />
            </div>
          </div>

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
