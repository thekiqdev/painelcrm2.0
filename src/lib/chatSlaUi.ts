import type { ChatConversation } from '@/services/chat';

export type SlaContextForUi = {
  risk_percent: number;
  tenant_first_minutes: number | null;
  tenant_next_minutes: number | null;
  /** queue_id -> minutes override */
  queue_sla: Record<string, { first: number | null; next: number | null }>;
};

export type OperationalPanelFilter =
  | ''
  | 'open'
  | 'pending'
  | 'in_progress'
  | 'waiting_customer'
  | 'sla_at_risk'
  | 'sla_breached'
  | 'unassigned'
  | 'customer_waiting_reply';

function effMin(
  queueId: string | null | undefined,
  q: SlaContextForUi
): { first: number | null; next: number | null } {
  const tFirst = q.tenant_first_minutes;
  const tNext = q.tenant_next_minutes;
  if (!queueId || !q.queue_sla[queueId]) {
    return { first: tFirst, next: tNext };
  }
  const o = q.queue_sla[queueId]!;
  return {
    first: o.first != null && o.first > 0 ? o.first : tFirst,
    next: o.next != null && o.next > 0 ? o.next : tNext,
  };
}

export function classifySlaUi(
  conv: ChatConversation,
  q: SlaContextForUi
): 'ok' | 'at_risk' | 'breached' {
  const anyConv = conv as ChatConversation & {
    first_response_at?: string | null;
    last_customer_message_at?: string | null;
    last_agent_message_at?: string | null;
  };
  const fr = anyConv.first_response_at ? new Date(anyConv.first_response_at) : null;
  const lcm = anyConv.last_customer_message_at ? new Date(anyConv.last_customer_message_at) : null;
  const lam = anyConv.last_agent_message_at ? new Date(anyConv.last_agent_message_at) : null;
  const { first: effFirst, next: effNext } = effMin(conv.queue_id, q);
  const risk = Math.min(99, Math.max(50, q.risk_percent)) / 100;
  const now = Date.now();
  let score = 0;

  if (effFirst != null && !fr && lcm) {
    const elapsedMin = (now - lcm.getTime()) / 60_000;
    if (elapsedMin >= effFirst) score = Math.max(score, 2);
    else if (elapsedMin >= effFirst * risk) score = Math.max(score, 1);
  }
  if (effNext != null && lcm && lam && lcm.getTime() > lam.getTime()) {
    const elapsedMin = (now - lcm.getTime()) / 60_000;
    if (elapsedMin >= effNext) score = Math.max(score, 2);
    else if (elapsedMin >= effNext * risk) score = Math.max(score, 1);
  }
  if (score >= 2) return 'breached';
  if (score >= 1) return 'at_risk';
  return 'ok';
}

export type ChatBadgeUi = {
  key: string;
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
};

/** No máximo 2: (1) estado de atendimento curto (2) SLA só se crítico (risco ou vencido). */
export function selectChatBadges(conv: ChatConversation, sla: SlaContextForUi | null): ChatBadgeUi[] {
  const st = conv.attendance_status;
  const closed = st === 'closed' || st === 'archived';

  const anyConv = conv as ChatConversation & {
    last_customer_message_at?: string | null;
    last_agent_message_at?: string | null;
  };
  const lcm = anyConv.last_customer_message_at ? new Date(anyConv.last_customer_message_at) : null;
  const lam = anyConv.last_agent_message_at ? new Date(anyConv.last_agent_message_at) : null;
  const customerWaitingOurReply = Boolean(lcm && lam && lcm.getTime() > lam.getTime() && !closed);

  const primary = (): ChatBadgeUi | null => {
    if (closed) return null;

    if (
      st === 'unassigned' ||
      (!conv.assigned_to_user_id &&
        st !== 'closed' &&
        st !== 'archived' &&
        (st === 'pending' || st === 'open' || !st))
    ) {
      return { key: 'unassigned', label: 'Sem resp.', variant: 'secondary' };
    }

    if (st === 'waiting_customer' || customerWaitingOurReply) {
      return { key: 'wait', label: 'Aguardando', variant: 'outline' };
    }

    if (st === 'in_progress' || st === 'in_service') {
      return { key: 'prog', label: 'Em atendimento', variant: 'default' };
    }

    if (st === 'queued') {
      return { key: 'queued', label: 'Na fila', variant: 'outline' };
    }

    if (st === 'pending' || st === 'open') {
      return { key: 'aberto', label: 'Aberto', variant: 'outline' };
    }

    return null;
  };

  const slaBadge = (): ChatBadgeUi | null => {
    if (!sla || closed) return null;
    const bucket = classifySlaUi(conv, sla);
    if (bucket === 'breached') return { key: 'sla_b', label: 'Vencido', variant: 'destructive' };
    if (bucket === 'at_risk') return { key: 'sla_r', label: 'Risco', variant: 'secondary' };
    return null;
  };

  const p = primary();
  const s = slaBadge();
  const out: ChatBadgeUi[] = [];
  if (p) out.push(p);
  if (s && out.length < 2) out.push(s);
  else if (!p && s) out.push(s);
  return out.slice(0, 2);
}

export function matchesOperationalFilter(
  conv: ChatConversation,
  filter: OperationalPanelFilter,
  sla: SlaContextForUi | null
): boolean {
  if (!filter) return true;
  const st = conv.attendance_status;
  const closed = st === 'closed' || st === 'archived';

  if (filter === 'open') return !closed;
  if (filter === 'pending') return st === 'pending' || st === 'open';
  if (filter === 'in_progress') return st === 'in_progress';
  if (filter === 'waiting_customer') return st === 'waiting_customer';
  if (filter === 'unassigned') {
    return (
      !conv.assigned_to_user_id &&
      !closed &&
      (st === 'pending' || st === 'open' || st === 'in_progress' || !st)
    );
  }
  const anyConv = conv as ChatConversation & {
    last_customer_message_at?: string | null;
    last_agent_message_at?: string | null;
  };
  const lcm = anyConv.last_customer_message_at ? new Date(anyConv.last_customer_message_at) : null;
  const lam = anyConv.last_agent_message_at ? new Date(anyConv.last_agent_message_at) : null;
  if (filter === 'customer_waiting_reply') {
    return Boolean(lcm && lam && lcm.getTime() > lam.getTime() && !closed);
  }
  if (sla && (filter === 'sla_at_risk' || filter === 'sla_breached')) {
    const b = classifySlaUi(conv, sla);
    if (filter === 'sla_at_risk') return b === 'at_risk';
    if (filter === 'sla_breached') return b === 'breached';
  }
  return true;
}

export function buildSlaContextFromDashboard(d: {
  sla_context: { risk_percent: number; tenant_first_minutes: number | null; tenant_next_minutes: number | null };
  by_queue: Array<{
    queue_id: string;
    sla_first_minutes: number | null;
    sla_next_minutes: number | null;
  }>;
}): SlaContextForUi {
  const queue_sla: SlaContextForUi['queue_sla'] = {};
  for (const q of d.by_queue) {
    queue_sla[q.queue_id] = { first: q.sla_first_minutes, next: q.sla_next_minutes };
  }
  return {
    risk_percent: d.sla_context.risk_percent,
    tenant_first_minutes: d.sla_context.tenant_first_minutes,
    tenant_next_minutes: d.sla_context.tenant_next_minutes,
    queue_sla,
  };
}
