/**
 * Motor puro do runtime Chatbot Flows (S3) — sem I/O.
 * Avança nós essentials até pausa (wait_input), terminal ou erro.
 */
import {
  applySelectedInvoiceVars,
  selectInvoiceFromSessionVars,
} from './flowInvoiceActions.js';
import {
  buildUazMenuChoices,
  matchMenuOption,
  MENU_CHOICE_RETRIES_KEY,
  normalizeMenuOptions,
} from './menuChoiceHelpers.js';
import { pickConditionHandle } from './conditionHelpers.js';
import { computeInputTimeoutResumeAt } from './inputTimeout.js';

const INVOICE_ASSIST_RETRIES_KEY = 'invoice._assist_retries';
const INVOICE_ASSIST_CHOICE_VAR = 'answer';

function invoiceAssistLinkText(
  data: Record<string, unknown>,
  variables: Record<string, unknown>
): string {
  const tpl = String(
    data.link_template ||
      'Segue o link da fatura {{invoice.number}} ({{invoice.total}}):\n{{invoice.public_link}}'
  );
  return interpolateTemplate(tpl, variables).trim();
}

function invoiceAssistPromptText(
  data: Record<string, unknown>,
  variables: Record<string, unknown>
): string {
  const tpl = String(
    data.prompt_template ||
      'Estas são suas faturas em aberto:\n{{invoice.menu}}\n\nResponda com o número da opção desejada.'
  );
  return interpolateTemplate(tpl, variables).trim();
}

export type RuntimeGraphNode = {
  id: string;
  type: string;
  data?: Record<string, unknown>;
};

export type RuntimeGraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
};

export type RuntimeGraph = {
  nodes: RuntimeGraphNode[];
  edges: RuntimeGraphEdge[];
};

export type RuntimeSessionSnapshot = {
  status:
    | 'active'
    | 'waiting_input'
    | 'waiting_delay'
    | 'waiting_http'
    | 'paused'
    | 'ended'
    | 'transferred'
    | 'error';
  currentNodeId: string | null;
  variables: Record<string, unknown>;
  waitingVariable: string | null;
  /** ISO resume time when waiting_delay (informational for runner). */
  resumeAt?: string | null;
};

export type RuntimeOutboundAction =
  | { type: 'send_text'; text: string }
  | {
      type: 'send_media';
      mediaType: 'image' | 'document' | 'audio';
      mediaUrl: string;
      caption?: string;
      filename?: string;
    }
  | { type: 'transfer_human'; message?: string }
  | { type: 'end' }
  | { type: 'conversation_note'; text: string; noteType?: 'internal' | 'general' }
  | {
      type: 'resolve_conversation';
      message?: string;
      closeAttendance?: boolean;
    }
  | { type: 'error'; message: string }
  | { type: 'set_variable'; name: string; value: string }
  | {
      type: 'update_contact';
      field: 'name' | 'email' | 'phone' | 'company' | 'cpf_cnpj';
      value: string;
    }
  | { type: 'add_tag'; tagLabel?: string; tagId?: string }
  | {
      type: 'assign_agent';
      mode: 'user' | 'team' | 'queue';
      userId?: string;
      teamId?: string;
      queueId?: string | null;
    }
  | {
      type: 'move_kanban';
      boardId?: string;
      columnId: string;
      title?: string;
      description?: string;
      tagLabel?: string;
      tagId?: string;
    }
  | {
      type: 'kanban_add_card';
      boardId: string;
      columnId: string;
      title: string;
      description: string;
      tagLabel?: string;
      tagId?: string;
    }
  | {
      type: 'delay';
      amount: number;
      unit: 'seconds' | 'minutes' | 'hours' | 'days';
    }
  | {
      type: 'http_request';
      method: string;
      url: string;
      headers: Array<{ key: string; value: string }>;
      body: string;
      timeoutMs: number;
      responseVariable?: string;
      statusVariable?: string;
      responseMap: Array<{ path: string; variable: string }>;
    }
  | {
      type: 'webhook_out';
      method: string;
      url: string;
      headers: Array<{ key: string; value: string }>;
      secret?: string;
      timeoutMs: number;
      includeSessionVars: boolean;
      payloadMode: 'envelope' | 'envelope_plus' | 'custom';
      bodyTemplate: string;
    }
  | {
      type: 'lookup_invoice';
      mode: 'last_open' | 'open_menu';
      limit: number;
    }
  | {
      type: 'send_menu';
      mode: 'button' | 'list';
      text: string;
      footerText?: string;
      listButton?: string;
      choices: string[];
      options: Array<{
        id: string;
        label: string;
        description?: string;
        section?: string;
        set_variables?: Array<{ name: string; value: string }>;
      }>;
    };

export type RuntimeStepResult = {
  session: RuntimeSessionSnapshot;
  actions: RuntimeOutboundAction[];
  /** true se este inbound foi consumido pelo bot (não deve disparar Phase 8). */
  handled: boolean;
};

const MAX_STEPS = 40;

function nodeById(graph: RuntimeGraph, id: string | null | undefined): RuntimeGraphNode | null {
  if (!id) return null;
  return graph.nodes.find((n) => n.id === id) ?? null;
}

function outEdge(
  graph: RuntimeGraph,
  sourceId: string,
  handle: string
): RuntimeGraphEdge | null {
  const edges = graph.edges.filter((e) => e.source === sourceId);
  const exact = edges.find((e) => (e.sourceHandle || 'default') === handle);
  if (exact) return exact;
  if (handle === 'default' && edges.length === 1) return edges[0]!;
  return null;
}

/** Condition: case:{id}/else, com fallback legado true/false. */
function outEdgeForCondition(
  graph: RuntimeGraph,
  sourceId: string,
  handle: string
): RuntimeGraphEdge | null {
  const exact = outEdge(graph, sourceId, handle);
  if (exact) return exact;
  if (handle.startsWith('case:')) {
    return outEdge(graph, sourceId, 'true');
  }
  if (handle === 'else') {
    return outEdge(graph, sourceId, 'false');
  }
  return null;
}

export function interpolateTemplate(text: string, variables: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = variables[key];
    if (v == null) return '';
    return String(v);
  });
}

const CONTACT_FIELDS = new Set(['name', 'email', 'phone', 'company', 'cpf_cnpj']);

/** S20: se wait_input.save_to_contact, emite update_contact com a resposta capturada. */
function maybePushUpdateContactFromWaitInput(
  actions: RuntimeOutboundAction[],
  waitNodeData: Record<string, unknown>,
  answer: string
): void {
  if (waitNodeData.save_to_contact !== true) return;
  const value = String(answer || '').trim();
  if (!value) return;
  const field = String(waitNodeData.contact_field || 'name');
  if (!CONTACT_FIELDS.has(field)) return;
  actions.push({
    type: 'update_contact',
    field: field as 'name' | 'email' | 'phone' | 'company' | 'cpf_cnpj',
    value,
  });
}

export function findStartNode(graph: RuntimeGraph): RuntimeGraphNode | null {
  const starts = graph.nodes.filter((n) => n.type === 'start');
  return starts.length === 1 ? starts[0]! : starts[0] ?? null;
}

export type FlowTriggerMatch = {
  flowId: string;
  versionId: string;
  graph: RuntimeGraph;
  reason: 'keyword' | 'first_message';
};

export function matchFlowTrigger(opts: {
  graph: RuntimeGraph;
  messageBody: string;
  incomingMessageCount: number;
}): 'keyword' | 'first_message' | null {
  const start = findStartNode(opts.graph);
  if (!start) return null;
  const trigger = (start.data?.trigger && typeof start.data.trigger === 'object'
    ? start.data.trigger
    : { type: 'first_message' }) as { type?: string; value?: string };

  const body = opts.messageBody.trim();
  if (trigger.type === 'keyword') {
    const kw = String(trigger.value || '')
      .trim()
      .toLowerCase();
    if (!kw) return null;
    if (body.toLowerCase() === kw || body.toLowerCase().includes(kw)) return 'keyword';
    return null;
  }
  // first_message (default)
  if (opts.incomingMessageCount <= 1) return 'first_message';
  return null;
}

function evalCondition(
  data: Record<string, unknown>,
  variables: Record<string, unknown>
): string {
  return pickConditionHandle(data, variables);
}

/**
 * Processa um inbound: retoma wait_input ou inicia do start (caller cria sessão).
 * Se session.status === waiting_input, messageBody alimenta waitingVariable.
 */
export function processInboundStep(opts: {
  graph: RuntimeGraph;
  session: RuntimeSessionSnapshot;
  messageBody: string | null;
  /** ID de botão/lista UazAPI (preferir no match do menu_choice). */
  interactiveReplyId?: string | null;
  /** Se true, estamos iniciando (acabou de criar sessão no start). */
  justStarted?: boolean;
  /** Worker retomando após delay: avança a partir do nó delay → saída default. */
  resumeFromDelay?: boolean;
  /**
   * Runner retomando após HTTP/webhook/lookup_invoice: avança via default|failHandle e aplica variáveis.
   */
  resumeFromHttp?: {
    ok: boolean;
    mappedVariables?: Record<string, string>;
    /** Quando ok=false (default: error). Ex.: empty | invalid */
    failHandle?: string;
  };
  /** Worker: inatividade em wait_input / menu_choice (S18). */
  resumeFromTimeout?: boolean;
  /** Entrada via webhook_in: id do nó + variáveis iniciais. */
  startFromWebhook?: {
    nodeId: string;
    variables?: Record<string, unknown>;
  };
}): RuntimeStepResult {
  const actions: RuntimeOutboundAction[] = [];
  let session: RuntimeSessionSnapshot = {
    ...opts.session,
    variables: { ...opts.session.variables },
  };

  if (session.status === 'paused' || session.status === 'ended' || session.status === 'transferred') {
    return { session, actions, handled: false };
  }

  if (session.status === 'waiting_delay' && !opts.resumeFromDelay) {
    return { session, actions, handled: false };
  }

  if (session.status === 'waiting_http' && !opts.resumeFromHttp) {
    return { session, actions, handled: false };
  }

  // Timeout de inatividade (S18) — não consome mensagem
  if (opts.resumeFromTimeout) {
    const waitNode = nodeById(opts.graph, session.currentNodeId);
    if (
      !waitNode ||
      (waitNode.type !== 'wait_input' && waitNode.type !== 'menu_choice')
    ) {
      session.status = 'error';
      actions.push({ type: 'error', message: 'Sessão timeout inválida' });
      return { session, actions, handled: true };
    }
    session.status = 'active';
    session.resumeAt = null;
    session.waitingVariable = null;
    session.variables[MENU_CHOICE_RETRIES_KEY] = '0';
    const next = outEdge(opts.graph, waitNode.id, 'timeout');
    if (!next) {
      session.status = 'ended';
      actions.push({ type: 'end' });
      return { session, actions, handled: true };
    }
    session.currentNodeId = next.target;
  } else if (session.status === 'waiting_input') {
    const varName = session.waitingVariable || 'answer';
    const bodyText = (opts.messageBody ?? '').trim();
    const interactiveId = (opts.interactiveReplyId ?? '').trim();
    session.variables[varName] = interactiveId || bodyText;
    session.waitingVariable = null;
    session.resumeAt = null;
    session.status = 'active';
    const waitNode = nodeById(opts.graph, session.currentNodeId);
    if (
      !waitNode ||
      (waitNode.type !== 'wait_input' &&
        waitNode.type !== 'invoice_assist' &&
        waitNode.type !== 'menu_choice')
    ) {
      session.status = 'error';
      actions.push({ type: 'error', message: 'Sessão wait_input inválida' });
      return { session, actions, handled: true };
    }

    if (waitNode.type === 'menu_choice') {
      const data = (waitNode.data || {}) as Record<string, unknown>;
      const options = normalizeMenuOptions(data.options);
      const reply = interactiveId || bodyText;
      const matched = matchMenuOption(options, reply);
      if (matched) {
        session.variables[varName] = matched.id;
        session.variables[MENU_CHOICE_RETRIES_KEY] = '0';
        for (const sv of matched.set_variables || []) {
          const value = interpolateTemplate(sv.value, session.variables);
          session.variables[sv.name] = value;
          actions.push({ type: 'set_variable', name: sv.name, value });
        }
        const next = outEdge(opts.graph, waitNode.id, matched.id);
        if (!next) {
          session.status = 'error';
          actions.push({ type: 'error', message: `menu_choice sem saída "${matched.id}"` });
          return { session, actions, handled: true };
        }
        session.currentNodeId = next.target;
      } else {
        const maxInvalid = Math.min(10, Math.max(1, Number(data.max_invalid) || 3));
        const retries = (Number(session.variables[MENU_CHOICE_RETRIES_KEY]) || 0) + 1;
        session.variables[MENU_CHOICE_RETRIES_KEY] = String(retries);
        if (retries >= maxInvalid) {
          const next = outEdge(opts.graph, waitNode.id, 'fallback');
          if (!next) {
            session.status = 'error';
            actions.push({ type: 'error', message: 'menu_choice sem saída fallback' });
            return { session, actions, handled: true };
          }
          session.currentNodeId = next.target;
        } else {
          const invalidMsg = interpolateTemplate(
            String(data.invalid_message || 'Opção inválida. Escolha uma das alternativas.'),
            session.variables
          ).trim();
          if (invalidMsg) actions.push({ type: 'send_text', text: invalidMsg });
          session.status = 'waiting_input';
          session.waitingVariable = varName;
          session.resumeAt = computeInputTimeoutResumeAt(data);
          return { session, actions, handled: true };
        }
      }
    } else if (waitNode.type === 'invoice_assist') {
      const data = (waitNode.data || {}) as Record<string, unknown>;
      const picked = selectInvoiceFromSessionVars(session.variables, varName);
      if (picked.ok) {
        applySelectedInvoiceVars(session.variables, picked.item);
        session.variables[INVOICE_ASSIST_RETRIES_KEY] = '0';
        const linkMsg = invoiceAssistLinkText(data, session.variables);
        if (linkMsg) actions.push({ type: 'send_text', text: linkMsg });
        const next = outEdge(opts.graph, waitNode.id, 'default');
        if (!next) {
          session.status = 'error';
          actions.push({ type: 'error', message: 'invoice_assist sem saída default' });
          return { session, actions, handled: true };
        }
        session.currentNodeId = next.target;
      } else {
        const maxInvalid = Math.min(10, Math.max(1, Number(data.max_invalid) || 3));
        const retries = (Number(session.variables[INVOICE_ASSIST_RETRIES_KEY]) || 0) + 1;
        session.variables[INVOICE_ASSIST_RETRIES_KEY] = String(retries);
        if (retries >= maxInvalid) {
          const next = outEdge(opts.graph, waitNode.id, 'invalid');
          if (!next) {
            session.status = 'error';
            actions.push({ type: 'error', message: `invoice_assist: ${picked.reason}` });
            return { session, actions, handled: true };
          }
          session.currentNodeId = next.target;
        } else {
          const invalidMsg = interpolateTemplate(
            String(data.invalid_message || 'Opção inválida. Digite o número de uma das faturas da lista.'),
            session.variables
          ).trim();
          if (invalidMsg) actions.push({ type: 'send_text', text: invalidMsg });
          session.status = 'waiting_input';
          session.waitingVariable = varName;
          return { session, actions, handled: true };
        }
      }
    } else {
      const waitData = (waitNode.data || {}) as Record<string, unknown>;
      maybePushUpdateContactFromWaitInput(
        actions,
        waitData,
        String(session.variables[varName] ?? '')
      );
      const next = outEdge(opts.graph, waitNode.id, 'default');
      if (!next) {
        session.status = 'error';
        actions.push({ type: 'error', message: 'wait_input sem saída' });
        return { session, actions, handled: true };
      }
      session.currentNodeId = next.target;
    }
  } else if (opts.resumeFromDelay) {
    const delayNode = nodeById(opts.graph, session.currentNodeId);
    if (!delayNode || delayNode.type !== 'delay') {
      session.status = 'error';
      actions.push({ type: 'error', message: 'Sessão delay inválida' });
      return { session, actions, handled: true };
    }
    const next = outEdge(opts.graph, delayNode.id, 'default');
    if (!next) {
      session.status = 'error';
      actions.push({ type: 'error', message: 'delay sem saída' });
      return { session, actions, handled: true };
    }
    session.status = 'active';
    session.resumeAt = null;
    session.currentNodeId = next.target;
  } else if (opts.resumeFromHttp) {
    const httpNode = nodeById(opts.graph, session.currentNodeId);
    if (
      !httpNode ||
      (httpNode.type !== 'http_request' &&
        httpNode.type !== 'webhook_out' &&
        httpNode.type !== 'lookup_invoice' &&
        httpNode.type !== 'invoice_assist' &&
        httpNode.type !== 'kanban_add_card' &&
        httpNode.type !== 'move_kanban')
    ) {
      session.status = 'error';
      actions.push({ type: 'error', message: 'Sessão HTTP/lookup inválida' });
      return { session, actions, handled: true };
    }
    if (opts.resumeFromHttp.mappedVariables) {
      for (const [k, v] of Object.entries(opts.resumeFromHttp.mappedVariables)) {
        session.variables[k] = v;
      }
    }

    if (httpNode.type === 'invoice_assist') {
      const data = (httpNode.data || {}) as Record<string, unknown>;
      session.status = 'active';
      if (!opts.resumeFromHttp.ok) {
        const emptyMsg = interpolateTemplate(String(data.empty_message || ''), session.variables).trim();
        if (emptyMsg) actions.push({ type: 'send_text', text: emptyMsg });
        const next = outEdge(opts.graph, httpNode.id, 'empty');
        if (!next) {
          session.status = 'error';
          actions.push({ type: 'error', message: 'invoice_assist sem saída empty' });
          return { session, actions, handled: true };
        }
        session.currentNodeId = next.target;
      } else {
        const mode = String(data.mode || 'last_open') === 'open_menu' ? 'open_menu' : 'last_open';
        if (mode === 'last_open') {
          const linkMsg = invoiceAssistLinkText(data, session.variables);
          if (linkMsg) actions.push({ type: 'send_text', text: linkMsg });
          const next = outEdge(opts.graph, httpNode.id, 'default');
          if (!next) {
            session.status = 'error';
            actions.push({ type: 'error', message: 'invoice_assist sem saída default' });
            return { session, actions, handled: true };
          }
          session.currentNodeId = next.target;
        } else {
          session.variables[INVOICE_ASSIST_RETRIES_KEY] = '0';
          const prompt = invoiceAssistPromptText(data, session.variables);
          if (prompt) actions.push({ type: 'send_text', text: prompt });
          session.status = 'waiting_input';
          session.waitingVariable = INVOICE_ASSIST_CHOICE_VAR;
          return { session, actions, handled: true };
        }
      }
    } else {
      const handle = opts.resumeFromHttp.ok
        ? 'default'
        : opts.resumeFromHttp.failHandle || 'error';
      const next = outEdge(opts.graph, httpNode.id, handle);
      if (!next) {
        session.status = 'error';
        actions.push({ type: 'error', message: `HTTP/lookup sem saída ${handle}` });
        return { session, actions, handled: true };
      }
      session.status = 'active';
      session.currentNodeId = next.target;
    }
  } else if (opts.startFromWebhook) {
    const entry = nodeById(opts.graph, opts.startFromWebhook.nodeId);
    if (!entry || entry.type !== 'webhook_in') {
      session.status = 'error';
      actions.push({ type: 'error', message: 'Nó webhook_in inválido' });
      return { session, actions, handled: true };
    }
    if (opts.startFromWebhook.variables) {
      for (const [k, v] of Object.entries(opts.startFromWebhook.variables)) {
        session.variables[k] = v;
      }
    }
    session.currentNodeId = entry.id;
    session.status = 'active';
    const next = outEdge(opts.graph, entry.id, 'default');
    if (!next) {
      session.status = 'error';
      actions.push({ type: 'error', message: 'webhook_in sem saída' });
      return { session, actions, handled: true };
    }
    session.currentNodeId = next.target;
  } else if (opts.justStarted) {
    const start = findStartNode(opts.graph);
    if (!start) {
      session.status = 'error';
      actions.push({ type: 'error', message: 'Flow sem nó start' });
      return { session, actions, handled: true };
    }
    session.currentNodeId = start.id;
    session.status = 'active';
    const next = outEdge(opts.graph, start.id, 'default');
    if (!next) {
      session.status = 'error';
      actions.push({ type: 'error', message: 'start sem saída' });
      return { session, actions, handled: true };
    }
    session.currentNodeId = next.target;
  }

  let steps = 0;
  while (steps++ < MAX_STEPS) {
    const node = nodeById(opts.graph, session.currentNodeId);
    if (!node) {
      session.status = 'error';
      actions.push({ type: 'error', message: 'Nó atual inexistente' });
      break;
    }
    const data = (node.data && typeof node.data === 'object' ? node.data : {}) as Record<
      string,
      unknown
    >;

    switch (node.type) {
      case 'start': {
        const next = outEdge(opts.graph, node.id, 'default');
        if (!next) {
          session.status = 'error';
          actions.push({ type: 'error', message: 'start sem saída' });
          return { session, actions, handled: true };
        }
        session.currentNodeId = next.target;
        continue;
      }
      case 'send_message': {
        const mode = String(data.send_mode || 'text') === 'media' ? 'media' : 'text';
        if (mode === 'media') {
          const mediaUrl = interpolateTemplate(String(data.media_url || ''), session.variables).trim();
          const rawMt = String(data.media_type || 'image');
          const mediaType =
            rawMt === 'document' || rawMt === 'audio' ? rawMt : ('image' as const);
          const caption =
            mediaType === 'audio'
              ? ''
              : interpolateTemplate(String(data.caption || ''), session.variables).trim();
          const filename = interpolateTemplate(String(data.filename || ''), session.variables).trim();
          if (mediaUrl) {
            actions.push({
              type: 'send_media',
              mediaType,
              mediaUrl,
              caption: caption || undefined,
              filename: filename || undefined,
            });
          }
        } else {
          const text = interpolateTemplate(String(data.text || ''), session.variables).trim();
          if (text) actions.push({ type: 'send_text', text });
        }
        const next = outEdge(opts.graph, node.id, 'default');
        if (!next) {
          session.status = 'error';
          actions.push({ type: 'error', message: 'send_message sem saída' });
          return { session, actions, handled: true };
        }
        session.currentNodeId = next.target;
        continue;
      }
      case 'wait_input': {
        const prompt = interpolateTemplate(String(data.prompt || ''), session.variables).trim();
        if (prompt) actions.push({ type: 'send_text', text: prompt });
        session.status = 'waiting_input';
        session.waitingVariable = String(data.variable || 'answer');
        session.resumeAt = computeInputTimeoutResumeAt(data);
        return { session, actions, handled: true };
      }
      case 'set_variable': {
        const name = String(data.variable || '').trim();
        const value = interpolateTemplate(String(data.value ?? ''), session.variables);
        if (name) {
          session.variables[name] = value;
          actions.push({ type: 'set_variable', name, value });
        }
        const next = outEdge(opts.graph, node.id, 'default');
        if (!next) {
          session.status = 'error';
          actions.push({ type: 'error', message: 'set_variable sem saída' });
          return { session, actions, handled: true };
        }
        session.currentNodeId = next.target;
        continue;
      }
      case 'add_tag': {
        actions.push({
          type: 'add_tag',
          tagLabel: data.tag_label != null ? String(data.tag_label) : undefined,
          tagId: data.tag_id != null ? String(data.tag_id) : undefined,
        });
        const next = outEdge(opts.graph, node.id, 'default');
        if (!next) {
          session.status = 'error';
          actions.push({ type: 'error', message: 'add_tag sem saída' });
          return { session, actions, handled: true };
        }
        session.currentNodeId = next.target;
        continue;
      }
      case 'assign_agent': {
        actions.push({
          type: 'assign_agent',
          mode: (data.mode as 'user' | 'team' | 'queue') || 'queue',
          userId: data.user_id != null ? String(data.user_id) : undefined,
          teamId: data.team_id != null ? String(data.team_id) : undefined,
          queueId: data.queue_id != null ? String(data.queue_id) : null,
        });
        const next = outEdge(opts.graph, node.id, 'default');
        if (!next) {
          session.status = 'error';
          actions.push({ type: 'error', message: 'assign_agent sem saída' });
          return { session, actions, handled: true };
        }
        session.currentNodeId = next.target;
        continue;
      }
      case 'move_kanban':
      case 'kanban_add_card': {
        const title = interpolateTemplate(String(data.title || ''), session.variables);
        const description = interpolateTemplate(String(data.description || ''), session.variables);
        const tagLabel = data.tag_label != null ? String(data.tag_label) : undefined;
        const tagId = data.tag_id != null ? String(data.tag_id) : undefined;
        const columnId = String(data.column_id || '');
        if (node.type === 'kanban_add_card') {
          actions.push({
            type: 'kanban_add_card',
            boardId: String(data.board_id || ''),
            columnId,
            title,
            description,
            tagLabel,
            tagId,
          });
        } else {
          actions.push({
            type: 'move_kanban',
            boardId: data.board_id != null ? String(data.board_id) : undefined,
            columnId,
            title,
            description,
            tagLabel,
            tagId,
          });
        }
        session.status = 'waiting_http';
        return { session, actions, handled: true };
      }
      case 'delay': {
        const amount = Math.max(1, Number(data.amount) || 1);
        const unit = (data.unit as 'seconds' | 'minutes' | 'hours' | 'days') || 'minutes';
        actions.push({ type: 'delay', amount, unit });
        session.status = 'waiting_delay';
        return { session, actions, handled: true };
      }
      case 'http_request': {
        const headersRaw = Array.isArray(data.headers) ? data.headers : [];
        const headers = headersRaw
          .map((h) => {
            if (!h || typeof h !== 'object') return null;
            const item = h as Record<string, unknown>;
            const key = String(item.key || '').trim();
            if (!key) return null;
            return { key, value: String(item.value ?? '') };
          })
          .filter(Boolean) as Array<{ key: string; value: string }>;
        const responseMapRaw = Array.isArray(data.response_map) ? data.response_map : [];
        const responseMap = responseMapRaw
          .map((m) => {
            if (!m || typeof m !== 'object') return null;
            const item = m as Record<string, unknown>;
            const path = String(item.path || '').trim();
            const variable = String(item.variable || '').trim();
            if (!path || !variable) return null;
            return { path, variable };
          })
          .filter(Boolean) as Array<{ path: string; variable: string }>;
        actions.push({
          type: 'http_request',
          method: String(data.method || 'GET'),
          url: String(data.url || ''),
          headers,
          body: String(data.body ?? ''),
          timeoutMs: Math.max(500, Math.min(30000, Number(data.timeout_ms) || 10000)),
          responseVariable: data.response_variable ? String(data.response_variable) : undefined,
          statusVariable: data.status_variable ? String(data.status_variable) : undefined,
          responseMap,
        });
        session.status = 'waiting_http';
        return { session, actions, handled: true };
      }
      case 'webhook_out': {
        const modeRaw = String(data.payload_mode || 'envelope');
        const payloadMode =
          modeRaw === 'custom' || modeRaw === 'envelope_plus' ? modeRaw : 'envelope';
        const headersRaw = Array.isArray(data.headers) ? data.headers : [];
        const headers = headersRaw
          .map((h: unknown) => {
            if (!h || typeof h !== 'object') return null;
            const row = h as Record<string, unknown>;
            const key = String(row.key ?? '').trim();
            if (!key) return null;
            return { key, value: String(row.value ?? '') };
          })
          .filter(Boolean) as Array<{ key: string; value: string }>;
        actions.push({
          type: 'webhook_out',
          method: String(data.method || 'POST').toUpperCase(),
          url: String(data.url || ''),
          headers,
          secret: data.secret != null ? String(data.secret) : undefined,
          timeoutMs: Math.max(500, Math.min(30000, Number(data.timeout_ms) || 10000)),
          includeSessionVars: data.include_session_vars !== false,
          payloadMode,
          bodyTemplate: String(data.body_template ?? ''),
        });
        session.status = 'waiting_http';
        return { session, actions, handled: true };
      }
      case 'lookup_invoice': {
        const modeRaw = String(data.mode || 'last_open');
        const mode = modeRaw === 'open_menu' ? 'open_menu' : 'last_open';
        actions.push({
          type: 'lookup_invoice',
          mode,
          limit: Math.min(20, Math.max(1, Number(data.limit) || 8)),
        });
        session.status = 'waiting_http';
        return { session, actions, handled: true };
      }
      case 'invoice_assist': {
        const modeRaw = String(data.mode || 'last_open');
        const mode = modeRaw === 'open_menu' ? 'open_menu' : 'last_open';
        actions.push({
          type: 'lookup_invoice',
          mode,
          limit: Math.min(20, Math.max(1, Number(data.limit) || 8)),
        });
        session.status = 'waiting_http';
        return { session, actions, handled: true };
      }
      case 'menu_choice': {
        const options = normalizeMenuOptions(data.options);
        if (options.length === 0) {
          session.status = 'error';
          actions.push({ type: 'error', message: 'menu_choice sem opções' });
          return { session, actions, handled: true };
        }
        const mode = String(data.mode || 'button') === 'list' ? 'list' : 'button';
        const text = interpolateTemplate(String(data.text || ''), session.variables).trim();
        actions.push({
          type: 'send_menu',
          mode,
          text: text || 'Escolha uma opção:',
          footerText: data.footer_text != null ? String(data.footer_text) : undefined,
          listButton: data.list_button != null ? String(data.list_button) : undefined,
          choices: buildUazMenuChoices(mode, options),
          options,
        });
        session.variables[MENU_CHOICE_RETRIES_KEY] = '0';
        session.status = 'waiting_input';
        session.waitingVariable = String(data.variable || 'answer').trim() || 'answer';
        session.resumeAt = computeInputTimeoutResumeAt(data);
        return { session, actions, handled: true };
      }
      case 'select_invoice': {
        const varName = String(data.variable || 'answer').trim() || 'answer';
        const picked = selectInvoiceFromSessionVars(session.variables, varName);
        if (picked.ok) {
          applySelectedInvoiceVars(session.variables, picked.item);
          const next = outEdge(opts.graph, node.id, 'default');
          if (!next) {
            session.status = 'error';
            actions.push({ type: 'error', message: 'select_invoice sem saída default' });
            return { session, actions, handled: true };
          }
          session.currentNodeId = next.target;
          continue;
        } else {
          const next = outEdge(opts.graph, node.id, 'invalid');
          if (!next) {
            session.status = 'error';
            actions.push({ type: 'error', message: `select_invoice: ${picked.reason}` });
            return { session, actions, handled: true };
          }
          session.currentNodeId = next.target;
          continue;
        }
      }
      case 'webhook_in': {
        // Entry only — não deve ser executado no loop (só via startFromWebhook).
        session.status = 'error';
        actions.push({ type: 'error', message: 'webhook_in não é executável no meio do fluxo' });
        return { session, actions, handled: true };
      }
      case 'condition': {
        const handle = evalCondition(data, session.variables);
        const next = outEdgeForCondition(opts.graph, node.id, handle);
        if (!next) {
          session.status = 'error';
          actions.push({ type: 'error', message: `condition sem saída ${handle}` });
          return { session, actions, handled: true };
        }
        session.currentNodeId = next.target;
        continue;
      }
      case 'transfer_human': {
        const msg = interpolateTemplate(String(data.message || ''), session.variables).trim();
        if (msg) actions.push({ type: 'send_text', text: msg });
        const destMode = String(data.mode || 'none');
        if (destMode === 'user' || destMode === 'team' || destMode === 'queue') {
          actions.push({
            type: 'assign_agent',
            mode: destMode,
            userId: data.user_id != null ? String(data.user_id) : undefined,
            teamId: data.team_id != null ? String(data.team_id) : undefined,
            queueId: data.queue_id != null ? String(data.queue_id) : null,
          });
        }
        actions.push({ type: 'transfer_human', message: msg || undefined });
        session.status = 'transferred';
        return { session, actions, handled: true };
      }
      case 'conversation_note': {
        const text = interpolateTemplate(String(data.text || ''), session.variables).trim();
        if (!text) {
          session.status = 'error';
          actions.push({ type: 'error', message: 'conversation_note sem texto' });
          return { session, actions, handled: true };
        }
        actions.push({ type: 'conversation_note', text, noteType: 'internal' });
        const next = outEdge(opts.graph, node.id, 'default');
        if (!next) {
          session.status = 'error';
          actions.push({ type: 'error', message: 'conversation_note sem saída' });
          return { session, actions, handled: true };
        }
        session.currentNodeId = next.target;
        continue;
      }
      case 'resolve_conversation': {
        const msg = interpolateTemplate(String(data.message || ''), session.variables).trim();
        if (msg) actions.push({ type: 'send_text', text: msg });
        actions.push({
          type: 'resolve_conversation',
          message: msg || undefined,
          closeAttendance: data.close_attendance !== false,
        });
        session.status = 'ended';
        return { session, actions, handled: true };
      }
      case 'end': {
        actions.push({ type: 'end' });
        session.status = 'ended';
        return { session, actions, handled: true };
      }
      default: {
        session.status = 'error';
        actions.push({ type: 'error', message: `Tipo não suportado no runtime: ${node.type}` });
        return { session, actions, handled: true };
      }
    }
  }

  session.status = 'error';
  actions.push({ type: 'error', message: 'Limite de passos excedido' });
  return { session, actions, handled: true };
}
