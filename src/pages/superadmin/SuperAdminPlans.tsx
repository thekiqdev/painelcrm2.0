import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Flag, ChevronDown, ChevronRight, Check, Users, MessageCircle, Mail, Headphones, Star, Zap, Shield, FileText, BarChart3, Settings, Smartphone, Globe, Lock, Gift, CreditCard, Building2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/integrations/api/client';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const BILLING_INTERVALS = [
  { key: 'monthly', label: 'Mensal' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'semi_annual', label: 'Semestral' },
  { key: 'yearly', label: 'Anual' },
] as const;

interface IntervalPrice {
  billing_interval: string;
  price_per_user_cents: number;
}

interface PlanBenefit {
  icon: string;
  label: string;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  billing_interval: string;
  max_users: number | null;
  max_profiles: number | null;
  max_whatsapp_instances?: number | null;
  plan_type?: 'standard' | 'custom';
  is_default?: boolean;
  is_free?: boolean;
  free_access_days?: number | null;
  interval_prices?: IntervalPrice[];
  benefits?: PlanBenefit[];
  is_active: boolean;
  sort_order: number;
  enabled_features_count?: number;
}

interface FeatureKeyItem {
  key: string;
  label: string;
}

const defaultPlan: Partial<Plan> = {
  name: '',
  slug: '',
  description: '',
  price_cents: 0,
  billing_interval: 'monthly',
  max_users: null,
  max_profiles: null,
  max_whatsapp_instances: null,
  plan_type: 'standard',
  is_default: false,
  is_free: false,
  free_access_days: null,
  interval_prices: BILLING_INTERVALS.map(({ key }) => ({ billing_interval: key, price_per_user_cents: 0 })),
  is_active: true,
  sort_order: 0,
  features: {} as Record<string, boolean>,
  benefits: [],
};

const BENEFIT_ICONS: { value: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'Check', label: 'Check', Icon: Check },
  { value: 'Users', label: 'Usuários', Icon: Users },
  { value: 'MessageCircle', label: 'WhatsApp / Chat', Icon: MessageCircle },
  { value: 'Mail', label: 'E-mail', Icon: Mail },
  { value: 'Headphones', label: 'Suporte', Icon: Headphones },
  { value: 'Star', label: 'Estrela', Icon: Star },
  { value: 'Zap', label: 'Energia', Icon: Zap },
  { value: 'Shield', label: 'Segurança', Icon: Shield },
  { value: 'FileText', label: 'Documento', Icon: FileText },
  { value: 'BarChart3', label: 'Relatórios', Icon: BarChart3 },
  { value: 'Settings', label: 'Configurações', Icon: Settings },
  { value: 'Smartphone', label: 'Celular', Icon: Smartphone },
  { value: 'Globe', label: 'Globo', Icon: Globe },
  { value: 'Lock', label: 'Cadeado', Icon: Lock },
  { value: 'Gift', label: 'Benefício / Presente', Icon: Gift },
  { value: 'CreditCard', label: 'Pagamento', Icon: CreditCard },
  { value: 'Building2', label: 'Empresa', Icon: Building2 },
  { value: 'Calendar', label: 'Agendamento', Icon: Calendar },
];
const BENEFIT_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = Object.fromEntries(
  BENEFIT_ICONS.map(({ value, Icon }) => [value, Icon])
);

export default function SuperAdminPlans() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Plan> & { features?: Record<string, boolean> }>(defaultPlan);
  const [saving, setSaving] = useState(false);
  const [featureKeys, setFeatureKeys] = useState<FeatureKeyItem[]>([]);
  const [featuresOpen, setFeaturesOpen] = useState(true);

  const loadPlans = async () => {
    setLoading(true);
    const res = await apiClient.get<Plan[]>('/api/superadmin/plans');
    if (res.error) {
      toast.error(res.error);
      setPlans([]);
    } else if (res.data) {
      setPlans(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPlans();
    apiClient.get<FeatureKeyItem[]>('/api/superadmin/plans/feature-keys').then((r) => r.data && setFeatureKeys(r.data));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...defaultPlan,
      features: {},
      benefits: [],
      interval_prices: [],
    });
    setDialogOpen(true);
  };

  const openEdit = async (plan: Plan) => {
    setEditingId(plan.id);
    const intervalPrices = plan.interval_prices ?? [];
    const featuresRes = await apiClient.get<{ features: Record<string, boolean> }>(`/api/superadmin/plans/${plan.id}/features`);
    const features = featuresRes.data?.features ?? {};
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description || '',
      price_cents: plan.price_cents,
      billing_interval: plan.billing_interval,
      max_users: plan.max_users,
      max_profiles: plan.max_profiles,
      max_whatsapp_instances: plan.max_whatsapp_instances ?? null,
      plan_type: plan.plan_type ?? 'standard',
      is_default: plan.is_default ?? false,
      is_free: plan.is_free ?? false,
      free_access_days: plan.free_access_days ?? null,
      interval_prices: intervalPrices.length
        ? intervalPrices
        : [],
      is_active: plan.is_active,
      sort_order: plan.sort_order,
      features,
      benefits: Array.isArray(plan.benefits) ? plan.benefits : [],
    });
    setDialogOpen(true);
  };

  const handleSlugFromName = () => {
    const name = form.name || '';
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setForm((f) => ({ ...f, slug }));
  };

  const savePlan = async () => {
    if (!form.name?.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!form.slug?.trim()) {
      toast.error('Slug é obrigatório');
      return;
    }
    if (form.plan_type === 'custom') {
      const hasPrice = form.interval_prices?.some((ip) => ip.price_per_user_cents > 0);
      if (!hasPrice) {
        toast.error('Plano personalizado exige pelo menos um preço por usuário (por periodicidade)');
        return;
      }
    }
    if (form.is_free && (!form.free_access_days || form.free_access_days < 1)) {
      toast.error('Plano grátis exige dias de acesso >= 1');
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      is_free: form.is_free ?? false,
      free_access_days: form.is_free ? (form.free_access_days ?? null) : null,
      interval_prices:
        form.plan_type === 'custom' && form.interval_prices
          ? form.interval_prices.filter((ip) => ip.billing_interval && ip.price_per_user_cents > 0)
          : undefined,
      benefits: (form.benefits ?? [])
        .filter((b) => (b.label || '').trim())
        .map((b) => ({ icon: b.icon || 'Check', label: (b.label || '').trim() })),
    };
    delete (payload as Record<string, unknown>).features;
    let planId: string;
    if (editingId) {
      const res = await apiClient.put<Plan>(`/api/superadmin/plans/${editingId}`, payload);
      if (res.error) {
        toast.error(res.error);
        setSaving(false);
        return;
      }
      planId = editingId;
      toast.success('Plano atualizado');
    } else {
      const res = await apiClient.post<Plan>('/api/superadmin/plans', payload);
      if (res.error) {
        toast.error(res.error);
        setSaving(false);
        return;
      }
      planId = res.data!.id;
      toast.success('Plano criado');
    }
    if (form.features && featureKeys.length > 0) {
      const featuresPayload: Record<string, boolean> = {};
      featureKeys.forEach(({ key }) => {
        featuresPayload[key] = form.features![key] === true;
      });
      const featRes = await apiClient.put(`/api/superadmin/plans/${planId}/features`, { features: featuresPayload });
      if (featRes.error) toast.error('Plano salvo, mas falha ao salvar recursos: ' + featRes.error);
    }
    setDialogOpen(false);
    setSaving(false);
    loadPlans();
  };

  const deletePlan = async (plan: Plan) => {
    if (!confirm(`Excluir o plano "${plan.name}"?`)) return;
    const res = await apiClient.delete(`/api/superadmin/plans/${plan.id}`);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Plano excluído');
    loadPlans();
  };

  const formatPrice = (cents: number) => {
    if (cents === 0) return 'Grátis';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(cents / 100);
  };

  /** Converte centavos para string em reais (ex.: 9950 → "99,50") para exibir no input */
  const centsToReaisInput = (cents: number) => {
    if (cents === 0) return '';
    const reais = cents / 100;
    return reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planos</h1>
          <p className="text-muted-foreground">Gerencie planos e features por plano.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo plano
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de planos</CardTitle>
          <CardDescription>Clique em Features para configurar recursos do plano.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : plans.length === 0 ? (
            <p className="text-muted-foreground">Nenhum plano cadastrado. Execute o seed ou crie um plano.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Limites</TableHead>
                  <TableHead>Benefícios</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{plan.name}</span>
                        {plan.plan_type === 'custom' && (
                          <Badge variant="outline" className="text-xs">Personalizado</Badge>
                        )}
                        {plan.is_default && (
                          <Badge variant="secondary" className="text-xs">Padrão</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{plan.slug}</TableCell>
                    <TableCell>
                      {plan.plan_type === 'custom' ? (
                        plan.interval_prices?.length ? (
                          <span className="text-sm">
                            {plan.interval_prices.map((ip) => {
                              const label = BILLING_INTERVALS.find((i) => i.key === ip.billing_interval)?.label ?? ip.billing_interval;
                              return (
                                <span key={ip.billing_interval} className="block">
                                  {formatPrice(ip.price_per_user_cents)}/usuário ({label.toLowerCase()})
                                </span>
                              );
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Por usuário</span>
                        )
                      ) : (
                        `${formatPrice(plan.price_cents)}/${plan.billing_interval === 'yearly' ? 'ano' : 'mês'}`
                      )}
                    </TableCell>
                    <TableCell>
                      {plan.max_users != null ? `${plan.max_users} usuários` : '—'}
                      {plan.max_profiles != null ? ` · ${plan.max_profiles} perfis` : ''}
                      {plan.max_whatsapp_instances != null ? ` · ${plan.max_whatsapp_instances} WhatsApp` : ''}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {Array.isArray(plan.benefits) && plan.benefits.length > 0 ? (
                        <div className="flex flex-wrap gap-1 text-sm text-muted-foreground">
                          {(plan.benefits as PlanBenefit[]).slice(0, 3).map((b, i) => {
                            const IconC = BENEFIT_ICON_MAP[b.icon || 'Check'] ?? Check;
                            return (
                              <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                                <IconC className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{b.label}</span>
                              </span>
                            );
                          })}
                          {(plan.benefits as PlanBenefit[]).length > 3 && (
                            <span className="text-muted-foreground">+{(plan.benefits as PlanBenefit[]).length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/superadmin/plans/${plan.id}/features`)}
                      >
                        <Flag className="mr-1 h-4 w-4" />
                        {plan.enabled_features_count ?? 0} ativas
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 items-center">
                        {plan.is_free && (
                          <Badge variant="outline" className="text-green-600 border-green-600">Grátis</Badge>
                        )}
                        {plan.is_active ? (
                          <Badge variant="default">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(plan)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deletePlan(plan)}>
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
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>{editingId ? 'Editar plano' : 'Novo plano'}</DialogTitle>
            <DialogDescription>Preencha os dados do plano.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 py-4 overflow-y-auto min-h-0">
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input
                value={form.name ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={!editingId ? handleSlugFromName : undefined}
                placeholder="Ex: Pro"
              />
            </div>
            <div className="grid gap-2">
              <Label>Slug (identificador único)</Label>
              <Input
                value={form.slug ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                placeholder="Ex: pro"
              />
            </div>
            <div className="grid gap-2">
              <Label>Descrição (opcional)</Label>
              <Input
                value={form.description ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Breve descrição"
              />
            </div>
            <div className="grid gap-2">
              <Label>Tipo de plano</Label>
              <Select
                value={form.plan_type ?? 'standard'}
                onValueChange={(v: 'standard' | 'custom') =>
                  setForm((f) => ({
                    ...f,
                    plan_type: v,
                    interval_prices:
                      v === 'custom'
                        ? (f.interval_prices?.length ? f.interval_prices : [])
                        : undefined,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard (preço fixo)</SelectItem>
                  <SelectItem value="custom">Personalizado (preço por usuário)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.plan_type === 'standard' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Preço (R$)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={form.price_cents != null && form.price_cents > 0 ? `R$ ${centsToReaisInput(form.price_cents)}` : ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        const cents = raw === '' ? 0 : parseInt(raw, 10);
                        setForm((f) => ({ ...f, price_cents: isNaN(cents) ? 0 : cents }));
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Cobrança</Label>
                    <Select
                      value={form.billing_interval ?? 'monthly'}
                      onValueChange={(v) => setForm((f) => ({ ...f, billing_interval: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BILLING_INTERVALS.map(({ key, label }) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label>Máx. usuários (vazio = ilimitado)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.max_users ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, max_users: e.target.value === '' ? null : parseInt(e.target.value, 10) }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Máx. perfis (vazio = ilimitado)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.max_profiles ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, max_profiles: e.target.value === '' ? null : parseInt(e.target.value, 10) }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Máx. inst. WhatsApp (vazio = ilimitado)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.max_whatsapp_instances ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, max_whatsapp_instances: e.target.value === '' ? null : parseInt(e.target.value, 10) }))}
                    />
                  </div>
                </div>
              </>
            )}
            {form.plan_type === 'custom' && (
              <div className="space-y-3">
                <div>
                  <Label>Preço por usuário por periodicidade</Label>
                  <p className="text-sm text-muted-foreground mt-0.5">Adicione valor e período. Cada periodicidade só pode ser usada uma vez.</p>
                </div>
                <div className="space-y-2">
                  {(form.interval_prices ?? []).map((ip, index) => {
                    const usedByOthers = new Set(
                      (form.interval_prices ?? [])
                        .map((x, i) => (i !== index ? x.billing_interval : null))
                        .filter(Boolean)
                    );
                    const periodOptions = BILLING_INTERVALS.filter(
                      (i) => ip.billing_interval === i.key || !usedByOthers.has(i.key)
                    );
                    const cents = ip.price_per_user_cents ?? 0;
                    return (
                      <div key={`${index}-${ip.billing_interval || 'new'}`} className="flex items-center gap-2">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="Valor (R$)"
                          className="w-[120px] shrink-0"
                          value={cents > 0 ? `R$ ${centsToReaisInput(cents)}` : ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '');
                            const next = raw === '' ? 0 : parseInt(raw, 10);
                            const nextCents = isNaN(next) ? 0 : next;
                            setForm((f) => {
                              const list = [...(f.interval_prices ?? [])];
                              list[index] = { ...list[index], price_per_user_cents: nextCents };
                              return { ...f, interval_prices: list };
                            });
                          }}
                        />
                        <Select
                          value={ip.billing_interval || '__none__'}
                          onValueChange={(v) => {
                            if (v === '__none__') return;
                            setForm((f) => {
                              const list = [...(f.interval_prices ?? [])];
                              list[index] = { ...list[index], billing_interval: v };
                              return { ...f, interval_prices: list };
                            });
                          }}
                        >
                          <SelectTrigger className="min-w-[140px]">
                            <SelectValue placeholder="Período" />
                          </SelectTrigger>
                          <SelectContent>
                            {!ip.billing_interval && (
                              <SelectItem value="__none__" disabled>
                                Selecione o período
                              </SelectItem>
                            )}
                            {periodOptions.map(({ key, label: l }) => (
                              <SelectItem key={key} value={key}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              interval_prices: (f.interval_prices ?? []).filter((_, i) => i !== index),
                            }))
                          }
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      interval_prices: [...(f.interval_prices ?? []), { billing_interval: '', price_per_user_cents: 0 }],
                    }))
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar valor
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label htmlFor="plan-default">Plano padrão (atribuído em novos cadastros no site)</Label>
              <Switch
                id="plan-default"
                checked={form.is_default ?? false}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="plan-free">Plano grátis (acesso limitado por dias)</Label>
              <Switch
                id="plan-free"
                checked={form.is_free ?? false}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_free: v, free_access_days: v ? (f.free_access_days ?? 30) : null }))}
              />
            </div>
            {(form.is_free ?? false) && (
              <div className="grid gap-2">
                <Label htmlFor="free-access-days">Dias de acesso (após o período o usuário é direcionado à contratação)</Label>
                <Input
                  id="free-access-days"
                  type="number"
                  min={1}
                  value={form.free_access_days ?? 30}
                  onChange={(e) => setForm((f) => ({ ...f, free_access_days: parseInt(e.target.value, 10) || 1 }))}
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch
                checked={form.is_active ?? true}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Ordem de exibição</Label>
              <Input
                type="number"
                min={0}
                value={form.sort_order ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>

            <Collapsible open={featuresOpen} onOpenChange={setFeaturesOpen} className="space-y-2">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-card/50 px-4 py-3 text-left font-medium hover:bg-card">
                  <span className="flex items-center gap-2">
                    <Flag className="h-4 w-4" />
                    Recursos do plano (features)
                  </span>
                  {featuresOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid gap-2 rounded-lg border border-border/50 bg-muted/20 p-4 sm:grid-cols-2">
                  {featureKeys.map(({ key: featureKey, label }) => (
                    <div key={featureKey} className="flex items-center space-x-2">
                      <Checkbox
                        id={`feat-${featureKey}`}
                        checked={form.features?.[featureKey] === true}
                        onCheckedChange={(checked) =>
                          setForm((f) => ({
                            ...f,
                            features: { ...(f.features ?? {}), [featureKey]: checked === true },
                          }))
                        }
                      />
                      <label htmlFor={`feat-${featureKey}`} className="cursor-pointer text-sm font-medium leading-none">
                        {label}
                      </label>
                    </div>
                  ))}
                </div>
                {featureKeys.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">Carregando lista de recursos...</p>
                )}
              </CollapsibleContent>
            </Collapsible>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base">O que este plano oferece (benefícios)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      benefits: [...(f.benefits ?? []), { icon: 'Check', label: '' }],
                    }))
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Adicionar benefício
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Escolha um ícone e descreva o benefício. Apenas itens com texto são salvos (ex.: &quot;10 usuários&quot;, &quot;WhatsApp integrado&quot;).
              </p>
              <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
                {(form.benefits ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Nenhum benefício. Clique em &quot;Adicionar benefício&quot; para incluir ícone + texto.</p>
                ) : (
                  (form.benefits ?? []).map((benefit, idx) => {
                    const IconComponent = BENEFIT_ICON_MAP[benefit.icon] ?? Check;
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <Select
                          value={benefit.icon}
                          onValueChange={(v) =>
                            setForm((f) => ({
                              ...f,
                              benefits: (f.benefits ?? []).map((b, i) => (i === idx ? { ...b, icon: v } : b)),
                            }))
                          }
                        >
                          <SelectTrigger className="w-[140px] shrink-0">
                            <span className="flex items-center gap-2">
                              <IconComponent className="h-4 w-4" />
                              <SelectValue />
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {BENEFIT_ICONS.map(({ value, label: iconLabel, Icon }) => (
                              <SelectItem key={value} value={value}>
                                <span className="flex items-center gap-2">
                                  <Icon className="h-4 w-4" />
                                  {iconLabel}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Ex: 10 usuários"
                          value={benefit.label}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              benefits: (f.benefits ?? []).map((b, i) => (i === idx ? { ...b, label: e.target.value } : b)),
                            }))
                          }
                          className="min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive hover:text-destructive"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              benefits: (f.benefits ?? []).filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={savePlan} disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
