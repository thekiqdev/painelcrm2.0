/**
 * Billing Engine V2 — Sprint 2.4B: stress tests do laboratório.
 */
import { BillingProjectionEngine } from '../../../billingProjection/billingProjectionEngine.js';
import { BillingConsistencyValidator } from '../../../billingConsistency/billingConsistencyValidator.js';
import { buildBaseContext } from './billingScenarioFactory.js';
import type { StressLevelResult } from './types.js';

const consistencyValidator = new BillingConsistencyValidator();

function heapMb(): number {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
}

async function runIterations(iterations: number, parallel: number): Promise<{
  durations: number[];
  hashes: string[];
  errors: string[];
}> {
  const context = buildBaseContext();
  const durations: number[] = [];
  const hashes: string[] = [];
  const errors: string[] = [];

  for (let batch = 0; batch < iterations; batch += parallel) {
    const batchSize = Math.min(parallel, iterations - batch);
    const results = await Promise.all(
      Array.from({ length: batchSize }, async () => {
        const started = Date.now();
        try {
          const projection = BillingProjectionEngine.project({ context, skipCache: true });
          consistencyValidator.validateFromContext(context);
          const ms = Date.now() - started;
          return { ms, hash: projection.diagnostics.hash, error: null as string | null };
        } catch (e: unknown) {
          return {
            ms: Date.now() - started,
            hash: '',
            error: e instanceof Error ? e.message : String(e),
          };
        }
      })
    );
    for (const r of results) {
      durations.push(r.ms);
      if (r.hash) hashes.push(r.hash);
      if (r.error) errors.push(r.error);
    }
  }

  return { durations, hashes, errors };
}

export async function runStressLevel(iterations: number): Promise<StressLevelResult> {
  const parallel = iterations >= 500 ? 10 : iterations >= 100 ? 5 : 1;
  const heapStart = heapMb();
  const started = Date.now();

  const first = await runIterations(iterations, parallel);
  const idempotencyHashes = await runIterations(3, 1);
  const idempotency_ok =
    idempotencyHashes.hashes.length >= 2 &&
    idempotencyHashes.hashes.every((h) => h === idempotencyHashes.hashes[0]);

  const concurrency = await Promise.all([
    runIterations(5, 5),
    runIterations(5, 5),
  ]);
  const concurrency_ok =
    concurrency.every((c) => c.errors.length === 0) && first.errors.length === 0;

  const totalMs = Date.now() - started;
  const heapEnd = heapMb();

  return {
    iterations,
    passed: first.errors.length === 0 && idempotency_ok && concurrency_ok,
    total_duration_ms: totalMs,
    avg_duration_ms:
      first.durations.length > 0
        ? Math.round(first.durations.reduce((a, b) => a + b, 0) / first.durations.length)
        : 0,
    max_duration_ms: first.durations.length > 0 ? Math.max(...first.durations) : 0,
    memory_heap_mb_start: heapStart,
    memory_heap_mb_end: heapEnd,
    memory_heap_delta_mb: Math.round((heapEnd - heapStart) * 100) / 100,
    parallel_batches: parallel,
    idempotency_ok,
    concurrency_ok,
    errors: [...first.errors, ...idempotencyHashes.errors],
  };
}

export async function runStressSuite(levels: readonly number[]): Promise<{
  levels: StressLevelResult[];
  approved: boolean;
}> {
  const results: StressLevelResult[] = [];
  for (const n of levels) {
    results.push(await runStressLevel(n));
  }
  return {
    levels: results,
    approved: results.every((r) => r.passed),
  };
}
