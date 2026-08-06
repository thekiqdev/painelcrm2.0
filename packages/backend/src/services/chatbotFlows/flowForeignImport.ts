/**
 * S21 — Adaptador de import `chatbot.flow_data` (builder externo / “Safe”) → painelcrm.chatbot_flow.
 * Preferência: omitir nós sem paridade + relatório (D21.1).
 *
 * Não importa flowPortability (evita ciclo); o caller aplica sanitizeGraph.
 */
import type { ChatbotFlowGraph } from './graphValidation.js';
import { generateInboundWebhookToken } from './flowWebhookIn.js';

export type FlowImportFormat = 'painelcrm.chatbot_flow' | 'chatbot.flow_data' | 'unknown';

export type ForeignImportReportItem = {
  id: string;
  fromType: string;
  toType?: string;
  reason?: string;
  fields?: string[];
};

export type ForeignImportReport = {
  format: FlowImportFormat;
  name: string;
  mapped: ForeignImportReportItem[];
  omitted: ForeignImportReportItem[];
  needsRelink: ForeignImportReportItem[];
  brokenEdges: Array<{ id: string; reason: string }>;
  secretsStripped: number;
  nodeCount: number;
  edgeCount: number;
};

export type AdaptedForeignDocument = {
  format: 'painelcrm.chatbot_flow';
  format_version: 1;
  exported_at: string;
  flow: { name: string };
  graph: ChatbotFlowGraph;
};

export type AdaptForeignResult =
  | {
      ok: true;
      doc: AdaptedForeignDocument;
      report: ForeignImportReport;
    }
  | { ok: false; error: string };

/** Aliases §4 do plano S15. */
export const FOREIGN_TYPE_ALIAS: Record<string, string> = {
  message: 'send_message',
  open_question: 'wait_input',
  options: 'menu_choice',
  transfer_to_human: 'transfer_human',
  wait: 'delay',
  pipeline_add_card: 'move_kanban',
  pipeline_move_card: 'move_kanban',
  contact_label_add: 'add_tag',
  start: 'start',
  send_message: 'send_message',
  wait_input: 'wait_input',
  menu_choice: 'menu_choice',
  condition: 'condition',
  transfer_human: 'transfer_human',
  end: 'end',
  delay: 'delay',
  http_request: 'http_request',
  webhook_out: 'webhook_out',
  webhook_in: 'webhook_in',
  conversation_note: 'conversation_note',
  resolve_conversation: 'resolve_conversation',
  add_tag: 'add_tag',
  assign_agent: 'assign_agent',
  move_kanban: 'move_kanban',
  kanban_add_card: 'move_kanban',
  set_variable: 'set_variable',
  lookup_invoice: 'lookup_invoice',
  invoice_assist: 'invoice_assist',
  ticket_assist: 'ticket_assist',
  lookup_ticket: 'lookup_ticket',
  select_ticket: 'select_ticket',
  ticket_lookup_assist: 'ticket_lookup_assist',
  crm_link_check: 'crm_link_check',
  crm_convert: 'crm_convert',
};

const SUPPORTED_TYPES = new Set(Object.values(FOREIGN_TYPE_ALIAS));

const SENSITIVE_KEY_RE =
  /^(authorization|cookie|set-cookie|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|secret|password|passwd|token|bearer|x-api-key)$/i;

type RawNode = {
  id: string;
  type: string;
  position?: { x?: number; y?: number };
  data?: Record<string, unknown>;
};

type RawEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  kind?: string | null;
};

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown, fallback = ''): string {
  if (v == null) return fallback;
  return String(v);
}

/** Extrai nodes/edges/nome de variantes comuns do export estrangeiro. */
export function extractForeignFlowPayload(
  raw: Record<string, unknown>
): { name: string; nodes: unknown[]; edges: unknown[] } | null {
  const chatbot = asObj(raw.chatbot);
  if (chatbot) {
    const fd = asObj(chatbot.flow_data);
    if (fd && Array.isArray(fd.nodes) && Array.isArray(fd.edges)) {
      return {
        name: str(chatbot.name || raw.name || 'Flow importado').trim().slice(0, 200) || 'Flow importado',
        nodes: fd.nodes,
        edges: fd.edges,
      };
    }
  }

  const fd2 = asObj(raw.flow_data);
  if (fd2 && Array.isArray(fd2.nodes) && Array.isArray(fd2.edges)) {
    return {
      name: str(raw.name || 'Flow importado').trim().slice(0, 200) || 'Flow importado',
      nodes: fd2.nodes,
      edges: fd2.edges,
    };
  }

  if (
    Array.isArray(raw.nodes) &&
    Array.isArray(raw.edges) &&
    (raw.export_version != null || raw.format === 'chatbot.flow_data')
  ) {
    return {
      name: str(raw.name || 'Flow importado').trim().slice(0, 200) || 'Flow importado',
      nodes: raw.nodes,
      edges: raw.edges,
    };
  }

  return null;
}

export function detectFlowImportFormat(raw: unknown): FlowImportFormat {
  if (!raw || typeof raw !== 'object') return 'unknown';
  const o = raw as Record<string, unknown>;
  if (o.format === 'painelcrm.chatbot_flow') return 'painelcrm.chatbot_flow';
  if (extractForeignFlowPayload(o)) return 'chatbot.flow_data';
  return 'unknown';
}

function normalizeRawNode(n: unknown): RawNode | null {
  const o = asObj(n);
  if (!o) return null;
  const id = str(o.id).trim();
  if (!id) return null;
  const type = str(o.type || o.node_type || 'unknown').trim() || 'unknown';
  const data = asObj(o.data) || {};
  const pos = asObj(o.position);
  return {
    id,
    type,
    position: pos
      ? { x: Number(pos.x) || 0, y: Number(pos.y) || 0 }
      : { x: Number(o.x) || 0, y: Number(o.y) || 0 },
    data,
  };
}

function normalizeRawEdge(e: unknown, idx: number): RawEdge | null {
  const o = asObj(e);
  if (!o) return null;
  const source = str(o.source || o.source_id).trim();
  const target = str(o.target || o.target_id).trim();
  if (!source || !target) return null;
  const sourceHandle = str(o.sourceHandle ?? o.source_handle ?? '', '') || null;
  const targetHandle = str(o.targetHandle ?? o.target_handle ?? '', '') || null;
  const kind = str(o.kind ?? o.handle_kind ?? '', '') || null;
  return {
    id: str(o.id).trim() || `e_${idx + 1}`,
    source,
    target,
    sourceHandle,
    targetHandle,
    kind,
  };
}

function stripSecretsDeep(value: unknown, counter: { n: number }): unknown {
  if (Array.isArray(value)) return value.map((v) => stripSecretsDeep(v, counter));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      counter.n += 1;
      out[k] = '';
      continue;
    }
    if (k === 'headers' && v && typeof v === 'object' && !Array.isArray(v)) {
      const headers: Record<string, unknown> = {};
      for (const [hk, hv] of Object.entries(v as Record<string, unknown>)) {
        if (SENSITIVE_KEY_RE.test(hk)) {
          counter.n += 1;
          headers[hk] = '';
        } else {
          headers[hk] = stripSecretsDeep(hv, counter);
        }
      }
      out[k] = headers;
      continue;
    }
    if (k === 'headers' && Array.isArray(v)) {
      out[k] = v.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const item = row as Record<string, unknown>;
        const hk = str(item.key);
        if (SENSITIVE_KEY_RE.test(hk)) {
          counter.n += 1;
          return { key: hk, value: '' };
        }
        return {
          key: hk,
          value: typeof item.value === 'string' ? item.value : str(item.value),
        };
      });
      continue;
    }
    out[k] = stripSecretsDeep(v, counter);
  }
  return out;
}

function mapContactField(raw: string): 'name' | 'email' | 'phone' | 'company' | 'cpf_cnpj' | null {
  const s = raw.toLowerCase().trim();
  if (['name', 'nome', 'full_name', 'contact_name'].includes(s)) return 'name';
  if (['email', 'e-mail', 'mail'].includes(s)) return 'email';
  if (['phone', 'telefone', 'whatsapp', 'mobile'].includes(s)) return 'phone';
  if (['company', 'empresa', 'organization'].includes(s)) return 'company';
  if (['cpf', 'cnpj', 'cpf_cnpj', 'document'].includes(s)) return 'cpf_cnpj';
  return null;
}

type MapNodeCtx = {
  needsRelink: ForeignImportReportItem[];
  /** nodeId → option ids in order (for opt:N) */
  menuOptionIds: Map<string, string[]>;
  /** nodeId → case ids in order (for case:N) */
  conditionCaseIds: Map<string, string[]>;
  secretsStripped: number;
};

function mapNodeData(
  fromType: string,
  toType: string,
  data: Record<string, unknown>,
  nodeId: string,
  ctx: MapNodeCtx
): Record<string, unknown> {
  const cleaned = stripSecretsDeep(data, { n: 0 }) as Record<string, unknown>;
  // recount via ctx
  const secretProbe = { n: 0 };
  stripSecretsDeep(data, secretProbe);
  ctx.secretsStripped += secretProbe.n;
  const out: Record<string, unknown> = { ...cleaned };
  const relinkFields: string[] = [];

  if (toType === 'send_message') {
    const text = str(cleaned.text || cleaned.content || cleaned.message || cleaned.body);
    const sendMode = str(cleaned.send_mode || 'text') === 'media' ? 'media' : 'text';
    out.label = str(cleaned.label || 'Mensagem') || 'Mensagem';
    out.send_mode = sendMode;
    out.text = text;
    out.media_url = str(cleaned.media_url || cleaned.file_url || cleaned.url);
    out.media_type = ['image', 'document', 'audio'].includes(str(cleaned.media_type))
      ? str(cleaned.media_type)
      : 'image';
    out.caption = str(cleaned.caption);
    out.filename = str(cleaned.filename || cleaned.file_name);
  }

  if (toType === 'wait_input') {
    out.label = str(cleaned.label || 'Pergunta') || 'Pergunta';
    out.prompt = str(cleaned.prompt || cleaned.question || cleaned.text || cleaned.message);
    out.variable =
      str(cleaned.variable || cleaned.variable_name || cleaned.response_variable || 'answer') ||
      'answer';
    const timeoutOn =
      cleaned.timeout_enabled === true ||
      cleaned.inactivity_enabled === true ||
      (cleaned.inactivity_enabled !== false && Number(cleaned.timeout || cleaned.timeout_seconds) > 0);
    // Safe: inactivity_enabled false + timeout present → não força timeout
    const forceOff = cleaned.inactivity_enabled === false && cleaned.timeout_enabled !== true;
    out.timeout_enabled = forceOff ? false : timeoutOn;
    if (out.timeout_enabled) {
      const secs = Number(cleaned.timeout_seconds || cleaned.timeout || cleaned.timeout_amount) || 5;
      if (secs >= 3600 && secs % 3600 === 0) {
        out.timeout_amount = secs / 3600;
        out.timeout_unit = 'hours';
      } else if (secs >= 60 && secs % 60 === 0) {
        out.timeout_amount = secs / 60;
        out.timeout_unit = 'minutes';
      } else {
        out.timeout_amount = Math.max(1, secs);
        out.timeout_unit = 'seconds';
      }
    }
    const fieldRaw = str(
      cleaned.contact_field || cleaned.save_field || cleaned.field || cleaned.custom_field_key
    );
    const customName = str(cleaned.custom_field_name);
    let mappedField = mapContactField(fieldRaw);
    if (!mappedField && fieldRaw === 'custom') {
      mappedField = mapContactField(customName);
    }
    const save =
      cleaned.save_to_contact === true ||
      cleaned.save_to_contact_field === true ||
      Boolean(cleaned.custom_field_id) ||
      Boolean(mappedField);
    out.save_to_contact = save;
    if (mappedField) out.contact_field = mappedField;
    else if (save) out.contact_field = 'name';
    if (cleaned.custom_field_id && !mappedField) {
      relinkFields.push('custom_field');
      out.custom_field_id = '';
      out.needs_relink = true;
    }
  }

  if (toType === 'menu_choice') {
    out.label = str(cleaned.label || 'Menu') || 'Menu';
    out.text = str(cleaned.text || cleaned.prompt || cleaned.question || cleaned.message || 'Escolha uma opção');
    out.variable =
      str(cleaned.variable || cleaned.variable_name || cleaned.response_variable || 'answer') ||
      'answer';
    out.mode =
      str(cleaned.mode || cleaned.presentation) === 'list' || str(cleaned.presentation) === 'list'
        ? 'list'
        : 'button';
    out.footer_text = str(cleaned.footer_text || cleaned.footer);
    out.list_button = str(cleaned.list_button || 'Ver opções') || 'Ver opções';
    out.max_invalid = Number(cleaned.max_invalid || cleaned.invalid_fallback_max_attempts) || 3;
    out.invalid_message = str(
      cleaned.invalid_message ||
        cleaned.invalid_fallback_message ||
        'Opção inválida. Escolha uma das alternativas.'
    );
    const rawOpts = Array.isArray(cleaned.options) ? cleaned.options : [];
    const options: Array<Record<string, unknown>> = [];
    const ids: string[] = [];
    rawOpts.forEach((row, i) => {
      const o = asObj(row) || {};
      const valueIdx = o.value != null && Number.isFinite(Number(o.value)) ? Number(o.value) : i;
      const id = str(o.id).trim() || `opt_${valueIdx}`;
      ids.push(id);
      options.push({
        id,
        label: str(o.label || o.title || o.text || `Opção ${i + 1}`).slice(0, 24),
        description: str(o.description).slice(0, 72),
        section: str(o.section).slice(0, 24),
        set_variables: Array.isArray(o.set_variables) ? o.set_variables : [],
      });
    });
    if (options.length === 0) {
      options.push(
        { id: 'opt_0', label: 'Opção A', description: '', section: '', set_variables: [] },
        { id: 'opt_1', label: 'Opção B', description: '', section: '', set_variables: [] }
      );
      ids.push('opt_0', 'opt_1');
    }
    out.options = options;
    ctx.menuOptionIds.set(nodeId, ids);

    const forceOff = cleaned.inactivity_enabled === false && cleaned.timeout_enabled !== true;
    const timeoutOn =
      !forceOff &&
      (cleaned.timeout_enabled === true ||
        cleaned.inactivity_enabled === true ||
        Number(cleaned.timeout || cleaned.timeout_seconds) > 0);
    out.timeout_enabled = timeoutOn;
    if (timeoutOn) {
      const secs = Number(cleaned.timeout_seconds || cleaned.timeout || 300) || 300;
      out.timeout_amount = Math.max(1, Math.round(secs / 60));
      out.timeout_unit = 'minutes';
    }
  }

  if (toType === 'condition') {
    out.label = str(cleaned.label || 'Condição') || 'Condição';
    const rawCases = Array.isArray(cleaned.cases) ? cleaned.cases : [];
    const cases: Array<Record<string, unknown>> = [];
    const caseIds: string[] = [];
    const mapOp = (op: string): string => {
      const o = op.toLowerCase();
      if (o === 'equals' || o === 'eq' || o === '==') return 'eq';
      if (o === 'not_equals' || o === 'neq' || o === '!=') return 'neq';
      if (o === 'contains' || o === 'includes') return 'contains';
      if (o === 'exists' || o === 'is_set') return 'exists';
      if (o === 'empty' || o === 'is_empty') return 'empty';
      return ['eq', 'neq', 'contains', 'exists', 'empty'].includes(o) ? o : 'eq';
    };
    if (rawCases.length > 0) {
      rawCases.forEach((row, i) => {
        const c = asObj(row) || {};
        const id = str(c.id).trim() || `c${i + 1}`;
        caseIds.push(id);
        const conditions = Array.isArray(c.conditions)
          ? (c.conditions as unknown[]).map((cond) => {
              const x = asObj(cond) || {};
              return {
                variable: str(x.variable || x.field || cleaned.variable || 'answer'),
                operator: mapOp(str(x.operator || 'eq')),
                value: str(x.value ?? ''),
              };
            })
          : [
              {
                variable: str(c.variable || c.field || cleaned.variable || 'answer'),
                operator: mapOp(str(c.operator || 'eq')),
                value: str(c.value ?? cleaned.value ?? ''),
              },
            ];
        cases.push({
          id,
          name: str(c.name || `Caso ${i + 1}`),
          join: str(c.join || c.conditionsJoin) === 'or' ? 'or' : 'and',
          conditions: conditions.length
            ? conditions
            : [{ variable: 'answer', operator: 'eq', value: '' }],
        });
      });
    } else if (cleaned.variable || cleaned.field) {
      const id = 'c1';
      caseIds.push(id);
      cases.push({
        id,
        name: 'Caso 1',
        join: 'and',
        conditions: [
          {
            variable: str(cleaned.variable || cleaned.field),
            operator: mapOp(str(cleaned.operator || 'eq')),
            value: str(cleaned.value),
          },
        ],
      });
    } else {
      const id = 'c1';
      caseIds.push(id);
      cases.push({
        id,
        name: 'Caso 1',
        join: 'and',
        conditions: [{ variable: 'answer', operator: 'eq', value: '' }],
      });
    }
    out.cases = cases;
    ctx.conditionCaseIds.set(nodeId, caseIds);
  }

  if (toType === 'delay') {
    out.label = str(cleaned.label || 'Espera') || 'Espera';
    if (cleaned.seconds != null || cleaned.amount_seconds != null) {
      const secs = Number(cleaned.seconds ?? cleaned.amount_seconds) || 5;
      out.amount = Math.max(1, secs);
      out.unit = 'seconds';
    } else {
      out.amount = Number(cleaned.amount) || 5;
      out.unit = ['seconds', 'minutes', 'hours', 'days'].includes(str(cleaned.unit))
        ? str(cleaned.unit)
        : 'minutes';
    }
  }

  if (toType === 'http_request') {
    out.label = str(cleaned.label || 'HTTP') || 'HTTP';
    out.method = str(cleaned.method || 'GET').toUpperCase() || 'GET';
    out.url = str(cleaned.url);
    out.timeout_ms = Number(cleaned.timeout_ms || cleaned.timeout) || 10000;
    out.response_variable = str(cleaned.response_variable || 'http_body') || 'http_body';
    out.status_variable = str(cleaned.status_variable || 'http_status') || 'http_status';
    out.body = str(cleaned.body || cleaned.body_template);
    // headers: array or object → array {key,value} without secrets
    if (Array.isArray(cleaned.headers)) {
      out.headers = (cleaned.headers as unknown[])
        .map((row) => {
          const o = asObj(row);
          if (!o) return null;
          const key = str(o.key || o.name);
          if (!key) return null;
          if (SENSITIVE_KEY_RE.test(key)) {
            ctx.secretsStripped += 1;
            return null;
          }
          return { key, value: str(o.value) };
        })
        .filter(Boolean);
    } else if (asObj(cleaned.headers)) {
      out.headers = Object.entries(asObj(cleaned.headers) || {})
        .filter(([k]) => {
          if (SENSITIVE_KEY_RE.test(k)) {
            ctx.secretsStripped += 1;
            return false;
          }
          return true;
        })
        .map(([key, value]) => ({ key, value: str(value) }));
    } else {
      out.headers = [];
    }
    const mappings = Array.isArray(cleaned.save_mappings)
      ? cleaned.save_mappings
      : Array.isArray(cleaned.response_map)
        ? cleaned.response_map
        : [];
    out.response_map = mappings
      .map((row) => {
        const o = asObj(row);
        if (!o) return null;
        const path = str(o.path || o.data_path || o.json_path || o.from);
        const variable = str(o.variable || o.to || o.name);
        if (!path || !variable) return null;
        return { path, variable };
      })
      .filter(Boolean);
  }

  if (toType === 'transfer_human') {
    out.label = str(cleaned.label || 'Humano') || 'Humano';
    out.message = str(cleaned.message || cleaned.text);
    out.mode = 'none';
  }

  if (toType === 'conversation_note') {
    out.label = str(cleaned.label || 'Nota interna') || 'Nota interna';
    out.text = str(cleaned.text || cleaned.note || cleaned.message);
    out.visibility = 'internal';
  }

  if (toType === 'resolve_conversation') {
    out.label = str(cleaned.label || 'Resolver') || 'Resolver';
    out.message = str(cleaned.message || cleaned.text);
    out.close_attendance = cleaned.close_attendance !== false;
  }

  if (toType === 'add_tag') {
    out.label = str(cleaned.label || 'Tag') || 'Tag';
    out.tag_label = str(cleaned.tag_label || cleaned.label || cleaned.tag || cleaned.name);
    if (cleaned.tag_id || cleaned.label_id || cleaned.contact_label_id) {
      out.tag_id = '';
      relinkFields.push('tag_id');
      out.needs_relink = true;
    }
  }

  if (toType === 'move_kanban') {
    out.label = str(cleaned.label || 'Kanban') || 'Kanban';
    out.title = str(cleaned.title || cleaned.card_title || cleaned.name);
    out.description = str(cleaned.description || cleaned.card_description);
    out.tag_label = str(cleaned.tag_label || cleaned.tag);
    // IDs externos → vazios + needs_relink
    const hadBoard = Boolean(
      cleaned.board_id || cleaned.pipeline_id || cleaned.boardId || cleaned.pipelineId
    );
    const hadCol = Boolean(
      cleaned.column_id || cleaned.stage_id || cleaned.columnId || cleaned.stageId
    );
    out.board_id = '';
    out.column_id = '';
    if (hadBoard || hadCol || fromType.startsWith('pipeline_')) {
      relinkFields.push('board_id', 'column_id');
      out.needs_relink = true;
      out.foreign_pipeline_id = cleaned.pipeline_id ?? cleaned.board_id ?? null;
      out.foreign_stage_id = cleaned.stage_id ?? cleaned.column_id ?? null;
    }
  }

  if (toType === 'start') {
    out.label = str(cleaned.label || 'Início') || 'Início';
    const trigger = asObj(cleaned.trigger);
    if (trigger) out.trigger = trigger;
    else if (cleaned.keyword || cleaned.trigger_keyword) {
      out.trigger = { type: 'keyword', value: str(cleaned.keyword || cleaned.trigger_keyword) };
    } else {
      out.trigger = { type: 'first_message' };
    }
  }

  if (toType === 'webhook_in') {
    out.label = str(cleaned.label || 'Webhook in') || 'Webhook in';
    // token/secret são sensíveis — regenera token local; secret fica vazio
    out.token = generateInboundWebhookToken();
    out.secret = '';
    const mappings = Array.isArray(cleaned.payload_map)
      ? cleaned.payload_map
      : Array.isArray(cleaned.save_mappings)
        ? cleaned.save_mappings
        : Array.isArray(cleaned.response_map)
          ? cleaned.response_map
          : [];
    out.payload_map = mappings
      .map((row) => {
        const o = asObj(row);
        if (!o) return null;
        const path = str(o.path || o.data_path || o.json_path || o.from);
        const variable = str(o.variable || o.to || o.name);
        if (!path || !variable) return null;
        return { path, variable };
      })
      .filter(Boolean);
    delete out.last_payload_json;
    delete out.last_payload_at;
  }

  if (toType === 'end') {
    out.label = str(cleaned.label || 'Fim') || 'Fim';
  }

  if (toType === 'set_variable') {
    out.label = str(cleaned.label || 'Variável') || 'Variável';
    const name = str(cleaned.name || cleaned.variable || cleaned.key);
    const value = str(cleaned.value);
    if (Array.isArray(cleaned.assignments) && cleaned.assignments.length) {
      out.assignments = cleaned.assignments;
    } else if (name) {
      out.assignments = [{ name, value }];
    } else {
      out.assignments = [{ name: 'var1', value: '' }];
    }
  }

  if (relinkFields.length) {
    ctx.needsRelink.push({
      id: nodeId,
      fromType,
      toType,
      fields: relinkFields,
      reason: 'IDs externos removidos — religue no editor',
    });
  }

  return out;
}

function remapSourceHandle(
  handle: string | null | undefined,
  kind: string | null | undefined,
  sourceId: string,
  ctx: MapNodeCtx
): string | null {
  let h = (handle || '').trim();
  const k = (kind || '').trim().toLowerCase();

  if (!h && k) {
    if (k === 'http_failure' || k === 'error' || k === 'failure') return 'error';
    if (k === 'fallback') return 'fallback';
    if (k === 'condition_else' || k === 'else') return 'else';
    if (k === 'timeout' || k === 'inactivity') return 'timeout';
    if (k === 'default' || k === 'success' || k === 'ok') return 'default';
  }

  if (!h) return 'default';

  if (h === 'http_failure' || h === 'failure') return 'error';
  if (h === 'condition_else') return 'else';
  if (h === 'true') {
    const cases = ctx.conditionCaseIds.get(sourceId);
    return cases?.[0] ? `case:${cases[0]}` : 'else';
  }
  if (h === 'false') return 'else';

  const optMatch = /^opt:(\d+)$/i.exec(h);
  if (optMatch) {
    const idx = Number(optMatch[1]);
    const ids = ctx.menuOptionIds.get(sourceId);
    if (ids && ids[idx]) return ids[idx];
    return `opt_${idx}`;
  }

  const caseMatch = /^case:(\d+)$/i.exec(h);
  if (caseMatch) {
    const idx = Number(caseMatch[1]);
    const ids = ctx.conditionCaseIds.get(sourceId);
    if (ids && ids[idx]) return `case:${ids[idx]}`;
    return h;
  }

  return h;
}

export function adaptChatbotFlowData(raw: unknown): AdaptForeignResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'JSON inválido' };
  }
  const payload = extractForeignFlowPayload(raw as Record<string, unknown>);
  if (!payload) {
    return { ok: false, error: 'Formato chatbot.flow_data não reconhecido' };
  }

  const ctx: MapNodeCtx = {
    needsRelink: [],
    menuOptionIds: new Map(),
    conditionCaseIds: new Map(),
    secretsStripped: 0,
  };

  const mapped: ForeignImportReportItem[] = [];
  const omitted: ForeignImportReportItem[] = [];
  const keptIds = new Set<string>();
  const nodesOut: unknown[] = [];

  // First pass: map nodes (so option/case ids exist for edge remap)
  const normalizedNodes: RawNode[] = [];
  for (const n of payload.nodes) {
    const rn = normalizeRawNode(n);
    if (rn) normalizedNodes.push(rn);
  }

  for (const rn of normalizedNodes) {
    const toType = FOREIGN_TYPE_ALIAS[rn.type];
    if (!toType || !SUPPORTED_TYPES.has(toType)) {
      omitted.push({
        id: rn.id,
        fromType: rn.type,
        reason: 'Tipo sem paridade no PainelCRM — omitido',
      });
      continue;
    }
    const data = mapNodeData(rn.type, toType, rn.data || {}, rn.id, ctx);
    nodesOut.push({
      id: rn.id,
      type: toType,
      position: { x: rn.position?.x ?? 0, y: rn.position?.y ?? 0 },
      data,
    });
    keptIds.add(rn.id);
    mapped.push({ id: rn.id, fromType: rn.type, toType });
  }

  const brokenEdges: Array<{ id: string; reason: string }> = [];
  const edgesOut: unknown[] = [];
  payload.edges.forEach((e, idx) => {
    const re = normalizeRawEdge(e, idx);
    if (!re) return;
    if (!keptIds.has(re.source) || !keptIds.has(re.target)) {
      brokenEdges.push({
        id: re.id,
        reason: !keptIds.has(re.source)
          ? `source ${re.source} omitido`
          : `target ${re.target} omitido`,
      });
      return;
    }
    const sourceHandle = remapSourceHandle(re.sourceHandle, re.kind, re.source, ctx);
    edgesOut.push({
      id: re.id,
      source: re.source,
      target: re.target,
      sourceHandle: sourceHandle || 'default',
      ...(re.targetHandle ? { targetHandle: re.targetHandle } : {}),
    });
  });

  const graph: ChatbotFlowGraph = {
    nodes: nodesOut,
    edges: edgesOut,
  };

  const doc: AdaptedForeignDocument = {
    format: 'painelcrm.chatbot_flow',
    format_version: 1,
    exported_at: new Date().toISOString(),
    flow: { name: payload.name },
    graph,
  };

  const report: ForeignImportReport = {
    format: 'chatbot.flow_data',
    name: payload.name,
    mapped,
    omitted,
    needsRelink: ctx.needsRelink,
    brokenEdges,
    secretsStripped: ctx.secretsStripped,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
  };

  return { ok: true, doc, report };
}
