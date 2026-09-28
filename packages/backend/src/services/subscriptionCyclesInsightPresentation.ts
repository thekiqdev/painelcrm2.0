/**
 * Apresentação PT do estado de um ciclo para o insight da fatura (Etapa 2).
 */
import type { RecurrenceVisualTag } from './recurrenceInsightVisualTag.js';
import type { SubscriptionCycleDbRow } from './subscriptionCyclesQueryService.js';

export interface SubscriptionCycleInsightRow {
  id: string;
  cycle_date: string;
  period_start: string;
  period_end: string;
  status: string;
  invoice_id: string | null;
  job_id: string | null;
  processed_at: string | null;
  skipped_reason: string | null;
  status_label_pt: string;
}

export function subscriptionCycleStatusLabelPt(status: string): string {
  const m: Record<string, string> = {
    pending: 'Aguardando geração automática',
    queued: 'Processamento agendado',
    processing: 'Processando cobrança',
    invoiced: 'Faturado',
    skipped: 'Ignorado / sem fatura CRM',
    failed: 'Falhou',
    cancelled: 'Cancelado',
  };
  return m[status] ?? status;
}

export function toSubscriptionCycleInsightRow(row: SubscriptionCycleDbRow): SubscriptionCycleInsightRow {
  return {
    id: row.id,
    cycle_date: row.cycle_date,
    period_start: row.period_start,
    period_end: row.period_end,
    status: row.status,
    invoice_id: row.invoice_id,
    job_id: row.job_id,
    processed_at: row.processed_at,
    skipped_reason: row.skipped_reason,
    status_label_pt: subscriptionCycleStatusLabelPt(row.status),
  };
}

export interface CycleDerivedPresentation {
  visual_tag: RecurrenceVisualTag;
  status_badge_pt: string;
  last_result_summary_pt: string;
  problem_hint_pt: string | null;
}

function skippedReasonHintPt(reason: string | null): string | null {
  if (!reason || !reason.trim()) return null;
  const r = reason.trim();
  if (r === 'tenant_billing_invoice_no_crm_fk' || r.includes('tenant_billing')) {
    return 'Este ciclo foi cobrado no contexto SaaS (fatura do tenant); não há fatura CRM vinculada nesta tabela.';
  }
  if (r.includes('completed_no_invoice') || r.includes('no_eligible')) {
    return 'Nenhum item elegível gerou fatura CRM neste ciclo (ver itens recorrentes / agenda).';
  }
  if (r.includes('cancelled_job_cycle_mismatch') || r.includes('mismatch')) {
    return 'Ciclo obsoleto ou reagendado; detalhe técnico no painel operacional.';
  }
  return null;
}

/** Mapeia linha de ciclo para badge/resumo mostrado ao utilizador. */
export function derivePresentationFromMatchedCycle(row: SubscriptionCycleDbRow): CycleDerivedPresentation {
  const status = row.status;
  const srHint = skippedReasonHintPt(row.skipped_reason);

  switch (status) {
    case 'invoiced':
      return {
        visual_tag: 'processed',
        status_badge_pt: 'Faturado (ciclo)',
        last_result_summary_pt:
          'Este período está registado como faturado no ciclo da assinatura (fatura vinculada).',
        problem_hint_pt: null,
      };
    case 'pending':
      return {
        visual_tag: 'scheduled',
        status_badge_pt: 'Aguardando geração automática',
        last_result_summary_pt:
          'A cobrança recorrente ainda não foi processada pelo sistema automático. Isso é normal dentro da janela de geração configurada na conta.',
        problem_hint_pt: null,
      };
    case 'queued':
    case 'processing':
      return {
        visual_tag: 'scheduled',
        status_badge_pt: status === 'processing' ? 'Ciclo em processamento' : 'Ciclo na fila',
        last_result_summary_pt:
          status === 'processing'
            ? 'O ciclo está a ser processado pelo worker de recorrência.'
            : 'O ciclo está na fila de cobrança recorrente.',
        problem_hint_pt: null,
      };
    case 'skipped':
      return {
        visual_tag: 'no_new_invoice',
        status_badge_pt: 'Ciclo sem fatura CRM',
        last_result_summary_pt:
          srHint ??
          'Este ciclo foi encerrado sem fatura CRM (motivo registado no ciclo). Consulte detalhes operacionais se necessário.',
        problem_hint_pt: srHint,
      };
    case 'failed':
      return {
        visual_tag: 'failed',
        status_badge_pt: 'Ciclo falhou',
        last_result_summary_pt: 'O processamento automático deste ciclo falhou.',
        problem_hint_pt: row.error_message?.slice(0, 500) ?? 'Ver jobs falhos ou logs de billing.',
      };
    case 'cancelled':
      return {
        visual_tag: 'cancelled',
        status_badge_pt: 'Ciclo cancelado',
        last_result_summary_pt: 'Este ciclo foi cancelado ou invalidado.',
        problem_hint_pt: srHint,
      };
    default:
      return {
        visual_tag: 'scheduled',
        status_badge_pt: subscriptionCycleStatusLabelPt(status),
        last_result_summary_pt: 'Estado do ciclo registado na base de dados.',
        problem_hint_pt: null,
      };
  }
}
