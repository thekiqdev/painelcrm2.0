/**
 * Orquestração do simulador de draft (S7) — dry-run sem side-effects reais.
 */
import type { Edge, Node } from '@xyflow/react';
import {
  processInboundStep,
  type RuntimeGraph,
  type RuntimeOutboundAction,
  type RuntimeSessionSnapshot,
  type RuntimeStepResult,
} from './runtimeEngine';
import { NODE_LABELS, type EssentialNodeType } from './nodeCatalog';
import { isEditorOnlyNodeType } from './canvasAnnotations';
import { buildMockFlowVariableSeed, mergeMockVariableSeed } from './mockVariableSeed';
import { buildMockInvoiceLookupMapped } from './flowInvoiceVars';
import { buildMockTicketCreatedMapped, buildMockTicketLookupMapped } from './flowTicketVars';
import { buildCrmLinkMapped, classifyCrmLinkKind, buildCrmConvertMapped, classifyCrmConvertOutcome } from './flowCrmLinkVars';
import {
  applyTestSubjectToVariables,
  EMPTY_TEST_SUBJECT,
  type FlowTestSubject,
} from './flowTestSubject';
import { normalizeMenuOptions } from './menuChoiceHelpers';
import { isInputTimeoutEnabled } from './inputTimeout';
import { buildMappedFromLastSample, hasLastHttpSample } from './httpTestHelpers';

export type SimChatMessage = {
  id: string;
  role: 'bot' | 'user' | 'system';
  text: string;
  ok?: boolean;
  /** Opções clicáveis do menu_choice (S13). */
  menuOptions?: Array<{ id: string; label: string }>;
};

export type SimLogEntry = {
  id: string;
  nodeId: string | null;
  nodeType: string;
  label: string;
  detail: string;
  status: 'ok' | 'wait' | 'error' | 'info';
};

export type FlowSimulationState = {
  session: RuntimeSessionSnapshot;
  messages: SimChatMessage[];
  log: SimLogEntry[];
  visitedNodeIds: string[];
  currentNodeId: string | null;
  /** Aguardando decisão do usuário no HTTP/fatura dry-run. */
  pendingHttp: boolean;
  pendingHttpKind?: 'http' | 'invoice' | 'ticket' | 'crm' | 'crm_convert' | 'kanban' | 'ensure_conversation' | null;
  /** Nó HTTP tem sample do editor (S14) para “Usar última resposta”. */
  pendingHttpHasSample?: boolean;
  /** Opções do menu_choice aguardando clique/texto (S13). */
  pendingMenuOptions: Array<{ id: string; label: string }> | null;
  /** Cliente/lead escolhido no painel Testar (S12). */
  testSubject: FlowTestSubject;
  running: boolean;
};

function uid(): string {
  return crypto.randomUUID().slice(0, 10);
}

export function graphFromEditor(nodes: Node[], edges: Edge[]): RuntimeGraph {
  const runtimeNodes = nodes.filter((n) => !isEditorOnlyNodeType(n.type));
  const ids = new Set(runtimeNodes.map((n) => n.id));
  return {
    nodes: runtimeNodes.map((n) => ({
      id: n.id,
      type: String(n.type || ''),
      data: (n.data || {}) as Record<string, unknown>,
    })),
    edges: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
      })),
  };
}

function nodeLabel(type: string): string {
  return NODE_LABELS[type as EssentialNodeType] || type;
}

function describeAction(a: RuntimeOutboundAction): { detail: string; status: SimLogEntry['status'] } {
  switch (a.type) {
    case 'send_text':
      return { detail: a.text, status: 'ok' };
    case 'send_media':
      return {
        detail: `[mídia: ${a.mediaType}]${a.caption ? ` ${a.caption}` : ''}`.slice(0, 120),
        status: 'ok',
      };
    case 'set_variable':
      return { detail: `${a.name} = ${a.value}`, status: 'ok' };
    case 'update_contact':
      return {
        detail: `Contato.${a.field} = ${a.value.slice(0, 60)} (dry-run)`,
        status: 'ok',
      };
    case 'add_tag':
      return { detail: `Tag: ${a.tagLabel || a.tagId || '—'} (dry-run)`, status: 'ok' };
    case 'assign_agent':
      return { detail: `Atribuir ${a.mode} (dry-run)`, status: 'ok' };
    case 'move_kanban':
    case 'kanban_add_card':
      return {
        detail: `Kanban (cria ou move)${a.title ? `: ${String(a.title).slice(0, 40)}` : ''} (sim)`,
        status: 'ok',
      };
    case 'ensure_conversation':
      return {
        detail: `Iniciar atendimento: ${String(a.phone || '').slice(0, 40)} (sim)`,
        status: 'wait',
      };
    case 'delay':
      return { detail: `Delay ${a.amount} ${a.unit} (simulado)`, status: 'info' };
    case 'http_request':
      return { detail: `HTTP ${a.method} ${a.url} (aguardar ok/erro)`, status: 'wait' };
    case 'webhook_out':
      return { detail: `Webhook ${a.method || 'POST'} → ${a.url} (aguardar ok/erro)`, status: 'wait' };
    case 'lookup_invoice':
      return {
        detail:
          a.mode === 'open_menu'
            ? 'Consultar menu de faturas (aguardar achou/vazia)'
            : 'Consultar última fatura (aguardar achou/vazia)',
        status: 'wait',
      };
    case 'resolve_crm_link':
      return {
        detail: 'Classificar vínculo CRM (cliente / lead / sem vínculo)',
        status: 'wait',
      };
    case 'crm_convert':
      return {
        detail: `Converter CRM → ${a.mode === 'to_client' ? 'cliente' : 'lead'}`,
        status: 'wait',
      };
    case 'send_menu':
      return {
        detail: `Menu ${a.mode}: ${a.options.map((o) => o.label).join(' · ')}`,
        status: 'wait',
      };
    case 'transfer_human':
      return { detail: 'Transferir humano', status: 'ok' };
    case 'conversation_note':
      return { detail: `Nota interna: ${a.text.slice(0, 80)}`, status: 'ok' };
    case 'resolve_conversation':
      return {
        detail:
          a.closeAttendance === false
            ? 'Resolver (só sessão bot)'
            : 'Resolver + fechar atendimento',
        status: 'ok',
      };
    case 'end':
      return { detail: 'Fim do fluxo', status: 'ok' };
    case 'error':
      return { detail: a.message, status: 'error' };
    default:
      return { detail: String((a as { type: string }).type), status: 'info' };
  }
}

function appendFromResult(
  state: FlowSimulationState,
  result: RuntimeStepResult,
  graph: RuntimeGraph
): FlowSimulationState {
  const messages = [...state.messages];
  const log = [...state.log];
  const visited = new Set(state.visitedNodeIds);
  if (result.session.currentNodeId) visited.add(result.session.currentNodeId);

  // Marca nós visitados pelos actions de caminho — usa currentNodeId final + anteriores
  let pendingMenuOptions: Array<{ id: string; label: string }> | null = null;
  for (const a of result.actions) {
    const node = graph.nodes.find((n) => n.id === result.session.currentNodeId);
    const type = node?.type || a.type;
    const desc = describeAction(a);
    if (a.type === 'send_text') {
      messages.push({ id: uid(), role: 'bot', text: a.text });
    }
    if (a.type === 'send_media') {
      const label = `[mídia: ${a.mediaType}]${a.caption ? ` ${a.caption}` : ''}`;
      messages.push({ id: uid(), role: 'bot', text: label.trim() });
    }
    if (a.type === 'conversation_note') {
      messages.push({
        id: uid(),
        role: 'system',
        text: `Nota interna: ${a.text.slice(0, 200)}`,
        ok: true,
      });
    }
    if (a.type === 'resolve_conversation') {
      messages.push({
        id: uid(),
        role: 'system',
        text:
          a.closeAttendance === false
            ? 'Fluxo resolvido (sessão bot).'
            : 'Conversa resolvida — atendimento fechado.',
        ok: true,
      });
    }
    if (a.type === 'send_menu') {
      const menuOptions = a.options.map((o) => ({ id: o.id, label: o.label }));
      pendingMenuOptions = menuOptions;
      messages.push({
        id: uid(),
        role: 'bot',
        text: a.text,
        menuOptions,
      });
    }
    log.push({
      id: uid(),
      nodeId: result.session.currentNodeId,
      nodeType: type,
      label: nodeLabel(type),
      detail: desc.detail,
      status: desc.status,
    });
  }

  if (result.session.status === 'waiting_input' && !pendingMenuOptions) {
    const waitNode = graph.nodes.find((n) => n.id === result.session.currentNodeId);
    if (waitNode?.type === 'menu_choice') {
      const opts = normalizeMenuOptions(
        (waitNode.data as Record<string, unknown> | undefined)?.options
      );
      pendingMenuOptions = opts.map((o) => ({ id: o.id, label: o.label }));
    }
  }
  if (result.session.status !== 'waiting_input') {
    pendingMenuOptions = null;
  }

  const pendingHttp = result.session.status === 'waiting_http';
  const waitingNode = pendingHttp
    ? graph.nodes.find((n) => n.id === result.session.currentNodeId)
    : null;
  const pendingHttpKind = pendingHttp
    ? waitingNode?.type === 'lookup_invoice' || waitingNode?.type === 'invoice_assist'
      ? 'invoice'
      : waitingNode?.type === 'ticket_assist' ||
          waitingNode?.type === 'lookup_ticket' ||
          waitingNode?.type === 'ticket_lookup_assist'
        ? 'ticket'
        : waitingNode?.type === 'crm_link_check'
          ? 'crm'
          : waitingNode?.type === 'crm_convert'
            ? 'crm_convert'
            : waitingNode?.type === 'kanban_add_card' || waitingNode?.type === 'move_kanban'
            ? 'kanban'
            : waitingNode?.type === 'ensure_conversation'
              ? 'ensure_conversation'
            : 'http'
    : null;
  const pendingHttpHasSample =
    pendingHttp &&
    pendingHttpKind === 'http' &&
    waitingNode &&
    (waitingNode.type === 'http_request' || waitingNode.type === 'webhook_out') &&
    hasLastHttpSample((waitingNode.data || {}) as Record<string, unknown>);

  return {
    ...state,
    session: result.session,
    messages,
    log,
    visitedNodeIds: [...visited],
    currentNodeId: result.session.currentNodeId,
    pendingHttp,
    pendingHttpKind,
    pendingHttpHasSample: Boolean(pendingHttpHasSample),
    pendingMenuOptions,
    running:
      result.session.status === 'waiting_input' ||
      result.session.status === 'waiting_http' ||
      result.session.status === 'waiting_delay' ||
      result.session.status === 'active',
  };
}

/** Auto-avança delay no simulador (instantâneo). */
function autoResumeDelay(
  graph: RuntimeGraph,
  state: FlowSimulationState
): FlowSimulationState {
  if (state.session.status !== 'waiting_delay') return state;
  const result = processInboundStep({
    graph,
    session: state.session,
    messageBody: null,
    resumeFromDelay: true,
  });
  let next = appendFromResult(state, result, graph);
  next = autoResumeDelay(graph, next);
  next = autoResumeIfNeeded(graph, next);
  return next;
}

function autoResumeKanban(
  graph: RuntimeGraph,
  state: FlowSimulationState
): FlowSimulationState {
  if (state.session.status !== 'waiting_http') return state;
  const node = graph.nodes.find((n) => n.id === state.session.currentNodeId);
  if (node?.type !== 'kanban_add_card' && node?.type !== 'move_kanban') return state;
  const data = (node.data || {}) as Record<string, unknown>;
  const result = processInboundStep({
    graph,
    session: state.session,
    messageBody: null,
    resumeFromHttp: {
      ok: true,
      mappedVariables: {
        'kanban.card_id': `sim-${uid()}`,
        'kanban.board_id': String(data.board_id || ''),
        'kanban.column_id': String(data.column_id || ''),
        'kanban.created': 'true',
        'kanban.moved': 'false',
      },
    },
  });
  let next = appendFromResult(state, result, graph);
  next.messages.push({
    id: uid(),
    role: 'system',
    text: 'Kanban: card criado ou movido (simulação).',
    ok: true,
  });
  next = autoResumeDelay(graph, next);
  next = autoResumeKanban(graph, next);
  return next;
}

function autoResumeEnsureConversation(
  graph: RuntimeGraph,
  state: FlowSimulationState
): FlowSimulationState {
  if (state.session.status !== 'waiting_http') return state;
  const node = graph.nodes.find((n) => n.id === state.session.currentNodeId);
  if (node?.type !== 'ensure_conversation') return state;
  const data = (node.data || {}) as Record<string, unknown>;
  const phoneTpl = String(data.phone || '');
  const simId = `sim-conv-${uid()}`;
  const result = processInboundStep({
    graph,
    session: state.session,
    messageBody: null,
    resumeFromHttp: {
      ok: true,
      mappedVariables: {
        'conversation.id': simId,
        conversation_id: simId,
        'contact.phone': phoneTpl.includes('{{') ? '5511999999999' : phoneTpl.replace(/\D/g, '') || '5511999999999',
        'ensure_conversation.created': 'true',
        'ensure_conversation.reused': 'false',
      },
    },
  });
  let next = appendFromResult(state, result, graph);
  next.messages.push({
    id: uid(),
    role: 'system',
    text: 'Iniciar atendimento: conversa amarrada (simulação).',
    ok: true,
  });
  next = autoResumeDelay(graph, next);
  next = autoResumeKanban(graph, next);
  next = autoResumeEnsureConversation(graph, next);
  return next;
}

function autoResumeIfNeeded(graph: RuntimeGraph, state: FlowSimulationState): FlowSimulationState {
  if (state.session.status === 'waiting_delay') {
    return autoResumeDelay(graph, state);
  }
  if (state.session.status === 'waiting_http') {
    const node = graph.nodes.find((n) => n.id === state.session.currentNodeId);
    if (node?.type === 'kanban_add_card' || node?.type === 'move_kanban') {
      return autoResumeKanban(graph, state);
    }
    if (node?.type === 'ensure_conversation') {
      return autoResumeEnsureConversation(graph, state);
    }
  }
  return state;
}

export function createIdleSimulation(): FlowSimulationState {
  return {
    session: {
      status: 'active',
      currentNodeId: null,
      variables: {},
      waitingVariable: null,
    },
    messages: [],
    log: [],
    visitedNodeIds: [],
    currentNodeId: null,
    pendingHttp: false,
    pendingHttpKind: null,
    pendingHttpHasSample: false,
    pendingMenuOptions: null,
    testSubject: EMPTY_TEST_SUBJECT,
    running: false,
  };
}

export function startSimulation(
  graph: RuntimeGraph,
  subject: FlowTestSubject = EMPTY_TEST_SUBJECT
): FlowSimulationState {
  const base = createIdleSimulation();
  base.testSubject = subject;
  base.session.variables = applyTestSubjectToVariables(
    mergeMockVariableSeed(base.session.variables, buildMockFlowVariableSeed()),
    subject
  );
  const subjectNote =
    subject.kind === 'client'
      ? `Cliente: ${subject.label}. Faturas usam dados reais desse cliente.`
      : subject.kind === 'lead'
        ? `Lead: ${subject.label}. Faturas continuam mock (lead sem client_id).`
        : 'Variáveis CRM/sistema pré-preenchidas (mock).';
  base.messages.push({
    id: uid(),
    role: 'system',
    text: `Simulação iniciada (rascunho). ${subjectNote} Ações CRM/HTTP são dry-run.`,
  });
  const result = processInboundStep({
    graph,
    session: base.session,
    messageBody: '',
    justStarted: true,
  });
  let state = appendFromResult(base, result, graph);
  state = autoResumeIfNeeded(graph, state);
  if (state.session.status === 'ended') {
    state.messages.push({ id: uid(), role: 'system', text: 'Fluxo encerrado.', ok: true });
    state.running = false;
  } else if (state.session.status === 'transferred') {
    state.messages.push({ id: uid(), role: 'system', text: 'Transferido para humano.', ok: true });
    state.running = false;
  } else if (state.session.status === 'error') {
    state.messages.push({ id: uid(), role: 'system', text: 'Erro no fluxo.', ok: false });
    state.running = false;
  } else if (state.session.status === 'waiting_input') {
    state.messages.push({
      id: uid(),
      role: 'system',
      text: `Aguardando resposta → {{${state.session.waitingVariable || 'answer'}}}`,
    });
  }
  return state;
}

export function replySimulation(
  graph: RuntimeGraph,
  state: FlowSimulationState,
  text: string,
  interactiveReplyId?: string | null
): FlowSimulationState {
  if (state.session.status !== 'waiting_input') return state;
  const trimmed = text.trim();
  const interactiveId = (interactiveReplyId ?? '').trim();
  if (!trimmed && !interactiveId) return state;

  const displayText = trimmed || interactiveId;

  let next: FlowSimulationState = {
    ...state,
    messages: [...state.messages, { id: uid(), role: 'user', text: displayText }],
    pendingMenuOptions: null,
  };

  const result = processInboundStep({
    graph,
    session: state.session,
    messageBody: trimmed || interactiveId,
    interactiveReplyId: interactiveId || null,
  });
  next = appendFromResult(next, result, graph);
  next = autoResumeIfNeeded(graph, next);

  if (next.session.status === 'ended') {
    next.messages.push({ id: uid(), role: 'system', text: 'Fluxo encerrado.', ok: true });
    next.running = false;
  } else if (next.session.status === 'transferred') {
    next.messages.push({ id: uid(), role: 'system', text: 'Transferido para humano.', ok: true });
    next.running = false;
  } else if (next.session.status === 'error') {
    next.messages.push({ id: uid(), role: 'system', text: 'Erro no fluxo.', ok: false });
    next.running = false;
  } else if (next.session.status === 'waiting_input') {
    next.messages.push({
      id: uid(),
      role: 'system',
      text: `Aguardando → {{${next.session.waitingVariable || 'answer'}}}`,
    });
  }
  return next;
}

/** Simula timeout de inatividade (S18) sem esperar o relógio. */
export function resolveTimeoutSimulation(
  graph: RuntimeGraph,
  state: FlowSimulationState
): FlowSimulationState {
  if (state.session.status !== 'waiting_input') return state;
  const node = graph.nodes.find((n) => n.id === state.session.currentNodeId);
  if (
    !node ||
    (node.type !== 'wait_input' && node.type !== 'menu_choice') ||
    !isInputTimeoutEnabled((node.data || {}) as Record<string, unknown>)
  ) {
    return state;
  }
  const result = processInboundStep({
    graph,
    session: state.session,
    messageBody: null,
    resumeFromTimeout: true,
  });
  let next = appendFromResult(state, result, graph);
  next.messages.push({
    id: uid(),
    role: 'system',
    text: 'Timeout de inatividade (simulação).',
    ok: true,
  });
  next = autoResumeIfNeeded(graph, next);
  if (next.session.status === 'ended') {
    next.messages.push({ id: uid(), role: 'system', text: 'Fluxo encerrado.', ok: true });
    next.running = false;
  } else if (next.session.status === 'transferred') {
    next.messages.push({ id: uid(), role: 'system', text: 'Transferido para humano.', ok: true });
    next.running = false;
  } else if (next.session.status === 'error') {
    next.messages.push({ id: uid(), role: 'system', text: 'Erro no fluxo.', ok: false });
    next.running = false;
  } else if (next.session.status === 'waiting_input') {
    next.messages.push({
      id: uid(),
      role: 'system',
      text: `Aguardando → {{${next.session.waitingVariable || 'answer'}}}`,
    });
  }
  return next;
}

export function resolveHttpSimulation(
  graph: RuntimeGraph,
  state: FlowSimulationState,
  ok: boolean
): FlowSimulationState {
  if (state.session.status !== 'waiting_http') return state;

  const node = graph.nodes.find((n) => n.id === state.session.currentNodeId);
  const data = (node?.data || {}) as Record<string, unknown>;
  const isLookup = node?.type === 'lookup_invoice' || node?.type === 'invoice_assist';
  const isTicketCreate = node?.type === 'ticket_assist';
  const isTicketLookup =
    node?.type === 'lookup_ticket' || node?.type === 'ticket_lookup_assist';
  const isCrmLink = node?.type === 'crm_link_check';
  const isCrmConvert = node?.type === 'crm_convert';

  let mapped: Record<string, string> = {};
  let failHandle: string | undefined;
  let outHandle: string | undefined;
  let systemText: string;
  let logDetail: string;

  if (isCrmLink) {
    const sub = state.testSubject;
    const kind = classifyCrmLinkKind({
      clientId: sub.kind === 'client' ? sub.clientId || sub.id : null,
      leadId: sub.kind === 'lead' ? sub.id : null,
    });
    // Se ok=false no painel, força unlinked para testar o ramo
    const effective = ok ? kind : 'unlinked';
    mapped = buildCrmLinkMapped({
      kind: effective,
      clientId: effective === 'client' ? sub.clientId || sub.id : null,
      leadId: effective === 'lead' ? sub.id : null,
      clientName: effective === 'client' ? sub.name : null,
      leadName: effective === 'lead' ? sub.name : null,
    });
    outHandle = effective;
    systemText = `Vínculo CRM: ${effective}`;
    logDetail = `Seguiu saída ${effective}`;
  } else if (isCrmConvert) {
    const sub = state.testSubject;
    const mode = String(data.mode || 'to_lead') === 'to_client' ? 'to_client' : 'to_lead';
    const clientId = sub.kind === 'client' ? sub.clientId || sub.id : null;
    const leadId = sub.kind === 'lead' ? sub.id : null;
    const phone = String(sub.phone || '').replace(/\D/g, '');
    const hasIdentity = phone.length >= 8 || Boolean(sub.name);
    if (!ok) {
      outHandle = 'error';
      mapped = buildCrmConvertMapped({
        mode,
        outHandle: 'error',
        result: 'error',
        error: 'forced_error',
      });
      systemText = 'Converter CRM: erro (forçado)';
      logDetail = 'Seguiu saída error';
    } else {
      const outcome = classifyCrmConvertOutcome({
        mode,
        clientId,
        leadId,
        hasIdentity: hasIdentity || Boolean(clientId || leadId),
      });
      outHandle = outcome.outHandle;
      const mockLeadId = leadId || (outcome.result === 'created' && mode === 'to_lead' ? 'sim-lead-1' : null);
      const mockClientId =
        clientId || (outcome.result === 'created' && mode === 'to_client' ? 'sim-client-1' : null);
      mapped = buildCrmConvertMapped({
        mode,
        outHandle: outcome.outHandle,
        result: outcome.result,
        clientId: outcome.outHandle === 'already_client' || mode === 'to_client' ? mockClientId || clientId : clientId,
        leadId: mode === 'to_lead' && outcome.outHandle === 'default' ? mockLeadId : null,
        clientName: sub.kind === 'client' || mode === 'to_client' ? sub.name || 'Cliente sim' : null,
        leadName: mode === 'to_lead' ? sub.name || 'Lead sim' : null,
        error: outcome.error,
      });
      systemText = `Converter CRM (${mode}): ${outcome.outHandle} / ${outcome.result}`;
      logDetail = `Seguiu saída ${outcome.outHandle}`;
    }
  } else if (isTicketCreate) {
    failHandle = 'empty';
    const phase = String(state.session.variables['ticket._assist_phase'] || 'bootstrap');
    if (ok) {
      if (phase === 'create') {
        mapped = buildMockTicketCreatedMapped();
        systemText = 'Ticket simulado: criado (mock)';
        logDetail = 'Seguiu saída ok (create mock)';
      } else {
        const cats = [
          { id: 'cat-1', name: 'Desenvolvimento', option_id: 'c1' },
          { id: 'cat-2', name: 'Financeiro', option_id: 'c2' },
          { id: 'cat-3', name: 'Suporte', option_id: 'c3' },
        ];
        mapped = {
          'ticket.category_count': '3',
          ticket_category_count: '3',
          'ticket._categories': JSON.stringify(cats),
          'ticket.menu': '1) Desenvolvimento\n2) Financeiro\n3) Suporte',
          ticket_menu: '1) Desenvolvimento\n2) Financeiro\n3) Suporte',
        };
        if (state.testSubject.clientId) {
          mapped['client.id'] = state.testSubject.clientId;
          mapped.client_id = state.testSubject.clientId;
        }
        systemText = 'Categorias simuladas (mock)';
        logDetail = 'Bootstrap ticket ok (mock)';
      }
    } else {
      if (phase === 'create') {
        mapped = {
          'ticket.category_count': '0',
          ticket_category_count: '0',
          'ticket._categories': '[]',
          'ticket.menu': '',
          'ticket._bootstrap_reason': 'create_failed',
        };
        systemText = 'Falha ao criar ticket (mock)';
        logDetail = 'Seguiu saída vazia';
      } else {
        // Espelha BE: no_client ainda pode ter categorias no tenant
        const cats = [
          { id: 'cat-1', name: 'Desenvolvimento', option_id: 'c1' },
          { id: 'cat-2', name: 'Financeiro', option_id: 'c2' },
          { id: 'cat-3', name: 'Suporte', option_id: 'c3' },
        ];
        mapped = {
          'ticket.category_count': '3',
          ticket_category_count: '3',
          'ticket._categories': JSON.stringify(cats),
          'ticket.menu': '1) Desenvolvimento\n2) Financeiro\n3) Suporte',
          ticket_menu: '1) Desenvolvimento\n2) Financeiro\n3) Suporte',
          'ticket._bootstrap_reason': 'no_client',
        };
        systemText = 'Ticket: sem cliente vinculado (mock)';
        logDetail = 'Seguiu saída vazia (no_client)';
      }
    }
  } else if (isTicketLookup) {
    failHandle = 'empty';
    if (ok) {
      const mode = String(data.mode || 'open_menu') === 'last_open' ? 'last_open' : 'open_menu';
      mapped = buildMockTicketLookupMapped(mode);
      if (state.testSubject.clientId) {
        mapped['client.id'] = state.testSubject.clientId;
        mapped.client_id = state.testSubject.clientId;
      }
      systemText = 'Chamado(s) simulado(s): achou (mock)';
      logDetail = 'Seguiu saída ok (lookup mock)';
    } else {
      mapped = {
        'ticket.count': '0',
        ticket_count: '0',
        'ticket.menu': '',
        'ticket._items': '[]',
      };
      systemText = 'Chamados: vazio (mock)';
      logDetail = 'Seguiu saída vazia';
    }
  } else if (isLookup) {
    failHandle = 'empty';
    if (ok) {
      const mode = String(data.mode || 'last_open') === 'open_menu' ? 'open_menu' : 'last_open';
      mapped = buildMockInvoiceLookupMapped(mode);
      // Preserva client.id do sujeito real se houver
      if (state.testSubject.clientId) {
        mapped['client.id'] = state.testSubject.clientId;
        mapped.client_id = state.testSubject.clientId;
      }
      systemText = 'Fatura(s) simulada(s): achou (mock)';
      logDetail = 'Seguiu saída achou (mock)';
    } else {
      mapped = {
        'invoice.count': '0',
        invoice_count: '0',
        'invoice.menu': '',
        'invoice._items': '[]',
      };
      systemText = 'Faturas: vazia';
      logDetail = 'Seguiu saída vazia';
    }
  } else {
    if (ok) {
      mapped.http_status = '200';
      mapped.http_body = '{"ok":true,"simulated":true}';
    } else {
      mapped.http_status = '500';
      mapped.http_body = '{"ok":false,"simulated":true}';
    }
    if (data.status_variable) mapped[String(data.status_variable)] = mapped.http_status;
    if (data.response_variable) mapped[String(data.response_variable)] = mapped.http_body;
    if (Array.isArray(data.response_map)) {
      for (const row of data.response_map) {
        if (!row || typeof row !== 'object') continue;
        const item = row as Record<string, unknown>;
        const variable = String(item.variable || '').trim();
        if (variable) mapped[variable] = 'simulated';
      }
    }
    systemText = ok ? 'HTTP simulado: OK (2xx)' : 'HTTP simulado: ERRO';
    logDetail = ok ? 'Seguiu saída ok' : 'Seguiu saída erro';
  }

  return resumeWaitingHttp(graph, state, {
    ok,
    mapped,
    failHandle,
    outHandle,
    systemText,
    logDetail,
    nodeType: String(node?.type || 'http'),
  });
}

/** Usa resposta real de test-integration (simulador chat). */
export function resolveHttpWithLiveResult(
  graph: RuntimeGraph,
  state: FlowSimulationState,
  result: {
    ok: boolean;
    status: number;
    body_text?: string;
    mapped?: Record<string, string>;
    error?: string | null;
  }
): FlowSimulationState {
  if (state.session.status !== 'waiting_http') return state;
  const node = graph.nodes.find((n) => n.id === state.session.currentNodeId);
  const preview = String(result.body_text || result.error || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  const statusLabel = result.status ? String(result.status) : result.error || 'erro';
  return resumeWaitingHttp(graph, state, {
    ok: result.ok,
    mapped: result.mapped || {},
    systemText: result.ok
      ? `HTTP real: OK (${statusLabel})${preview ? ` — ${preview}` : ''}`
      : `HTTP real: falha (${statusLabel})${preview ? ` — ${preview}` : ''}`,
    logDetail: result.ok
      ? `HTTP ${statusLabel} → saída ok`
      : `HTTP ${statusLabel} → saída erro`,
    nodeType: String(node?.type || 'http'),
  });
}

/** Serializa variables da sessão para o endpoint de teste. */
export function sessionVariablesForHttpTest(
  variables: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(variables)) {
    if (v == null) continue;
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
    else {
      try {
        out[k] = JSON.stringify(v);
      } catch {
        out[k] = String(v);
      }
    }
  }
  return out;
}

/** Usa sample `last_test_*` do nó HTTP/webhook (S14).
 * Mapeia sempre (qualquer status); `ok` só escolhe a saída default|error. */
export function resolveHttpWithLastSample(
  graph: RuntimeGraph,
  state: FlowSimulationState
): FlowSimulationState {
  if (state.session.status !== 'waiting_http') return state;
  const node = graph.nodes.find((n) => n.id === state.session.currentNodeId);
  if (!node || (node.type !== 'http_request' && node.type !== 'webhook_out')) return state;
  const data = (node.data || {}) as Record<string, unknown>;
  if (!hasLastHttpSample(data)) return state;

  const mapped = buildMappedFromLastSample(data);
  const status = Number(data.last_test_status) || 0;
  const ok = status >= 200 && status < 300;
  return resumeWaitingHttp(graph, state, {
    ok,
    mapped,
    systemText: ok
      ? `HTTP sample: OK (${data.last_test_status})`
      : `HTTP sample: erro (${data.last_test_status || data.last_test_error || 'falha'})`,
    logDetail: ok ? 'Seguiu saída ok (última resposta)' : 'Seguiu saída erro (última resposta)',
    nodeType: String(node.type),
  });
}

/** Resume ticket_assist bootstrap / lookup com bag real (API). */
export function resolveTicketHttpWithMapped(
  graph: RuntimeGraph,
  state: FlowSimulationState,
  opts: {
    ok: boolean;
    mapped: Record<string, string>;
    systemText: string;
  }
): FlowSimulationState {
  if (state.session.status !== 'waiting_http') return state;
  const node = graph.nodes.find((n) => n.id === state.session.currentNodeId);
  return resumeWaitingHttp(graph, state, {
    ok: opts.ok,
    mapped: opts.mapped,
    failHandle: 'empty',
    systemText: opts.systemText,
    logDetail: opts.ok ? 'Seguiu saída ok (API)' : 'Seguiu saída vazia (API)',
    nodeType: String(node?.type || 'ticket_assist'),
  });
}

/** Resume lookup de fatura com bag já montada (dados reais do cliente — S12). */
export function resolveInvoiceLookupWithMapped(
  graph: RuntimeGraph,
  state: FlowSimulationState,
  opts: {
    found: boolean;
    mapped: Record<string, string>;
    systemText: string;
  }
): FlowSimulationState {
  if (state.session.status !== 'waiting_http') return state;
  const node = graph.nodes.find((n) => n.id === state.session.currentNodeId);
  return resumeWaitingHttp(graph, state, {
    ok: opts.found,
    mapped: opts.mapped,
    failHandle: 'empty',
    systemText: opts.systemText,
    logDetail: opts.found ? 'Seguiu saída achou (cliente)' : 'Seguiu saída vazia (cliente)',
    nodeType: String(node?.type || 'invoice_assist'),
  });
}

function resumeWaitingHttp(
  graph: RuntimeGraph,
  state: FlowSimulationState,
  opts: {
    ok: boolean;
    mapped: Record<string, string>;
    failHandle?: string;
    outHandle?: string;
    systemText: string;
    logDetail: string;
    nodeType: string;
  }
): FlowSimulationState {
  let next: FlowSimulationState = {
    ...state,
    messages: [
      ...state.messages,
      {
        id: uid(),
        role: 'system',
        text: opts.systemText,
        ok: opts.ok,
      },
    ],
    log: [
      ...state.log,
      {
        id: uid(),
        nodeId: state.session.currentNodeId,
        nodeType: opts.nodeType,
        label: nodeLabel(opts.nodeType),
        detail: opts.logDetail,
        status: opts.ok ? 'ok' : 'error',
      },
    ],
  };

  const result = processInboundStep({
    graph,
    session: state.session,
    messageBody: null,
    resumeFromHttp: {
      ok: opts.ok,
      mappedVariables: opts.mapped,
      failHandle: opts.failHandle,
      outHandle: opts.outHandle,
    },
  });
  next = appendFromResult(next, result, graph);
  next = autoResumeIfNeeded(graph, next);

  if (next.session.status === 'ended') {
    next.messages.push({ id: uid(), role: 'system', text: 'Fluxo encerrado.', ok: true });
    next.running = false;
  } else if (next.session.status === 'transferred') {
    next.messages.push({ id: uid(), role: 'system', text: 'Transferido para humano.', ok: true });
    next.running = false;
  } else if (next.session.status === 'error') {
    next.messages.push({ id: uid(), role: 'system', text: 'Erro no fluxo.', ok: false });
    next.running = false;
  } else if (next.session.status === 'waiting_input') {
    next.messages.push({
      id: uid(),
      role: 'system',
      text: `Aguardando → {{${next.session.waitingVariable || 'answer'}}}`,
    });
  }
  return next;
}

export function applySimHighlights(
  nodes: Node[],
  sim: FlowSimulationState | null
): Node[] {
  const clear = (list: Node[]) =>
    list.map((n) => {
      const data = (n.data || {}) as Record<string, unknown>;
      if (data.simStatus == null && data.simDone == null) return n;
      const { simStatus: _s, simDone: _d, ...rest } = data;
      return { ...n, data: rest };
    });

  if (!sim) return clear(nodes);

  const visited = new Set(sim.visitedNodeIds);
  const current = sim.currentNodeId;
  const failed = sim.session.status === 'error';
  return nodes.map((n) => {
    let simStatus: 'current' | 'done' | 'error' | undefined;
    if (failed && n.id === current) simStatus = 'error';
    else if (n.id === current && (sim.running || sim.session.status === 'waiting_input' || sim.session.status === 'waiting_http'))
      simStatus = 'current';
    else if (visited.has(n.id) || n.id === current) simStatus = 'done';
    if (!simStatus) {
      const data = (n.data || {}) as Record<string, unknown>;
      if (data.simStatus == null && data.simDone == null) return n;
      const { simStatus: _s, simDone: _d, ...rest } = data;
      return { ...n, data: rest };
    }
    return {
      ...n,
      data: {
        ...n.data,
        simStatus,
        simDone: visited.has(n.id) || n.id === current,
      },
    };
  });
}
