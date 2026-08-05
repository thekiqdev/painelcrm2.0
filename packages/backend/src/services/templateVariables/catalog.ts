/**
 * Catálogo unificado de variáveis de template (S9) — fonte de metadados para UI/docs.
 * Resolução de valores = S10+ (context builders por escopo).
 *
 * Inventário: docs/chatbot-flows/VARIABLES_CATALOG_INVESTIGATION.md
 */

export type TemplateVariableScope =
  | 'chatbot_flows'
  | 'chat_templates'
  | 'kanban'
  | 'contracts'
  | 'notifications'
  | 'proposals';

export type TemplateVariableCategoryId =
  | 'flow_session'
  | 'contact'
  | 'conversation'
  | 'agent'
  | 'tenant'
  | 'system'
  | 'invoice';

export type TemplateVariableDefinition = {
  /** Chave canônica dotted, ex.: contact.name */
  key: string;
  /** Alias flat legado (chat templates / flows), ex.: contact_name */
  aliases?: string[];
  label: string;
  description: string;
  source: string;
  scopes: TemplateVariableScope[];
  /** true = criada em runtime (wait_input / set_variable / HTTP map) — não seed estático */
  dynamic?: boolean;
};

export type TemplateVariableCategory = {
  id: TemplateVariableCategoryId;
  title: string;
  description?: string;
  fields: TemplateVariableDefinition[];
};

/** Seed estático — variáveis de sistema/CRM disponíveis nos escopos listados. */
export const TEMPLATE_VARIABLE_CATEGORIES: TemplateVariableCategory[] = [
  {
    id: 'flow_session',
    title: 'Sessão do flow',
    description:
      'Variáveis capturadas ou definidas no fluxo (bag JSONB da sessão). Chaves dinâmicas além destas.',
    fields: [
      {
        key: 'flow_session.answer',
        aliases: ['answer'],
        label: 'Última resposta (answer)',
        description: 'Default do nó Pergunta (wait_input) quando variable=answer.',
        source: 'chatbot_flow_sessions.variables',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'flow_session.webhook_payload',
        aliases: ['webhook_payload'],
        label: 'Payload do webhook in',
        description: 'JSON/string do body recebido no webhook_in.',
        source: 'runChatbotFlowsRuntimeFromWebhook',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'flow_session.http_status',
        aliases: ['http_status'],
        label: 'Status HTTP (default)',
        description: 'Default do nó HTTP quando status_variable=http_status.',
        source: 'http_request dry-run/runtime',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'flow_session.http_body',
        aliases: ['http_body'],
        label: 'Body HTTP (default)',
        description: 'Default do nó HTTP quando response_variable=http_body.',
        source: 'http_request dry-run/runtime',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
    ],
  },
  {
    id: 'contact',
    title: 'Contato',
    description: 'Lead / contato da conversa.',
    fields: [
      {
        key: 'contact.name',
        aliases: ['contact_name', 'client_name', 'display_name'],
        label: 'Nome do contato',
        description: 'Nome exibido do contato na conversa.',
        source: 'chat_conversations / contato',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban', 'contracts', 'proposals'],
      },
      {
        key: 'contact.phone',
        aliases: ['canonical_phone', 'contact_phone'],
        label: 'Telefone',
        description: 'Telefone normalizado / canônico.',
        source: 'chat_conversations.phone_normalized',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban'],
      },
      {
        key: 'contact.email',
        aliases: ['contact_email', 'client_email'],
        label: 'E-mail',
        description: 'E-mail do contato, se houver.',
        source: 'contato / CRM',
        scopes: ['chatbot_flows', 'chat_templates', 'contracts'],
      },
      {
        key: 'client.id',
        aliases: ['client_id'],
        label: 'ID do cliente CRM',
        description: 'clients.id vinculado à conversa.',
        source: 'chat_conversations.client_id',
        scopes: ['chatbot_flows'],
      },
    ],
  },
  {
    id: 'invoice',
    title: 'Fatura (CRM)',
    description: 'Preenchidas pelo nó Consultar/Escolher fatura (S11).',
    fields: [
      {
        key: 'invoice.public_link',
        aliases: ['invoice_public_link'],
        label: 'Link de pagamento',
        description: 'URL pública /pay/{token}.',
        source: 'lookup_invoice / select_invoice',
        scopes: ['chatbot_flows', 'notifications'],
        dynamic: true,
      },
      {
        key: 'invoice.number',
        aliases: ['invoice_number'],
        label: 'Número',
        description: 'Número da fatura.',
        source: 'customer_invoices',
        scopes: ['chatbot_flows', 'notifications'],
        dynamic: true,
      },
      {
        key: 'invoice.total',
        aliases: ['invoice_total'],
        label: 'Valor formatado',
        description: 'Valor em R$.',
        source: 'customer_invoices',
        scopes: ['chatbot_flows', 'notifications'],
        dynamic: true,
      },
      {
        key: 'invoice.due_date',
        aliases: ['invoice_due_date'],
        label: 'Vencimento',
        description: 'Data de vencimento (dd/mm/aaaa).',
        source: 'customer_invoices',
        scopes: ['chatbot_flows', 'notifications'],
        dynamic: true,
      },
      {
        key: 'invoice.menu',
        aliases: ['invoice_menu'],
        label: 'Menu de faturas',
        description: 'Lista numerada (modo menu).',
        source: 'lookup_invoice open_menu',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'invoice.count',
        aliases: ['invoice_count'],
        label: 'Qtd. abertas',
        description: 'Quantidade de faturas encontradas.',
        source: 'lookup_invoice',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
    ],
  },
  {
    id: 'conversation',
    title: 'Conversa',
    description: 'Contexto do atendimento / kanban.',
    fields: [
      {
        key: 'conversation.id',
        aliases: ['conversation_id'],
        label: 'ID da conversa',
        description: 'UUID da conversa.',
        source: 'chat_conversations.id',
        scopes: ['chatbot_flows', 'kanban'],
      },
      {
        key: 'conversation.column_name',
        aliases: ['column_name'],
        label: 'Coluna do Kanban',
        description: 'Nome da coluna atual do card.',
        source: 'kanban columns',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban'],
      },
      {
        key: 'conversation.board_name',
        aliases: ['board_name'],
        label: 'Board do Kanban',
        description: 'Nome do board.',
        source: 'kanban boards',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban'],
      },
    ],
  },
  {
    id: 'agent',
    title: 'Agente / equipe',
    description: 'Operador e time do atendimento.',
    fields: [
      {
        key: 'agent.name',
        aliases: ['operator_name'],
        label: 'Nome do agente',
        description: 'Atendente atribuído ou dono da caixa.',
        source: 'users.full_name',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban', 'contracts'],
      },
      {
        key: 'agent.team_name',
        aliases: ['team_name'],
        label: 'Nome da equipe',
        description: 'Equipe atribuída à conversa.',
        source: 'teams.name',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban'],
      },
    ],
  },
  {
    id: 'tenant',
    title: 'Empresa (tenant)',
    description: 'Conta / organização no PainelCRM.',
    fields: [
      {
        key: 'tenant.name',
        aliases: ['company_name', 'tenant_name', 'system.tenant_name'],
        label: 'Nome da empresa',
        description: 'Nome do tenant.',
        source: 'tenants.name',
        scopes: ['chatbot_flows', 'chat_templates', 'contracts', 'notifications', 'proposals'],
      },
      {
        key: 'tenant.domain',
        aliases: ['system.tenant_domain'],
        label: 'Domínio',
        description: 'Domínio configurado do tenant.',
        source: 'tenants.domain',
        scopes: ['chatbot_flows', 'contracts'],
      },
    ],
  },
  {
    id: 'system',
    title: 'Sistema / data',
    description: 'Valores de plataforma e relógio (alinhar a contratos).',
    fields: [
      {
        key: 'system.date',
        label: 'Data (ISO)',
        description: 'AAAA-MM-DD (UTC).',
        source: 'Relógio do servidor',
        scopes: ['chatbot_flows', 'contracts', 'chat_templates'],
      },
      {
        key: 'system.date_formatted',
        label: 'Data formatada',
        description: 'dd/mm/aaaa (UTC).',
        source: 'Relógio do servidor',
        scopes: ['chatbot_flows', 'contracts', 'chat_templates'],
      },
      {
        key: 'system.name',
        label: 'Nome do sistema',
        description: 'APP_PUBLIC_NAME ou PainelCRM.',
        source: 'env',
        scopes: ['chatbot_flows', 'contracts'],
      },
    ],
  },
];

export function listTemplateVariablesForScope(
  scope: TemplateVariableScope
): TemplateVariableDefinition[] {
  const out: TemplateVariableDefinition[] = [];
  for (const cat of TEMPLATE_VARIABLE_CATEGORIES) {
    for (const f of cat.fields) {
      if (f.scopes.includes(scope)) out.push(f);
    }
  }
  return out;
}

export function getTemplateVariableCategoriesForScope(
  scope: TemplateVariableScope
): TemplateVariableCategory[] {
  return TEMPLATE_VARIABLE_CATEGORIES.map((cat) => ({
    ...cat,
    fields: cat.fields.filter((f) => f.scopes.includes(scope)),
  })).filter((cat) => cat.fields.length > 0);
}

/** Token para inserir em templates: {{key}} */
export function templateVariableToken(key: string): string {
  return `{{${key}}}`;
}

/**
 * Resolve valor a partir de um bag flat (aliases + canônico).
 * Missing → undefined (caller decide leave vs empty).
 */
export function lookupTemplateVariableValue(
  keyOrAlias: string,
  bag: Record<string, unknown>
): unknown {
  if (Object.prototype.hasOwnProperty.call(bag, keyOrAlias)) return bag[keyOrAlias];
  for (const cat of TEMPLATE_VARIABLE_CATEGORIES) {
    for (const f of cat.fields) {
      if (f.key === keyOrAlias || f.aliases?.includes(keyOrAlias)) {
        if (Object.prototype.hasOwnProperty.call(bag, f.key)) return bag[f.key];
        for (const a of f.aliases || []) {
          if (Object.prototype.hasOwnProperty.call(bag, a)) return bag[a];
        }
      }
    }
  }
  return undefined;
}
