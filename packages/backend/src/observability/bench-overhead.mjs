/**
 * Microbench local — overhead de record SQL/worker (OBS_METRICS=1).
 * Uso: node --import tsx packages/backend/src/observability/bench-overhead.mjs
 */
process.env.OBS_METRICS = '1';
process.env.OBS_METRICS_SAMPLE_RATE = '1';

const { resetMetricsRegistryForTests, getMetricsSnapshot } = await import('./registry.ts');
const { recordSqlQuery } = await import('./sqlMetrics.ts');
const { recordWorkerRun } = await import('./workerMetrics.ts');

resetMetricsRegistryForTests();
const N = 5000;
const memBefore = process.memoryUsage().rss;
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) {
  recordSqlQuery(1 + (i % 20), true);
  recordWorkerRun('bench', 1, true);
}
const t1 = process.hrtime.bigint();
const ms = Number(t1 - t0) / 1e6;
const snap = getMetricsSnapshot();
console.log(
  JSON.stringify(
    {
      ops: N * 2,
      total_ms: Number(ms.toFixed(3)),
      per_op_us: Number(((ms / (N * 2)) * 1000).toFixed(3)),
      sql: snap.counters.sql_queries_total?.[0]?.value,
      workers: snap.counters.worker_runs_total?.[0]?.value,
      rss_before_mb: Number((memBefore / 1048576).toFixed(2)),
      rss_after_mb: Number((process.memoryUsage().rss / 1048576).toFixed(2)),
    },
    null,
    2,
  ),
);
