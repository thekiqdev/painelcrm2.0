/**
 * Espelho FE do catálogo unificado (S9).
 * Manter alinhado a packages/backend/src/services/templateVariables/catalog.ts
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
  | 'invoice'
  | 'ticket';

export type TemplateVariableDefinition = {
  key: string;
  aliases?: string[];
  label: string;
  description: string;
  source: string;
  scopes: TemplateVariableScope[];
  dynamic?: boolean;
};

export type TemplateVariableCategory = {
  id: TemplateVariableCategoryId;
  title: string;
  description?: string;
  fields: TemplateVariableDefinition[];
};

export const TEMPLATE_VARIABLE_CATEGORIES: TemplateVariableCategory[] = [
  {
    id: 'flow_session',
    title: 'Sessão do flow',
    description: 'Variáveis capturadas ou definidas no fluxo. Chaves dinâmicas além destas.',
    fields: [
      {
        key: 'flow_session.answer',
        aliases: ['answer'],
        label: 'Última resposta (answer)',
        description: 'Default do nó Pergunta quando variable=answer.',
        source: 'sessão do flow',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'flow_session.webhook_payload',
        aliases: ['webhook_payload'],
        label: 'Payload do webhook in',
        description: 'Body recebido no webhook_in.',
        source: 'webhook_in',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'flow_session.http_status',
        aliases: ['http_status'],
        label: 'Status HTTP (default)',
        description: 'Default do nó HTTP.',
        source: 'http_request',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'flow_session.http_body',
        aliases: ['http_body'],
        label: 'Body HTTP (default)',
        description: 'Default do nó HTTP.',
        source: 'http_request',
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
        description: 'Nome exibido na conversa.',
        source: 'conversa / contato',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban', 'contracts', 'proposals'],
      },
      {
        key: 'contact.phone',
        aliases: ['canonical_phone', 'contact_phone'],
        label: 'Telefone',
        description: 'Telefone normalizado.',
        source: 'conversa',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban'],
      },
      {
        key: 'contact.email',
        aliases: ['contact_email', 'client_email'],
        label: 'E-mail',
        description: 'E-mail do contato.',
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
      {
        key: 'lead.id',
        aliases: ['lead_id'],
        label: 'ID do lead CRM',
        description: 'leads.id vinculado à conversa.',
        source: 'chat_conversations.lead_id',
        scopes: ['chatbot_flows'],
      },
      {
        key: 'lead.name',
        aliases: ['lead_name'],
        label: 'Nome do lead',
        description: 'Nome do lead vinculado.',
        source: 'leads / crm_link_check',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'crm.link_kind',
        aliases: ['crm_link_kind'],
        label: 'Tipo de vínculo CRM',
        description: 'client | lead | unlinked (nó Vínculo CRM).',
        source: 'crm_link_check',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'crm.convert_mode',
        aliases: ['crm_convert_mode'],
        label: 'Modo de conversão CRM',
        description: 'to_lead | to_client',
        source: 'crm_convert',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'crm.convert_result',
        aliases: ['crm_convert_result'],
        label: 'Resultado da conversão',
        description: 'created | linked | unchanged',
        source: 'crm_convert',
        scopes: ['chatbot_flows'],
        dynamic: true,
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
    id: 'ticket',
    title: 'Chamado (CRM)',
    description: 'Preenchidas pelos nós Abrir/Consultar chamado (S25).',
    fields: [
      {
        key: 'ticket.public_url',
        aliases: ['ticket_public_url', 'ticket_public_link'],
        label: 'Link público',
        description: 'URL /ticket/{token} (PublicTicketView).',
        source: 'ticket_assist / ticket_lookup_assist',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'ticket.number',
        aliases: ['ticket_number'],
        label: 'Número',
        description: 'Número do chamado.',
        source: 'tickets.ticket_number',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'ticket.subject',
        aliases: ['ticket_subject'],
        label: 'Assunto',
        description: 'Assunto do chamado.',
        source: 'tickets.subject',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'ticket.status',
        aliases: ['ticket_status'],
        label: 'Status',
        description: 'Status atual (new, open, pending…).',
        source: 'tickets.status',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'ticket.category_name',
        aliases: ['ticket_category_name'],
        label: 'Categoria',
        description: 'Nome da categoria escolhida.',
        source: 'ticket_categories',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'ticket.menu',
        aliases: ['ticket_menu'],
        label: 'Menu',
        description: 'Lista numerada de categorias ou chamados.',
        source: 'ticket_assist / ticket_lookup_assist',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'ticket.count',
        aliases: ['ticket_count'],
        label: 'Qtd. chamados',
        description: 'Quantidade encontrada no lookup.',
        source: 'lookup_ticket',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
      {
        key: 'ticket.category_count',
        aliases: ['ticket_category_count'],
        label: 'Qtd. categorias',
        description: 'Quantidade de categorias no bootstrap.',
        source: 'ticket_assist',
        scopes: ['chatbot_flows'],
        dynamic: true,
      },
    ],
  },
  {
    id: 'conversation',
    title: 'Conversa',
    description: 'Atendimento / kanban.',
    fields: [
      {
        key: 'conversation.id',
        aliases: ['conversation_id'],
        label: 'ID da conversa',
        description: 'UUID da conversa.',
        source: 'chat_conversations',
        scopes: ['chatbot_flows', 'kanban'],
      },
      {
        key: 'conversation.column_name',
        aliases: ['column_name'],
        label: 'Coluna do Kanban',
        description: 'Coluna atual do card.',
        source: 'kanban',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban'],
      },
      {
        key: 'conversation.board_name',
        aliases: ['board_name'],
        label: 'Board do Kanban',
        description: 'Nome do board.',
        source: 'kanban',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban'],
      },
    ],
  },
  {
    id: 'agent',
    title: 'Agente / equipe',
    fields: [
      {
        key: 'agent.name',
        aliases: ['operator_name'],
        label: 'Nome do agente',
        description: 'Atendente / operador.',
        source: 'users',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban', 'contracts'],
      },
      {
        key: 'agent.team_name',
        aliases: ['team_name'],
        label: 'Nome da equipe',
        description: 'Equipe atribuída.',
        source: 'teams',
        scopes: ['chatbot_flows', 'chat_templates', 'kanban'],
      },
    ],
  },
  {
    id: 'tenant',
    title: 'Empresa (tenant)',
    fields: [
      {
        key: 'tenant.name',
        aliases: ['company_name', 'tenant_name', 'system.tenant_name'],
        label: 'Nome da empresa',
        description: 'Nome do tenant.',
        source: 'tenants',
        scopes: ['chatbot_flows', 'chat_templates', 'contracts', 'notifications', 'proposals'],
      },
      {
        key: 'tenant.domain',
        aliases: ['system.tenant_domain'],
        label: 'Domínio',
        description: 'Domínio do tenant.',
        source: 'tenants',
        scopes: ['chatbot_flows', 'contracts'],
      },
    ],
  },
  {
    id: 'system',
    title: 'Sistema / data',
    fields: [
      {
        key: 'system.date',
        label: 'Data (ISO)',
        description: 'AAAA-MM-DD (UTC).',
        source: 'servidor',
        scopes: ['chatbot_flows', 'contracts', 'chat_templates'],
      },
      {
        key: 'system.date_formatted',
        label: 'Data formatada',
        description: 'dd/mm/aaaa.',
        source: 'servidor',
        scopes: ['chatbot_flows', 'contracts', 'chat_templates'],
      },
      {
        key: 'system.name',
        label: 'Nome do sistema',
        description: 'PainelCRM / APP_PUBLIC_NAME.',
        source: 'env',
        scopes: ['chatbot_flows', 'contracts'],
      },
    ],
  },
];

export function getTemplateVariableCategoriesForScope(
  scope: TemplateVariableScope
): TemplateVariableCategory[] {
  return TEMPLATE_VARIABLE_CATEGORIES.map((cat) => ({
    ...cat,
    fields: cat.fields.filter((f) => f.scopes.includes(scope)),
  })).filter((cat) => cat.fields.length > 0);
}

export function listTemplateVariablesForScope(
  scope: TemplateVariableScope
): TemplateVariableDefinition[] {
  return getTemplateVariableCategoriesForScope(scope).flatMap((c) => c.fields);
}

export function templateVariableToken(key: string): string {
  return `{{${key}}}`;
}
