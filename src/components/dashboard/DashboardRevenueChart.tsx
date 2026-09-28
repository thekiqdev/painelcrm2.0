import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardRevenueChartRow } from './dashboardChartTypes';
import { formatDashboardCurrency } from './dashboardChartFormat';

const axisTickProps = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 };

type DashboardRevenueChartProps = {
  chartRows: DashboardRevenueChartRow[];
  chartShowReceived: boolean;
  chartShowProjected: boolean;
};

export default function DashboardRevenueChart({
  chartRows,
  chartShowReceived,
  chartShowProjected,
}: DashboardRevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
        <XAxis dataKey="name" tick={axisTickProps} />
        <YAxis tick={axisTickProps} />
        <Tooltip
          formatter={(value: number, name: string) => [formatDashboardCurrency(Number(value)), name]}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as DashboardRevenueChartRow;
            return (
              <div className="space-y-1 rounded-md border bg-background p-3 text-xs shadow-sm">
                <p className="font-medium">{label}</p>
                {chartShowReceived ? (
                  <p className="text-emerald-700 dark:text-emerald-400">
                    Realizada: {formatDashboardCurrency(row.receita_recebida)}
                  </p>
                ) : null}
                {chartShowProjected ? (
                  <p className="text-emerald-600/90 dark:text-emerald-300/90">
                    Prevista: {formatDashboardCurrency(row.receita_futura)}
                  </p>
                ) : null}
                <p className="border-t pt-1 text-muted-foreground">
                  Total: {formatDashboardCurrency(row.receita_total_potencial)}
                </p>
              </div>
            );
          }}
        />
        <Legend />
        {chartShowReceived ? (
          <Bar
            dataKey="receita_recebida"
            stackId="r"
            fill="hsl(142 76% 36%)"
            name="Receita realizada"
            radius={chartShowProjected ? [0, 0, 0, 0] : [4, 4, 0, 0]}
          />
        ) : null}
        {chartShowProjected ? (
          <Bar
            dataKey="receita_futura"
            stackId="r"
            fill="hsl(142 55% 52%)"
            name="Receita prevista"
            radius={[4, 4, 0, 0]}
          />
        ) : null}
      </BarChart>
    </ResponsiveContainer>
  );
}
