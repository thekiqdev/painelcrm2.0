import React from 'react';
import { KeyRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/entities/StatCard';
import { COMMERCIAL_SUMMARY_GRID_4 } from '@/lib/commercialListUi';
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerSectionHeader } from './PartnerSectionHeader';
import { formatBrlCents } from './partnerTypes';

export default function PartnerLicensesPage() {
  const { licenses } = usePartnerPanel();

  const pct =
    licenses && licenses.purchased_seats > 0
      ? Math.min(100, Math.round((licenses.used_seats / licenses.purchased_seats) * 100))
      : 0;

  const nearLimit = Boolean(licenses && licenses.available_seats <= Math.max(1, Math.floor(licenses.purchased_seats * 0.1)));

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title="Licenças"
        description="Visão operacional do pool: 1 licença = 1 usuário nos clientes do canal."
      />

      <div className={COMMERCIAL_SUMMARY_GRID_4}>
        <StatCard
          label="Contratadas"
          value={licenses ? String(licenses.purchased_seats) : '—'}
          icon={KeyRound}
        />
        <StatCard
          label="Utilizadas"
          value={licenses ? String(licenses.used_seats) : '—'}
          icon={KeyRound}
          iconClassName="text-crm-primary"
        />
        <StatCard
          label="Disponíveis"
          value={licenses ? String(licenses.available_seats) : '—'}
          icon={KeyRound}
          iconClassName="text-emerald-600"
        />
        <StatCard
          label="Custo unitário"
          value={licenses ? formatBrlCents(licenses.unit_cost_cents) : '—'}
          icon={KeyRound}
          iconClassName="text-amber-600"
        />
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Consumo</CardTitle>
          <CardDescription>
            {licenses
              ? `${licenses.used_seats} de ${licenses.purchased_seats} licenças em uso`
              : 'Carregando pool…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <p className="text-3xl font-bold tracking-tight">
              {licenses ? `${licenses.used_seats} / ${licenses.purchased_seats}` : '—'}
            </p>
            <p className="text-sm text-muted-foreground">{pct}%</p>
          </div>
          <Progress value={pct} className="h-3" />
          {licenses?.floor_price_cents != null ? (
            <p className="text-xs text-muted-foreground">
              Piso comercial do programa: {formatBrlCents(licenses.floor_price_cents)}
            </p>
          ) : null}
          {nearLimit ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Você está próximo do limite do pool. Solicite mais licenças ao Super Admin quando
              necessário.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
