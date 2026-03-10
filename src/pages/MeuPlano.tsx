import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/integrations/api/client';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Minus, Plus, ArrowRight, CreditCard, Calendar } from 'lucide-react';
import {
  Users,
  MessageCircle,
  Mail,
  Headphones,
  Star,
  Zap,
  Shield,
  FileText,
  BarChart3,
  Settings,
  Smartphone,
  Globe,
  Lock,
  Gift,
  CreditCard,
  Building2,
  Calendar,
} from 'lucide-react';

const BENEFIT_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Check,
  Users,
  MessageCircle,
  Mail,
  Headphones,
  Star,
  Zap,
  Shield,
  FileText,
  BarChart3,
  Settings,
  Smartphone,
  Globe,
  Lock,
  Gift,
  CreditCard,
  Building2,
  Calendar,
};

const INTERVALS = [
  { key: 'monthly', label: 'Mensal' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'semi_annual', label: 'Semestral' },
  { key: 'yearly', label: 'Anual' },
] as const;

interface PlanBenefit {
  icon?: string;
  label: string;
}

interface IntervalPrice {
  billing_interval: string;
  price_per_user_cents: number;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  billing_interval: string;
  plan_type: 'standard' | 'custom';
  is_free?: boolean;
  free_access_days?: number | null;
  benefits?: PlanBenefit[];
  interval_prices?: IntervalPrice[];
}

interface MyPlanResponse {
  tenant_id: string;
  plan: Plan;
  trial_ends_at: string | null;
  max_users_override: number | null;
  max_whatsapp_instances_override: number | null;
  tenant_status?: string;
  plan_period_start?: string | null;
  plan_period_end?: string | null;
}

function formatPrice(cents: number): string {
  if (cents === 0) return 'Grátis';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function MeuPlano() {
  const navigate = useNavigate();
  const [myPlan, setMyPlan] = useState<MyPlanResponse | null>(null);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usersCount, setUsersCount] = useState(1);
  const [intervalIdx, setIntervalIdx] = useState(0);

  useEffect(() => {
    Promise.all([
      apiClient.get<MyPlanResponse>('/api/me/tenant/plan'),
      apiClient.get<Plan[]>('/api/plans'),
    ]).then(([resPlan, resPlans]) => {
      if (resPlan.error) {
        if (resPlan.details?.status === 403) {
          toast.error('Apenas o administrador da conta pode acessar os planos.');
        } else {
          toast.error(resPlan.error);
        }
        setLoading(false);
        return;
      }
      if (resPlan.data) {
        setMyPlan(resPlan.data);
        const u = resPlan.data.max_users_override ?? 1;
        setUsersCount(u >= 1 ? u : 1);
      }
      if (resPlans.data) setAllPlans(resPlans.data);
      setLoading(false);
    });
  }, []);

  const changePlan = async (planId: string) => {
    if (!myPlan || saving) return;
    setSaving(true);
    const res = await apiClient.put('/api/me/tenant/plan', { plan_id: planId });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Plano alterado.');
    const again = await apiClient.get<MyPlanResponse>('/api/me/tenant/plan');
    if (again.data) setMyPlan(again.data);
  };

  const saveCustomUsers = async () => {
    if (!myPlan || myPlan.plan.plan_type !== 'custom' || saving) return;
    setSaving(true);
    const res = await apiClient.put('/api/me/tenant/plan', { users_count: usersCount });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Quantidade de usuários atualizada.');
    const again = await apiClient.get<MyPlanResponse>('/api/me/tenant/plan');
    if (again.data) setMyPlan(again.data);
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!myPlan) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Não foi possível carregar o plano da sua conta.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const plan = myPlan.plan;
  const isCustom = plan.plan_type === 'custom';
  const prices = plan.interval_prices ?? [];
  const interval = INTERVALS[intervalIdx] ?? INTERVALS[0];
  const priceRow = prices.find((p) => p.billing_interval === interval.key);
  const currentPriceCents = isCustom && priceRow ? priceRow.price_per_user_cents * usersCount : plan.price_cents;
  const otherPlans = allPlans.filter((p) => p.id !== plan.id);
  const tenantStatus = myPlan.tenant_status ?? 'active';
  const isActive = tenantStatus === 'active';
  const isPaymentPending = tenantStatus === 'payment_pending';
  const planPeriodEnd = myPlan.plan_period_end;

  const refetchPlan = () => {
    apiClient.get<MyPlanResponse>('/api/me/tenant/plan').then((r) => r.data && setMyPlan(r.data));
  };

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Meu plano</h1>
        <p className="text-muted-foreground">Gerencie o plano da sua conta e contrate mais usuários se precisar.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plano atual</CardTitle>
          <CardDescription>{plan.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {plan.is_free ? (
              <span className="text-2xl font-bold text-green-600">Grátis</span>
            ) : (
              <span className="text-2xl font-bold">{formatPrice(currentPriceCents)}</span>
            )}
            {plan.is_free && myPlan.trial_ends_at && (
              <span className="text-sm text-muted-foreground">
                Acesso até {formatDate(myPlan.trial_ends_at)}
              </span>
            )}
            {isPaymentPending && !plan.is_free && (
              <span className="text-sm text-amber-600 font-medium">Aguardando pagamento</span>
            )}
            {isActive && planPeriodEnd && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Próxima cobrança em {formatDate(planPeriodEnd)}
              </span>
            )}
          </div>
          {!plan.is_free && (isPaymentPending || !isActive) && (
            <Button
              variant="default"
              size="sm"
              className="gap-1"
              onClick={() =>
                navigate('/checkout', {
                  state: {
                    plan: {
                      id: plan.id,
                      name: plan.name,
                      plan_type: plan.plan_type,
                      price_cents: plan.price_cents,
                      interval_prices: plan.interval_prices,
                      description: plan.description,
                      benefits: plan.benefits,
                    },
                    billingInterval: interval.key,
                    usersCount: plan.plan_type === 'custom' ? usersCount : undefined,
                  },
                })
              }
            >
              <CreditCard className="h-4 w-4" />
              {isPaymentPending ? 'Ver link de pagamento' : 'Assinar plano'}
            </Button>
          )}
          {isCustom && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Usuários contratados:</span>
              <div className="flex items-center gap-1 rounded-lg border p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setUsersCount((c) => Math.max(1, c - 1))}
                  disabled={usersCount <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="min-w-[2rem] text-center font-medium">{usersCount}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setUsersCount((c) => c + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {prices.length > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIntervalIdx((i) => Math.max(0, i - 1))}
                    disabled={intervalIdx <= 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm min-w-[80px]">{interval.label}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIntervalIdx((i) => Math.min(INTERVALS.length - 1, i + 1))}
                    disabled={intervalIdx >= INTERVALS.length - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <Button onClick={saveCustomUsers} disabled={saving}>
                {saving ? 'Salvando...' : 'Atualizar usuários'}
              </Button>
            </div>
          )}
          <ul className="space-y-2">
            {Array.isArray(plan.benefits) &&
              plan.benefits.map((b, i) => {
                const IconC = b.icon ? BENEFIT_ICON_MAP[b.icon] ?? Check : Check;
                return (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <IconC className="h-4 w-4 shrink-0 text-primary" />
                    {b.label}
                  </li>
                );
              })}
          </ul>
        </CardContent>
      </Card>

      {otherPlans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Outros planos</CardTitle>
            <CardDescription>
              {isActive ? 'Troque de plano ou assine outro.' : 'Escolha um plano para assinar.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {otherPlans.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col rounded-lg border p-4 gap-2"
                >
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                  )}
                  <div className="mt-auto pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1"
                      disabled={saving}
                      onClick={() =>
                        navigate('/checkout', {
                          state: {
                            plan: {
                              id: p.id,
                              name: p.name,
                              plan_type: p.plan_type,
                              price_cents: p.price_cents,
                              interval_prices: p.interval_prices,
                              description: p.description,
                              benefits: p.benefits,
                            },
                            billingInterval: interval.key,
                            usersCount: p.plan_type === 'custom' ? usersCount : undefined,
                          },
                        })
                      }
                    >
                      Assinar
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
