/**
 * Insight de recorrência para a tela da fatura (CRM): subscription + último job, sem duplicar o motor de billing.
 */
import { pool } from '../utils/db.js';
import { getInvoiceById } from './customerBillingService.js';
import {
  BILLING_RECURRING_JOB_OUTCOME,
  BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE,
  describeRenewalEnqueueForSubscriptionId,
  normalizeBillingCycleKeyYmd,
  renewalEnqueueBlockReasonMessagePt,
  type TryEnqueueRenewalReason,
} from './recurringBillingJobService.js';
import {
  clampRecurringInvoiceGenerateDaysBeforeDue,
  computeRecurringInvoiceGenerationDateYmd,
} from '../utils/billingGenerationDate.js';
import { effectiveRecurringGenerateDaysBeforeDue } from '../utils/billingIntervalGenerationCap.js';
import type { BillingWindowReason } from './billingTimeWindowObservability.js';
import { billingRecurringJobsHasCompletionColumns } from './billingRecurringJobsOpsService.js';
import { isSubscriptionCyclesReadEnabled } from './subscriptionCyclesReadFlagService.js';
import {
  findSubscriptionCycleForInvoice,
  listSubscriptionCyclesBySubscriptionId,
} from './subscriptionCyclesQueryService.js';
import {
  derivePresentationFromMatchedCycle,
  toSubscriptionCycleInsightRow,
} from './subscriptionCyclesInsightPresentation.js';

export type { RecurrenceVisualTag } from './recurrenceInsightVisualTag.js';
import type { RecurrenceVisualTag } from './recurrenceInsightVisualTag.js';
import type { SubscriptionCycleInsightRow } from './subscriptionCyclesInsightPresentation.js';

export interface CustomerInvoiceRecurrenceInsight {
  is_recurring: boolean;
  visual_tag: RecurrenceVisualTag;
  /** Texto curto para badge principal */
  status_badge_pt: string;
  /** Na fila de processamento (pending/processing) */
  is_queued: boolean;
  subscription: {
    id: string;
    status: string;
    billing_interval: string;
    next_billing_date: string;
    cancel_at_period_end: boolean;
    current_period_start: string | null;
    current_period_end: string | null;
    type: string;
  } | null;
  /**
   * Datas desta fatura (snapshot no registro); não mudam quando `subscriptions.next_billing_date` é alterado.
   */
  this_invoice: {
    period_start: string | null;
    period_end: string | null;
    due_date: string | null;
  };
  /**
   * Espelho de `subscription.next_billing_date` — próximo ciclo **global** da assinatura (não é “próxima cobrança desta fatura”).
   * @deprecated Preferir `subscription.next_billing_date` na UI; mantido para compatibilidade.
   */
  next_charge_date: string | null;
  periodicity_label_pt: string | null;
  last_processing_at: string | null;
  /** Mensagem para utilizador comum */
  last_result_summary_pt: string;
  /** Quando há problema ou atenção */
  problem_hint_pt: string | null;
  pending_jobs_count: number;
  latest_job: {
    id: string;
    status: string;
    cycle_key: string;
    updated_at: string;
    completion_outcome: string | null;
    completion_detail: string | null;
    result_invoice_id: string | null;
    error_message: string | null;
  } | null;
  /** Última fatura criada pelo job (quando aplicável). */
  last_generated_invoice_id: string | null;
  /** Dados para operador (tenant admin); omitidos na UI se não for operador. */
  operational: {
    subscription_id: string;
    latest_job_id: string | null;
    completion_outcome: string | null;
    completion_detail_raw: string | null;
    completion_detail_parsed: Record<string, unknown> | null;
    result_invoice_id: string | null;
  } | null;
  /**
   * Estado de enfileiramento para o ciclo atual (`subscription.next_billing_date` = cycle_key).
   * Calculado no backend (mesma lógica que PATCH / scheduler / worker pós-mismatch).
   */
  renewal_enqueue_status: {
    current_cycle_key: string;
    pending_jobs_for_current_cycle: number;
    why_no_job_for_cycle: {
      code: TryEnqueueRenewalReason | 'eligible_no_row_yet';
      message_pt: string;
      window_reason: BillingWindowReason | null;
      predicted_insert: string | null;
    } | null;
  } | null;
  /** Preferências do tenant para pré-visualizar geração vs vencimento do ciclo. */
  tenant_recurring_generation?: {
    days_before_due: number;
    cycle_due_ymd: string;
    generation_date_ymd: string;
    recurring_generate_time_local: string | null;
    timezone: string | null;
  } | null;
  /**
   * Só quando a flag global `subscription_cycles_read` está ativa (superadmin_settings).
   * Lista ciclos reais; badge/resumo podem ser derivados do `matched_cycle` quando existir.
   */
  subscription_cycles_insight?: {
    matched_cycle: SubscriptionCycleInsightRow | null;
    recent_cycles: SubscriptionCycleInsightRow[];
  };
}

function billingIntervalLabelPt(interval: string): string {
  const m: Record<string, string> = {
    weekly: 'Semanal',
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    semi_annual: 'Semestral',
    yearly: 'Anual',
  };
  return m[interval] ?? interval;
}

function parseDetailJson(raw: string | null): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    return typeof o === 'object' && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function ymdOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function thisInvoiceSnapshotFromInvoiceRow(inv: NonNullable<Awaited<ReturnType<typeof getInvoiceById>>>): CustomerInvoiceRecurrenceInsight['this_invoice'] {
  return {
    period_start: ymdOrNull(inv.period_start),
    period_end: ymdOrNull(inv.period_end),
    due_date: ymdOrNull(inv.due_date),
  };
}

function problemHintFromDetail(parsed: Record<string, unknown> | null, outcome: string | null): string | null {
  if (!parsed && !outcome) return null;
  const reason = parsed?.reason;
  if (reason === 'no_eligible_recurring_items_for_cycle' || outcome === BILLING_RECURRING_JOB_OUTCOME.COMPLETED_NO_INVOICE_NO_ELIGIBLE_ITEMS) {
    return 'Nenhum item elegível para gerar fatura neste ciclo (ver itens recorrentes / agenda).';
  }
  const note = parsed?.operational_note;
  if (typeof note === 'string' && note.trim()) return note.trim();
  return null;
}

function subscriptionEffectivelyCancelled(row: {
  status: string;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
}): boolean {
  if (row.status !== 'active') return true;
  if (row.cancel_at_period_end && row.current_period_end) {
    const t = new Date(row.current_period_end).getTime();
    if (!Number.isNaN(t) && Date.now() > t) return true;
  }
  return false;
}

export async function getCustomerInvoiceRecurrenceInsight(
  tenantId: string,
  invoiceId: string
): Promise<CustomerInvoiceRecurrenceInsight> {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) {
    throw new Error('Fatura não encontrada');
  }
  if (!invoice.subscription_id) {
    return {
      is_recurring: false,
      visual_tag: 'not_recurring',
      status_badge_pt: 'Não recorrente',
      is_queued: false,
      subscription: null,
      this_invoice: thisInvoiceSnapshotFromInvoiceRow(invoice),
      next_charge_date: null,
      periodicity_label_pt: null,
      last_processing_at: null,
      last_result_summary_pt: 'Esta fatura não está ligada a uma assinatura recorrente.',
      problem_hint_pt: null,
      pending_jobs_count: 0,
      latest_job: null,
      last_generated_invoice_id: null,
      operational: null,
      renewal_enqueue_status: null,
      tenant_recurring_generation: null,
    };
  }

  const subR = await pool.query<{
    id: string;
    status: string;
    billing_interval: string;
    next_billing_date: string;
    cancel_at_period_end: boolean;
    current_period_start: string | null;
    current_period_end: string | null;
    type: string;
  }>(
    `SELECT id, status, billing_interval, next_billing_date::text, cancel_at_period_end,
            current_period_start::text, current_period_end::text, type
     FROM subscriptions
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [invoice.subscription_id, tenantId]
  );
  const sub = subR.rows[0] ?? null;
  if (!sub) {
    return {
      is_recurring: true,
      visual_tag: 'cancelled',
      status_badge_pt: 'Cancelada',
      is_queued: false,
      subscription: null,
      this_invoice: thisInvoiceSnapshotFromInvoiceRow(invoice),
      next_charge_date: null,
      periodicity_label_pt: null,
      last_processing_at: null,
      last_result_summary_pt: 'Assinatura não encontrada para este tenant.',
      problem_hint_pt: 'Possível inconsistência de dados.',
      pending_jobs_count: 0,
      latest_job: null,
      last_generated_invoice_id: null,
      operational: {
        subscription_id: invoice.subscription_id,
        latest_job_id: null,
        completion_outcome: null,
        completion_detail_raw: null,
        completion_detail_parsed: null,
        result_invoice_id: null,
      },
      renewal_enqueue_status: null,
      tenant_recurring_generation: null,
    };
  }

  const hasOc = await billingRecurringJobsHasCompletionColumns();

  const [pendingR, tenantPrefsR] = await Promise.all([
    pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM billing_recurring_jobs
       WHERE subscription_id = $1 AND tenant_id = $2 AND status IN ('pending', 'processing')`,
      [sub.id, tenantId]
    ),
    pool.query<{
      recurring_invoice_generate_days_before_due: number;
      recurring_invoice_generate_days_before_due_weekly: number | null;
      recurring_generate_time_local: string | null;
      timezone: string | null;
    }>(
      `SELECT COALESCE(recurring_invoice_generate_days_before_due, 0)::int AS recurring_invoice_generate_days_before_due,
              recurring_invoice_generate_days_before_due_weekly,
              recurring_generate_time_local::text,
              timezone::text
       FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId]
    ),
  ]);
  const pending_jobs_count = parseInt(pendingR.rows[0]?.c ?? '0', 10);
  const tenantPrefRow = tenantPrefsR.rows[0] ?? null;
  const cycleDueYmd =
    normalizeBillingCycleKeyYmd(sub.next_billing_date) || String(sub.next_billing_date ?? '').trim().slice(0, 10);
  const daysBefore = effectiveRecurringGenerateDaysBeforeDue({
    general: tenantPrefRow?.recurring_invoice_generate_days_before_due ?? 0,
    weekly: tenantPrefRow?.recurring_invoice_generate_days_before_due_weekly ?? null,
    billingInterval: sub.billing_interval || 'monthly',
  });
  const genTime =
    tenantPrefRow?.recurring_generate_time_local != null
      ? String(tenantPrefRow.recurring_generate_time_local).trim().slice(0, 5)
      : null;
  const tenant_recurring_generation: CustomerInvoiceRecurrenceInsight['tenant_recurring_generation'] =
    cycleDueYmd.length === 10
      ? {
          days_before_due: daysBefore,
          cycle_due_ymd: cycleDueYmd,
          generation_date_ymd: computeRecurringInvoiceGenerationDateYmd(cycleDueYmd, daysBefore),
          recurring_generate_time_local: genTime && /^\d{2}:\d{2}$/.test(genTime) ? genTime : null,
          timezone: tenantPrefRow?.timezone?.trim() || null,
        }
      : null;

  const latestSelect = hasOc
    ? `SELECT id::text, status, cycle_key, scheduled_at::text, updated_at::text,
              completion_outcome, completion_detail, result_invoice_id::text, error_message`
    : `SELECT id::text, status, cycle_key, scheduled_at::text, updated_at::text,
              NULL::text AS completion_outcome, NULL::text AS completion_detail,
              result_invoice_id::text, error_message`;

  const latestR = await pool.query<{
    id: string;
    status: string;
    cycle_key: string;
    updated_at: string;
    completion_outcome: string | null;
    completion_detail: string | null;
    result_invoice_id: string | null;
    error_message: string | null;
  }>(
    `${latestSelect}
     FROM billing_recurring_jobs
     WHERE subscription_id = $1 AND tenant_id = $2
     ORDER BY updated_at DESC
     LIMIT 1`,
    [sub.id, tenantId]
  );
  const latest = latestR.rows[0] ?? null;

  const insightCycleCanonical =
    normalizeBillingCycleKeyYmd(sub.next_billing_date) || sub.next_billing_date;
  const pendingCycleR = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM billing_recurring_jobs
     WHERE ${BILLING_JOBS_WHERE_SUB_TENANT_SAME_LOGICAL_CYCLE}
       AND status IN ('pending', 'processing')`,
    [sub.id, tenantId, insightCycleCanonical]
  );
  const pending_jobs_for_current_cycle = parseInt(pendingCycleR.rows[0]?.c ?? '0', 10);

  let renewal_enqueue_status: CustomerInvoiceRecurrenceInsight['renewal_enqueue_status'] = null;
  if (sub.status === 'active' && (sub.type === 'customer' || sub.type === 'saas')) {
    const desc = await describeRenewalEnqueueForSubscriptionId(sub.id);
    let why_no_job_for_cycle: NonNullable<
      NonNullable<CustomerInvoiceRecurrenceInsight['renewal_enqueue_status']>['why_no_job_for_cycle']
    > | null = null;
    if (pending_jobs_for_current_cycle === 0) {
      if (desc.block_reason) {
        why_no_job_for_cycle = {
          code: desc.block_reason,
          message_pt: renewalEnqueueBlockReasonMessagePt(desc.block_reason),
          window_reason: desc.window_eligible ? null : desc.window_diagnostic?.reason ?? null,
          predicted_insert: desc.predicted_insert,
        };
      } else {
        why_no_job_for_cycle = {
          code: 'eligible_no_row_yet',
          message_pt:
            'Pela regra atual (CURRENT_DATE + janela local Fase 2), o ciclo pode ser enfileirado, mas não há job pendente para este cycle_key. Aguarde o próximo tick do scheduler ou confirme billing:scheduler / billing:worker.',
          window_reason: desc.window_diagnostic?.reason ?? null,
          predicted_insert: desc.predicted_insert,
        };
      }
    }
    renewal_enqueue_status = {
      current_cycle_key: insightCycleCanonical,
      pending_jobs_for_current_cycle,
      why_no_job_for_cycle,
    };
  }

  const parsedDetail = parseDetailJson(latest?.completion_detail ?? null);

  let visual_tag: RecurrenceVisualTag = 'scheduled';
  let status_badge_pt = 'Agendada';
  let last_result_summary_pt = 'Aguardando dados de processamento.';
  let problem_hint_pt: string | null = null;

  if (subscriptionEffectivelyCancelled(sub)) {
    visual_tag = 'cancelled';
    status_badge_pt = 'Cancelada';
    last_result_summary_pt = 'A assinatura não está ativa ou o período já foi encerrado.';
  } else if (latest?.status === 'failed') {
    visual_tag = 'failed';
    status_badge_pt = 'Falhou';
    last_result_summary_pt = 'O último processamento automático falhou após várias tentativas.';
    problem_hint_pt = latest.error_message?.slice(0, 500) ?? 'Ver logs [BILLING] ou jobs falhos no painel.';
  } else if (latest?.status === 'pending' || latest?.status === 'processing') {
    visual_tag = 'scheduled';
    status_badge_pt = 'Agendada';
    last_result_summary_pt =
      latest.status === 'processing'
        ? 'Processamento em curso neste momento.'
        : 'Cobrança na fila — será processada em breve pelo worker.';
  } else if (latest?.status === 'completed') {
    const noInv =
      latest.completion_outcome === BILLING_RECURRING_JOB_OUTCOME.COMPLETED_NO_INVOICE_NO_ELIGIBLE_ITEMS ||
      parsedDetail?.reason === 'no_eligible_recurring_items_for_cycle';
    if (noInv) {
      visual_tag = 'no_new_invoice';
      status_badge_pt = 'Sem nova fatura';
      last_result_summary_pt = 'O ciclo foi processado, mas não gerou nova fatura neste período.';
      problem_hint_pt = problemHintFromDetail(parsedDetail, latest.completion_outcome);
    } else if (latest.result_invoice_id) {
      visual_tag = 'processed';
      status_badge_pt = 'Processada';
      last_result_summary_pt = 'Último ciclo gerou fatura com sucesso.';
    } else {
      visual_tag = 'scheduled';
      status_badge_pt = 'Agendada';
      last_result_summary_pt = 'Último job concluído; verifique detalhes operacionais se necessário.';
    }
  } else if (latest?.status === 'cancelled') {
    const mismatch = latest.completion_outcome === BILLING_RECURRING_JOB_OUTCOME.CANCELLED_JOB_CYCLE_MISMATCH;
    if (mismatch && pending_jobs_for_current_cycle === 0 && !subscriptionEffectivelyCancelled(sub)) {
      visual_tag = 'stale_after_reschedule';
      status_badge_pt = 'Reagendamento — sem fila no ciclo';
      last_result_summary_pt =
        'O último job foi cancelado porque o ciclo enfileirado não coincidia com a data atual da assinatura (reagendamento). Não há job pendente para o ciclo atual.';
      problem_hint_pt = renewal_enqueue_status?.why_no_job_for_cycle?.message_pt ?? problem_hint_pt;
    } else {
      visual_tag = 'cancelled';
      status_badge_pt = 'Cancelada';
      last_result_summary_pt = 'O último job foi cancelado (assinatura ou data inelegível).';
    }
  } else if (!latest) {
    visual_tag = 'scheduled';
    status_badge_pt = 'Agendada';
    last_result_summary_pt = 'Ainda não há registro de job de recorrência — aguardando scheduler/worker.';
  }

  if (
    invoice.origin === 'subscription' &&
    String(invoice.due_date ?? '').trim().slice(0, 10) &&
    sub.next_billing_date
  ) {
    const dDue = String(invoice.due_date).slice(0, 10);
    const dNext = sub.next_billing_date.slice(0, 10);
    if (dDue !== dNext) {
      const line =
        `O vencimento desta fatura (${dDue}) é só da cobrança atual; a próxima geração automática usa a data da assinatura (${dNext}). Editar a fatura não altera essa data.`;
      problem_hint_pt = problem_hint_pt ? `${line} — ${problem_hint_pt}` : line;
    }
  }

  if (
    !subscriptionEffectivelyCancelled(sub) &&
    sub.status === 'active' &&
    !latest &&
    pending_jobs_count === 0 &&
    visual_tag !== 'stale_after_reschedule'
  ) {
    const dbTodayR = await pool.query<{ d: string }>(`SELECT CURRENT_DATE::text AS d`);
    const dbToday = (dbTodayR.rows[0]?.d ?? '').trim().slice(0, 10);
    const nextY = (sub.next_billing_date ?? '').slice(0, 10);
    if (dbToday && nextY && nextY <= dbToday) {
      const line =
        `A próxima cobrança da assinatura (${nextY}) já é hoje ou anterior no calendário do servidor (CURRENT_DATE), mas não há job na fila. Confirme os processos billing:scheduler e billing:worker. Ao guardar "Alterar próxima renovação" com a janela horária local da empresa já aberta, o backend tenta enfileirar o job de imediato.`;
      problem_hint_pt = problem_hint_pt ? `${problem_hint_pt} ${line}` : line;
    }
  }

  const is_queued = pending_jobs_count > 0 || latest?.status === 'pending' || latest?.status === 'processing';

  let last_processing_at_out: string | null = latest?.updated_at ?? null;
  let last_generated_invoice_id_out: string | null = latest?.result_invoice_id ?? null;

  let subscription_cycles_insight: CustomerInvoiceRecurrenceInsight['subscription_cycles_insight'] = undefined;
  const cyclesReadEnabled = await isSubscriptionCyclesReadEnabled();
  if (cyclesReadEnabled) {
    const periodRaw = invoice.period_start != null && String(invoice.period_start).trim()
      ? String(invoice.period_start).trim().slice(0, 10)
      : null;
    const periodSlice = periodRaw && /^\d{4}-\d{2}-\d{2}$/.test(periodRaw) ? periodRaw : null;
    const [matchedRow, recentRows] = await Promise.all([
      findSubscriptionCycleForInvoice(tenantId, sub.id, invoiceId, periodSlice),
      listSubscriptionCyclesBySubscriptionId(tenantId, sub.id, 24),
    ]);
    subscription_cycles_insight = {
      matched_cycle: matchedRow ? toSubscriptionCycleInsightRow(matchedRow) : null,
      recent_cycles: recentRows.map(toSubscriptionCycleInsightRow),
    };

    if (matchedRow && !subscriptionEffectivelyCancelled(sub) && visual_tag !== 'stale_after_reschedule') {
      const derived = derivePresentationFromMatchedCycle(matchedRow);
      visual_tag = derived.visual_tag;
      status_badge_pt = derived.status_badge_pt;
      last_result_summary_pt = derived.last_result_summary_pt;
      if (derived.problem_hint_pt) {
        problem_hint_pt = problem_hint_pt ? `${problem_hint_pt} · ${derived.problem_hint_pt}` : derived.problem_hint_pt;
      }
      if (matchedRow.processed_at) {
        last_processing_at_out = matchedRow.processed_at;
      }
      if (matchedRow.invoice_id) {
        last_generated_invoice_id_out = matchedRow.invoice_id;
      }

      if (latest?.status === 'failed') {
        visual_tag = 'failed';
        status_badge_pt = 'Falhou';
        last_result_summary_pt = 'O último processamento automático falhou após várias tentativas.';
        problem_hint_pt = latest.error_message?.slice(0, 500) ?? problem_hint_pt;
      } else if (latest?.status === 'pending' || latest?.status === 'processing') {
        visual_tag = 'scheduled';
        status_badge_pt = 'Agendada';
        last_result_summary_pt =
          latest.status === 'processing'
            ? 'Processamento em curso neste momento.'
            : 'Cobrança na fila — será processada em breve pelo worker.';
      }
    }
  }

  const operational =
    invoice.subscription_id != null
      ? {
          subscription_id: invoice.subscription_id,
          latest_job_id: latest?.id ?? null,
          completion_outcome: latest?.completion_outcome ?? null,
          completion_detail_raw: latest?.completion_detail ?? null,
          completion_detail_parsed: parsedDetail,
          result_invoice_id: latest?.result_invoice_id ?? null,
        }
      : null;

  return {
    is_recurring: true,
    visual_tag,
    status_badge_pt,
    is_queued,
    subscription: sub,
    this_invoice: thisInvoiceSnapshotFromInvoiceRow(invoice),
    next_charge_date: sub.next_billing_date ?? null,
    periodicity_label_pt: billingIntervalLabelPt(sub.billing_interval || 'monthly'),
    last_processing_at: last_processing_at_out,
    last_result_summary_pt,
    problem_hint_pt,
    pending_jobs_count,
    latest_job: latest,
    last_generated_invoice_id: last_generated_invoice_id_out,
    operational,
    renewal_enqueue_status,
    tenant_recurring_generation,
    ...(subscription_cycles_insight != null ? { subscription_cycles_insight } : {}),
  };
}
