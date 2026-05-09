import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/integrations/api/client';
import {
  TrendingUp,
  Wallet,
  Building2,
  Timer,
  Clock,
  TriangleAlert,
  CircleCheck,
  Info,
  MessageCircle,
  Mail,
  PlugZap,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';

/** Resposta consolidada GET /api/superadmin/dashboard; campos opcionais para compatibilidade com payloads antigos ou parciais. */
type SuperadminDashboardResponse = {
  financial?: Partial<{
    mrr_cents: number;
    received_this_month_cents: number;
    pending_cents: number;
    overdue_cents: number;
    open_billing_count: number;
    overdue_billing_count: number;
  }>;
  subscriptions?: Partial<{
    active_tenants: number;
    trial_tenants: number;
  }>;
  totals?: Partial<{
    plans: number;
    tenants: number;
    active_tenants: number;
    users: number;
  }>;
  recent_tenants?: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
    plan_name: string | null;
  }>;
  recent_users?: Array<{
    id: string;
    email: string;
    created_at: string;
    tenant_name: string | null;
  }>;
  growth?: Partial<{
    tenants_by_day_30d: Array<{ date: string; count: number }>;
    users_by_day_30d: Array<{ date: string; count: number }>;
  }>;
  plans?: Partial<{
    by_plan: Array<{
      plan_id: string;
      plan_name: string;
      tenants_count: number;
      active_tenants_count: number;
      estimated_mrr_cents: number;
    }>;
  }>;
  alerts?: Array<{
    type: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    count?: number;
  }>;
  operational?: Partial<{
    gateways: Array<{
      gateway: string;
      status: 'configured' | 'not_configured' | 'unknown';
    }>;
    whatsapp_instances: {
      total: number;
      connected: number;
      disconnected: number;
    };
    smtp: {
      configured: boolean;
      enabled: boolean;
    };
  }>;
};

const intFmt = new Intl.NumberFormat('pt-BR');

function safeInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

/** Valores monetários armazenados em centavos (BRL). */
function formatCurrencyFromCents(value: unknown): string {
  const cents = safeInt(value ?? 0, 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

/** Altura única dos gráficos / vazio (compacto, executivo). */
const CHART_AREA_CLASS = 'h-[200px]';

function ExecutiveKpiSkeleton() {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="relative overflow-hidden border-border/60 shadow-none">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 px-3 pb-1 pt-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-7 rounded-full" />
          </CardHeader>
          <CardContent className="space-y-1.5 px-3 pb-3">
            <Skeleton className="h-8 w-[65%]" />
            <Skeleton className="h-2.5 w-[40%]" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-3 sm:gap-4 xl:grid-cols-3 2xl:gap-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="border-border/60 shadow-none">
          <CardHeader className="space-y-1 px-4 pb-0 pt-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full max-w-[240px]" />
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            <Skeleton className={`${CHART_AREA_CLASS} w-full rounded-md`} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OperationsSkeleton() {
  return (
    <div className="grid gap-3 sm:gap-4 xl:grid-cols-3 2xl:gap-5">
      <Card className="border-border/60 shadow-none xl:col-span-2">
        <CardHeader className="space-y-1 px-4 pb-0 pt-4">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-56" />
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4 pt-3">
          {Array.from({ length: 3 }).map((_, j) => (
            <Skeleton key={j} className="h-14 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-none">
        <CardHeader className="space-y-1 px-4 pb-0 pt-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48" />
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4 pt-3">
          {Array.from({ length: 4 }).map((_, j) => (
            <Skeleton key={j} className="h-11 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div
      className={`flex ${CHART_AREA_CLASS} items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/15 px-4 text-center`}
    >
      <p className="text-xs text-muted-foreground sm:text-sm">{message}</p>
    </div>
  );
}

function severityBadge(severity: 'info' | 'warning' | 'critical') {
  if (severity === 'critical') {
    return (
      <Badge variant="outline" className="border-destructive/35 bg-destructive/10 text-[10px] font-medium text-destructive">
        Crítico
      </Badge>
    );
  }
  if (severity === 'warning') {
    return (
      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] font-medium text-amber-700 dark:text-amber-300">
        Atenção
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] font-medium">
      Info
    </Badge>
  );
}

function severityIcon(severity: 'info' | 'warning' | 'critical') {
  if (severity === 'critical') return TriangleAlert;
  if (severity === 'warning') return TriangleAlert;
  return Info;
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/50 pb-3 sm:flex-row sm:items-end sm:justify-between">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      {description ? <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
    </div>
  );
}

type KpiAccent = 'default' | 'success' | 'warning' | 'danger';

function ExecutiveKpiCard(props: {
  title: string;
  subtitle?: string;
  value: React.ReactNode;
  footnote?: React.ReactNode;
  icon: React.ElementType;
  accent?: KpiAccent;
  badge?: React.ReactNode;
}) {
  const { title, subtitle, value, footnote, icon: Icon, accent = 'default', badge } = props;

  const ring =
    accent === 'success'
      ? 'ring-1 ring-emerald-500/15'
      : accent === 'warning'
        ? 'ring-1 ring-amber-500/15'
        : accent === 'danger'
          ? 'ring-1 ring-destructive/20'
          : 'ring-1 ring-border/60';

  return (
    <Card className={`relative overflow-hidden ${ring} bg-card/90 shadow-none backdrop-blur-sm transition-shadow hover:shadow-sm`}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 px-3 pb-1 pt-3">
        <div className="min-w-0 pr-2">
          <CardTitle className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
          {subtitle ? (
            <CardDescription className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground/90 sm:text-[11px]">
              {subtitle}
            </CardDescription>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {badge}
          <div className="rounded-full bg-muted/50 p-1.5 text-muted-foreground">
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="tabular-nums text-xl font-semibold tracking-tight sm:text-2xl leading-none">{value}</div>
        {footnote ? (
          <p className="mt-1.5 text-[10px] text-muted-foreground tabular-nums leading-snug sm:text-[11px]">{footnote}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminDashboard() {
  const [data, setData] = useState<SuperadminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiClient.get<SuperadminDashboardResponse>('/api/superadmin/dashboard');
    if (res.error) {
      setError(res.error);
      setData(null);
    } else if (res.data) {
      setData(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[90rem] space-y-8 px-1 pb-8 sm:px-0">
        <header className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Super Admin</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Painel executivo</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Visão consolidada de receita, base, crescimento e saúde operacional da plataforma.
          </p>
        </header>
        <section className="space-y-3">
          <SectionHeading title="Indicadores principais" description="MRR, caixa do mês, base ativa e risco de cobrança." />
          <ExecutiveKpiSkeleton />
        </section>
        <section className="space-y-3">
          <SectionHeading title="Crescimento e planos" description="Série de 30 dias e distribuição por plano contratado." />
          <ChartsSkeleton />
        </section>
        <section className="space-y-3">
          <SectionHeading title="Alertas e operação" description="Sinalizações da plataforma e status de integrações." />
          <OperationsSkeleton />
        </section>
        <section className="space-y-3">
          <SectionHeading title="Atividade recente" description="Últimos cadastros de empresas e usuários." />
          <div className="grid gap-3 md:grid-cols-2 lg:gap-4">
            {[0, 1].map((i) => (
              <Card key={i} className="border-border/60 shadow-none">
                <CardHeader className="space-y-1 px-4 pb-0 pt-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-52" />
                </CardHeader>
                <CardContent className="space-y-2 px-4 pb-4 pt-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="h-9 w-full rounded-md" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[90rem] space-y-6 px-1 sm:px-0">
        <header className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Super Admin</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Painel executivo</h1>
        </header>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Não foi possível carregar o dashboard</CardTitle>
            <CardDescription className="text-destructive/90">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fin = data?.financial ?? {};
  const subs = data?.subscriptions ?? {};

  const mrrCents = safeInt(fin.mrr_cents, 0);
  const receivedMonthCents = safeInt(fin.received_this_month_cents, 0);
  const activeTenants = safeInt(subs.active_tenants ?? data?.totals?.active_tenants, 0);
  const trialTenants = safeInt(subs.trial_tenants, 0);
  const pendingCents = safeInt(fin.pending_cents, 0);
  const openBilling = safeInt(fin.open_billing_count, 0);
  const overdueCents = safeInt(fin.overdue_cents, 0);
  const overdueBilling = safeInt(fin.overdue_billing_count, 0);

  const recentTenants = data?.recent_tenants ?? [];
  const recentUsers = data?.recent_users ?? [];
  const growth = data?.growth ?? {};
  const plans = data?.plans ?? {};
  const alerts = data?.alerts ?? [];
  const operational = data?.operational ?? {};
  const tenantsGrowthData = (growth.tenants_by_day_30d ?? []).map((row) => ({
    date: typeof row?.date === 'string' ? row.date : '',
    day: typeof row?.date === 'string' ? row.date.slice(5) : '--',
    count: safeInt(row?.count, 0),
  }));
  const usersGrowthData = (growth.users_by_day_30d ?? []).map((row) => ({
    date: typeof row?.date === 'string' ? row.date : '',
    day: typeof row?.date === 'string' ? row.date.slice(5) : '--',
    count: safeInt(row?.count, 0),
  }));
  const planDistributionData = (plans.by_plan ?? [])
    .map((row) => ({
      plan: (row?.plan_name || 'Sem nome').slice(0, 24),
      tenants_count: safeInt(row?.tenants_count, 0),
      estimated_mrr_cents: safeInt(row?.estimated_mrr_cents, 0),
    }))
    .filter((row) => row.tenants_count > 0 || row.estimated_mrr_cents > 0)
    .sort((a, b) => b.tenants_count - a.tenants_count)
    .slice(0, 8);
  const gateways = operational.gateways ?? [];
  const configuredGateways = gateways.filter((g) => g.status === 'configured').length;
  const whatsapp = operational.whatsapp_instances ?? { total: 0, connected: 0, disconnected: 0 };
  const smtp = operational.smtp ?? { configured: false, enabled: false };
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical').length;

  return (
    <div className="mx-auto w-full max-w-[90rem] space-y-8 px-1 pb-8 sm:px-0">
      <header className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Super Admin</p>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Painel executivo</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Resumo financeiro, evolução da base, distribuição por plano e monitoramento operacional.
        </p>
      </header>

      <section className="space-y-3">
        <SectionHeading title="Indicadores principais" description="MRR, caixa do mês, base ativa e risco de cobrança." />
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <ExecutiveKpiCard
          title="Receita recorrente mensal"
          subtitle="MRR estimado pela base"
          icon={TrendingUp}
          value={formatCurrencyFromCents(mrrCents)}
          accent="default"
        />
        <ExecutiveKpiCard
          title="Recebido no mês"
          subtitle="Pagamentos confirmados no mês corrente"
          icon={Wallet}
          accent="success"
          value={formatCurrencyFromCents(receivedMonthCents)}
        />
        <ExecutiveKpiCard
          title="Empresas ativas"
          subtitle="Tenants com status ativo"
          icon={Building2}
          value={intFmt.format(activeTenants)}
        />
        <ExecutiveKpiCard
          title="Trials ativos"
          subtitle="Empresas em período de trial"
          icon={Timer}
          value={intFmt.format(trialTenants)}
          badge={
            trialTenants > 0 ? (
              <Badge variant="secondary" className="hidden text-[10px] font-normal sm:inline-flex">
                Em avaliação
              </Badge>
            ) : null
          }
        />
        <ExecutiveKpiCard
          title="Cobranças pendentes"
          subtitle="Em aberto (pendente/aguardando)"
          icon={Clock}
          accent={openBilling > 0 ? 'warning' : 'default'}
          value={formatCurrencyFromCents(pendingCents)}
          footnote={openBilling > 0 ? `${intFmt.format(openBilling)} cobrança(ões)` : 'Sem cobranças em aberto neste grupo'}
          badge={
            openBilling > 0 ? (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] font-normal">
                Em aberto
              </Badge>
            ) : null
          }
        />
        <ExecutiveKpiCard
          title="Inadimplência"
          subtitle="Vencidas e atrasadas"
          icon={TriangleAlert}
          accent={overdueBilling > 0 ? 'danger' : 'default'}
          value={formatCurrencyFromCents(overdueCents)}
          footnote={
            overdueBilling > 0
              ? `${intFmt.format(overdueBilling)} cobrança(ões)`
              : 'Nenhuma cobrança considerada em atraso'
          }
          badge={
            overdueBilling > 0 ? (
              <Badge variant="outline" className="border-destructive/35 bg-destructive/10 text-[10px] font-normal">
                Risco
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] font-normal">
                Em dia
              </Badge>
            )
          }
        />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Crescimento e planos" description="Série de 30 dias e distribuição por plano contratado." />
        <div className="grid gap-3 sm:gap-4 xl:grid-cols-3 2xl:gap-5">
        <Card className="border-border/60 shadow-none">
          <CardHeader className="space-y-1 px-4 pb-0 pt-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Crescimento de empresas</CardTitle>
            <CardDescription className="text-xs">
              Últimos 30 dias · {intFmt.format(tenantsGrowthData.reduce((acc, item) => acc + item.count, 0))} novas
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            {tenantsGrowthData.length === 0 ? (
              <EmptyChartState message="Sem dados de crescimento de empresas para o período." />
            ) : (
              <div className={`${CHART_AREA_CLASS} w-full`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={tenantsGrowthData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickMargin={8} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                    <Tooltip
                      formatter={(value: number) => [intFmt.format(Number(value) || 0), 'Empresas']}
                      labelFormatter={(label) => `Dia ${String(label)}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Empresas"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none">
          <CardHeader className="space-y-1 px-4 pb-0 pt-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Crescimento de usuários</CardTitle>
            <CardDescription className="text-xs">
              Últimos 30 dias · {intFmt.format(usersGrowthData.reduce((acc, item) => acc + item.count, 0))} novos
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            {usersGrowthData.length === 0 ? (
              <EmptyChartState message="Sem dados de crescimento de usuários para o período." />
            ) : (
              <div className={`${CHART_AREA_CLASS} w-full`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={usersGrowthData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickMargin={8} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                    <Tooltip
                      formatter={(value: number) => [intFmt.format(Number(value) || 0), 'Usuários']}
                      labelFormatter={(label) => `Dia ${String(label)}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Usuários"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none">
          <CardHeader className="space-y-1 px-4 pb-0 pt-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Distribuição por plano</CardTitle>
            <CardDescription className="text-xs">Até 8 planos · empresas e MRR estimado</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            {planDistributionData.length === 0 ? (
              <EmptyChartState message="Sem dados de planos para exibir no momento." />
            ) : (
              <div className="space-y-2.5">
                <div className={`${CHART_AREA_CLASS} w-full`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={planDistributionData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                      <XAxis dataKey="plan" tick={{ fontSize: 11 }} tickMargin={8} interval={0} angle={-18} textAnchor="end" height={52} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === 'estimated_mrr_cents') return [formatCurrencyFromCents(value), 'MRR estimado'];
                          return [intFmt.format(Number(value) || 0), 'Empresas'];
                        }}
                      />
                      <Bar dataKey="tenants_count" name="Empresas" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5">
                  {planDistributionData.slice(0, 4).map((row) => (
                    <div
                      key={row.plan}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/10 px-2.5 py-1.5 text-xs"
                    >
                      <span className="text-muted-foreground truncate">{row.plan}</span>
                      <span className="font-medium tabular-nums">
                        {intFmt.format(row.tenants_count)} · {formatCurrencyFromCents(row.estimated_mrr_cents)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Alertas e operação" description="Sinalizações da plataforma e status de integrações." />
        <div className="grid gap-3 sm:gap-4 xl:grid-cols-3 2xl:gap-5">
        <Card className="border-border/60 shadow-none xl:col-span-2">
          <CardHeader className="space-y-1 px-4 pb-0 pt-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Alertas da plataforma</CardTitle>
            <CardDescription className="text-xs">Itens que merecem atenção imediata ou acompanhamento.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            {alerts.length === 0 ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/15 px-4 text-center">
                <p className="text-xs text-muted-foreground sm:text-sm">Nenhum alerta crítico no momento.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {alerts.slice(0, 6).map((alert) => {
                  const Icon = severityIcon(alert.severity);
                  return (
                    <li
                      key={`${alert.type}-${alert.title}`}
                      className="rounded-md border border-border/60 bg-muted/5 p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <p className="truncate text-sm font-medium">{alert.title}</p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{alert.description}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {typeof alert.count === 'number' ? (
                            <Badge variant="outline" className="text-[10px] font-medium">
                              {intFmt.format(safeInt(alert.count, 0))}
                            </Badge>
                          ) : null}
                          {severityBadge(alert.severity)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none">
          <CardHeader className="space-y-1 px-4 pb-0 pt-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Status operacional</CardTitle>
            <CardDescription className="text-xs">Gateways, WhatsApp e e-mail transacional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4 pt-3">
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <PlugZap className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Gateways configurados</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">
                  {intFmt.format(configuredGateways)}/{intFmt.format(gateways.length)}
                </span>
                <Badge variant={configuredGateways > 0 ? 'secondary' : 'outline'} className="text-[10px] font-medium">
                  {configuredGateways > 0 ? 'OK' : 'Sem config'}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">WhatsApp (conexões)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">
                  {intFmt.format(safeInt(whatsapp.connected, 0))}/{intFmt.format(safeInt(whatsapp.total, 0))}
                </span>
                <Badge
                  variant={safeInt(whatsapp.connected, 0) > 0 ? 'secondary' : 'outline'}
                  className="text-[10px] font-medium"
                >
                  {safeInt(whatsapp.disconnected, 0) > 0 ? `${intFmt.format(safeInt(whatsapp.disconnected, 0))} off` : 'Tudo on'}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">SMTP</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{smtp.configured ? 'Configurado' : 'Não configurado'}</span>
                <Badge variant={smtp.enabled ? 'secondary' : 'outline'} className="text-[10px] font-medium">
                  {smtp.enabled ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-dashed border-border/60 px-2.5 py-1.5">
              <span className="text-xs text-muted-foreground">Alertas críticos</span>
              <div className="flex items-center gap-1.5">
                {criticalAlerts === 0 ? (
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
                )}
                <span className="text-xs font-medium tabular-nums">{intFmt.format(criticalAlerts)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Atividade recente" description="Últimos cadastros de empresas e usuários." />
        <div className="grid gap-3 md:grid-cols-2 lg:gap-4">
        <Card className="border-border/60 shadow-none">
          <CardHeader className="space-y-1 px-4 pb-0 pt-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Últimas empresas</CardTitle>
            <CardDescription className="text-xs">Cadastros mais recentes na plataforma.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            {recentTenants.length ? (
              <ul className="space-y-2">
                {recentTenants.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 text-sm last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{row.name}</span>
                      <span className="text-muted-foreground ml-2">({row.slug})</span>
                    </div>
                    <span className="shrink-0 text-muted-foreground text-xs sm:text-sm">
                      {formatDate(row.created_at)}
                      {row.plan_name ? ` · ${row.plan_name}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhuma empresa cadastrada.</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-none">
          <CardHeader className="space-y-1 px-4 pb-0 pt-4">
            <CardTitle className="text-sm font-semibold tracking-tight">Últimos usuários</CardTitle>
            <CardDescription className="text-xs">Novos usuários e empresa vinculada, quando houver.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            {recentUsers.length ? (
              <ul className="space-y-2">
                {recentUsers.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 text-sm last:border-0 last:pb-0"
                  >
                    <span className="font-medium min-w-0 truncate">{row.email}</span>
                    <span className="shrink-0 text-muted-foreground text-xs sm:text-sm">
                      {formatDate(row.created_at)}
                      {row.tenant_name ? ` · ${row.tenant_name}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhum usuário cadastrado.</p>
            )}
          </CardContent>
        </Card>
        </div>
      </section>
    </div>
  );
}
