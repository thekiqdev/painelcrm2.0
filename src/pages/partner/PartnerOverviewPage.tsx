import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, Copy, KeyRound, Package, Users, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/entities/StatCard';
import { COMMERCIAL_SUMMARY_GRID_4 } from '@/lib/commercialListUi';
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerSectionHeader } from './PartnerSectionHeader';
import { billingIntervalLabel, formatBrlCents } from './partnerTypes';

export default function PartnerOverviewPage() {
  const navigate = useNavigate();
  const {
    me,
    isSeller,
    customers,
    sellers,
    licenses,
    plans,
    gateway,
    houseLink,
    sellerLink,
    sellerEarnings,
    setupSteps,
    setupProgress,
    nextSetupStep,
    copySaleLink,
  } = usePartnerPanel();

  if (!me) return null;

  if (isSeller) {
    const link = sellerLink?.sale_url;
    return (
      <div className="space-y-6">
        <PartnerSectionHeader
          title="Seu painel"
          description="Compartilhe seu link e acompanhe seus ganhos."
        />
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Seu link de vendas</CardTitle>
            <CardDescription>Clientes que entrarem por este link ficam atribuídos a você.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {link ? (
              <>
                <p className="break-all rounded-md border bg-muted/30 px-3 py-2 text-sm">{link}</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void copySaleLink(link)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar link
                  </Button>
                  <Badge variant="secondary">Pronto para compartilhar</Badge>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Carregando link…</p>
            )}
          </CardContent>
        </Card>
        <div className={COMMERCIAL_SUMMARY_GRID_4}>
          <StatCard
            label="Disponível"
            value={
              sellerEarnings
                ? formatBrlCents(sellerEarnings.available_cents)
                : '—'
            }
            icon={Package}
            iconClassName="text-emerald-600"
          />
          <StatCard
            label="Já pago"
            value={sellerEarnings ? formatBrlCents(sellerEarnings.paid_cents) : '—'}
            icon={Package}
            iconClassName="text-crm-primary"
          />
        </div>
        <Button variant="outline" onClick={() => navigate('/partner/commissions')}>
          Ver extrato de ganhos
        </Button>
      </div>
    );
  }

  const activeSellers = sellers.filter((s) => s.status === 'active').length;
  const activeCustomers = customers.filter((c) => c.status === 'active').length;
  const activePlans = plans.filter((p) => p.status === 'active');
  const setupIncomplete = setupSteps.some((s) => !s.done);
  const licensePct =
    licenses && licenses.purchased_seats > 0
      ? Math.min(100, Math.round((licenses.used_seats / licenses.purchased_seats) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title={me.profile.product_name || 'Visão geral'}
        description={`Canal de ${me.profile.public_name || 'sua agência'} · acompanhe clientes, licenças e configuração.`}
        actions={
          houseLink ? (
            <Button variant="secondary" onClick={() => void copySaleLink(houseLink.sale_url)}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar link de vendas
            </Button>
          ) : null
        }
      />

      {setupIncomplete ? (
        <Card className="border-crm-primary/25 bg-crm-primary/[0.04] shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Vamos configurar seu canal</CardTitle>
                <CardDescription>
                  {setupSteps.filter((s) => s.done).length} de {setupSteps.length} etapas concluídas
                </CardDescription>
              </div>
              <Badge variant="outline">{setupProgress}%</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={setupProgress} className="h-2" />
            <ul className="space-y-2">
              {setupSteps.map((step) => (
                <li key={step.id} className="flex items-center gap-2 text-sm">
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={step.done ? 'text-muted-foreground line-through' : 'text-foreground'}>
                    {step.label}
                  </span>
                </li>
              ))}
            </ul>
            {nextSetupStep ? (
              <Button onClick={() => navigate(nextSetupStep.to)}>Continuar configuração</Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/80 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Canal configurado · {setupProgress}%</span>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/partner/config/identity">Revisar configuração</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className={COMMERCIAL_SUMMARY_GRID_4}>
        <StatCard
          label="Clientes"
          value={`${activeCustomers} / ${customers.length}`}
          icon={Users}
          iconClassName="text-crm-primary"
        />
        <StatCard
          label="Vendedores"
          value={`${activeSellers} ativos`}
          icon={UserPlus}
          iconClassName="text-violet-600"
        />
        <StatCard
          label="Licenças"
          value={
            licenses
              ? `${licenses.used_seats} / ${licenses.purchased_seats}`
              : '—'
          }
          icon={KeyRound}
          iconClassName="text-amber-600"
        />
        <StatCard
          label="Planos ativos"
          value={String(activePlans.length)}
          icon={Package}
          iconClassName="text-emerald-600"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Consumo de licenças</CardTitle>
            <CardDescription>
              {licenses
                ? `${licenses.available_seats} disponíveis · custo unitário ${formatBrlCents(licenses.unit_cost_cents)}`
                : 'Carregando…'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={licensePct} className="h-2.5" />
            <p className="text-xs text-muted-foreground">{licensePct}% do pool em uso</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/partner/licenses')}>
              Ver detalhes
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Status do canal</CardTitle>
            <CardDescription>O que precisa da sua atenção agora.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>Gateway</span>
              <Badge variant={gateway?.can_charge ? 'default' : 'outline'}>
                {gateway?.can_charge ? 'Pronto para cobrar' : 'Configurar'}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Domínio</span>
              <Badge variant="outline">{me.profile.domain_status}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Plano em destaque</span>
              <span className="truncate text-muted-foreground">
                {activePlans[0]
                  ? `${activePlans[0].name} · ${formatBrlCents(activePlans[0].price_cents)} / ${billingIntervalLabel(activePlans[0].billing_interval)}`
                  : 'Nenhum plano publicado'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {!gateway?.can_charge ? (
                <Button size="sm" onClick={() => navigate('/partner/gateway')}>
                  Configurar gateway
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => navigate('/partner/customers')}>
                Ver clientes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
