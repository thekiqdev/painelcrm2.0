import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { ArrowLeft } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';
import { datetimeLocalToTrialEndsAtIso } from '@/lib/trialEndsAtBrAdmin';

interface Plan {
  id: string;
  name: string;
  slug: string;
  plan_type?: 'standard' | 'custom';
}

export default function SuperAdminClientNew() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    domain: '',
    plan_id: '',
    status: 'active',
    trial_ends_at: '',
    max_users_override: '' as string | number,
    max_whatsapp_instances_override: '' as string | number,
  });

  useEffect(() => {
    const load = async () => {
      const res = await apiClient.get<Plan[]>('/api/superadmin/plans');
      if (res.data) {
        setPlans(res.data);
        if (res.data.length > 0 && !form.plan_id) setForm((f) => ({ ...f, plan_id: res.data[0].id }));
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSlugFromName = () => {
    const slug = (form.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'empresa';
    setForm((f) => ({ ...f, slug }));
  };

  const save = async () => {
    if (!form.name?.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!form.slug?.trim()) {
      toast.error('Slug é obrigatório');
      return;
    }
    if (!form.plan_id) {
      toast.error('Selecione um plano');
      return;
    }
    setSaving(true);
    const selectedPlan = plans.find((p) => p.id === form.plan_id);
    const isCustom = selectedPlan?.plan_type === 'custom';
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      domain: form.domain || null,
      plan_id: form.plan_id,
      status: form.status,
      trial_ends_at: datetimeLocalToTrialEndsAtIso(form.trial_ends_at),
    };
    if (isCustom) {
      const u = form.max_users_override === '' || form.max_users_override === null ? null : Number(form.max_users_override);
      const w = form.max_whatsapp_instances_override === '' || form.max_whatsapp_instances_override === null ? null : Number(form.max_whatsapp_instances_override);
      if (u != null) payload.max_users_override = u;
      if (w != null) payload.max_whatsapp_instances_override = w;
    }
    const res = await apiClient.post<{ id: string }>('/api/superadmin/tenants', payload);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Empresa criada.');
    navigate(res.data?.id ? `/superadmin/clients/${res.data.id}` : '/superadmin/clients');
  };

  if (loading) {
    return <p className="text-muted-foreground">Carregando...</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/superadmin/clients')} title="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nova empresa</h1>
          <p className="text-muted-foreground">Cadastre uma nova conta (empresa).</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Dados da empresa</CardTitle>
          <CardDescription>Preencha os dados da conta. Depois você pode editar e vincular usuários na página da empresa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={handleSlugFromName}
                placeholder="Ex: Empresa XYZ"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug (identificador único)</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                placeholder="empresa-xyz"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Domínio (opcional)</Label>
              <Input
                value={form.domain}
                onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                placeholder="app.empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select
                value={form.plan_id}
                onValueChange={(v) => setForm((f) => ({ ...f, plan_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.plan_id && plans.find((p) => p.id === form.plan_id)?.plan_type === 'custom' && (
                <div className="grid gap-4 sm:grid-cols-2 pt-2">
                  <div className="space-y-2">
                    <Label>Quantidade de usuários (cobrança personalizada)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.max_users_override === '' ? '' : form.max_users_override}
                      onChange={(e) => setForm((f) => ({ ...f, max_users_override: e.target.value === '' ? '' : parseInt(e.target.value, 10) }))}
                      placeholder="Ex: 10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade de instâncias WhatsApp</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.max_whatsapp_instances_override === '' ? '' : form.max_whatsapp_instances_override}
                      onChange={(e) => setForm((f) => ({ ...f, max_whatsapp_instances_override: e.target.value === '' ? '' : parseInt(e.target.value, 10) }))}
                      placeholder="Ex: 2"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="payment_pending">Aguardando pagamento</SelectItem>
                  <SelectItem value="suspended">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Trial até (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Horário de Brasília (America/Sao_Paulo). Gravado em UTC no servidor.
              </p>
              <Input
                type="datetime-local"
                value={form.trial_ends_at}
                onChange={(e) => setForm((f) => ({ ...f, trial_ends_at: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar empresa'}
            </Button>
            <Button variant="outline" onClick={() => navigate('/superadmin/clients')}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
