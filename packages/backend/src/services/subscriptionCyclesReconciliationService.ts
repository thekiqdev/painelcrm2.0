/**
 * Reconciliação somente leitura: subscription_cycles × billing_recurring_jobs × customer_invoices (Etapa 4).
 * Não altera dados. Adequado a staging/produção para avaliar cutover futuro.
 */
import { pool } from '../utils/db.js';

const DEFAULT_SAMPLE = 15;

export type SubscriptionCyclesReconciliationReport = {
  generated_at_iso: string;
  subscription_cycles_table_exists: boolean;
  summary: {
    invoiced_cycle_missing_invoice_id: number;
    customer_invoice_subscription_missing_cycle: number;
    completed_job_customer_invoice_cycle_mismatch: number;
    queued_cycle_without_active_job: number;
    processing_cycle_without_processing_job: number;
    terminal_cycle_missing_reason: number;
    invoiced_cycle_invoice_orphan_or_wrong_subscription: number;
  };
  samples: {
    invoiced_cycle_missing_invoice_id: SampleRow[];
    customer_invoice_subscription_missing_cycle: SampleRow[];
    completed_job_customer_invoice_cycle_mismatch: SampleRow[];
    queued_cycle_without_active_job: SampleRow[];
    processing_cycle_without_processing_job: SampleRow[];
    terminal_cycle_missing_reason: SampleRow[];
    invoiced_cycle_invoice_orphan_or_wrong_subscription: SampleRow[];
  };
  notes_pt: string[];
};

type SampleRow = Record<string, string | null>;

function isMissingSubscriptionCyclesTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return (
    code === '42P01' ||
    /relation\s+["']?subscription_cycles["']?\s+does not exist/i.test(msg)
  );
}

async function tableExists(): Promise<boolean> {
  try {
    const r = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'subscription_cycles'`
    );
    return parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  } catch {
    return false;
  }
}

/** Mesma noção de ciclo lógico que `BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE` (cycle_key canónico = data). */
const JOB_SAME_LOGICAL_CYCLE_AS_SC = `j.subscription_id = sc.subscription_id
  AND j.tenant_id = sc.tenant_id
  AND (
    j.cycle_key = sc.cycle_date::text
    OR (
      length(trim(j.cycle_key)) > 10
      AND left(trim(j.cycle_key), 10) = sc.cycle_date::text
      AND (substring(trim(j.cycle_key), 11, 1) IN ('T', 't', ' '))
    )
  )`;

async function selectSamples(
  sql: string,
  params: unknown[],
  limit: number
): Promise<{ rows: SampleRow[]; count: number }> {
  const countSql = `SELECT COUNT(*)::text AS c FROM (${sql}) sub`;
  const countR = await pool.query<{ c: string }>(countSql, params);
  const count = parseInt(countR.rows[0]?.c ?? '0', 10);
  const limited = `${sql} LIMIT $${params.length + 1}`;
  const rowsR = await pool.query<Record<string, unknown>>(limited, [...params, limit]);
  const rows: SampleRow[] = rowsR.rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, v == null ? null : String(v)])
    )
  );
  return { rows, count };
}

/**
 * Executa todas as verificações e devolve relatório com contagens totais e amostras (read-only).
 */
export async function runSubscriptionCyclesReconciliation(options?: {
  sampleLimit?: number;
}): Promise<SubscriptionCyclesReconciliationReport> {
  const sampleLimit = Math.min(Math.max(options?.sampleLimit ?? DEFAULT_SAMPLE, 1), 200);
  const generated_at_iso = new Date().toISOString();
  const notes_pt: string[] = [
    'Relatório apenas leitura (Etapa 4). Nenhuma linha foi alterada.',
    'Em ambientes sem migração 141, a tabela subscription_cycles pode não existir.',
  ];

  let exists = await tableExists();
  if (!exists) {
    return {
      generated_at_iso,
      subscription_cycles_table_exists: false,
      summary: {
        invoiced_cycle_missing_invoice_id: 0,
        customer_invoice_subscription_missing_cycle: 0,
        completed_job_customer_invoice_cycle_mismatch: 0,
        queued_cycle_without_active_job: 0,
        processing_cycle_without_processing_job: 0,
        terminal_cycle_missing_reason: 0,
        invoiced_cycle_invoice_orphan_or_wrong_subscription: 0,
      },
      samples: {
        invoiced_cycle_missing_invoice_id: [],
        customer_invoice_subscription_missing_cycle: [],
        completed_job_customer_invoice_cycle_mismatch: [],
        queued_cycle_without_active_job: [],
        processing_cycle_without_processing_job: [],
        terminal_cycle_missing_reason: [],
        invoiced_cycle_invoice_orphan_or_wrong_subscription: [],
      },
      notes_pt,
    };
  }

  try {
    await pool.query(`SELECT 1 FROM subscription_cycles LIMIT 1`);
  } catch (e: unknown) {
    if (isMissingSubscriptionCyclesTable(e)) {
      exists = false;
      return {
        generated_at_iso,
        subscription_cycles_table_exists: false,
        summary: {
          invoiced_cycle_missing_invoice_id: 0,
          customer_invoice_subscription_missing_cycle: 0,
          completed_job_customer_invoice_cycle_mismatch: 0,
          queued_cycle_without_active_job: 0,
          processing_cycle_without_processing_job: 0,
          terminal_cycle_missing_reason: 0,
          invoiced_cycle_invoice_orphan_or_wrong_subscription: 0,
        },
        samples: {
          invoiced_cycle_missing_invoice_id: [],
          customer_invoice_subscription_missing_cycle: [],
          completed_job_customer_invoice_cycle_mismatch: [],
          queued_cycle_without_active_job: [],
          processing_cycle_without_processing_job: [],
          terminal_cycle_missing_reason: [],
          invoiced_cycle_invoice_orphan_or_wrong_subscription: [],
        },
        notes_pt,
      };
    }
    throw e;
  }

  const q1 = `
    SELECT sc.id::text AS cycle_id, sc.tenant_id::text, sc.subscription_id::text, sc.cycle_date::text, sc.status, sc.job_id::text
    FROM subscription_cycles sc
    WHERE sc.status = 'invoiced' AND sc.invoice_id IS NULL`;

  const q2 = `
    SELECT ci.id::text AS invoice_id, ci.tenant_id::text, ci.subscription_id::text, ci.period_start::text, ci.period_end::text
    FROM customer_invoices ci
    WHERE ci.subscription_id IS NOT NULL
      AND ci.period_start IS NOT NULL
      AND ci.origin = 'subscription'
      AND NOT EXISTS (
        SELECT 1 FROM subscription_cycles sc2
        WHERE sc2.subscription_id = ci.subscription_id AND sc2.cycle_date = ci.period_start
      )`;

  const q3 = `
    SELECT br.id::text AS job_id, br.tenant_id::text, br.subscription_id::text, br.cycle_key,
           br.result_invoice_id::text, br.completion_outcome,
           sc.id::text AS cycle_id, sc.status AS cycle_status, sc.invoice_id::text AS cycle_invoice_id
    FROM billing_recurring_jobs br
    LEFT JOIN subscription_cycles sc
      ON sc.subscription_id = br.subscription_id
     AND sc.tenant_id = br.tenant_id
     AND sc.cycle_date = left(trim(br.cycle_key), 10)::date
    WHERE br.status = 'completed'
      AND br.result_invoice_id IS NOT NULL
      AND trim(br.cycle_key) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      AND (br.result_invoice_type IS NULL OR br.result_invoice_type = 'customer_invoice')
      AND (
        sc.id IS NULL
        OR sc.status IS DISTINCT FROM 'invoiced'
        OR sc.invoice_id IS DISTINCT FROM br.result_invoice_id
      )`;

  const q4 = `
    SELECT sc.id::text AS cycle_id, sc.tenant_id::text, sc.subscription_id::text, sc.cycle_date::text, sc.status, sc.job_id::text
    FROM subscription_cycles sc
    WHERE sc.status = 'queued'
      AND NOT EXISTS (
        SELECT 1 FROM billing_recurring_jobs j
        WHERE ${JOB_SAME_LOGICAL_CYCLE_AS_SC}
          AND j.status IN ('pending', 'processing')
      )`;

  const q5 = `
    SELECT sc.id::text AS cycle_id, sc.tenant_id::text, sc.subscription_id::text, sc.cycle_date::text, sc.status, sc.job_id::text
    FROM subscription_cycles sc
    WHERE sc.status = 'processing'
      AND NOT EXISTS (
        SELECT 1 FROM billing_recurring_jobs j
        WHERE ${JOB_SAME_LOGICAL_CYCLE_AS_SC}
          AND j.status = 'processing'
      )`;

  const q6 = `
    SELECT sc.id::text AS cycle_id, sc.tenant_id::text, sc.subscription_id::text, sc.cycle_date::text, sc.status,
           sc.skipped_reason, sc.error_message
    FROM subscription_cycles sc
    WHERE (
      (sc.status IN ('skipped', 'cancelled') AND sc.skipped_reason IS NULL)
      OR (sc.status = 'failed' AND sc.skipped_reason IS NULL AND (sc.error_message IS NULL OR trim(sc.error_message) = ''))
    )`;

  const q7 = `
    SELECT sc.id::text AS cycle_id, sc.tenant_id::text, sc.subscription_id::text, sc.invoice_id::text,
           ci.id::text AS invoice_row_id, ci.subscription_id::text AS invoice_subscription_id
    FROM subscription_cycles sc
    LEFT JOIN customer_invoices ci ON ci.id = sc.invoice_id
    WHERE sc.status = 'invoiced'
      AND sc.invoice_id IS NOT NULL
      AND (ci.id IS NULL OR ci.subscription_id IS DISTINCT FROM sc.subscription_id)`;

  const [s1, s2, s3, s4, s5, s6, s7] = await Promise.all([
    selectSamples(q1, [], sampleLimit),
    selectSamples(q2, [], sampleLimit),
    selectSamples(q3, [], sampleLimit),
    selectSamples(q4, [], sampleLimit),
    selectSamples(q5, [], sampleLimit),
    selectSamples(q6, [], sampleLimit),
    selectSamples(q7, [], sampleLimit),
  ]);

  return {
    generated_at_iso,
    subscription_cycles_table_exists: true,
    summary: {
      invoiced_cycle_missing_invoice_id: s1.count,
      customer_invoice_subscription_missing_cycle: s2.count,
      completed_job_customer_invoice_cycle_mismatch: s3.count,
      queued_cycle_without_active_job: s4.count,
      processing_cycle_without_processing_job: s5.count,
      terminal_cycle_missing_reason: s6.count,
      invoiced_cycle_invoice_orphan_or_wrong_subscription: s7.count,
    },
    samples: {
      invoiced_cycle_missing_invoice_id: s1.rows,
      customer_invoice_subscription_missing_cycle: s2.rows,
      completed_job_customer_invoice_cycle_mismatch: s3.rows,
      queued_cycle_without_active_job: s4.rows,
      processing_cycle_without_processing_job: s5.rows,
      terminal_cycle_missing_reason: s6.rows,
      invoiced_cycle_invoice_orphan_or_wrong_subscription: s7.rows,
    },
    notes_pt,
  };
}
