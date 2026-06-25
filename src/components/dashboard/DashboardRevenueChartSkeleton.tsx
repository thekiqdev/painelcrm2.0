/** Skeleton local enquanto o chunk Recharts carrega (mesmas dimensões do gráfico). */
export function DashboardRevenueChartSkeleton() {
  return (
    <div className="flex h-full flex-col justify-end gap-2 px-2 pb-4 pt-6" aria-hidden>
      <div className="flex h-full items-end justify-between gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-full max-w-[3rem] animate-pulse rounded-t-md bg-muted/60"
            style={{ height: `${35 + (i % 4) * 12}%` }}
          />
        ))}
      </div>
      <div className="mx-auto h-3 w-32 animate-pulse rounded bg-muted/50" />
    </div>
  );
}
