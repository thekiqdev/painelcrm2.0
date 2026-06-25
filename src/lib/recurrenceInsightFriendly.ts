import type { CustomerInvoiceRecurrenceInsight, RenewalEnqueueBlockReasonCode } from "@/services/customerInvoices";

const TECHNICAL_HINT =
  /worker|scheduler|\bjobs?\b|CURRENT_DATE|PostgreSQL|cycle_key|completion_outcome|subscription_cycles|next_billing_date|fila\s*—|enfileir/i;

/** Mensagens amigáveis para o utilizador final (substituem textos técnicos do backend). */
export const FRIENDLY_RENEWAL_BLOCK_REASON: Record<RenewalEnqueueBlockReasonCode, string> = {
  subscription_not_found:
    "Não foi possível localizar a assinatura associada. Se persistir, contacte o suporte ou o administrador da conta.",
  subscription_not_active: "A assinatura não está ativa. A renovação automática não será gerada enquanto estiver neste estado.",
  subscription_type_unsupported:
    "Este tipo de assinatura não utiliza o processamento automático de renovação nesta configuração.",
  next_billing_after_db_today: "A próxima cobrança ainda está agendada para uma data futura. Nenhuma ação é necessária.",
  future_local_date: "A próxima cobrança ainda está agendada para uma data futura. Nenhuma ação é necessária.",
  too_early_local_time: "A próxima cobrança será gerada automaticamente assim que a janela de processamento permitir.",
  outside_local_window: "A próxima cobrança será gerada automaticamente na próxima janela de processamento.",
  active_job_exists: "A cobrança está aguardando processamento automático.",
  completed_cycle_guard: "Este ciclo já possui uma fatura vinculada.",
  eligible_no_row_yet: "O sistema está a registar o processamento deste ciclo. Aguarde alguns instantes.",
  customer_unresolvable:
    "A assinatura ainda não tem cliente vinculado. Conclua o cadastro do cliente ou vincule-o à assinatura para habilitar a renovação automática.",
};

export function friendlyRenewalBlockReason(code: RenewalEnqueueBlockReasonCode): string {
  return FRIENDLY_RENEWAL_BLOCK_REASON[code] ?? "A renovação será tratada automaticamente pelo sistema.";
}

export function renewalBlockReasonIsInformational(code: RenewalEnqueueBlockReasonCode): boolean {
  return (
    code === "next_billing_after_db_today" ||
    code === "future_local_date" ||
    code === "too_early_local_time" ||
    code === "outside_local_window" ||
    code === "active_job_exists" ||
    code === "completed_cycle_guard" ||
    code === "eligible_no_row_yet"
  );
}

export function problemHintLooksTechnical(hint: string): boolean {
  return TECHNICAL_HINT.test(hint);
}

/** Explicação vencimento desta fatura vs. próxima data da assinatura — redundante com o bloco «Esta cobrança». */
export function isDueDateVersusSubscriptionNextHint(hint: string): boolean {
  return (
    /O vencimento desta fatura/i.test(hint) &&
    (/próxima geração automática/i.test(hint) || /data da assinatura/i.test(hint))
  );
}

/** Copy curta para fila/processamento sem mencionar worker ou job. */
export function friendlyQueuedSummary(insight: CustomerInvoiceRecurrenceInsight): string | null {
  if (!insight.is_queued && !(insight.pending_jobs_count > 0)) return null;
  return "A cobrança está aguardando processamento automático.";
}

/**
 * Mensagem para área principal quando o backend envia problem_hint operacional.
 * Evita mostrar texto técnico ao utilizador final.
 */
export function friendlyProblemHintForMain(hint: string | null): string | null {
  if (!hint || !hint.trim()) return null;
  const t = hint.trim();
  if (isDueDateVersusSubscriptionNextHint(t)) return null;
  if (t.includes("Nenhum item elegível para gerar fatura neste ciclo")) {
    return "Não há itens elegíveis para gerar a próxima fatura neste ciclo. Verifique os itens recorrentes da assinatura.";
  }
  if (problemHintLooksTechnical(t)) return null;
  return t;
}

export function friendlySubscriptionCycleLine(insight: CustomerInvoiceRecurrenceInsight): string | null {
  const sub = insight.subscription;
  if (!sub) return null;
  if (sub.status !== "active") {
    return "A assinatura não está ativa.";
  }
  if (sub.cancel_at_period_end) {
    return "Cancelamento ao fim do período atual está marcado na assinatura.";
  }
  return null;
}
