import { z } from 'zod';
import {
  isEditorOnlyNodeType,
  validateEditorOnlyNodeData,
} from './canvasAnnotations.js';
import { outHandlesForMenuChoice } from './menuChoiceHelpers.js';
import {
  migrateConditionGraph,
  migrateLegacyConditionData,
  outHandlesForCondition,
} from './conditionHelpers.js';
import { isInputTimeoutEnabled } from './inputTimeout.js';

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

/** @deprecated use FLOW_NODE_TYPES */
export const ESSENTIAL_NODE_TYPES = FLOW_NODE_TYPES;

export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number];
export type EssentialNodeType = FlowNodeType;

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
    /** S24: minutos sem reiniciar após ended/error (0 = off). */
    cooldown_minutes: z.coerce.number().int().min(0).max(10080).optional().default(0),
    /** S24: janela horária (timezone do tenant se não houver override). */
    schedule_enabled: z.boolean().optional().default(false),
    schedule_start: z.string().optional().default('09:00'),
    schedule_end: z.string().optional().default('18:00'),
    /** S24: vazia = todas as instâncias; senão só estes UUIDs. */
    instance_ids: z.array(z.string().uuid()).optional().default([]),
    /** S24: maior vence em overlap de trigger. */
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
    /** S33.2 — asset da Media Library (scopes library / product_image). */
    media_asset_id: z.string().uuid().optional().or(z.literal('')).default(''),
    /** Label só UI (nome do ficheiro escolhido no picker). */
    media_asset_label: z.string().optional().default(''),
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
    } else {
      const hasUrl = Boolean(String(d.media_url || '').trim());
      const hasAsset = Boolean(String(d.media_asset_id || '').trim());
      if (!hasUrl && !hasAsset) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Escolha um asset da biblioteca ou informe a URL da mídia',
          path: ['media_asset_id'],
        });
      }
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
    /** S32: o que o nó aceita do lead. Default text = compat. */
    accept: z.enum(['text', 'media', 'any']).optional().default('text'),
    /** S32: tipos de mídia permitidos quando accept=media|any. Default document+image. */
    media_kinds: z
      .array(z.enum(['document', 'image', 'audio', 'video']))
      .optional()
      .default(['document', 'image']),
    /** S32: re-prompt quando a mensagem não casa com accept. */
    invalid_message: z.string().optional().default(''),
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

/** S29 — telefone → create/reuse conversa → bind sessão órfã. */
export const ensureConversationDataSchema = z.object({
  label: z.string().optional(),
  phone: z.string().min(1, 'Telefone obrigatório (literal ou {{var}})'),
  normalize_br: z.boolean().optional().default(true),
  instance_id: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.string().uuid().nullable().optional().default(null)
  ),
  reuse_policy: z.enum(['open', 'any', 'always_create']).optional().default('open'),
  /** S29.1 — chave opcional (literal ou {{var}}, ex. {{order.id}}). Vazio = off. */
  idempotency_key: z.string().max(256).optional().nullable().default(''),
  /** Preview só editor — strip no publish. */
  last_normalized_preview: z.string().optional().nullable(),
});

export const setVariableDataSchema = z.preprocess(
  normalizeSetVariableData,
  z.object({
    label: z.string().optional(),
    assignments: z
      .array(
        z.object({
          name: sessionVarName,
          value: z.string(),
        })
      )
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
    message: 'Informe tag_label ou tag_id',
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

/** Alias legado S16 — mesmo create-or-move por conversation_id. */
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
  mode: z.enum(['last_open', 'open_menu']).default('last_open'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
});

export const selectInvoiceDataSchema = z.object({
  label: z.string().optional(),
  variable: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Variável inválida')
    .default('answer'),
});

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

const DATA_BY_TYPE: Record<FlowNodeType, z.ZodTypeAny> = {
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

export type ChatbotFlowGraph = {
  nodes: unknown[];
  edges: unknown[];
};

export type GraphValidationIssue = {
  code: string;
  message: string;
  nodeIds?: string[];
  edgeIds?: string[];
  handle?: string;
};

export type GraphValidationResult =
  | { ok: true }
  | { ok: false; issues: GraphValidationIssue[] };

type ParsedNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

type ParsedEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
};

function parseNodes(raw: unknown[]): ParsedNode[] {
  return raw.map((n, i) => {
    const item = (n && typeof n === 'object' ? n : {}) as Record<string, unknown>;
    return {
      id: typeof item.id === 'string' && item.id ? item.id : `n-${i}`,
      type: typeof item.type === 'string' ? item.type : '',
      data:
        item.data && typeof item.data === 'object'
          ? (item.data as Record<string, unknown>)
          : {},
    };
  });
}

function parseEdges(raw: unknown[]): ParsedEdge[] {
  return raw.map((e, i) => {
    const item = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    return {
      id: typeof item.id === 'string' && item.id ? item.id : `e-${i}`,
      source: typeof item.source === 'string' ? item.source : '',
      target: typeof item.target === 'string' ? item.target : '',
      sourceHandle: typeof item.sourceHandle === 'string' ? item.sourceHandle : null,
    };
  });
}

const OUT_HANDLES: Record<FlowNodeType, string[]> = {
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
  /** Legado: drafts S16; runtime = mesmo create-or-move do move_kanban */
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

function outHandlesForNode(type: string, data: Record<string, unknown>): string[] {
  if (type === 'menu_choice') {
    const base = outHandlesForMenuChoice(data);
    return isInputTimeoutEnabled(data) ? [...base, 'timeout'] : base;
  }
  if (type === 'condition') return outHandlesForCondition(data);
  if (type === 'wait_input') {
    return isInputTimeoutEnabled(data) ? ['default', 'timeout'] : ['default'];
  }
  if (type === 'crm_convert') {
    return String(data.mode || 'to_lead') === 'to_client'
      ? ['default', 'error']
      : ['default', 'already_client', 'error'];
  }
  return OUT_HANDLES[type as FlowNodeType] || [];
}

function allowedOutHandlesForNode(type: string, data: Record<string, unknown>): string[] {
  const required = outHandlesForNode(type, data);
  if (type === 'move_kanban') {
    return Array.from(new Set([...required, 'error']));
  }
  return required;
}

const NEEDS_IN: Set<FlowNodeType> = new Set([
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
]);

export function validateGraphForPublish(graph: ChatbotFlowGraph): GraphValidationResult {
  const issues: GraphValidationIssue[] = [];
  const migrated = migrateConditionGraph({
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
  });
  const nodes = parseNodes(migrated.nodes);
  const edges = parseEdges(migrated.edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  if (nodes.length === 0) {
    issues.push({ code: 'empty', message: 'Grafo vazio' });
    return { ok: false, issues };
  }

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
    if (isEditorOnlyNodeType(n.type)) {
      const ann = validateEditorOnlyNodeData(n.type, n.data);
      if (!ann.ok) {
        issues.push({
          code: 'node_data',
          message: ann.message,
          nodeIds: [n.id],
        });
      }
      continue;
    }
    if (!(FLOW_NODE_TYPES as readonly string[]).includes(n.type)) {
      issues.push({
        code: 'unknown_type',
        message: `Tipo de nó não suportado: ${n.type || '(vazio)'}`,
        nodeIds: [n.id],
      });
      continue;
    }
      const schema = DATA_BY_TYPE[n.type as FlowNodeType];
    const parsed = schema.safeParse(n.data);
    if (!parsed.success) {
      issues.push({
        code: 'node_data',
        message: `${n.type}: ${parsed.error.issues[0]?.message || 'dados inválidos'}`,
        nodeIds: [n.id],
      });
    }
  }

  for (const e of edges) {
    if (!e.source || !e.target || !byId.has(e.source) || !byId.has(e.target)) {
      issues.push({
        code: 'edge_invalid',
        message: 'Conexão aponta para nó inexistente',
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
    if ((FLOW_NODE_TYPES as readonly string[]).includes(src.type)) {
      const allowed = allowedOutHandlesForNode(src.type, src.data);
      const handle = e.sourceHandle || 'default';
      if (allowed.length === 0) {
        issues.push({
          code: 'edge_handle',
          message: `Nó ${src.type} não deve ter saídas`,
          nodeIds: [src.id],
          edgeIds: [e.id],
        });
      } else if (!allowed.includes(handle)) {
        issues.push({
          code: 'edge_handle',
          message: `Handle de saída inválido "${handle}" em ${src.type}`,
          nodeIds: [src.id],
          edgeIds: [e.id],
          handle,
        });
      }
    }
  }

  const outgoing = new Map<string, ParsedEdge[]>();
  const incoming = new Map<string, ParsedEdge[]>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const src = byId.get(e.source)!;
    const tgt = byId.get(e.target)!;
    if (isEditorOnlyNodeType(src.type) || isEditorOnlyNodeType(tgt.type)) continue;
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e);
  }

  for (const n of nodes) {
    if (isEditorOnlyNodeType(n.type)) continue;
    if (!(FLOW_NODE_TYPES as readonly string[]).includes(n.type)) continue;
    const type = n.type as FlowNodeType;
    const outs = outgoing.get(n.id) || [];
    const required = outHandlesForNode(type, n.data);
    for (const h of required) {
      if (!outs.some((e) => (e.sourceHandle || 'default') === h)) {
        issues.push({
          code: 'missing_out',
          message: `Nó ${type} precisa de saída "${h}"`,
          nodeIds: [n.id],
          handle: h,
        });
      }
    }
    if (NEEDS_IN.has(type) && (incoming.get(n.id) || []).length === 0) {
      issues.push({
        code: 'orphan',
        message: `Nó órfão (${type}) sem entrada`,
        nodeIds: [n.id],
      });
    }
  }

  // Reachability from start + webhook_in
  const entryIds = [...starts.map((s) => s.id), ...webhookIns.map((w) => w.id)];
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

/** Nó S29 que amarra conversa à sessão órfã (reconhecido na reachability antes do catálogo completo). */
export const CONVERSATION_BINDING_NODE_TYPE = 'ensure_conversation';

/** Nós que exigem conversation_id na sessão (WhatsApp / CRM / ticket). */
export const NODES_REQUIRING_CONVERSATION: ReadonlySet<string> = new Set([
  'send_message',
  'wait_input',
  'menu_choice',
  'transfer_human',
  'add_tag',
  'assign_agent',
  'move_kanban',
  'kanban_add_card',
  'conversation_note',
  'resolve_conversation',
  'lookup_invoice',
  'select_invoice',
  'invoice_assist',
  'ticket_assist',
  'lookup_ticket',
  'select_ticket',
  'ticket_lookup_assist',
  'crm_link_check',
  'crm_convert',
  'webhook_out',
]);

/**
 * S28.1 — a partir de webhook_in, encontra nós que exigem conversa sem passar por ensure_conversation.
 * Aviso de publish (não bloqueia); runtime falha em send com conversation_required até o bind (S29).
 */
export function findWebhookConversationPathGaps(graph: ChatbotFlowGraph): {
  gapNodeIds: string[];
  hasWebhookIn: boolean;
  hasEnsureOnAllPaths: boolean;
} {
  const migrated = migrateConditionGraph({
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
  });
  const nodes = parseNodes(migrated.nodes);
  const edges = parseEdges(migrated.edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const webhookIns = nodes.filter((n) => n.type === 'webhook_in');
  if (webhookIns.length === 0) {
    return { gapNodeIds: [], hasWebhookIn: false, hasEnsureOnAllPaths: true };
  }

  const outgoing = new Map<string, ParsedEdge[]>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
  }

  const gapIds = new Set<string>();
  const visited = new Set<string>();
  const stack: Array<{ id: string; hasEnsure: boolean }> = webhookIns.map((w) => ({
    id: w.id,
    hasEnsure: false,
  }));

  while (stack.length) {
    const cur = stack.pop()!;
    const key = `${cur.id}|${cur.hasEnsure ? 1 : 0}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const node = byId.get(cur.id);
    if (!node) continue;

    const hasEnsure =
      cur.hasEnsure || node.type === CONVERSATION_BINDING_NODE_TYPE;

    if (!hasEnsure && NODES_REQUIRING_CONVERSATION.has(node.type)) {
      gapIds.add(node.id);
    }

    for (const e of outgoing.get(cur.id) || []) {
      stack.push({ id: e.target, hasEnsure });
    }
  }

  return {
    gapNodeIds: [...gapIds],
    hasWebhookIn: true,
    hasEnsureOnAllPaths: gapIds.size === 0,
  };
}

/** Avisos de publish (não bloqueiam) — webhook sem ensure_conversation antes de nós que exigem conversa. */
export function collectWebhookOrphanConversationWarnings(graph: ChatbotFlowGraph): string[] {
  const { gapNodeIds, hasWebhookIn, hasEnsureOnAllPaths } =
    findWebhookConversationPathGaps(graph);
  if (!hasWebhookIn || hasEnsureOnAllPaths) return [];
  return [
    `Webhook in: caminho até nó(s) que exigem conversa sem ensure_conversation (${gapNodeIds.join(', ')}). ` +
      'POST sem conversation_id cria sessão órfã; send_message/wait_input falham até amarrar conversa (ensure_conversation).',
  ];
}
