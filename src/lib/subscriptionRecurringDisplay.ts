import { formatYmdBrSafe, formatDateTimeBrSafe, safeDate } from '@/lib/billingSafeDate';
import type {
  CrmSubscriptionJobRow,
  CrmSubscriptionTenantBillingPrefs,
  CrmSubscriptionTimelineRow,
  SubscriptionTimelineOperationalState,
} from '@/services/crmSubscriptions';
import {
  clampRecurringGenerateDaysBeforeDue,
  computeRecurringGenerationDateYmd,
} from '@/lib/recurringGenerationPreview';

/** Estado operacional para UI (não altera motor financeiro). */
export type RecurringOperationalKind =
  | 'awaiting_auto_generation'
  | 'processing'
  | 'generation_failed'
  | 'gateway_failed'
  | 'skipped'
  | 'cancelled'
  | 'invoice_status'
  | 'neutral';

export type RecurringDisplayBadge = {
  kind: RecurringOperationalKind;
  label: string;
  variant: 'awaiting' | 'processing' | 'error' | 'warning' | 'neutral' | 'success' | 'outline';
  tooltip: string;
  detail?: string | null;
};

export type RecurringInvoiceColumnDisplay = {
  label: string;
  muted?: boolean;
};

const AWAITING_TOOLTIP =
  'A cobrança recorrente ainda não foi processada pelo sistema automático de faturamento. Isso é normal dentro da janela de geração configurada na conta.';

function normalizeCycleKey(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function formatYmdBr(ymd: string | null | undefined): string {
  return formatYmdBrSafe(ymd);
}

function formatDateTimeBr(iso: string | null | undefined): string {
  return formatDateTimeBrSafe(iso);
}

function generationTimeLabel(prefs: CrmSubscriptionTenantBillingPrefs): string {
  const t = prefs.recurring_generate_time_local?.trim().slice(0, 5);
  const tz = prefs.timezone?.trim();
  if (t && tz) return `${t} (${tz})`;
  if (t) return t;
  return 'horário configurado na conta';
}

export function buildScheduledGenerationDetail(
  dueYmd: string | null | undefined,
  prefs: CrmSubscriptionTenantBillingPrefs
): string | null {
  if (!dueYmd || dueYmd.length < 10) return null;
  const days = clampRecurringGenerateDaysBeforeDue(prefs.recurring_invoice_generate_days_before_due);
  const genYmd = computeRecurringGenerationDateYmd(dueYmd.slice(0, 10), days);
  const time = prefs.recurring_generate_time_local?.trim().slice(0, 5) ?? '09:00';
  return `A cobrança será processada automaticamente após ${formatYmdBr(genYmd)} às ${time}.`;
}

function isGatewayChargeFailed(
  invoiceStatus: string | null | undefined,
  gatewayStatus: string | null | undefined,
  gatewayRef: string | null | undefined
): boolean {
  const gs = (gatewayStatus ?? '').trim().toLowerCase();
  if (gs === 'failed' || gs === 'refused' || gs === 'chargeback') return true;
  const inv = (invoiceStatus ?? '').trim().toLowerCase();
  if (inv === 'failed') return true;
  const hasRef = Boolean(gatewayRef?.trim());
  if (hasRef) return false;
  return false;
}

function findJobForRow(
  row: Pick<
    CrmSubscriptionTimelineRow,
    'job_id' | 'period_start' | 'due_date' | 'cycle_status' | 'cycle_date'
  >,
  jobs: CrmSubscriptionJobRow[]
): CrmSubscriptionJobRow | null {
  if (row.job_id) {
    const byId = jobs.find((j) => j.id === row.job_id);
    if (byId) return byId;
  }
  const key =
    normalizeCycleKey(row.cycle_date) ||
    normalizeCycleKey(row.period_start) ||
    normalizeCycleKey(row.due_date);
  if (!key) return null;
  return (
    jobs.find((j) => normalizeCycleKey(j.cycle_key) === key) ??
    jobs.find((j) => normalizeCycleKey(j.cycle_key).startsWith(key)) ??
    null
  );
}

function isJobGenerationFailure(job: CrmSubscriptionJobRow | null): boolean {
  if (!job) return false;
  if (job.status === 'failed') return true;
  if (job.attempts >= job.max_attempts && job.status === 'pending') return true;
  if (job.completion_outcome === 'failed_max_attempts') return true;
  return Boolean(job.error_message?.trim()) && job.status === 'failed';
}

const INVOICE_STATUS_PT: Record<string, string> = {
  pending: 'Aguardando pagamento',
  waiting_payment: 'Aguardando pagamento',
  processing: 'Processando pagamento',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
  failed: 'Falhou',
};

function badgeFromOperationalState(
  state: SubscriptionTimelineOperationalState,
  label: string,
  detail: string | null
): RecurringDisplayBadge | null {
  const base = { label, detail };
  switch (state) {
    case 'paid':
      return {
        ...base,
        kind: 'invoice_status',
        variant: 'success',
        tooltip: 'Ciclo com fatura paga.',
      };
    case 'gateway_failed':
      return {
        ...base,
        kind: 'gateway_failed',
        variant: 'warning',
        tooltip: 'Fatura gerada, mas a cobrança no gateway não foi concluída.',
      };
    case 'generated':
      return {
        ...base,
        kind: 'invoice_status',
        variant: 'neutral',
        tooltip: 'Fatura gerada pelo processamento automático ou manualmente.',
      };
    case 'processing':
      return {
        ...base,
        kind: 'processing',
        variant: 'processing',
        tooltip: AWAITING_TOOLTIP,
      };
    case 'scheduled':
      return {
        ...base,
        kind: 'awaiting_auto_generation',
        variant: 'awaiting',
        tooltip: AWAITING_TOOLTIP,
      };
    case 'awaiting_generation':
    case 'in_queue':
      return {
        ...base,
        kind: 'awaiting_auto_generation',
        variant: 'awaiting',
        tooltip: AWAITING_TOOLTIP,
      };
    case 'failed':
      return {
        ...base,
        kind: 'generation_failed',
        variant: 'error',
        tooltip: 'Falha no processamento automático deste ciclo.',
      };
    case 'skipped':
      return {
        ...base,
        kind: 'skipped',
        variant: 'neutral',
        tooltip: 'Ciclo processado sem nova fatura elegível.',
      };
    case 'cancelled':
      return {
        ...base,
        kind: 'cancelled',
        variant: 'outline',
        tooltip: 'Ciclo cancelado.',
      };
    case 'manual_invoice':
      return {
        ...base,
        kind: 'neutral',
        variant: 'neutral',
        tooltip: 'Fatura ligada à assinatura sem registro de ciclo automático.',
      };
    default:
      return null;
  }
}

/**
 * Resolve badge + tooltip para uma linha do histórico de cobranças.
 */
export function resolveTimelineRecurringDisplay(
  row: CrmSubscriptionTimelineRow,
  jobs: CrmSubscriptionJobRow[],
  tenantBilling: CrmSubscriptionTenantBillingPrefs
): RecurringDisplayBadge {
  const job = findJobForRow(row, jobs);
  const dueYmd = row.due_date ?? row.period_start;
  const scheduledDetail = buildScheduledGenerationDetail(dueYmd, tenantBilling);
  const retryDetail = row.has_auto_retry && row.job_retry_at
    ? `Reprocessamento automático · ${formatDateTimeBr(row.job_retry_at)}`
    : null;
  const genNote = row.generation_note ?? null;
  const detailParts = [genNote, retryDetail, scheduledDetail].filter(Boolean);
  const mergedDetail = detailParts.length > 0 ? detailParts.join(' · ') : null;

  if (row.operational_state) {
    const fromState = badgeFromOperationalState(
      row.operational_state,
      row.operational_state_pt || row.status_pt,
      mergedDetail
    );
    if (fromState) {
      if (row.job_error_snippet && fromState.kind === 'generation_failed') {
        return {
          ...fromState,
          tooltip: row.job_error_snippet.slice(0, 500),
          detail: mergedDetail,
        };
      }
      return { ...fromState, detail: mergedDetail ?? fromState.detail };
    }
  }

  if (row.invoice_id) {
    if (
      isGatewayChargeFailed(row.invoice_status, row.gateway_status, row.gateway_reference_id) &&
      row.invoice_status !== 'paid' &&
      row.invoice_status !== 'cancelled'
    ) {
      return {
        kind: 'gateway_failed',
        label: 'Falha na cobrança',
        variant: 'warning',
        tooltip:
          'A fatura foi gerada, mas a cobrança no gateway de pagamento não foi concluída. Revise o cadastro do cliente (CPF/CNPJ) ou tente reenviar a cobrança.',
        detail: row.gateway_status ? `Gateway: ${row.gateway_status}` : null,
      };
    }
    const invLabel = INVOICE_STATUS_PT[row.invoice_status ?? ''] ?? row.status_pt;
    return {
      kind: 'invoice_status',
      label: invLabel,
      variant:
        row.invoice_status === 'paid'
          ? 'success'
          : row.invoice_status === 'overdue' || row.invoice_status === 'failed'
            ? 'error'
            : 'neutral',
      tooltip: 'Fatura gerada pelo processamento automático ou manualmente.',
    };
  }

  if (isJobGenerationFailure(job)) {
    return {
      kind: 'generation_failed',
      label: 'Falha na geração',
      variant: 'error',
      tooltip: job?.error_message?.trim()
        ? job.error_message.trim().slice(0, 500)
        : 'O processamento automático não conseguiu gerar a fatura deste ciclo. Consulte os detalhes técnicos ou contacte o suporte.',
      detail: job?.retry_at ? `Última tentativa agendada: ${formatDateTimeBr(job.retry_at)}` : null,
    };
  }

  const cycle = (row.cycle_status ?? '').toLowerCase();

  if (cycle === 'failed') {
    return {
      kind: 'generation_failed',
      label: 'Falha na geração',
      variant: 'error',
      tooltip: row.status_pt || 'Falha no ciclo de cobrança automática.',
    };
  }

  if (cycle === 'cancelled') {
    return {
      kind: 'cancelled',
      label: 'Cancelado',
      variant: 'outline',
      tooltip: 'Ciclo de cobrança automática cancelado.',
    };
  }

  if (cycle === 'skipped') {
    return {
      kind: 'skipped',
      label: 'Sem nova fatura',
      variant: 'neutral',
      tooltip:
        'O ciclo foi processado, mas não havia itens recorrentes elegíveis para gerar uma nova fatura neste período.',
    };
  }

  if (cycle === 'processing' || job?.status === 'processing') {
    return {
      kind: 'processing',
      label: 'Processando',
      variant: 'processing',
      tooltip: AWAITING_TOOLTIP,
      detail: mergedDetail ?? 'Em processamento neste momento.',
    };
  }

  if (cycle === 'queued' || cycle === 'pending' || !cycle) {
    const label =
      cycle === 'queued'
        ? 'Agendado'
        : cycle === 'pending'
          ? 'Aguardando geração'
          : job?.status === 'pending'
            ? 'Em fila'
            : 'Aguardando geração';
    return {
      kind: 'awaiting_auto_generation',
      label,
      variant: 'awaiting',
      tooltip: AWAITING_TOOLTIP,
      detail: mergedDetail ?? 'Em fila para geração automática.',
    };
  }

  return {
    kind: 'neutral',
    label: row.status_pt || '—',
    variant: 'neutral',
    tooltip: AWAITING_TOOLTIP,
  };
}

export function resolveTimelineInvoiceColumn(
  row: CrmSubscriptionTimelineRow,
  jobs: CrmSubscriptionJobRow[],
  tenantBilling: CrmSubscriptionTenantBillingPrefs
): RecurringInvoiceColumnDisplay {
  if (row.invoice_id) {
    return { label: 'Ver fatura' };
  }
  const display = resolveTimelineRecurringDisplay(row, jobs, tenantBilling);
  if (
    display.kind === 'awaiting_auto_generation' ||
    display.kind === 'processing'
  ) {
    return { label: 'Em processamento', muted: true };
  }
  if (display.kind === 'generation_failed') {
    return { label: 'Não gerada', muted: true };
  }
  return { label: '—', muted: true };
}

export type SubscriptionProcessingHealth = {
  statusLabel: string;
  statusVariant: 'awaiting' | 'processing' | 'error' | 'neutral' | 'success';
  lastCheckAt: string | null;
  lastCheckLabel: string;
  nextAttemptAt: string | null;
  nextAttemptLabel: string | null;
  hint: string | null;
};

/**
 * Card "Processamento automático" no detalhe da assinatura (próximo ciclo).
 */
export function resolveSubscriptionProcessingHealth(params: {
  subscriptionStatus: string;
  nextBillingDate: string | null | undefined;
  lastJobAt: string | null | undefined;
  tenantBilling: CrmSubscriptionTenantBillingPrefs;
  recentJobs: CrmSubscriptionJobRow[];
}): SubscriptionProcessingHealth {
  const nextKey = normalizeCycleKey(params.nextBillingDate);
  const job =
    params.recentJobs.find((j) => normalizeCycleKey(j.cycle_key) === nextKey) ??
    params.recentJobs.find((j) => ['pending', 'processing'].includes(j.status)) ??
    null;

  const lastCheckAt = job?.updated_at ?? params.lastJobAt ?? null;
  const retryAtMs = job?.retry_at ? safeDate(job.retry_at)?.getTime() : null;
  const nextAttemptAt =
    retryAtMs != null && retryAtMs > Date.now() ? job!.retry_at : null;

  if (params.subscriptionStatus !== 'active') {
    return {
      statusLabel: 'Assinatura não renova automaticamente',
      statusVariant: 'neutral',
      lastCheckAt,
      lastCheckLabel: 'Última verificação',
      nextAttemptAt: null,
      nextAttemptLabel: null,
      hint: null,
    };
  }

  if (job && isJobGenerationFailure(job)) {
    return {
      statusLabel: 'Falha na geração automática',
      statusVariant: 'error',
      lastCheckAt,
      lastCheckLabel: 'Última verificação',
      nextAttemptAt: job.retry_at,
      nextAttemptLabel: job.retry_at ? 'Próxima tentativa' : null,
      hint: job.error_message?.trim().slice(0, 280) ?? null,
    };
  }

  if (job?.status === 'processing') {
    return {
      statusLabel: 'Processando cobrança agora',
      statusVariant: 'processing',
      lastCheckAt,
      lastCheckLabel: 'Última verificação',
      nextAttemptAt: null,
      nextAttemptLabel: null,
      hint: 'O sistema está a gerar a fatura deste ciclo.',
    };
  }

  if (job?.status === 'pending' || !job) {
    const scheduled = buildScheduledGenerationDetail(params.nextBillingDate, params.tenantBilling);
    return {
      statusLabel: 'Aguardando processamento automático',
      statusVariant: 'awaiting',
      lastCheckAt,
      lastCheckLabel: 'Última verificação',
      nextAttemptAt,
      nextAttemptLabel: nextAttemptAt ? 'Próxima tentativa' : null,
      hint: scheduled ?? (job ? 'Em fila para geração automática.' : 'O agendamento será criado na data de geração prevista.'),
    };
  }

  if (job.status === 'completed' && job.result_invoice_id) {
    return {
      statusLabel: 'Último ciclo processado com sucesso',
      statusVariant: 'success',
      lastCheckAt,
      lastCheckLabel: 'Última verificação',
      nextAttemptAt: null,
      nextAttemptLabel: null,
      hint: null,
    };
  }

  return {
    statusLabel: 'Monitorização automática ativa',
    statusVariant: 'neutral',
    lastCheckAt,
    lastCheckLabel: 'Última verificação',
    nextAttemptAt: null,
    nextAttemptLabel: null,
    hint: buildScheduledGenerationDetail(params.nextBillingDate, params.tenantBilling),
  };
}

/** Badge para linha da tabela de jobs (detalhe técnico). */
export function resolveJobRecurringDisplay(job: CrmSubscriptionJobRow): RecurringDisplayBadge {
  if (job.status === 'failed' || job.completion_outcome === 'failed_max_attempts') {
    return {
      kind: 'generation_failed',
      label: 'Falha na geração',
      variant: 'error',
      tooltip: job.error_message?.trim() || 'Job de renovação falhou.',
      detail: job.retry_at ? `Próxima tentativa: ${formatDateTimeBr(job.retry_at)}` : null,
    };
  }
  if (job.status === 'completed' && job.result_invoice_id) {
    return {
      kind: 'invoice_status',
      label: 'Concluído',
      variant: 'success',
      tooltip: 'Ciclo processado; fatura gerada.',
    };
  }
  if (job.status === 'completed' && !job.result_invoice_id) {
    return {
      kind: 'skipped',
      label: 'Sem nova fatura',
      variant: 'neutral',
      tooltip: job.completion_outcome ?? 'Processamento concluído sem nova fatura.',
    };
  }
  if (job.status === 'processing') {
    return {
      kind: 'processing',
      label: 'Processando',
      variant: 'processing',
      tooltip: AWAITING_TOOLTIP,
    };
  }
  if (job.status === 'pending') {
    return {
      kind: 'awaiting_auto_generation',
      label: job.retry_at ? 'Aguardando retry' : 'Processamento agendado',
      variant: 'awaiting',
      tooltip: AWAITING_TOOLTIP,
      detail: job.retry_at ? `Próxima tentativa: ${formatDateTimeBr(job.retry_at)}` : 'Em fila.',
    };
  }
  if (job.status === 'cancelled') {
    return {
      kind: 'cancelled',
      label: 'Cancelado',
      variant: 'outline',
      tooltip: job.completion_outcome ?? 'Job cancelado.',
    };
  }
  return {
    kind: 'neutral',
    label: job.status,
    variant: 'neutral',
    tooltip: AWAITING_TOOLTIP,
  };
}

export const recurringBadgeClassName: Record<RecurringDisplayBadge['variant'], string> = {
  awaiting: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/50 dark:bg-sky-950/40 dark:text-sky-200',
  processing:
    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-200',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-100',
  neutral: 'border-border bg-muted/50 text-muted-foreground',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200',
  outline: '',
};
