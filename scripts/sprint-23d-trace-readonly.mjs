/**
 * Sprint 5.0-23D — read-only runtime trace (no POST, no DB writes).
 */
import pg from 'pg';

const TENANT = '4ecc0b33-aecd-4489-a5ae-0d7c6395c35d';
const SUB_WEEKLY = 'bf6683bb-9975-4138-9e5b-05627e612363';
const CYCLE_JUL30 = 'd9b9666e-c01e-447d-a121-7a4b7bd8fc7c';
const SUB_TRACE = 'f585a448-0bb4-4ac4-976f-106efddbdd1c'; // weekly with Jul30 runtime at 15:23

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'painelcrm',
  user: 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
});

async function cycles(subId) {
  const r = await pool.query(
    `SELECT id::text, cycle_date::text, status, invoice_id::text, job_id::text
     FROM subscription_cycles WHERE subscription_id = $1 ORDER BY cycle_date`,
    [subId]
  );
  return r.rows;
}

async function subRow(subId) {
  const r = await pool.query(
    `SELECT id::text, billing_interval, next_billing_date::text, status FROM subscriptions WHERE id = $1`,
    [subId]
  );
  return r.rows[0];
}

// Minimal OCRE chronological (mirrors operationalCompetencyResolverCore)
const GENERATABLE = new Set(['pending', 'queued', 'failed', 'skipped', 'cancelled']);

function advanceWeekly(ymd) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

function resolveNextGenerate(cycles, interval) {
  const advance = interval === 'weekly' ? advanceWeekly : advanceWeekly;
  const sorted = [...cycles].sort((a, b) => a.cycle_date.localeCompare(b.cycle_date));
  if (!sorted.length) return { resolution: 'PROJECTION_ONLY' };
  const byDate = new Map(sorted.map((c) => [c.cycle_date, c]));
  let cursor = sorted[0].cycle_date;
  for (let i = 0; i < 48; i++) {
    const at = byDate.get(cursor);
    if (at) {
      if (!at.invoice_id && GENERATABLE.has(at.status)) {
        return { resolution: 'READY_TO_GENERATE', cycleId: at.id, cycleDate: at.cycle_date };
      }
      cursor = advance(at.cycle_date);
      continue;
    }
    const next = sorted.find((c) => c.cycle_date > cursor);
    if (next) {
      return { resolution: 'WAITING_MATERIALIZATION', cycleDate: cursor };
    }
    break;
  }
  return { resolution: 'PROJECTION_ONLY' };
}

function storeSignature(sub, timelineLike) {
  const tl = timelineLike
    .map((r) => `${r.cycle_id}:${r.invoice_id}:${r.operational_state}:${r.due_date}`)
    .join('|');
  return `${sub.id}:${sub.status}:${sub.next_billing_date}:${sub.latest_invoice_id ?? ''}:${tl}`;
}

async function main() {
  console.log('=== SPRINT 23D READ-ONLY TRACE ===\n');

  const sub = await subRow(SUB_WEEKLY);
  const cyc = await cycles(SUB_WEEKLY);
  console.log('CASE: bf6683bb weekly (Jul23 paid, Jul30 pending)');
  console.log('subscription:', sub);
  console.log('cycles:', cyc);
  const ocreBefore = resolveNextGenerate(cyc, sub.billing_interval);
  console.log('OCRE NEXT_GENERATE (simulated):', ocreBefore);

  // Simulate POST: Jul30 invoiced, next_billing advances to Aug6, NO Aug6 row (enqueue skipped)
  const simulatedCycles = cyc.map((c) =>
    c.id === CYCLE_JUL30
      ? { ...c, status: 'invoiced', invoice_id: 'sim-invoice-id' }
      : c
  );
  const simulatedSub = { ...sub, next_billing_date: '2026-08-06', latest_invoice_id: 'sim-invoice-id' };
  const ocreAfterNoAug = resolveNextGenerate(simulatedCycles, sub.billing_interval);
  console.log('\nAFTER POST (simulated Jul30 invoiced, NO Aug6 cycle row):');
  console.log('OCRE:', ocreAfterNoAug);

  const withAug = [
    ...simulatedCycles,
    {
      id: 'sim-aug6',
      cycle_date: '2026-08-06',
      status: 'pending',
      invoice_id: null,
      job_id: null,
    },
  ];
  const ocreAfterAug = resolveNextGenerate(withAug, sub.billing_interval);
  console.log('\nAFTER POST + Materializer Aug6 (simulated):');
  console.log('OCRE:', ocreAfterAug);

  // f585a448 trace subscription
  const sub2 = await subRow(SUB_TRACE);
  const cyc2 = await cycles(SUB_TRACE);
  console.log('\n--- Runtime trace sub f585a448 (15:23 POST evidence) ---');
  console.log('subscription:', sub2);
  console.log('cycles:', cyc2);
  console.log('OCRE now:', resolveNextGenerate(cyc2, sub2.billing_interval));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
