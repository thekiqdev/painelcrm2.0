import { z } from 'zod';

import { outHandlesForMenuChoice } from './menuChoiceHelpers';
import {
  migrateConditionGraph,
  migrateLegacyConditionData,
  outHandlesForCondition,
} from './conditionHelpers';
import { isInputTimeoutEnabled } from './inputTimeout';
import {
  annotationArrowDataSchema,
  annotationTextDataSchema,
  isEditorOnlyNodeType,
  stickyNoteDataSchema,
} from './canvasAnnotations';

export const FLOW_NODE_TYPES = [
  'start',
  'send_message',
  'wait_input',
  'condition',
  'transfer_human',
  'end',
  'set_variable',
  'add_tag',
  'assign_agent',
  'move_kanban',
  'kanban_add_card',
  'delay',
  'http_request',
  'webhook_out',
  'webhook_in',
  'lookup_invoice',
  'select_invoice',
  'invoice_assist',
  'ticket_assist',
  'lookup_ticket',
  'select_ticket',
  'ticket_lookup_assist',
  'crm_link_check',
  'crm_convert',
  'menu_choice',
  'conversation_note',
  'resolve_conversation',
  'ensure_conversation',
] as const;

export type EssentialNodeType = (typeof FLOW_NODE_TYPES)[number];
export type FlowNodeType = EssentialNodeType;

export const NODE_LABELS: Record<EssentialNodeType, string> = {
  start: 'Início',
  send_message: 'Mensagem',
  wait_input: 'Pergunta',
  condition: 'Condição',
  transfer_human: 'Humano',
  end: 'Fim',
  set_variable: 'Variável',
  add_tag: 'Tag',
  assign_agent: 'Atribuir',
  move_kanban: 'Kanban',
  kanban_add_card: 'Kanban',
  delay: 'Delay',
  http_request: 'HTTP',
  webhook_out: 'Webhook out',
  webhook_in: 'Webhook in',
  lookup_invoice: 'Consultar fatura',
  select_invoice: 'Escolher fatura',
  invoice_assist: 'Faturas',
  ticket_assist: 'Abrir chamado',
  lookup_ticket: 'Consultar ticket',
  select_ticket: 'Escolher ticket',
  ticket_lookup_assist: 'Consultar chamado',
  crm_link_check: 'Vínculo CRM',
  crm_convert: 'Converter CRM',
  menu_choice: 'Menu / IF',
  conversation_note: 'Nota interna',
  resolve_conversation: 'Resolver',
  ensure_conversation: 'Iniciar atendimento',
};

const varName = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Variável inválida');

/** Nome de variável de sessão: `city` ou `lead.origem` (dotted). */
const sessionVarName = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/,
    'Use letras/números/_ e pontos (ex.: lead.origem)'
  );

export type SetVariableAssignment = { name: string; value: string };

/** Leitura editor/runtime: assignments[] ou legado { variable, value }. */
export function readSetVariableAssignments(
  data: Record<string, unknown> | null | undefined,
  opts?: { forEditor?: boolean }
): SetVariableAssignment[] {
  const forEditor = opts?.forEditor !== false;
  const raw = data || {};
  if (Array.isArray(raw.assignments)) {
    const rows = raw.assignments
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        return { name: String(r.name ?? ''), value: String(r.value ?? '') };
      })
      .filter(Boolean) as SetVariableAssignment[];
    if (forEditor) {
      return rows.length ? rows : [{ name: '', value: '' }];
    }
    return rows.filter((r) => r.name.trim());
  }
  const legacyName = String(raw.variable ?? raw.name ?? '');
  const legacyValue = String(raw.value ?? '');
  if (legacyName || legacyValue || forEditor) {
    return [{ name: legacyName, value: legacyValue }];
  }
  return [];
}

function normalizeSetVariableData(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return { assignments: [{ name: 'var1', value: '' }] };
  const o = { ...(raw as Record<string, unknown>) };
  let assignments = readSetVariableAssignments(o, { forEditor: false });
  if (assignments.length === 0) {
    assignments = [{ name: 'var1', value: '' }];
  }
  o.assignments = assignments.map((a) => ({
    name: a.name.trim(),
    value: String(a.value ?? ''),
  }));
  delete o.variable;
  delete o.name;
  delete o.value;
  return o;
}

export const httpHeaderSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string(),
});

/** Aceita linhas vazias no editor; filtra na validação. */
const headersArraySchema = z.preprocess((v) => {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (h) => h && typeof h === 'object' && String((h as { key?: unknown }).key ?? '').trim()
  );
}, z.array(httpHeaderSchema).default([]));

const jsonFieldsUiSchema = z.enum(['fields', 'json']).optional();

export const httpResponseMapSchema = z.object({
  path: z.string().trim().min(1),
  variable: varName,
});

export const httpRequestDataSchema = z.object({
  label: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  url: z.string().trim().min(1, 'URL obrigatória'),
  headers: headersArraySchema,
  headers_ui: jsonFieldsUiSchema,
  body: z.string().optional().default(''),
  body_ui: jsonFieldsUiSchema,
  timeout_ms: z.coerce.number().int().min(500).max(30000).default(10000),
  response_variable: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      .optional()
  ),
  status_variable: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      .optional()
  ),
  response_map: z.array(httpResponseMapSchema).optional().default([]),
});

export const webhookOutDataSchema = z.object({
  label: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().default('POST'),
  url: z.string().trim().min(1, 'URL obrigatória'),
  headers: headersArraySchema,
  headers_ui: jsonFieldsUiSchema,
  secret: z.string().optional().default(''),
  timeout_ms: z.coerce.number().int().min(500).max(30000).default(10000),
  include_session_vars: z.boolean().optional().default(true),
  /**
   * envelope = payload padrão PainelCRM
   * envelope_plus = padrão + campo `data` (JSON do body_template)
   * custom = body inteiro = body_template interpolado
   */
  payload_mode: z.enum(['envelope', 'envelope_plus', 'custom']).optional().default('envelope'),
  body_template: z.string().optional().default(''),
  body_ui: jsonFieldsUiSchema,
});

export const webhookInDataSchema = z.object({
  label: z.string().optional(),
  token: z
    .string()
    .trim()
    .min(16, 'Token do webhook obrigatório')
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Token inválido'),
  secret: z.string().optional().default(''),
  /** S27 — path no JSON do body → variável de sessão */
  payload_map: z
    .array(
      z.object({
        path: z.string().trim().min(1, 'Path obrigatório'),
        variable: sessionVarName,
      })
    )
    .optional()
    .default([]),
  /** Sample colado no editor (S27 preview; S27.1 listen gravará aqui) */
  last_payload_json: z.unknown().optional().nullable(),
  last_payload_at: z.string().optional().nullable(),
});

export function generateInboundWebhookToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildInboundWebhookPath(token: string): string {
  return `/webhooks/chatbot-flows/${encodeURIComponent(token)}`;
}

export const triggerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('keyword'),
    value: z.string().trim().min(1, 'Palavra-chave obrigatória'),
    match: z.enum(['equals', 'contains']).optional().default('contains'),
    keywords: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('first_message'),
    idle_after_hours: z.coerce.number().min(0).max(8760).nullable().optional(),
  }),
  /** S31 — gatilho por tag na conversa. */
  z.object({
    type: z.literal('tag'),
    tag_id: z.string().uuid().optional().nullable(),
    tag_label: z.string().trim().optional().nullable(),
  }),
  /** S31 — gatilho por coluna kanban. */
  z.object({
    type: z.literal('kanban_column'),
    column_id: z.string().uuid({ message: 'Coluna Kanban obrigatória' }),
    board_id: z.string().uuid().optional().nullable(),
  }),
]);

export const startDataSchema = z
  .object({
    label: z.string().optional(),
    trigger: triggerSchema.default({ type: 'first_message' }),
    /** S22: true = só chats 1:1. Ausente/false = compat (grupos permitidos). */
    dm_only: z.boolean().optional().default(false),
    /** S23: política com sessão viva. */
    session_policy: z
      .enum(['ignore_if_session_alive', 'restart_on_keyword'])
      .optional()
      .default('ignore_if_session_alive'),
    /** S24 */
    cooldown_minutes: z.coerce.number().int().min(0).max(10080).optional().default(0),
    schedule_enabled: z.boolean().optional().default(false),
    schedule_start: z.string().optional().default('09:00'),
    schedule_end: z.string().optional().default('18:00'),
    instance_ids: z.array(z.string().uuid()).optional().default([]),
    priority: z.coerce.number().int().min(-999).max(9999).optional().default(0),
  })
  .superRefine((d, ctx) => {
    const t = d.trigger as { type?: string; tag_id?: unknown; tag_label?: unknown };
    if (t?.type === 'tag') {
      const hasId = Boolean(String(t.tag_id || '').trim());
      const hasLabel = Boolean(String(t.tag_label || '').trim());
      if (!hasId && !hasLabel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Selecione uma tag (id ou nome)',
          path: ['trigger', 'tag_id'],
        });
      }
    }
  });

export const sendMessageDataSchema = z
  .object({
    label: z.string().optional(),
    send_mode: z.enum(['text', 'media']).optional().default('text'),
    text: z.string().optional().default(''),
    media_url: z.string().optional().default(''),
    media_type: z.enum(['image', 'document', 'audio']).optional().default('image'),
    caption: z.string().optional().default(''),
    filename: z.string().optional().default(''),
  })
  .superRefine((d, ctx) => {
    const mode = d.send_mode === 'media' ? 'media' : 'text';
    if (mode === 'text') {
      if (!String(d.text || '').trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Texto da mensagem obrigatório',
          path: ['text'],
        });
      }
    } else if (!String(d.media_url || '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL da mídia obrigatória',
        path: ['media_url'],
      });
    }
  });

export const waitInputDataSchema = z
  .object({
    label: z.string().optional(),
    prompt: z.string().trim().min(1, 'Pergunta obrigatória'),
    variable: z
      .string()
      .trim()
      .min(1, 'Nome da variável obrigatório')
      .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Variável inválida'),
    timeout_enabled: z.boolean().optional().default(false),
    timeout_amount: z.coerce.number().int().min(1).max(99999).optional().default(5),
    timeout_unit: z.enum(['seconds', 'minutes', 'hours', 'days']).optional().default('minutes'),
    /** S20: persiste a resposta no cliente/lead vinculado à conversa. */
    save_to_contact: z.boolean().optional().default(false),
    contact_field: z
      .enum(['name', 'email', 'phone', 'company', 'cpf_cnpj'])
      .optional()
      .default('name'),
  })
  .superRefine((d, ctx) => {
    if (d.save_to_contact && !d.contact_field) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecione o campo do contato',
        path: ['contact_field'],
      });
    }
  });

const conditionOperatorSchema = z.enum(['eq', 'neq', 'contains', 'exists', 'empty']);

const conditionRuleSchema = z.object({
  variable: z.string().trim().min(1, 'Variável obrigatória'),
  operator: conditionOperatorSchema.default('eq'),
  value: z.string().optional().default(''),
});

const conditionCaseSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, 'ID de caso inválido'),
  name: z.string().optional(),
  join: z.enum(['and', 'or']).default('and'),
  conditions: z.array(conditionRuleSchema).min(1, 'Inclua ao menos 1 condição no caso'),
});

export const conditionDataSchema = z.preprocess(
  (raw) => migrateLegacyConditionData(raw),
  z.object({
    label: z.string().optional(),
    cases: z.array(conditionCaseSchema).min(1, 'Inclua ao menos 1 caso'),
  })
);

export const transferHumanDataSchema = z
  .object({
    label: z.string().optional(),
    message: z.string().optional(),
    /** Destino opcional ao transferir (sem destino = qualquer humano / pending). */
    mode: z.enum(['none', 'user', 'team', 'queue']).optional().default('none'),
    user_id: z.string().uuid().optional(),
    team_id: z.string().uuid().optional(),
    queue_id: z.string().uuid().optional().nullable(),
    assignee_label: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.mode === 'user' && !d.user_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione o agente' });
    }
    if (d.mode === 'team' && !d.team_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione a equipe' });
    }
  });

export const endDataSchema = z.object({
  label: z.string().optional(),
});

export const conversationNoteDataSchema = z.object({
  label: z.string().optional(),
  text: z.string().min(1, 'Texto da nota obrigatório'),
  visibility: z.enum(['internal']).optional().default('internal'),
});

export const resolveConversationDataSchema = z.object({
  label: z.string().optional(),
  message: z.string().optional().default(''),
  close_attendance: z.boolean().optional().default(true),
});

/** S29 / S29.1 — telefone → create/reuse conversa (+ idempotência opcional). */
export const ensureConversationDataSchema = z.object({
  label: z.string().optional(),
  phone: z.string().min(1, 'Telefone obrigatório (literal ou {{var}})'),
  normalize_br: z.boolean().optional().default(true),
  instance_id: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.string().uuid().nullable().optional().default(null)
  ),
  reuse_policy: z.enum(['open', 'any', 'always_create']).optional().default('open'),
  /** S29.1 — chave opcional (ex. {{order.id}}). Vazio = off. */
  idempotency_key: z.string().max(256).optional().nullable().default(''),
  last_normalized_preview: z.string().optional().nullable(),
});

export const setVariableAssignmentSchema = z.object({
  name: sessionVarName,
  value: z.string(),
});

export const setVariableDataSchema = z.preprocess(
  normalizeSetVariableData,
  z.object({
    label: z.string().optional(),
    assignments: z
      .array(setVariableAssignmentSchema)
      .min(1, 'Inclua ao menos 1 variável')
      .max(20),
  })
);

export const addTagDataSchema = z
  .object({
    label: z.string().optional(),
    tag_label: z.string().trim().optional(),
    tag_id: z.string().uuid().optional(),
  })
  .refine((d) => Boolean(d.tag_id || (d.tag_label && d.tag_label.trim())), {
    message: 'Informe o nome da tag',
  });

export const assignAgentDataSchema = z
  .object({
    label: z.string().optional(),
    mode: z.enum(['user', 'team', 'queue']),
    user_id: z.string().uuid().optional(),
    team_id: z.string().uuid().optional(),
    queue_id: z.string().uuid().optional().nullable(),
  })
  .superRefine((d, ctx) => {
    if (d.mode === 'user' && !d.user_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'user_id obrigatório' });
    }
    if (d.mode === 'team' && !d.team_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'team_id obrigatório' });
    }
  });

export const moveKanbanDataSchema = z.object({
  label: z.string().optional(),
  board_id: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().uuid().optional()
  ),
  board_label: z.string().optional(),
  column_id: z.string().uuid('Selecione a coluna do Kanban'),
  column_label: z.string().optional(),
  title: z.string().optional().default(''),
  description: z.string().optional().default(''),
  tag_id: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().uuid().optional()
  ),
  tag_label: z.string().optional(),
});

/** Alias legado S16 — mesmo schema do Kanban (cria ou move pela conversa). */
export const kanbanAddCardDataSchema = moveKanbanDataSchema.extend({
  board_id: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().uuid().optional()
  ),
  only_if_not_exists: z.boolean().optional(),
});

export const delayDataSchema = z.object({
  label: z.string().optional(),
  amount: z.coerce.number().int().min(1).max(99999),
  unit: z.enum(['seconds', 'minutes', 'hours', 'days']).default('minutes'),
});

export const lookupInvoiceDataSchema = z.object({
  label: z.string().optional(),
  /** last_open = 1 fatura em invoice.*; open_menu = lista numerada + invoice._items */
  mode: z.enum(['last_open', 'open_menu']).default('last_open'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
});

export const selectInvoiceDataSchema = z.object({
  label: z.string().optional(),
  /** Variável com a opção digitada (1, 2, …) — default answer */
  variable: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Variável inválida')
    .default('answer'),
});

/** S11.1 — consulta + mensagem + espera + envio do link num único nó. */
export const invoiceAssistDataSchema = z.object({
  label: z.string().optional(),
  mode: z.enum(['last_open', 'open_menu']).default('last_open'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
  prompt_template: z
    .string()
    .optional()
    .default(
      'Estas são suas faturas em aberto:\n{{invoice.menu}}\n\nResponda com o número da opção desejada.'
    ),
  link_template: z
    .string()
    .optional()
    .default(
      'Segue o link da fatura {{invoice.number}} ({{invoice.total}}):\n{{invoice.public_link}}'
    ),
  empty_message: z.string().optional().default(''),
  invalid_message: z
    .string()
    .optional()
    .default('Opção inválida. Digite o número de uma das faturas da lista.'),
  max_invalid: z.coerce.number().int().min(1).max(10).optional().default(3),
});

/** S25 — abrir chamado (categoria → assunto → descrição → ticket + link). */
export const ticketAssistDataSchema = z.object({
  label: z.string().optional(),
  require_client: z.boolean().optional().default(true),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  intro_message: z.string().optional().default(''),
  category_prompt: z
    .string()
    .optional()
    .default('Escolha a categoria do chamado:\n{{ticket.menu}}\n\nResponda com o número da opção.'),
  subject_prompt: z.string().optional().default('Qual o assunto do chamado?'),
  description_prompt: z
    .string()
    .optional()
    .default('Descreva o problema com detalhes:'),
  success_template: z
    .string()
    .optional()
    .default(
      'Chamado aberto com sucesso!\nNúmero: {{ticket.number}}\nAssunto: {{ticket.subject}}\nAcompanhe aqui: {{ticket.public_url}}'
    ),
  empty_message: z.string().optional().default(''),
  empty_client_message: z
    .string()
    .optional()
    .default(
      'Para abrir um chamado, vincule um cliente a esta conversa e tente novamente.'
    ),
  empty_categories_message: z
    .string()
    .optional()
    .default(
      'Não há categorias de chamado cadastradas. Peça ao atendimento para configurar.'
    ),
  invalid_message: z
    .string()
    .optional()
    .default('Opção inválida. Escolha uma categoria da lista.'),
  max_invalid: z.coerce.number().int().min(1).max(10).optional().default(3),
});

export const lookupTicketDataSchema = z.object({
  label: z.string().optional(),
  mode: z.enum(['last_open', 'open_menu']).default('last_open'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
  include_closed: z.boolean().optional().default(false),
});

export const selectTicketDataSchema = z.object({
  label: z.string().optional(),
  variable: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Variável inválida')
    .default('answer'),
});

export const ticketLookupAssistDataSchema = z.object({
  label: z.string().optional(),
  mode: z.enum(['last_open', 'open_menu']).default('open_menu'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
  include_closed: z.boolean().optional().default(false),
  prompt_template: z
    .string()
    .optional()
    .default(
      'Seus chamados em aberto:\n{{ticket.menu}}\n\nResponda com o número da opção desejada.'
    ),
  link_template: z
    .string()
    .optional()
    .default(
      'Chamado {{ticket.number}} — {{ticket.subject}}\nAcompanhe: {{ticket.public_url}}'
    ),
  empty_message: z
    .string()
    .optional()
    .default('Não encontrei chamados em aberto para este cliente.'),
  invalid_message: z
    .string()
    .optional()
    .default('Opção inválida. Digite o número de um dos chamados da lista.'),
  max_invalid: z.coerce.number().int().min(1).max(10).optional().default(3),
});

export const crmLinkCheckDataSchema = z.object({
  label: z.string().optional(),
  /** D26.2 — tenta match telefone→cliente antes de classificar */
  refresh_client_match: z.boolean().optional().default(true),
});

export const crmConvertDataSchema = z.object({
  label: z.string().optional(),
  mode: z.enum(['to_lead', 'to_client']).optional().default('to_lead'),
  error_message: z
    .string()
    .optional()
    .default('Não foi possível atualizar o vínculo CRM. Verifique telefone ou e-mail do contato.'),
});

export const menuChoiceOptionSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'ID da opção obrigatório')
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'ID: só letras, números, _ e -'),
  label: z.string().trim().min(1, 'Texto do botão obrigatório').max(24),
  description: z.string().max(72).optional().default(''),
  section: z.string().max(24).optional().default(''),
  set_variables: z
    .array(
      z.object({
        name: varName,
        value: z.string(),
      })
    )
    .optional()
    .default([]),
});

export const menuChoiceDataSchema = z
  .object({
    label: z.string().optional(),
    mode: z.enum(['button', 'list']).default('button'),
    text: z.string().trim().min(1, 'Texto do menu obrigatório'),
    footer_text: z.string().optional().default(''),
    list_button: z.string().optional().default('Ver opções'),
    variable: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      .default('answer'),
    max_invalid: z.coerce.number().int().min(1).max(10).optional().default(3),
    invalid_message: z
      .string()
      .optional()
      .default('Opção inválida. Escolha uma das alternativas.'),
    options: z.array(menuChoiceOptionSchema).min(1, 'Inclua ao menos 1 opção').max(10),
    timeout_enabled: z.boolean().optional().default(false),
    timeout_amount: z.coerce.number().int().min(1).max(99999).optional().default(5),
    timeout_unit: z.enum(['seconds', 'minutes', 'hours', 'days']).optional().default('minutes'),
  })
  .superRefine((d, ctx) => {
    if (d.mode === 'button' && d.options.length > 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Botões WhatsApp: no máximo 3 opções',
        path: ['options'],
      });
    }
    const ids = d.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'IDs das opções devem ser únicos',
        path: ['options'],
      });
    }
  });

export const DATA_SCHEMAS: Record<EssentialNodeType, z.ZodTypeAny> = {
  start: startDataSchema,
  send_message: sendMessageDataSchema,
  wait_input: waitInputDataSchema,
  condition: conditionDataSchema,
  transfer_human: transferHumanDataSchema,
  end: endDataSchema,
  set_variable: setVariableDataSchema,
  add_tag: addTagDataSchema,
  assign_agent: assignAgentDataSchema,
  move_kanban: moveKanbanDataSchema,
  kanban_add_card: kanbanAddCardDataSchema,
  delay: delayDataSchema,
  http_request: httpRequestDataSchema,
  webhook_out: webhookOutDataSchema,
  webhook_in: webhookInDataSchema,
  lookup_invoice: lookupInvoiceDataSchema,
  select_invoice: selectInvoiceDataSchema,
  invoice_assist: invoiceAssistDataSchema,
  ticket_assist: ticketAssistDataSchema,
  lookup_ticket: lookupTicketDataSchema,
  select_ticket: selectTicketDataSchema,
  ticket_lookup_assist: ticketLookupAssistDataSchema,
  crm_link_check: crmLinkCheckDataSchema,
  crm_convert: crmConvertDataSchema,
  menu_choice: menuChoiceDataSchema,
  conversation_note: conversationNoteDataSchema,
  resolve_conversation: resolveConversationDataSchema,
  ensure_conversation: ensureConversationDataSchema,
};

export const OUT_HANDLES: Record<EssentialNodeType, string[]> = {
  start: ['default'],
  send_message: ['default'],
  wait_input: ['default'],
  condition: ['else'],
  transfer_human: [],
  end: [],
  conversation_note: ['default'],
  resolve_conversation: [],
  ensure_conversation: ['default', 'error'],
  set_variable: ['default'],
  add_tag: ['default'],
  assign_agent: ['default'],
  move_kanban: ['default'],
  kanban_add_card: ['default', 'error'],
  delay: ['default'],
  http_request: ['default', 'error'],
  webhook_out: ['default', 'error'],
  webhook_in: ['default'],
  lookup_invoice: ['default', 'empty'],
  select_invoice: ['default', 'invalid'],
  invoice_assist: ['default', 'empty', 'invalid'],
  ticket_assist: ['default', 'empty', 'invalid'],
  lookup_ticket: ['default', 'empty'],
  select_ticket: ['default', 'invalid'],
  ticket_lookup_assist: ['default', 'empty', 'invalid'],
  crm_link_check: ['client', 'lead', 'unlinked'],
  /** Dinâmico — use outHandlesForNode() */
  crm_convert: ['default', 'already_client', 'error'],
  menu_choice: ['fallback'],
};

/** Handles de saída obrigatórios no publish (menu_choice / condition / timeout dinâmicos). */
export function outHandlesForNode(
  type: string,
  data?: Record<string, unknown> | null
): string[] {
  if (type === 'menu_choice') {
    const base = outHandlesForMenuChoice(data || {});
    return isInputTimeoutEnabled(data) ? [...base, 'timeout'] : base;
  }
  if (type === 'condition') {
    return outHandlesForCondition(data || {});
  }
  if (type === 'wait_input') {
    return isInputTimeoutEnabled(data) ? ['default', 'timeout'] : ['default'];
  }
  if (type === 'crm_convert') {
    return String(data?.mode || 'to_lead') === 'to_client'
      ? ['default', 'error']
      : ['default', 'already_client', 'error'];
  }
  if ((FLOW_NODE_TYPES as readonly string[]).includes(type)) {
    return OUT_HANDLES[type as EssentialNodeType] || [];
  }
  return [];
}

/**
 * Handles permitidos em edges (inclui opcionais).
 * Ex.: move_kanban exige só `default`, mas aceita `error` se conectado.
 */
export function allowedOutHandlesForNode(
  type: string,
  data?: Record<string, unknown> | null
): string[] {
  const required = outHandlesForNode(type, data);
  if (type === 'move_kanban') {
    return Array.from(new Set([...required, 'error']));
  }
  return required;
}

export type GraphValidationIssue = {
  code: string;
  message: string;
  nodeIds?: string[];
  edgeIds?: string[];
  /** Handle relacionado (missing_out / edge_handle). */
  handle?: string;
  /** Dica curta para o usuário. */
  hint?: string;
  /** Ação automática disponível no editor. */
  autofix?: 'remove_edges' | 'wire_to_end' | 'remove_orphan';
  autofixLabel?: string;
};

export function defaultDataForType(type: EssentialNodeType): Record<string, unknown> {
  switch (type) {
    case 'start':
      return {
        label: NODE_LABELS.start,
        trigger: { type: 'first_message' },
        dm_only: true,
      };
    case 'send_message':
      return {
        label: NODE_LABELS.send_message,
        send_mode: 'text',
        text: '',
        media_url: '',
        media_type: 'image',
        caption: '',
        filename: '',
      };
    case 'wait_input':
      return {
        label: NODE_LABELS.wait_input,
        prompt: '',
        variable: 'answer',
        save_to_contact: false,
        contact_field: 'name',
      };
    case 'condition':
      return {
        label: NODE_LABELS.condition,
        cases: [
          {
            id: 'c1',
            name: 'Caso 1',
            join: 'and',
            conditions: [{ variable: 'answer', operator: 'eq', value: '' }],
          },
        ],
      };
    case 'transfer_human':
      return { label: NODE_LABELS.transfer_human, message: '', mode: 'none' };
    case 'end':
      return { label: NODE_LABELS.end };
    case 'set_variable':
      return {
        label: NODE_LABELS.set_variable,
        assignments: [{ name: 'var1', value: '' }],
      };
    case 'add_tag':
      return { label: NODE_LABELS.add_tag, tag_label: '' };
    case 'assign_agent':
      return { label: NODE_LABELS.assign_agent, mode: 'queue', queue_id: '' };
    case 'move_kanban':
    case 'kanban_add_card':
      return {
        label: NODE_LABELS.move_kanban,
        board_id: '',
        column_id: '',
        title: '',
        description: '',
        tag_label: '',
      };
    case 'delay':
      return { label: NODE_LABELS.delay, amount: 5, unit: 'minutes' };
    case 'http_request':
      return {
        label: NODE_LABELS.http_request,
        method: 'GET',
        url: '',
        headers: [],
        headers_ui: 'fields',
        body: '',
        body_ui: 'fields',
        timeout_ms: 10000,
        response_variable: 'http_body',
        status_variable: 'http_status',
        response_map: [],
      };
    case 'webhook_out':
      return {
        label: NODE_LABELS.webhook_out,
        method: 'POST',
        url: '',
        headers: [],
        headers_ui: 'fields',
        secret: '',
        timeout_ms: 10000,
        include_session_vars: true,
        payload_mode: 'envelope',
        body_template: '{\n  "exemplo": "{{answer}}"\n}',
        body_ui: 'fields',
      };
    case 'lookup_invoice':
      return {
        label: NODE_LABELS.lookup_invoice,
        mode: 'last_open',
        limit: 8,
      };
    case 'select_invoice':
      return {
        label: NODE_LABELS.select_invoice,
        variable: 'answer',
      };
    case 'invoice_assist':
      return {
        label: NODE_LABELS.invoice_assist,
        mode: 'open_menu',
        limit: 8,
        prompt_template:
          'Estas são suas faturas em aberto:\n{{invoice.menu}}\n\nResponda com o número da opção desejada.',
        link_template:
          'Segue o link da fatura {{invoice.number}} ({{invoice.total}}):\n{{invoice.public_link}}',
        empty_message: '',
        invalid_message: 'Opção inválida. Digite o número de uma das faturas da lista.',
        max_invalid: 3,
      };
    case 'ticket_assist':
      return {
        label: NODE_LABELS.ticket_assist,
        require_client: true,
        priority: 'normal',
        intro_message: '',
        category_prompt:
          'Escolha a categoria do chamado:\n{{ticket.menu}}\n\nResponda com o número da opção.',
        subject_prompt: 'Qual o assunto do chamado?',
        description_prompt: 'Descreva o problema com detalhes:',
        success_template:
          'Chamado aberto com sucesso!\nNúmero: {{ticket.number}}\nAssunto: {{ticket.subject}}\nAcompanhe aqui: {{ticket.public_url}}',
        empty_message: '',
        empty_client_message:
          'Para abrir um chamado, vincule um cliente a esta conversa e tente novamente.',
        empty_categories_message:
          'Não há categorias de chamado cadastradas. Peça ao atendimento para configurar.',
        invalid_message: 'Opção inválida. Escolha uma categoria da lista.',
        max_invalid: 3,
      };
    case 'lookup_ticket':
      return {
        label: NODE_LABELS.lookup_ticket,
        mode: 'last_open',
        limit: 8,
        include_closed: false,
      };
    case 'select_ticket':
      return {
        label: NODE_LABELS.select_ticket,
        variable: 'answer',
      };
    case 'ticket_lookup_assist':
      return {
        label: NODE_LABELS.ticket_lookup_assist,
        mode: 'open_menu',
        limit: 8,
        include_closed: false,
        prompt_template:
          'Seus chamados em aberto:\n{{ticket.menu}}\n\nResponda com o número da opção desejada.',
        link_template:
          'Chamado {{ticket.number}} — {{ticket.subject}}\nAcompanhe: {{ticket.public_url}}',
        empty_message: 'Não encontrei chamados em aberto para este cliente.',
        invalid_message: 'Opção inválida. Digite o número de um dos chamados da lista.',
        max_invalid: 3,
      };
    case 'crm_link_check':
      return {
        label: NODE_LABELS.crm_link_check,
        refresh_client_match: true,
      };
    case 'crm_convert':
      return {
        label: NODE_LABELS.crm_convert,
        mode: 'to_lead',
        error_message:
          'Não foi possível atualizar o vínculo CRM. Verifique telefone ou e-mail do contato.',
      };
    case 'menu_choice':
      return {
        label: NODE_LABELS.menu_choice,
        mode: 'button',
        text: 'Como posso ajudar?',
        footer_text: '',
        list_button: 'Ver opções',
        variable: 'answer',
        max_invalid: 3,
        invalid_message: 'Opção inválida. Escolha uma das alternativas.',
        options: [
          { id: 'opt_a', label: 'Opção A', description: '', section: '', set_variables: [] },
          { id: 'opt_b', label: 'Opção B', description: '', section: '', set_variables: [] },
        ],
      };
    case 'conversation_note':
      return {
        label: NODE_LABELS.conversation_note,
        text: '',
        visibility: 'internal',
      };
    case 'resolve_conversation':
      return {
        label: NODE_LABELS.resolve_conversation,
        message: '',
        close_attendance: true,
      };
    case 'ensure_conversation':
      return {
        label: NODE_LABELS.ensure_conversation,
        phone: '{{order.phone}}',
        normalize_br: true,
        instance_id: null,
        reuse_policy: 'open',
        idempotency_key: '{{order.id}}',
      };
    case 'webhook_in':
      return {
        label: NODE_LABELS.webhook_in,
        token: generateInboundWebhookToken(),
        secret: '',
        payload_map: [],
      };
  }
}

export function nodePreview(type: string, data: Record<string, unknown>): string {
  if (type === 'send_message') {
    if (String(data.send_mode || 'text') === 'media') {
      const mt = String(data.media_type || 'image');
      const cap = String(data.caption || data.media_url || '').trim();
      return `[mídia: ${mt}] ${cap}`.trim().slice(0, 48);
    }
    if (typeof data.text === 'string' && data.text.trim()) {
      return data.text.trim().slice(0, 48);
    }
  }
  if (type === 'wait_input' && typeof data.prompt === 'string' && data.prompt.trim()) {
    return data.prompt.trim().slice(0, 48);
  }
  if (type === 'condition') {
    const cases = Array.isArray(data.cases) ? data.cases : [];
    if (cases.length > 0) return `${cases.length} caso${cases.length === 1 ? '' : 's'}`;
    return `${String(data.variable || '?')} ${String(data.operator || '')} ${String(data.value ?? '')}`.slice(
      0,
      48
    );
  }
  if (type === 'start') {
    const t = data.trigger as {
      type?: string;
      value?: string;
      idle_after_hours?: number;
      tag_label?: string;
      tag_id?: string;
      column_id?: string;
    } | undefined;
    const dm = data.dm_only === true ? ' · só 1:1' : '';
    if (t?.type === 'keyword') return `Keyword: ${t.value || '…'}${dm}`;
    if (t?.type === 'tag') {
      const label = String(t.tag_label || '').trim();
      return `Tag: ${label || t.tag_id?.slice(0, 8) || '…'}${dm}`;
    }
    if (t?.type === 'kanban_column') {
      return `Kanban: ${t.column_id ? t.column_id.slice(0, 8) : '…'}${dm}`;
    }
    const idle = Number(t?.idle_after_hours);
    if (Number.isFinite(idle) && idle > 0) return `1ª msg / idle ${idle}h${dm}`;
    return `1ª mensagem${dm}`;
  }
  if (type === 'transfer_human') {
    const mode = String(data.mode || 'none');
    const label = data.assignee_label ? String(data.assignee_label).slice(0, 32) : '';
    if (mode === 'user') return label ? `Agente: ${label}` : 'Agente específico';
    if (mode === 'team') return label ? `Equipe: ${label}` : 'Equipe';
    if (mode === 'queue') return label ? `Fila: ${label}` : 'Fila';
    return 'Atendimento humano';
  }
  if (type === 'conversation_note' && typeof data.text === 'string' && data.text.trim()) {
    return data.text.trim().slice(0, 48);
  }
  if (type === 'ensure_conversation') {
    const phone = String(data.phone || '').trim();
    const prev = String(data.last_normalized_preview || '').trim();
    if (prev) return prev.slice(0, 48);
    return phone ? phone.slice(0, 48) : 'telefone…';
  }
  if (type === 'resolve_conversation') {
    return data.close_attendance === false ? 'Só encerra bot' : 'Fecha atendimento';
  }
  if (type === 'set_variable') {
    const rows = readSetVariableAssignments(data as Record<string, unknown>, {
      forEditor: false,
    });
    if (rows.length === 0) return '—';
    if (rows.length === 1) {
      return `${rows[0]!.name} = ${String(rows[0]!.value).slice(0, 24)}`;
    }
    return `${rows.length} variáveis`;
  }
  if (type === 'add_tag') return String(data.tag_label || 'tag');
  if (type === 'assign_agent') {
    if (data.assignee_label) return String(data.assignee_label).slice(0, 40);
    return `modo: ${String(data.mode || 'queue')}`;
  }
  if (type === 'move_kanban' || type === 'kanban_add_card') {
    return String(data.column_label || data.title || 'coluna').slice(0, 40);
  }
  if (type === 'delay') return `${data.amount || '?'} ${data.unit || 'minutes'}`;
  if (type === 'http_request') {
    return `${String(data.method || 'GET')} ${String(data.url || '…').slice(0, 36)}`;
  }
  if (type === 'webhook_out') {
    return `${String(data.method || 'POST')} ${String(data.url || 'webhook').slice(0, 32)}`;
  }
  if (type === 'webhook_in') {
    const n = Array.isArray(data.payload_map) ? data.payload_map.length : 0;
    const tok = String(data.token || '');
    const suffix = tok ? `…${tok.slice(-8)}` : 'gerar token';
    return n > 0 ? `${n} map · ${suffix}` : suffix;
  }
  if (type === 'lookup_invoice') {
    return String(data.mode || 'last_open') === 'open_menu' ? 'Menu de abertas' : 'Última aberta';
  }
  if (type === 'select_invoice') {
    return `opção em {{${String(data.variable || 'answer')}}}`;
  }
  if (type === 'invoice_assist') {
    return String(data.mode || 'open_menu') === 'last_open'
      ? 'Última → envia link'
      : 'Menu → espera → link';
  }
  if (type === 'ticket_assist') {
    return 'Categoria → assunto → descrição';
  }
  if (type === 'lookup_ticket') {
    return String(data.mode || 'last_open') === 'open_menu' ? 'Menu de abertos' : 'Último aberto';
  }
  if (type === 'select_ticket') {
    return `opção em {{${String(data.variable || 'answer')}}}`;
  }
  if (type === 'ticket_lookup_assist') {
    return String(data.mode || 'open_menu') === 'last_open'
      ? 'Último → envia link'
      : 'Menu → espera → link';
  }
  if (type === 'crm_link_check') {
    return data.refresh_client_match === false
      ? 'Cliente / lead / sem vínculo'
      : 'Match telefone + 3 saídas';
  }
  if (type === 'crm_convert') {
    return String(data.mode || 'to_lead') === 'to_client'
      ? 'Garantir cliente'
      : 'Garantir lead';
  }
  if (type === 'menu_choice') {
    const n = Array.isArray(data.options) ? data.options.length : 0;
    return `${data.mode === 'list' ? 'Lista' : 'Botões'} · ${n} opção(ões)`;
  }
  return NODE_LABELS[type as EssentialNodeType] || type;
}

/** Validação client-side espelhando o backend (UX prévia ao publish). */
export function validateGraphForPublish(graph: {
  nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
  }>;
}): { ok: true } | { ok: false; issues: GraphValidationIssue[] } {
  const issues: GraphValidationIssue[] = [];
  const migrated = migrateConditionGraph({
    nodes: graph.nodes,
    edges: graph.edges,
  });
  const nodes = (migrated.nodes || []) as Array<{
    id: string;
    type?: string;
    data?: Record<string, unknown>;
  }>;
  const edges = (migrated.edges || []) as Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
  }>;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const starts = nodes.filter((n) => n.type === 'start');
  if (starts.length !== 1) {
    issues.push({
      code: 'start_count',
      message: starts.length === 0 ? 'É obrigatório ter 1 nó Início' : 'Só pode haver 1 nó Início',
      nodeIds: starts.map((s) => s.id),
    });
  }

  const webhookIns = nodes.filter((n) => n.type === 'webhook_in');
  if (webhookIns.length > 1) {
    issues.push({
      code: 'webhook_in_count',
      message: 'Só pode haver 1 nó Webhook in',
      nodeIds: webhookIns.map((n) => n.id),
    });
  }

  for (const n of nodes) {
    const type = n.type || '';
    if (isEditorOnlyNodeType(type)) {
      const schema =
        type === 'annotation_arrow'
          ? annotationArrowDataSchema
          : type === 'annotation_text'
            ? annotationTextDataSchema
            : stickyNoteDataSchema;
      const parsed = schema.safeParse(n.data || {});
      if (!parsed.success) {
        issues.push({
          code: 'node_data',
          message: `${type}: ${parsed.error.issues[0]?.message || 'dados inválidos'}`,
          nodeIds: [n.id],
        });
      }
      continue;
    }
    if (!(FLOW_NODE_TYPES as readonly string[]).includes(type)) {
      issues.push({
        code: 'unknown_type',
        message: `Tipo não suportado: ${type}`,
        nodeIds: [n.id],
      });
      continue;
    }
    const parsed = DATA_SCHEMAS[type as EssentialNodeType].safeParse(n.data || {});
    if (!parsed.success) {
      issues.push({
        code: 'node_data',
        message: `${type}: ${parsed.error.issues[0]?.message || 'dados inválidos'}`,
        nodeIds: [n.id],
      });
    }
  }

  const outgoing = new Map<string, typeof edges>();
  const incoming = new Map<string, typeof edges>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) {
      issues.push({
        code: 'edge_invalid',
        message: 'Conexão inválida',
        edgeIds: [e.id],
      });
      continue;
    }
    const src = byId.get(e.source)!;
    const tgt = byId.get(e.target)!;
    if (isEditorOnlyNodeType(src.type) || isEditorOnlyNodeType(tgt.type)) {
      issues.push({
        code: 'edge_handle',
        message: 'Anotações de canvas não devem ter conexões de fluxo',
        nodeIds: [src.id, tgt.id],
        edgeIds: [e.id],
      });
      continue;
    }
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e);

    if ((FLOW_NODE_TYPES as readonly string[]).includes(src.type || '')) {
      const allowed = allowedOutHandlesForNode(src.type || '', src.data as Record<string, unknown>);
      const handle = e.sourceHandle || 'default';
      if (allowed.length && !allowed.includes(handle)) {
        issues.push({
          code: 'edge_handle',
          message: `Saída "${handle}" inválida neste nó`,
          nodeIds: [src.id],
          edgeIds: [e.id],
          handle,
        });
      }
    }
  }

  for (const n of nodes) {
    if (isEditorOnlyNodeType(n.type)) continue;
    if (!(FLOW_NODE_TYPES as readonly string[]).includes(n.type || '')) continue;
    const type = n.type as EssentialNodeType;
    const outs = outgoing.get(n.id) || [];
    for (const h of outHandlesForNode(type, n.data as Record<string, unknown>)) {
      if (!outs.some((e) => (e.sourceHandle || 'default') === h)) {
        issues.push({
          code: 'missing_out',
          message: `Nó ${NODE_LABELS[type]} precisa de saída "${h}"`,
          nodeIds: [n.id],
          handle: h,
        });
      }
    }
    if (type !== 'start' && type !== 'webhook_in' && (incoming.get(n.id) || []).length === 0) {
      issues.push({
        code: 'orphan',
        message: `Nó órfão (${NODE_LABELS[type]})`,
        nodeIds: [n.id],
      });
    }
  }

  const entryIds = [
    ...starts.map((s) => s.id),
    ...webhookIns.map((w) => w.id),
  ];
  if (entryIds.length) {
    const seen = new Set<string>();
    const stack = [...entryIds];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const e of outgoing.get(cur) || []) stack.push(e.target);
    }
    const unreachable = nodes.filter(
      (n) =>
        !isEditorOnlyNodeType(n.type) &&
        n.type !== 'start' &&
        n.type !== 'webhook_in' &&
        !seen.has(n.id)
    );
    if (unreachable.length) {
      issues.push({
        code: 'unreachable',
        message: 'Há nós inacessíveis a partir do Início / Webhook in',
        nodeIds: unreachable.map((n) => n.id),
      });
    }
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true };
}

/** @deprecated */
export const ESSENTIAL_NODE_TYPES = FLOW_NODE_TYPES;
