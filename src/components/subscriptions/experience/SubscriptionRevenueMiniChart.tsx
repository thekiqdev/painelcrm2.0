import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { buildRevenueChartMonths, chartHasData } from '@/lib/billingSubscriptionExperiencePolish';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { cn } from '@/lib/utils';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  className?: string;
  height?: number;
};

export function SubscriptionRevenueMiniChart({ detail, className, height = 160 }: Props) {
  const data = useMemo(() => buildRevenueChartMonths(detail), [detail]);
  const hasData = chartHasData(data);

  if (!hasData) {
    return (
      <div
        className={cn('flex items-center justify-center text-xs text-muted-foreground rounded-lg border border-dashed bg-muted/10', className)}
        style={{ height }}
        role="img"
        aria-label="Sem dados de receita nos últimos 12 meses"
      >
        Sem dados nos últimos 12 meses
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)} style={{ height }} role="img" aria-label="Gráfico de receita dos últimos 12 meses">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={28} />
          <Tooltip
            contentStyle={{ fontSize: 11 }}
            formatter={(value: number, name: string) => {
              if (name === 'receita') return [`R$ ${value.toFixed(0)}`, 'Receita'];
              return [value, name === 'pagamentos' ? 'Pagamentos' : 'Atrasos'];
            }}
          />
          <Bar dataKey="receita" fill="hsl(142 76% 36%)" name="receita" radius={[2, 2, 0, 0]} />
          <Bar dataKey="atrasos" fill="hsl(0 72% 51%)" name="atrasos" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
