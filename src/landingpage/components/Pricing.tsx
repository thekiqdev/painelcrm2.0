import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/integrations/api/client";
import {
  formatVitrinePriceLabel,
  freeAccessDaysBadge,
  getCheckoutListPriceCents,
} from "@/lib/planCheckoutDisplay";
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
} from "lucide-react";

const INTERVALS = [
  { key: "monthly", label: "Mensal", short: "mês" },
  { key: "quarterly", label: "Trimestral", short: "trim" },
  { key: "semi_annual", label: "Semestral", short: "sem" },
  { key: "yearly", label: "Anual", short: "ano" },
] as const;

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
  plan_type: "standard" | "custom";
  is_default: boolean;
  is_free?: boolean;
  free_access_days?: number | null;
  benefits?: PlanBenefit[];
  interval_prices?: IntervalPrice[];
}

const Pricing = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [intervalIndex, setIntervalIndex] = useState<Record<string, number>>({});
  const [usersCount, setUsersCount] = useState<Record<string, number>>({});

  useEffect(() => {
    apiClient.get<Plan[]>("/api/plans").then((res) => {
      if (res.data && Array.isArray(res.data)) {
        setPlans(res.data);
        const next: Record<string, number> = {};
        const users: Record<string, number> = {};
        res.data.forEach((p) => {
          users[p.id] = 1;
          if (p.plan_type === "custom" && p.interval_prices && p.interval_prices.length > 0) {
            const first = p.interval_prices[0].billing_interval;
            const i = INTERVALS.findIndex((x) => x.key === first);
            next[p.id] = i >= 0 ? i : 0;
          } else {
            next[p.id] = 0;
          }
        });
        setIntervalIndex(next);
        setUsersCount(users);
      }
      setLoading(false);
    });
  }, []);

  const setPlanInterval = (planId: string, idx: number) => {
    setIntervalIndex((prev) => ({ ...prev, [planId]: idx }));
  };

  const setPlanUsers = (planId: string, delta: number) => {
    setUsersCount((prev) => {
      const cur = prev[planId] ?? 1;
      const next = Math.max(1, cur + delta);
      return { ...prev, [planId]: next };
    });
  };

  if (loading) {
    return (
      <section id="planos" className="relative py-24">
        <div className="container relative mx-auto px-4 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
              Planos que se adaptam ao seu <span className="text-gradient">crescimento</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">Carregando planos...</p>
          </div>
        </div>
      </section>
    );
  }

  if (plans.length === 0) {
    return (
      <section id="planos" className="relative py-24">
        <div className="container relative mx-auto px-4 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
              Planos que se adaptam ao seu <span className="text-gradient">crescimento</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">Nenhum plano disponível no momento.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="planos" className="relative py-24">
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="container relative mx-auto px-4 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Planos que se adaptam ao seu <span className="text-gradient">crescimento</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Comece grátis e escale conforme sua operação cresce.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCustom = plan.plan_type === "custom";
            const idx = intervalIndex[plan.id] ?? 0;
            const users = usersCount[plan.id] ?? 1;
            const interval = INTERVALS[idx];
            const prices = plan.interval_prices ?? [];
            const vitrineCents = getCheckoutListPriceCents(plan, {
              usersCount: users,
              billingInterval: interval.key,
            });
            const periodLabel = isCustom && interval
              ? interval.short
              : plan.billing_interval === "yearly"
                ? "ano"
                : "mês";
            const trialBadge = freeAccessDaysBadge(plan.is_free, plan.free_access_days);
            const hasIntervalSelector = isCustom && prices.length > 1;
            const canPrev = hasIntervalSelector && idx > 0;
            const canNext = hasIntervalSelector && idx < INTERVALS.length - 1;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-xl border p-6 transition-all ${
                  plan.is_default
                    ? "border-primary/50 bg-card glow-primary"
                    : "border-border/50 bg-card/50 hover:border-border"
                }`}
              >
                {plan.is_default && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                    Mais popular
                  </div>
                )}
                <div className="mb-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-xl font-bold text-foreground">{plan.name}</h3>
                    {trialBadge && (
                      <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                        {trialBadge}
                      </span>
                    )}
                  </div>
                  {plan.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  )}

                  {/* Preço + seletor de intervalo (setas) */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {hasIntervalSelector && (
                      <button
                        type="button"
                        aria-label="Intervalo anterior"
                        onClick={() => setPlanInterval(plan.id, idx - 1)}
                        disabled={!canPrev}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                    )}
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-extrabold text-foreground">
                        {formatVitrinePriceLabel(vitrineCents)}
                      </span>
                      <span className="text-muted-foreground">/{periodLabel}</span>
                    </div>
                    {hasIntervalSelector && (
                      <button
                        type="button"
                        aria-label="Próximo intervalo"
                        onClick={() => setPlanInterval(plan.id, idx + 1)}
                        disabled={!canNext}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  {hasIntervalSelector && (
                    <p className="mt-1 text-xs text-muted-foreground">{interval?.label}</p>
                  )}

                  {/* Usuários (-) [N] (+) só para custom */}
                  {isCustom && (
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Usuários</span>
                      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
                        <button
                          type="button"
                          aria-label="Menos um usuário"
                          onClick={() => setPlanUsers(plan.id, -1)}
                          disabled={users <= 1}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-[2rem] text-center font-semibold text-foreground">
                          {users}
                        </span>
                        <button
                          type="button"
                          aria-label="Mais um usuário"
                          onClick={() => setPlanUsers(plan.id, 1)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Benefícios */}
                <ul className="mb-8 flex-1 space-y-3">
                  {Array.isArray(plan.benefits) && plan.benefits.length > 0 ? (
                    plan.benefits.map((b, i) => {
                      const IconC = b.icon ? BENEFIT_ICON_MAP[b.icon] ?? Check : Check;
                      return (
                        <li key={i} className="flex items-start gap-2 text-sm text-secondary-foreground">
                          <IconC size={16} className="mt-0.5 shrink-0 text-primary" />
                          {b.label}
                        </li>
                      );
                    })
                  ) : (
                    <li className="text-sm text-muted-foreground">—</li>
                  )}
                </ul>

                <Button
                  variant={plan.is_default ? "default" : "outline"}
                  className="w-full gap-2 font-semibold"
                  onClick={() =>
                    navigate("/checkout", {
                      state: {
                        plan: {
                          id: plan.id,
                          name: plan.name,
                          plan_type: plan.plan_type,
                          price_cents: plan.price_cents,
                          interval_prices: plan.interval_prices,
                          description: plan.description,
                          benefits: plan.benefits,
                          is_free: plan.is_free,
                          free_access_days: plan.free_access_days,
                        },
                        billingInterval: INTERVALS[intervalIndex[plan.id] ?? 0]?.key ?? "monthly",
                        usersCount: usersCount[plan.id] ?? 1,
                      },
                    })
                  }
                >
                  Contratar
                  <ArrowRight size={16} />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
