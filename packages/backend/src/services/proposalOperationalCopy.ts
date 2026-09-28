/**
 * Textos operacionais e merge de placeholders para propostas (Etapa 4).
 * Placeholders: {{client_name}}, {{proposal_title}}, {{proposal_amount}}, {{proposal_link}},
 * {{tenant_name}}, {{valid_until}}, {{responsible_name}}
 */
import { pool } from '../utils/db.js';

export type ProposalOperationalSnippetKey =
  | 'initial_send'
  | 'reminder'
  | 'accepted_client_note'
  | 'rejected_client_note'
  | 'expired_client_note'
  | 'invoiced_internal_note';

const ACTION_BY_SNIPPET: Record<ProposalOperationalSnippetKey, string> = {
  initial_send: 'sent',
  reminder: 'reminder_sent',
  accepted_client_note: 'accepted',
  rejected_client_note: 'rejected',
  expired_client_note: 'expired',
  invoiced_internal_note: 'converted_to_invoice',
};

const FALLBACK_BODIES: Record<ProposalOperationalSnippetKey, { subject: string; body: string }> = {
  initial_send: {
    subject: 'Proposta comercial — {{proposal_title}}',
    body:
      'Olá {{client_name}},\n\n' +
      'Segue o link para visualizar nossa proposta comercial:\n{{proposal_link}}\n\n' +
      'Título: {{proposal_title}}\n' +
      'Valor: R$ {{proposal_amount}}\n' +
      'Validade: {{valid_until}}\n\n' +
      'Qualquer dúvida, estou à disposição.\n\n' +
      '{{responsible_name}}\n' +
      '{{tenant_name}}',
  },
  reminder: {
    subject: 'Lembrete: proposta {{proposal_title}}',
    body:
      'Olá {{client_name}},\n\n' +
      'Passando para lembrar da proposta enviada. Você pode revisar e responder pelo link:\n{{proposal_link}}\n\n' +
      'Validade: {{valid_until}}\n' +
      'Valor: R$ {{proposal_amount}}\n\n' +
      'Abraços,\n{{responsible_name}} — {{tenant_name}}',
  },
  accepted_client_note: {
    subject: 'Recebemos seu aceite — {{proposal_title}}',
    body:
      'Olá {{client_name}},\n\n' +
      'Confirmamos o recebimento do aceite da proposta "{{proposal_title}}". Nossa equipe dará continuidade aos próximos passos comerciais.\n\n' +
      '{{tenant_name}}',
  },
  rejected_client_note: {
    subject: 'Sobre a proposta {{proposal_title}}',
    body:
      'Olá {{client_name}},\n\n' +
      'Agradecemos o retorno sobre a proposta "{{proposal_title}}". Estamos à disposição para ajustes ou uma nova versão quando fizer sentido.\n\n' +
      '{{tenant_name}}',
  },
  expired_client_note: {
    subject: 'Proposta {{proposal_title}} — validade',
    body:
      'Olá {{client_name}},\n\n' +
      'A proposta "{{proposal_title}}" está fora do prazo de validade ({{valid_until}}). Se desejar uma nova versão, responda esta mensagem.\n\n' +
      '{{tenant_name}}',
  },
  invoiced_internal_note: {
    subject: 'Interno: fatura gerada para {{proposal_title}}',
    body:
      'Fatura criada a partir da proposta "{{proposal_title}}" (cliente {{client_name}}, total R$ {{proposal_amount}}). Revise em Faturamento.\n' +
      'Proposta: {{proposal_link}}',
  },
};

export function mergeProposalPlaceholders(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    const safe = v ?? '';
    out = out.split(`{{${k}}}`).join(safe);
  }
  return out;
}

export interface ProposalOperationalContext {
  client_name: string;
  proposal_title: string;
  proposal_amount: string;
  proposal_link: string;
  tenant_name: string;
  valid_until: string;
  responsible_name: string;
}

async function fetchTemplateFromDb(
  tenantId: string,
  userId: string,
  action: string
): Promise<{ subject: string | null; body: string } | null> {
  const r = await pool.query<{ subject: string | null; body: string }>(
    `SELECT mt.subject, mt.body
     FROM message_templates mt
     INNER JOIN users u ON u.id = mt.user_id AND u.tenant_id = $1
     WHERE mt.resource_type = 'proposals' AND mt.action = $2 AND mt.is_active = true
     ORDER BY (mt.user_id = $3) DESC, mt.is_predefined DESC, mt.updated_at DESC NULLS LAST
     LIMIT 1`,
    [tenantId, action, userId]
  );
  return r.rows[0] ?? null;
}

export async function buildProposalOperationalSnippets(params: {
  tenantId: string;
  requesterUserId: string;
  ctx: ProposalOperationalContext;
}): Promise<Record<ProposalOperationalSnippetKey, { subject: string; body: string }>> {
  const out = {} as Record<ProposalOperationalSnippetKey, { subject: string; body: string }>;
  const keys = Object.keys(FALLBACK_BODIES) as ProposalOperationalSnippetKey[];
  const vars: Record<string, string> = {
    client_name: params.ctx.client_name,
    proposal_title: params.ctx.proposal_title,
    proposal_amount: params.ctx.proposal_amount,
    proposal_link: params.ctx.proposal_link,
    tenant_name: params.ctx.tenant_name,
    valid_until: params.ctx.valid_until,
    responsible_name: params.ctx.responsible_name,
  };

  for (const key of keys) {
    const action = ACTION_BY_SNIPPET[key];
    const row = await fetchTemplateFromDb(params.tenantId, params.requesterUserId, action);
    const base = row?.body
      ? { subject: row.subject || FALLBACK_BODIES[key].subject, body: row.body }
      : FALLBACK_BODIES[key];
    out[key] = {
      subject: mergeProposalPlaceholders(base.subject, vars),
      body: mergeProposalPlaceholders(base.body, vars),
    };
  }
  return out;
}
