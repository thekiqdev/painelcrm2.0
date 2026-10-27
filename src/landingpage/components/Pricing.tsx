import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right.js";
import Check from "lucide-react/dist/esm/icons/check.js";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left.js";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js";
import Minus from "lucide-react/dist/esm/icons/minus.js";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/integrations/api/client";
import {
  getCheckoutListPriceCents,
} from "@/lib/planCheckoutDisplay";
import { LANDING_CHECKOUT_PREFILL_KEY } from "@/lib/landingCheckoutPrefill";
import { useLocaleCurrency } from "@/lib/i18n/LocaleProvider";
import { formatAppMoney } from "@/lib/i18n/formatApp";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3.js";
import Building2 from "lucide-react/dist/esm/icons/building-2.js";
import Calendar from "lucide-react/dist/esm/icons/calendar.js";
import CreditCard from "lucide-react/dist/esm/icons/credit-card.js";
import FileText from "lucide-react/dist/esm/icons/file-text.js";
import Gift from "lucide-react/dist/esm/icons/gift.js";
import Globe from "lucide-react/dist/esm/icons/globe.js";
import Headphones from "lucide-react/dist/esm/icons/headphones.js";
import Lock from "lucide-react/dist/esm/icons/lock.js";
import Mail from "lucide-react/dist/esm/icons/mail.js";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle.js";
import Settings from "lucide-react/dist/esm/icons/settings.js";
import Shield from "lucide-react/dist/esm/icons/shield.js";
import Smartphone from "lucide-react/dist/esm/icons/smartphone.js";
import Star from "lucide-react/dist/esm/icons/star.js";
import Users from "lucide-react/dist/esm/icons/users.js";
import Zap from "lucide-react/dist/esm/icons/zap.js";

const INTERVAL_KEYS = [
  { key: "monthly", labelKey: "pricing_monthly", shortKey: "pricing_per_month" },
  { key: "quarterly", labelKey: "pricing_quarterly", shortKey: "pricing_per_quarter" },
  { key: "semi_annual", labelKey: "pricing_semi", shortKey: "pricing_per_semi" },
  { key: "yearly", labelKey: "pricing_yearly", shortKey: "pricing_per_year" },
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
  currency?: string;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  currency?: string;
  billing_interval: string;
  /** Assentos inclusos; null = ilimitado. */
  max_users?: number | null;
  plan_type: "standard" | "custom";
  is_default: boolean;
  is_free?: boolean;
  free_access_days?: number | null;
  benefits?: PlanBenefit[];
  interval_prices?: IntervalPrice[];
}

function seatsIncludedLabel(maxUsers: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  return maxUsers === 1 ? t("pricing_seat_one") : t("pricing_seats", { count: maxUsers });
}

const Pricing = () => {
  const { t } = useTranslation("landing");
  const navigate = useNavigate();
  const { currency: preferredCurrency, locale, ready } = useLocaleCurrency();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [intervalIndex, setIntervalIndex] = useState<Record<string, number>>({});
  const [usersCount, setUsersCount] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({
      currency: preferredCurrency,
      locale,
    });
    apiClient.get<Plan[]>(`/api/plans?${qs.toString()}`).then((res) => {
      if (cancelled) return;
      if (res.data && Array.isArray(res.data)) {
        setPlans(res.data);
        const next: Record<string, number> = {};
        const users: Record<string, number> = {};
        res.data.forEach((p) => {
          users[p.id] = 1;
          if (p.plan_type === "custom" && p.interval_prices && p.interval_prices.length > 0) {
            const first = p.interval_prices[0].billing_interval;
            const i = INTERVAL_KEYS.findIndex((x) => x.key === first);
            next[p.id] = i >= 0 ? i : 0;
          } else {
            next[p.id] = 0;
          }
        });
        setIntervalIndex(next);
        setUsersCount(users);
      } else {
        setPlans([]);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, preferredCurrency, locale]);

  const displayCurrency = (plan: Plan) => plan.currency ?? preferredCurrency ?? "BRL";

  const formatPlanMoney = (cents: number, currency: string) => formatAppMoney(cents, currency);

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
              {t("pricing_title_before")} <span className="text-gradient">{t("pricing_title_em")}</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">{t("pricing_loading")}</p>
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
              {t("pricing_title_before")} <span className="text-gradient">{t("pricing_title_em")}</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">{t("pricing_empty")}</p>
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
            {t("pricing_title_before")} <span className="text-gradient">{t("pricing_title_em")}</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("pricing_lead")}
          </p>
        </div>

        <div
          className={`grid gap-6 ${
            plans.length === 1
              ? "mx-auto max-w-md grid-cols-1"
              : plans.length === 2
                ? "mx-auto max-w-4xl grid-cols-1 sm:grid-cols-2"
                : "md:grid-cols-2 lg:grid-cols-3"
          }`}
        >
          {plans.map((plan) => {
            const isCustom = plan.plan_type === "custom";
            const planCurrency = displayCurrency(plan);
            const idx = intervalIndex[plan.id] ?? 0;
            const users = usersCount[plan.id] ?? 1;
            const interval = INTERVAL_KEYS[idx];
            const prices = plan.interval_prices ?? [];
            const vitrineCents = getCheckoutListPriceCents(plan, {
              usersCount: users,
              billingInterval: interval.key,
            });
            const periodLabel = isCustom && interval
              ? t(interval.shortKey)
              : plan.billing_interval === "yearly"
                ? t("pricing_per_year")
                : t("pricing_per_month");
            const trialDays = plan.is_free === true && plan.free_access_days != null ? Number(plan.free_access_days) : 0;
            const trialBadge = trialDays >= 1
              ? t(trialDays === 1 ? "pricing_trial_one" : "pricing_trial_many", { count: trialDays })
              : null;
            const hasIntervalSelector = isCustom && prices.length > 1;
            const canPrev = hasIntervalSelector && idx > 0;
            const canNext = hasIntervalSelector && idx < INTERVAL_KEYS.length - 1;

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

                  {/* S1 SE: plano com teto de usuários — destaque na vitrine */}
                  {!isCustom && plan.max_users != null && plan.max_users > 0 ? (
                    <div className="mt-3 space-y-1">
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {seatsIncludedLabel(plan.max_users, t)}
                      </div>
                      {(() => {
                        const avulso =
                          prices.find((ip) => ip.billing_interval === plan.billing_interval)
                            ?.price_per_user_cents ??
                          prices[0]?.price_per_user_cents ??
                          0;
                        if (avulso <= 0) return null;
                        return (
                          <p className="text-xs text-muted-foreground">
                            {t("pricing_extra_seat", { price: formatPlanMoney(avulso, planCurrency) })}
                          </p>
                        );
                      })()}
                    </div>
                  ) : null}

                  {/* Preço + seletor de intervalo (setas) */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {hasIntervalSelector && (
                      <button
                        type="button"
                        aria-label={t("pricing_prev_interval")}
                        onClick={() => setPlanInterval(plan.id, idx - 1)}
                        disabled={!canPrev}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                    )}
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-extrabold text-foreground">
                        {vitrineCents > 0 ? formatPlanMoney(vitrineCents, planCurrency) : t("pricing_on_request")}
                      </span>
                      <span className="text-muted-foreground">/{periodLabel}</span>
                    </div>
                    {hasIntervalSelector && (
                      <button
                        type="button"
                        aria-label={t("pricing_next_interval")}
                        onClick={() => setPlanInterval(plan.id, idx + 1)}
                        disabled={!canNext}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  {hasIntervalSelector && (
                    <p className="mt-1 text-xs text-muted-foreground">{interval ? t(interval.labelKey) : null}</p>
                  )}

                  {/* Usuários (-) [N] (+) só para custom */}
                  {isCustom && (
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{t("pricing_users")}</span>
                      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
                        <button
                          type="button"
                          aria-label={t("pricing_less_user")}
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
                          aria-label={t("pricing_more_user")}
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
                  onClick={() => {
                    const checkoutState = {
                      plan: {
                        id: plan.id,
                        name: plan.name,
                        plan_type: plan.plan_type,
                        price_cents: plan.price_cents,
                        currency: planCurrency,
                        interval_prices: plan.interval_prices,
                        description: plan.description,
                        benefits: plan.benefits,
                        is_free: plan.is_free,
                        free_access_days: plan.free_access_days,
                      },
                      billingInterval: INTERVAL_KEYS[intervalIndex[plan.id] ?? 0]?.key ?? "monthly",
                      usersCount: usersCount[plan.id] ?? 1,
                      /** IX3: moeda do catálogo; cobrança Stripe USD/EUR na IX4. */
                      preferred_currency: planCurrency,
                    };
                    void (async () => {
                      const { buildSignupUrl, loadSignupEntryConfig } = await import("@/lib/signupEntry");
                      const cfg = await loadSignupEntryConfig();
                      const target = buildSignupUrl(cfg, { planId: plan.id });
                      if (import.meta.env.VITE_LANDING_STANDALONE === "1") {
                        if (target === "/checkout" || target.startsWith("/checkout")) {
                          try {
                            sessionStorage.setItem(LANDING_CHECKOUT_PREFILL_KEY, JSON.stringify(checkoutState));
                          } catch {
                            /* ignore */
                          }
                        }
                        window.location.assign(target);
                        return;
                      }
                      if (target.startsWith("/cadastro")) {
                        navigate(target);
                      } else {
                        navigate(target, { state: checkoutState });
                      }
                    })();
                    return;
                  }}
                >
                  {t("pricing_cta")}
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
