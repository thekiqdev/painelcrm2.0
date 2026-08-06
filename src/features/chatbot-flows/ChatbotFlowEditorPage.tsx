import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ConnectionLineType,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnSelectionChangeParams,
  type NodeMouseHandler,
  type XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, ArrowLeft, Copy, Download, Save, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import {
  duplicateChatbotFlow,
  exportChatbotFlow,
  getChatbotFlow,
  publishChatbotFlow,
  revertChatbotFlowToDraft,
  updateChatbotFlow,
  type ChatbotFlow,
  type ChatbotFlowGraph,
} from '@/services/chatbotFlows';
import { FlowCanvasNode } from './components/FlowCanvasNode';
import { StickyNoteNode } from './components/StickyNoteNode';
import { AnnotationArrowNode } from './components/AnnotationArrowNode';
import { AnnotationTextNode } from './components/AnnotationTextNode';
import { CanvasBoardToolbar } from './components/CanvasBoardToolbar';
import { FlowDeletableEdge } from './components/FlowDeletableEdge';
import { NodePropertiesPanel } from './components/NodePropertiesPanel';
import { NodePalettePanel } from './components/NodePalettePanel';
import { FlowTestPanel } from './components/FlowTestPanel';
import { FlowVersionBadge } from './components/FlowVersionBadge';
import { FlowPublishToggle, isFlowPublishToggleOn } from './components/FlowPublishToggle';
import { ImportFlowDialog } from './components/ImportFlowDialog';
import {
  defaultDataForType,
  validateGraphForPublish,
  type EssentialNodeType,
  type GraphValidationIssue,
} from './lib/nodeCatalog';
import {
  applyInvalidHighlights,
  applyValidationAutofix,
  clearValidationHighlights,
  enrichValidationIssues,
  nodeLabelForIssue,
} from './lib/flowValidationUx';
import { FlowValidationContext } from './lib/flowValidationContext';
import {
  buildArrowFromFlowPoints,
  defaultDataForEditorOnly,
  isEditorOnlyNodeType,
  type BoardTool,
  type EditorOnlyNodeType,
} from './lib/canvasAnnotations';
import { type ArrowDraft } from './lib/arrowPlacement';
import { REACTFLOW_DND_TYPE, type PaletteNodeType } from './lib/nodeCategories';
import { downloadJsonFile, slugifyFilename } from './lib/flowPortability';
import { useFlowCrmOptions } from './hooks/useFlowCrmOptions';
import { decorateFlowEdge } from './lib/flowEdgeStyle';
import { migrateConditionGraph } from './lib/conditionHelpers';
import { FlowEditorDirtyProvider } from './lib/flowEditorDirty';
import { FlowEdgeHoverProvider, useFlowEdgeHover } from './lib/flowEdgeHover';
import {
  applySimHighlights,
  createIdleSimulation,
  graphFromEditor,
  replySimulation,
  resolveHttpSimulation,
  resolveHttpWithLiveResult,
  resolveInvoiceLookupWithMapped,
  resolveTicketHttpWithMapped,
  resolveTimeoutSimulation,
  sessionVariablesForHttpTest,
  startSimulation,
  type FlowSimulationState,
} from './lib/flowSimulator';
import { isInputTimeoutEnabled } from './lib/inputTimeout';
import { EMPTY_TEST_SUBJECT, type FlowTestSubject } from './lib/flowTestSubject';
import { loadOpenInvoicesMappedForSim } from './lib/loadSimInvoices';
import {
  loadOpenTicketsMappedForSim,
  loadTicketAssistBootstrapForSim,
} from './lib/loadSimTickets';
import {
  testChatbotFlowIntegration,
  type ChatbotFlowIntegrationTestInput,
} from '@/services/chatbotFlows';
import { cn } from '@/lib/utils';
import './styles/flowCanvas.css';

const nodeTypes: NodeTypes = {
  start: FlowCanvasNode,
  send_message: FlowCanvasNode,
  wait_input: FlowCanvasNode,
  condition: FlowCanvasNode,
  transfer_human: FlowCanvasNode,
  end: FlowCanvasNode,
  set_variable: FlowCanvasNode,
  add_tag: FlowCanvasNode,
  assign_agent: FlowCanvasNode,
  move_kanban: FlowCanvasNode,
  kanban_add_card: FlowCanvasNode,
  delay: FlowCanvasNode,
  http_request: FlowCanvasNode,
  webhook_out: FlowCanvasNode,
  webhook_in: FlowCanvasNode,
  lookup_invoice: FlowCanvasNode,
  select_invoice: FlowCanvasNode,
  invoice_assist: FlowCanvasNode,
  ticket_assist: FlowCanvasNode,
  lookup_ticket: FlowCanvasNode,
  select_ticket: FlowCanvasNode,
  ticket_lookup_assist: FlowCanvasNode,
  crm_link_check: FlowCanvasNode,
  crm_convert: FlowCanvasNode,
  menu_choice: FlowCanvasNode,
  conversation_note: FlowCanvasNode,
  resolve_conversation: FlowCanvasNode,
  sticky_note: StickyNoteNode,
  annotation_arrow: AnnotationArrowNode,
  annotation_text: AnnotationTextNode,
};

const edgeTypes = {
  flowDeletable: FlowDeletableEdge,
};
function toFlowNodes(raw: unknown[], invalidIds?: Set<string>): Node[] {
  return raw.map((n, i) => {
    const item = (n && typeof n === 'object' ? n : {}) as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : `n-${i}`;
    const type = typeof item.type === 'string' ? item.type : 'send_message';
    const pos =
      item.position && typeof item.position === 'object'
        ? (item.position as { x?: number; y?: number })
        : {};
    const data =
      item.data && typeof item.data === 'object'
        ? { ...(item.data as Record<string, unknown>) }
        : {};
    if (invalidIds?.has(id)) data.invalid = true;
    else delete data.invalid;
    const node: Node = {
      id,
      type,
      position: { x: Number(pos.x) || 0, y: Number(pos.y) || 0 },
      data,
      connectable: !isEditorOnlyNodeType(type),
      selectable: true,
      draggable: true,
    };
    if (type === 'sticky_note' || type === 'annotation_text') {
      const w = Number(data.width) || (type === 'sticky_note' ? 220 : 200);
      const h = Number(data.height) || (type === 'sticky_note' ? 140 : 48);
      node.width = w;
      node.height = h;
      node.style = { width: w, height: h };
      node.zIndex = -1;
    }
    if (type === 'annotation_arrow') {
      const w = Number(data.width) || 188;
      const h = Number(data.height) || 68;
      node.width = w;
      node.height = h;
      node.style = { width: w, height: h };
      node.zIndex = -1;
    }
    return node;
  });
}

function toFlowEdges(raw: unknown[]): Edge[] {
  return raw
    .map((e, i) => {
      const item = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
      const source = typeof item.source === 'string' ? item.source : '';
      const target = typeof item.target === 'string' ? item.target : '';
      if (!source || !target) return null;
      return decorateFlowEdge({
        id: typeof item.id === 'string' ? item.id : `e-${i}`,
        source,
        target,
        sourceHandle: typeof item.sourceHandle === 'string' ? item.sourceHandle : undefined,
        targetHandle: typeof item.targetHandle === 'string' ? item.targetHandle : undefined,
      } as Edge);
    })
    .filter(Boolean) as Edge[];
}

function loadGraphIntoFlow(raw: { nodes?: unknown[]; edges?: unknown[] } | null | undefined): {
  nodes: Node[];
  edges: Edge[];
} {
  const migrated = migrateConditionGraph({
    nodes: Array.isArray(raw?.nodes) ? raw!.nodes! : [],
    edges: Array.isArray(raw?.edges) ? raw!.edges! : [],
  });
  return {
    nodes: toFlowNodes(migrated.nodes ?? []),
    edges: toFlowEdges(migrated.edges ?? []),
  };
}

function serializeGraph(nodes: Node[], edges: Edge[]): ChatbotFlowGraph {
  return {
    nodes: nodes.map((n) => {
      const {
        invalid: _i,
        simStatus: _s,
        simDone: _d,
        validationIssues: _v,
        ...data
      } = (n.data || {}) as Record<string, unknown>;
      if (n.type === 'sticky_note' || n.type === 'annotation_text' || n.type === 'annotation_arrow') {
        const w = n.measured?.width ?? n.width ?? data.width;
        const h = n.measured?.height ?? n.height ?? data.height;
        if (typeof w === 'number' && Number.isFinite(w)) data.width = Math.round(w);
        if (typeof h === 'number' && Number.isFinite(h)) data.height = Math.round(h);
      }
      return {
        id: n.id,
        type: n.type,
        position: n.position,
        data,
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
  };
}

const DRAFT_VERSION_KEY = (flowId: string) => `chatbot-flow-draft-version:${flowId}`;

function readStoredDraftVersion(flowId: string): number | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_VERSION_KEY(flowId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 ? n : null;
  } catch {
    return null;
  }
}

function writeStoredDraftVersion(flowId: string, version: number | null) {
  try {
    if (version == null) sessionStorage.removeItem(DRAFT_VERSION_KEY(flowId));
    else sessionStorage.setItem(DRAFT_VERSION_KEY(flowId), String(version));
  } catch {
    /* ignore */
  }
}

export default function ChatbotFlowEditorPage() {
  return (
    <ReactFlowProvider>
      <FlowEdgeHoverProvider>
        <ChatbotFlowEditorInner />
      </FlowEdgeHoverProvider>
    </ReactFlowProvider>
  );
}

function ChatbotFlowEditorInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { screenToFlowPosition, flowToScreenPosition, setCenter, getZoom } = useReactFlow();
  const { armEdgeHover, clearEdgeHoverSoon } = useFlowEdgeHover();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<GraphValidationIssue[]>([]);
  const [openIssueNodeId, setOpenIssueNodeId] = useState<string | null>(null);
  const [selectedDraftVersion, setSelectedDraftVersion] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMenuPosition, setPaletteMenuPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [paletteInsertAt, setPaletteInsertAt] = useState<XYPosition | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [sim, setSim] = useState<FlowSimulationState | null>(null);
  const [testSubject, setTestSubject] = useState<FlowTestSubject>(EMPTY_TEST_SUBJECT);
  const [resolvingInvoice, setResolvingInvoice] = useState(false);
  const [resolvingHttp, setResolvingHttp] = useState(false);
  const [name, setName] = useState('');
  const [meta, setMeta] = useState<ChatbotFlow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [propsOpen, setPropsOpen] = useState(false);
  const [boardTool, setBoardTool] = useState<BoardTool>('select');
  const [arrowDraft, setArrowDraft] = useState<ArrowDraft | null>(null);
  const [arrowCursor, setArrowCursor] = useState<XYPosition | null>(null);

  const crmOptions = useFlowCrmOptions(true);

  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null),
    [nodes, selectedId]
  );

  const displayNodes = useMemo(
    () => applySimHighlights(nodes, testOpen ? sim : null),
    [nodes, sim, testOpen]
  );

  const autoResolveInvoiceIfNeeded = useCallback(
    async (graph: ReturnType<typeof graphFromEditor>, state: FlowSimulationState) => {
      let next = state;
      let guard = 0;
      while (
        next.pendingHttpKind === 'invoice' &&
        next.testSubject.clientId &&
        next.session.status === 'waiting_http' &&
        guard < 5
      ) {
        guard += 1;
        const node = graph.nodes.find((n) => n.id === next.session.currentNodeId);
        if (node?.type !== 'lookup_invoice' && node?.type !== 'invoice_assist') {
          break;
        }
        const data = (node?.data || {}) as Record<string, unknown>;
        const mode = String(data.mode || 'last_open') === 'open_menu' ? 'open_menu' : 'last_open';
        const limit = Number(data.limit) || 8;
        try {
          setResolvingInvoice(true);
          const loaded = await loadOpenInvoicesMappedForSim({
            clientId: next.testSubject.clientId,
            mode,
            limit,
          });
          next = resolveInvoiceLookupWithMapped(graph, next, {
            found: loaded.found,
            mapped: loaded.mapped,
            systemText: loaded.found
              ? `Faturas do cliente: ${loaded.items.length} em aberto`
              : 'Cliente sem faturas em aberto',
          });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Erro ao carregar faturas');
          break;
        } finally {
          setResolvingInvoice(false);
        }
      }
      return next;
    },
    []
  );

  const autoResolveTicketIfNeeded = useCallback(
    async (graph: ReturnType<typeof graphFromEditor>, state: FlowSimulationState) => {
      let next = state;
      let guard = 0;
      while (
        next.pendingHttpKind === 'ticket' &&
        next.session.status === 'waiting_http' &&
        guard < 5
      ) {
        guard += 1;
        const node = graph.nodes.find((n) => n.id === next.session.currentNodeId);
        const data = (node?.data || {}) as Record<string, unknown>;
        const phase = String(next.session.variables['ticket._assist_phase'] || 'bootstrap');

        try {
          setResolvingInvoice(true);
          if (node?.type === 'ticket_assist') {
            if (phase === 'create') {
              // Create continua mock (não cria ticket real no dry-run)
              next = resolveHttpSimulation(graph, next, true);
              continue;
            }
            const boot = await loadTicketAssistBootstrapForSim({
              clientId: next.testSubject.clientId,
              requireClient: data.require_client !== false,
            });
            next = resolveTicketHttpWithMapped(graph, next, {
              ok: boot.ok,
              mapped: boot.mapped,
              systemText: boot.ok
                ? `Categorias do tenant: ${boot.categories.length}`
                : boot.reason === 'no_client'
                  ? 'Sem cliente vinculado (categorias do tenant carregadas)'
                  : 'Sem categorias no tenant',
            });
            continue;
          }

          if (node?.type === 'lookup_ticket' || node?.type === 'ticket_lookup_assist') {
            const mode =
              String(data.mode || 'open_menu') === 'last_open' ? 'last_open' : 'open_menu';
            if (!next.testSubject.clientId) {
              next = resolveTicketHttpWithMapped(graph, next, {
                ok: false,
                mapped: {
                  'ticket.count': '0',
                  ticket_count: '0',
                  'ticket.menu': '',
                  'ticket._items': '[]',
                },
                systemText: 'Lookup ticket: selecione um cliente no Testar',
              });
              continue;
            }
            const loaded = await loadOpenTicketsMappedForSim({
              clientId: next.testSubject.clientId,
              mode,
              limit: Number(data.limit) || 8,
              includeClosed: data.include_closed === true,
            });
            next = resolveTicketHttpWithMapped(graph, next, {
              ok: loaded.found,
              mapped: loaded.mapped,
              systemText: loaded.found
                ? `Chamados do cliente: ${loaded.items.length}`
                : 'Cliente sem chamados no filtro',
            });
            continue;
          }

          next = resolveHttpSimulation(graph, next, Boolean(next.testSubject.clientId));
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Erro ao carregar dados de ticket');
          break;
        } finally {
          setResolvingInvoice(false);
        }
      }
      return next;
    },
    []
  );

  const autoResolveHttpIfNeeded = useCallback(
    async (graph: ReturnType<typeof graphFromEditor>, state: FlowSimulationState) => {
      let next = state;
      let guard = 0;
      while (
        next.pendingHttpKind === 'http' &&
        next.session.status === 'waiting_http' &&
        guard < 5
      ) {
        guard += 1;
        const node = graph.nodes.find((n) => n.id === next.session.currentNodeId);
        if (
          !node ||
          (node.type !== 'http_request' && node.type !== 'webhook_out')
        ) {
          break;
        }
        const data = (node.data || {}) as Record<string, unknown>;
        const kind = node.type === 'webhook_out' ? 'webhook_out' : 'http_request';
        const mapRows = Array.isArray(data.response_map)
          ? (data.response_map as Array<{ path?: string; variable?: string }>)
              .map((r) => ({
                path: String(r.path || '').trim(),
                variable: String(r.variable || '').trim(),
              }))
              .filter((r) => r.path && r.variable)
          : [];
        const input: ChatbotFlowIntegrationTestInput = {
          kind,
          method: String(data.method || (kind === 'webhook_out' ? 'POST' : 'GET')) as
            | 'GET'
            | 'POST'
            | 'PUT'
            | 'PATCH'
            | 'DELETE',
          url: String(data.url || ''),
          headers: Array.isArray(data.headers)
            ? (data.headers as Array<{ key: string; value: string }>)
            : [],
          body: String(data.body || ''),
          timeout_ms: Number(data.timeout_ms) || 10000,
          secret: String(data.secret || ''),
          include_session_vars: data.include_session_vars !== false,
          payload_mode: String(data.payload_mode || 'envelope') as
            | 'envelope'
            | 'envelope_plus'
            | 'custom',
          body_template: String(data.body_template || ''),
          variables: sessionVariablesForHttpTest(next.session.variables),
          response_variable: data.response_variable
            ? String(data.response_variable)
            : undefined,
          status_variable: data.status_variable ? String(data.status_variable) : undefined,
          response_map: mapRows,
        };
        try {
          setResolvingHttp(true);
          const live = await testChatbotFlowIntegration(input);
          next = resolveHttpWithLiveResult(graph, next, live);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Falha na chamada HTTP';
          next = resolveHttpWithLiveResult(graph, next, {
            ok: false,
            status: 0,
            body_text: '',
            mapped: {},
            error: msg,
          });
        } finally {
          setResolvingHttp(false);
        }
      }
      return next;
    },
    []
  );

  const autoResolveSideEffects = useCallback(
    async (graph: ReturnType<typeof graphFromEditor>, state: FlowSimulationState) => {
      let next = state;
      let guard = 0;
      while (guard < 8) {
        guard += 1;
        if (
          next.pendingHttpKind === 'invoice' &&
          next.testSubject.clientId &&
          next.session.status === 'waiting_http'
        ) {
          next = await autoResolveInvoiceIfNeeded(graph, next);
          continue;
        }
        if (next.pendingHttpKind === 'ticket' && next.session.status === 'waiting_http') {
          next = await autoResolveTicketIfNeeded(graph, next);
          continue;
        }
        if (next.pendingHttpKind === 'crm' && next.session.status === 'waiting_http') {
          next = resolveHttpSimulation(graph, next, true);
          continue;
        }
        if (next.pendingHttpKind === 'crm_convert' && next.session.status === 'waiting_http') {
          next = resolveHttpSimulation(graph, next, true);
          continue;
        }
        if (next.pendingHttpKind === 'http' && next.session.status === 'waiting_http') {
          next = await autoResolveHttpIfNeeded(graph, next);
          continue;
        }
        break;
      }
      return next;
    },
    [autoResolveHttpIfNeeded, autoResolveInvoiceIfNeeded, autoResolveTicketIfNeeded]
  );

  const handleTestStart = useCallback(async () => {
    const g = graphFromEditor(nodes, edges);
    let state = startSimulation(g, testSubject);
    setSim(state);
    state = await autoResolveSideEffects(g, state);
    setSim(state);
  }, [autoResolveSideEffects, edges, nodes, testSubject]);

  const handleTestReset = useCallback(() => {
    setSim(createIdleSimulation());
    setResolvingInvoice(false);
    setResolvingHttp(false);
  }, []);

  const handleTestReply = useCallback(
    async (text: string, interactiveReplyId?: string) => {
      if (!sim) return;
      const g = graphFromEditor(nodes, edges);
      let next = replySimulation(g, sim, text, interactiveReplyId);
      setSim(next);
      next = await autoResolveSideEffects(g, next);
      setSim(next);
    },
    [autoResolveSideEffects, edges, nodes, sim]
  );

  const handleTestTimeout = useCallback(async () => {
    if (!sim) return;
    const g = graphFromEditor(nodes, edges);
    let next = resolveTimeoutSimulation(g, sim);
    setSim(next);
    next = await autoResolveSideEffects(g, next);
    setSim(next);
  }, [autoResolveSideEffects, edges, nodes, sim]);

  const canSimulateTimeout = useMemo(() => {
    if (!sim || sim.session.status !== 'waiting_input') return false;
    const node = nodes.find((n) => n.id === sim.session.currentNodeId);
    if (!node || (node.type !== 'wait_input' && node.type !== 'menu_choice')) return false;
    return isInputTimeoutEnabled((node.data || {}) as Record<string, unknown>);
  }, [nodes, sim]);

  const handleTestHttp = useCallback(
    async (ok: boolean) => {
      if (!sim) return;
      const g = graphFromEditor(nodes, edges);
      if (sim.pendingHttpKind === 'invoice' && ok && sim.testSubject.clientId) {
        const node = g.nodes.find((n) => n.id === sim.session.currentNodeId);
        const data = (node?.data || {}) as Record<string, unknown>;
        const mode = String(data.mode || 'last_open') === 'open_menu' ? 'open_menu' : 'last_open';
        try {
          setResolvingInvoice(true);
          const loaded = await loadOpenInvoicesMappedForSim({
            clientId: sim.testSubject.clientId,
            mode,
            limit: Number(data.limit) || 8,
          });
          let next = resolveInvoiceLookupWithMapped(g, sim, {
            found: loaded.found,
            mapped: loaded.mapped,
            systemText: loaded.found
              ? `Faturas do cliente: ${loaded.items.length} em aberto`
              : 'Cliente sem faturas em aberto',
          });
          next = await autoResolveSideEffects(g, next);
          setSim(next);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Erro ao carregar faturas');
        } finally {
          setResolvingInvoice(false);
        }
        return;
      }
      if (sim.pendingHttpKind === 'ticket') {
        try {
          setResolvingInvoice(true);
          let next = ok
            ? await autoResolveTicketIfNeeded(g, sim)
            : resolveHttpSimulation(g, sim, false);
          next = await autoResolveSideEffects(g, next);
          setSim(next);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Erro ao carregar tickets');
        } finally {
          setResolvingInvoice(false);
        }
        return;
      }
      // HTTP: preferir chamada real; OK/Erro só como fallback manual (invoice / edge cases)
      if (sim.pendingHttpKind === 'http') {
        let next = await autoResolveHttpIfNeeded(g, sim);
        next = await autoResolveSideEffects(g, next);
        setSim(next);
        return;
      }
      let next = resolveHttpSimulation(g, sim, ok);
      next = await autoResolveSideEffects(g, next);
      setSim(next);
    },
    [autoResolveHttpIfNeeded, autoResolveSideEffects, autoResolveTicketIfNeeded, edges, nodes, sim]
  );

  const reload = useCallback(async () => {
    if (!id) return;
    const flow = await getChatbotFlow(id);
    setMeta(flow);
    setName(flow.name);
    const loaded = loadGraphIntoFlow(flow.draft_graph);
    setNodes(loaded.nodes);
    setEdges(loaded.edges);
    setDirty(false);
    setSelectedId(null);
    setPropsOpen(false);
    const stored = readStoredDraftVersion(id);
    if (stored != null) setSelectedDraftVersion(stored);
    else if (flow.publish_state === 'published' && flow.published_version != null) {
      setSelectedDraftVersion(flow.published_version);
    } else {
      setSelectedDraftVersion(null);
    }
  }, [id, setEdges, setNodes]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await reload();
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Erro ao carregar flow');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          decorateFlowEdge({
            ...connection,
            sourceHandle: connection.sourceHandle || 'default',
          }),
          eds
        )
      );
      setDirty(true);
    },
    [setEdges]
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const source = nodes.find((n) => n.id === connection.source);
      const target = nodes.find((n) => n.id === connection.target);
      if (!source || !target) return false;
      if (isEditorOnlyNodeType(source.type) || isEditorOnlyNodeType(target.type)) return false;
      return true;
    },
    [nodes]
  );

  const markDirtyNodes = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      const removedIds = new Set(
        changes.filter((c) => c.type === 'remove').map((c) => ('id' in c ? c.id : ''))
      );
      if (removedIds.size) {
        setDirty(true);
        setSelectedId((cur) => {
          if (cur && removedIds.has(cur)) {
            setPropsOpen(false);
            return null;
          }
          return cur;
        });
      } else if (changes.some((c) => c.type === 'position' || c.type === 'add' || c.type === 'dimensions')) {
        setDirty(true);
      }
    },
    [onNodesChange]
  );

  const markDirtyEdges = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      if (changes.some((c) => c.type === 'remove' || c.type === 'add')) {
        setDirty(true);
      }
    },
    [onEdgesChange]
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const nid = params.nodes[0]?.id ?? null;
    setSelectedId(nid);
    if (!nid) setPropsOpen(false);
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler>((_event, node) => {
    setSelectedId(node.id);
    setPropsOpen(true);
  }, []);

  const addNodeAt = useCallback(
    (type: PaletteNodeType, position?: XYPosition, extraData?: Record<string, unknown>) => {
      if (type === 'start' && nodes.some((n) => n.type === 'start')) {
        return;
      }
      if (type === 'webhook_in' && nodes.some((n) => n.type === 'webhook_in')) {
        return;
      }
      const nid = `${type}-${crypto.randomUUID().slice(0, 8)}`;
      const data = {
        ...(isEditorOnlyNodeType(type)
          ? defaultDataForEditorOnly(type as EditorOnlyNodeType)
          : defaultDataForType(type as EssentialNodeType)),
        ...(extraData || {}),
      };
      const node: Node = {
        id: nid,
        type,
        position: position ?? { x: 180 + nodes.length * 24, y: 120 + nodes.length * 36 },
        data,
        connectable: !isEditorOnlyNodeType(type),
        zIndex: isEditorOnlyNodeType(type) ? -1 : undefined,
      };
      if (type === 'sticky_note' || type === 'annotation_text') {
        const w = Number((data as { width?: number }).width) || (type === 'sticky_note' ? 220 : 200);
        const h = Number((data as { height?: number }).height) || (type === 'sticky_note' ? 140 : 48);
        node.width = w;
        node.height = h;
        node.style = { width: w, height: h };
      }
      if (type === 'annotation_arrow') {
        const w = Number((data as { width?: number }).width) || 188;
        const h = Number((data as { height?: number }).height) || 68;
        node.width = w;
        node.height = h;
        node.style = { width: w, height: h };
      }
      setNodes((ns) => [...ns, node]);
      setSelectedId(nid);
      setPropsOpen(!isEditorOnlyNodeType(type) || type === 'sticky_note' || type === 'annotation_text');
      setDirty(true);
      return nid;
    },
    [nodes, setNodes]
  );

  const cancelArrowPlacement = useCallback(() => {
    setArrowDraft(null);
    setArrowCursor(null);
  }, []);

  const selectBoardTool = useCallback(
    (tool: BoardTool) => {
      setBoardTool(tool);
      setPaletteOpen(false);
      setPaletteMenuPosition(null);
      setPaletteInsertAt(null);
      setTestOpen(false);
      if (tool === 'arrow') {
        setPropsOpen(false);
        setSelectedId(null);
        setArrowDraft({ mode: 'armed' });
        setArrowCursor(null);
      } else {
        cancelArrowPlacement();
      }
    },
    [cancelArrowPlacement]
  );

  const commitArrow = useCallback(
    (start: XYPosition, end: XYPosition) => {
      const built = buildArrowFromFlowPoints(start, end);
      const nid = `annotation_arrow-${crypto.randomUUID().slice(0, 8)}`;
      setNodes((ns) => [
        ...ns,
        {
          id: nid,
          type: 'annotation_arrow',
          position: built.position,
          data: built.data,
          width: built.data.width,
          height: built.data.height,
          style: { width: built.data.width, height: built.data.height },
          connectable: false,
          zIndex: -1,
        },
      ]);
      setSelectedId(nid);
      setPropsOpen(false);
      setDirty(true);
      setArrowDraft({ mode: 'armed' });
      setArrowCursor(null);
      setBoardTool('arrow');
    },
    [setNodes]
  );

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setPaletteMenuPosition(null);
    setPaletteInsertAt(null);
  }, []);

  const openPaletteDocked = useCallback(() => {
    setPaletteMenuPosition(null);
    setPaletteInsertAt(null);
    setPaletteOpen(true);
  }, []);

  const onPalettePick = useCallback(
    (type: PaletteNodeType) => {
      cancelArrowPlacement();
      setBoardTool('select');
      addNodeAt(type, paletteInsertAt ?? undefined);
      setPaletteInsertAt(null);
      setPaletteMenuPosition(null);
    },
    [addNodeAt, cancelArrowPlacement, paletteInsertAt]
  );

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      const toolDrawing =
        boardTool === 'arrow' || boardTool === 'sticky' || boardTool === 'text';
      if (toolDrawing) return;
      event.preventDefault();
      const clientX = 'clientX' in event ? event.clientX : 0;
      const clientY = 'clientY' in event ? event.clientY : 0;
      const flow = screenToFlowPosition({ x: clientX, y: clientY });
      setPaletteInsertAt(flow);
      setPaletteMenuPosition({ x: clientX, y: clientY });
      setPaletteOpen(true);
      setPropsOpen(false);
      setSelectedId(null);
      setTestOpen(false);
      setBoardTool('select');
      cancelArrowPlacement();
    },
    [boardTool, cancelArrowPlacement, screenToFlowPosition]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelArrowPlacement();
        setBoardTool('select');
        return;
      }
      const map: Record<string, BoardTool> = {
        '1': 'select',
        '2': 'hand',
        '3': 'sticky',
        '4': 'arrow',
        '5': 'text',
      };
      const t = map[e.key];
      if (t) {
        e.preventDefault();
        selectBoardTool(t);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [arrowDraft, cancelArrowPlacement, selectBoardTool]);

  const onArrowOverlayPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!arrowDraft) return;
      e.preventDefault();
      e.stopPropagation();
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setArrowDraft({ mode: 'drawing', start: flow, current: flow });
    },
    [arrowDraft, screenToFlowPosition]
  );

  const onArrowOverlayPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!arrowDraft) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setArrowCursor(flow);
      if (arrowDraft.mode === 'drawing') {
        setArrowDraft({ mode: 'drawing', start: arrowDraft.start, current: flow });
      }
    },
    [arrowDraft, screenToFlowPosition]
  );

  const onArrowOverlayPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!arrowDraft || arrowDraft.mode !== 'drawing') return;
      e.preventDefault();
      e.stopPropagation();
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      const end = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      commitArrow(arrowDraft.start, end);
    },
    [arrowDraft, commitArrow, screenToFlowPosition]
  );

  const onBoardPlacePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (boardTool !== 'sticky' && boardTool !== 'text') return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (boardTool === 'sticky') {
        addNodeAt('sticky_note', { x: flow.x - 110, y: flow.y - 70 });
      } else {
        addNodeAt('annotation_text', { x: flow.x - 40, y: flow.y - 20 }, { autoEdit: true });
      }
      setBoardTool('select');
    },
    [addNodeAt, boardTool, screenToFlowPosition]
  );

  const arrowGhostScreen = useMemo(() => {
    if (!arrowDraft) return null;
    if (arrowDraft.mode === 'drawing') {
      const a = flowToScreenPosition(arrowDraft.start);
      const b = flowToScreenPosition(arrowDraft.current);
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    if (arrowCursor) {
      const a = flowToScreenPosition(arrowCursor);
      const b = flowToScreenPosition({
        x: arrowCursor.x + 72,
        y: arrowCursor.y + 18,
      });
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    return null;
  }, [arrowDraft, arrowCursor, flowToScreenPosition]);

  const drawingMode = boardTool === 'arrow' || boardTool === 'sticky' || boardTool === 'text';
  const isHand = boardTool === 'hand';

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(REACTFLOW_DND_TYPE) as PaletteNodeType;
      if (!type || isEditorOnlyNodeType(type)) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(type, position);
    },
    [addNodeAt, screenToFlowPosition]
  );

  const patchSelectedData = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedId) return;
      setNodes((ns) =>
        ns.map((n) =>
          n.id === selectedId ? { ...n, data: { ...n.data, ...patch, invalid: false } } : n
        )
      );
      setDirty(true);
    },
    [selectedId, setNodes]
  );

  const handleSave = useCallback(async () => {
    if (!id) return;
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    try {
      setSaving(true);
      const flow = await updateChatbotFlow(id, {
        name: trimmed,
        draft_graph: serializeGraph(nodes, edges),
      });
      setMeta(flow);
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }, [edges, id, name, nodes]);

  const focusValidationNode = useCallback(
    (nodeId: string) => {
      const n = nodes.find((x) => x.id === nodeId);
      if (!n) return;
      setSelectedId(nodeId);
      setPropsOpen(true);
      setOpenIssueNodeId(nodeId);
      const zoom = Math.max(getZoom(), 0.75);
      setCenter((n.position?.x || 0) + 100, (n.position?.y || 0) + 40, {
        zoom,
        duration: 350,
      });
    },
    [getZoom, nodes, setCenter]
  );

  const autofixIssue = useCallback(
    (issue: GraphValidationIssue) => {
      const result = applyValidationAutofix({ issue, nodes, edges });
      if (!result.ok) {
        toast.error(result.message || 'Não foi possível auto-corrigir');
        return;
      }
      setNodes(clearValidationHighlights(result.nodes));
      setEdges(result.edges);
      setDirty(true);
      setOpenIssueNodeId(null);

      const graph = serializeGraph(result.nodes, result.edges);
      const local = validateGraphForPublish({
        nodes: graph.nodes as Array<{ id: string; type?: string; data?: Record<string, unknown> }>,
        edges: graph.edges as Array<{
          id: string;
          source: string;
          target: string;
          sourceHandle?: string | null;
        }>,
      });
      if (!local.ok) {
        const enriched = enrichValidationIssues(local.issues);
        setPublishIssues(enriched);
        setNodes(applyInvalidHighlights(result.nodes, enriched));
        toast.message('Corrigido parcialmente — ainda há pendências nos nós marcados');
        return;
      }
      setPublishIssues([]);
      toast.success('Problema corrigido');
    },
    [edges, nodes, setEdges, setNodes]
  );

  const validationContextValue = useMemo(
    () => ({
      issues: publishIssues,
      openIssueNodeId,
      setOpenIssueNodeId,
      autofixIssue,
      focusNode: focusValidationNode,
    }),
    [autofixIssue, focusValidationNode, openIssueNodeId, publishIssues]
  );

  const handlePublish = useCallback(async () => {
    if (!id) return;
    const graph = serializeGraph(nodes, edges);
    const local = validateGraphForPublish({
      nodes: graph.nodes as Array<{ id: string; type?: string; data?: Record<string, unknown> }>,
      edges: graph.edges as Array<{
        id: string;
        source: string;
        target: string;
        sourceHandle?: string | null;
      }>,
    });
    if (!local.ok) {
      const enriched = enrichValidationIssues(local.issues);
      setPublishIssues(enriched);
      setNodes(applyInvalidHighlights(nodes, enriched));
      const firstNodeId = enriched.find((i) => i.nodeIds?.[0])?.nodeIds?.[0];
      if (firstNodeId) {
        setTimeout(() => focusValidationNode(firstNodeId), 50);
      }
      toast.error(
        enriched.length === 1
          ? 'Há 1 problema no fluxo — veja o ícone no nó'
          : `Há ${enriched.length} problemas no fluxo — veja os nós marcados`,
        { duration: 5000 }
      );
      return;
    }

    try {
      setPublishing(true);
      setPublishIssues([]);
      setOpenIssueNodeId(null);
      if (dirty) {
        const saved = await updateChatbotFlow(id, {
          name: name.trim() || undefined,
          draft_graph: graph,
        });
        setMeta(saved);
        setDirty(false);
      }
      const result = await publishChatbotFlow(id);
      setMeta(result.flow);
      const loaded = loadGraphIntoFlow(result.flow.draft_graph);
      setNodes(clearValidationHighlights(loaded.nodes));
      setEdges(loaded.edges);
      setPublishIssues([]);
      setSelectedDraftVersion(result.version.version);
      writeStoredDraftVersion(id, result.version.version);
      toast.success(`Publicado v${result.version.version}`);
      if (result.warnings?.length) {
        for (const w of result.warnings.slice(0, 3)) {
          toast.message(w, { duration: 10_000 });
        }
      }
    } catch (e) {
      const err = e as Error & { issues?: GraphValidationIssue[] };
      if (err.issues?.length) {
        const enriched = enrichValidationIssues(err.issues);
        setPublishIssues(enriched);
        setNodes(applyInvalidHighlights(nodes, enriched));
        const firstNodeId = enriched.find((i) => i.nodeIds?.[0])?.nodeIds?.[0];
        if (firstNodeId) focusValidationNode(firstNodeId);
        toast.error('Há problemas no fluxo — veja os nós marcados', { duration: 5000 });
      } else {
        setPublishIssues([]);
        toast.error(err.message || 'Erro ao publicar', { duration: 8000 });
      }
    } finally {
      setPublishing(false);
    }
  }, [
    dirty,
    edges,
    focusValidationNode,
    id,
    name,
    nodes,
    setEdges,
    setNodes,
  ]);

  const handleRestoreVersion = useCallback(
    (flow: ChatbotFlow, restoredVersion: number) => {
      setMeta(flow);
      setName(flow.name);
      const loaded = loadGraphIntoFlow(flow.draft_graph);
      setNodes(loaded.nodes);
      setEdges(loaded.edges);
      setDirty(false);
      setPublishIssues([]);
      setSelectedId(null);
      setPropsOpen(false);
      setSelectedDraftVersion(restoredVersion);
      if (id) writeStoredDraftVersion(id, restoredVersion);
    },
    [id, setEdges, setNodes]
  );

  const handleVersionDuplicated = useCallback(
    (flow: ChatbotFlow) => {
      navigate(`/chatbot-flows/${flow.id}`);
    },
    [navigate]
  );

  const handleVersionDeleted = useCallback(
    (version: number) => {
      if (selectedDraftVersion === version) {
        setSelectedDraftVersion(null);
        if (id) writeStoredDraftVersion(id, null);
      }
    },
    [id, selectedDraftVersion]
  );

  const handleRevertDraft = useCallback(async () => {
    if (!id) return;
    try {
      setPublishing(true);
      const flow = await revertChatbotFlowToDraft(id);
      setMeta(flow);
      toast.success('Flow em rascunho (desligado no WhatsApp)');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao voltar ao rascunho');
    } finally {
      setPublishing(false);
    }
  }, [id]);

  const handleExport = useCallback(async () => {
    if (!id) return;
    try {
      if (dirty) {
        await updateChatbotFlow(id, {
          name: name.trim() || undefined,
          draft_graph: serializeGraph(nodes, edges),
        });
        setDirty(false);
      }
      const doc = await exportChatbotFlow(id, { source: 'draft' });
      downloadJsonFile(`${slugifyFilename(name || 'flow')}.chatbot-flow.json`, doc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao exportar');
    }
  }, [dirty, edges, id, name, nodes]);

  const handleDuplicate = useCallback(async () => {
    if (!id) return;
    try {
      if (dirty) {
        await updateChatbotFlow(id, {
          name: name.trim() || undefined,
          draft_graph: serializeGraph(nodes, edges),
        });
        setDirty(false);
      }
      const copy = await duplicateChatbotFlow(id);
      navigate(`/chatbot-flows/${copy.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao duplicar');
    }
  }, [dirty, edges, id, name, navigate, nodes]);

  const graphNodesForVars = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: n.type,
        data: (n.data || {}) as Record<string, unknown>,
      })),
    [nodes]
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Carregando editor…
      </div>
    );
  }

  return (
    <FlowEditorDirtyProvider value={() => setDirty(true)}>
    <FlowValidationContext.Provider value={validationContextValue}>
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[420px] flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1.5 overflow-hidden border-b px-3 md:px-4">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link to="/chatbot-flows" title="Voltar à lista" aria-label="Voltar à lista">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Input
          className="h-8 min-w-0 max-w-[14rem] flex-1 sm:max-w-xs"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          aria-label="Nome do flow"
        />
        <div className="shrink-0">
          <FlowVersionBadge
            flow={meta}
            selectedVersion={selectedDraftVersion}
            onRestored={handleRestoreVersion}
            onDuplicated={handleVersionDuplicated}
            onVersionDeleted={handleVersionDeleted}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {dirty ? (
            <span className="mr-1 hidden text-xs text-amber-600 sm:inline">Não salvo</span>
          ) : null}
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            title="Exportar"
            aria-label="Exportar"
            onClick={() => void handleExport()}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            title="Importar"
            aria-label="Importar"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            title="Duplicar"
            aria-label="Duplicar"
            onClick={() => void handleDuplicate()}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            title={saving ? 'Salvando…' : 'Salvar'}
            aria-label={saving ? 'Salvando…' : 'Salvar'}
            disabled={saving || !dirty}
            onClick={() => void handleSave()}
          >
            <Save className="h-4 w-4" />
          </Button>
          {meta && meta.status !== 'archived' ? (
            <>
              <FlowPublishToggle
                id={`editor-pub-${meta.id}`}
                className="ml-2"
                checked={isFlowPublishToggleOn(meta)}
                busy={publishing}
                onPublish={() => handlePublish()}
                onUnpublish={() => handleRevertDraft()}
              />
              {(meta.publish_state === 'outdated' ||
                (dirty && isFlowPublishToggleOn(meta))) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={publishing}
                  title="Publicar alterações do rascunho sem desligar"
                  onClick={() => void handlePublish()}
                >
                  Atualizar
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {publishIssues.length > 0 ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1.5">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                {publishIssues.length === 1
                  ? '1 problema no fluxo — clique no nó ou abaixo'
                  : `${publishIssues.length} problemas no fluxo — clique para ir ao nó`}
              </p>
              <ul className="space-y-1">
                {publishIssues.slice(0, 8).map((issue, i) => {
                  const nodeId = issue.nodeIds?.[0];
                  const label = nodeLabelForIssue(issue, nodes);
                  return (
                    <li key={`${issue.code}-${i}`}>
                      <button
                        type="button"
                        className="text-left text-xs underline-offset-2 hover:underline"
                        onClick={() => {
                          if (nodeId) focusValidationNode(nodeId);
                        }}
                      >
                        <span className="font-medium">{label}</span>
                        <span className="text-amber-800/80 dark:text-amber-100/80">
                          {' — '}
                          {issue.message}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => {
                setPublishIssues([]);
                setOpenIssueNodeId(null);
                setNodes((ns) => clearValidationHighlights(ns));
              }}
              aria-label="Fechar erros"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={markDirtyNodes}
            onEdgesChange={markDirtyEdges}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onEdgeMouseEnter={(_e, edge) => armEdgeHover(edge.id)}
            onEdgeMouseLeave={() => clearEdgeHoverSoon()}
            onSelectionChange={onSelectionChange}
            onNodeClick={onNodeClick}
            onPaneClick={() => {
              if (drawingMode) return;
              setPropsOpen(false);
              setSelectedId(null);
              closePalette();
            }}
            onPaneContextMenu={onPaneContextMenu}
            onNodeContextMenu={(e) => onPaneContextMenu(e)}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={boardTool === 'select'}
            nodesConnectable={boardTool === 'select'}
            elementsSelectable={boardTool === 'select'}
            panOnDrag={isHand ? true : [1, 2]}
            selectionOnDrag={boardTool === 'select'}
            defaultEdgeOptions={{
              type: 'flowDeletable',
              animated: true,
              className: 'chatbot-flow-edge',
              style: { stroke: '#64748b', strokeWidth: 2 },
            }}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            minZoom={0.01}
            maxZoom={4}
            deleteKeyCode={drawingMode ? false : ['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Panel position="bottom-left" className="chatbot-flow-nav-panel m-2 flex items-end gap-2">
              <MiniMap
                pannable
                zoomable
                className="chatbot-flow-minimap !relative !m-0 !translate-x-0 !translate-y-0"
              />
              <Controls
                className="!relative !m-0 !translate-x-0 !translate-y-0"
                showInteractive={false}
              />
            </Panel>
          </ReactFlow>

          <CanvasBoardToolbar tool={boardTool} onToolChange={selectBoardTool} />

          {boardTool === 'arrow' && arrowDraft ? (
            <div
              className="absolute inset-0 z-30 cursor-crosshair"
              onPointerDown={onArrowOverlayPointerDown}
              onPointerMove={onArrowOverlayPointerMove}
              onPointerUp={onArrowOverlayPointerUp}
              onPointerCancel={() => {
                cancelArrowPlacement();
                setBoardTool('select');
              }}
            >
              <div className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2 rounded-md border bg-background/95 px-3 py-1.5 text-xs shadow-md">
                {arrowDraft.mode === 'armed'
                  ? 'Clique e arraste para desenhar a seta · Esc cancela'
                  : 'Solte para criar a seta · Esc cancela'}
              </div>
            </div>
          ) : null}

          {(boardTool === 'sticky' || boardTool === 'text') && (
            <div
              className={cn(
                'absolute inset-0 z-30',
                boardTool === 'sticky' ? 'cursor-copy' : 'cursor-text'
              )}
              onPointerDown={onBoardPlacePointerDown}
            >
              <div className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2 rounded-md border bg-background/95 px-3 py-1.5 text-xs shadow-md">
                {boardTool === 'sticky'
                  ? 'Clique para colocar a sticky note · Esc / 1 para selecionar'
                  : 'Clique para colocar o texto · Esc / 1 para selecionar'}
              </div>
            </div>
          )}

          {arrowDraft && arrowGhostScreen ? (
            <svg
              className="pointer-events-none fixed inset-0 z-40 h-screen w-screen overflow-visible"
              aria-hidden
            >
              <defs>
                <marker
                  id="arrow-place-ghost"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill="#64748b" />
                </marker>
              </defs>
              <line
                x1={arrowGhostScreen.x1}
                y1={arrowGhostScreen.y1}
                x2={arrowGhostScreen.x2}
                y2={arrowGhostScreen.y2}
                stroke="#64748b"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray={arrowDraft.mode === 'armed' ? '6 4' : undefined}
                markerEnd="url(#arrow-place-ghost)"
              />
            </svg>
          ) : null}

          <NodePalettePanel
            open={paletteOpen}
            menuPosition={paletteMenuPosition}
            onOpenChange={(open) => {
              if (open) openPaletteDocked();
              else closePalette();
            }}
            onPick={onPalettePick}
            testOpen={testOpen}
            onTestOpenChange={(open) => {
              setTestOpen(open);
              if (!open) {
                setSim(null);
                return;
              }
              closePalette();
              setPropsOpen(false);
              setBoardTool('select');
              cancelArrowPlacement();
            }}
          />

          <FlowTestPanel
            open={testOpen}
            onClose={() => {
              setTestOpen(false);
              setSim(null);
            }}
            sim={sim}
            subject={testSubject}
            onSubjectChange={setTestSubject}
            onStart={() => void handleTestStart()}
            onReset={handleTestReset}
            onReply={(t, id) => void handleTestReply(t, id)}
            onHttpResolve={(ok) => void handleTestHttp(ok)}
            onTimeoutResolve={() => void handleTestTimeout()}
            canSimulateTimeout={canSimulateTimeout}
            resolvingInvoice={resolvingInvoice}
            resolvingHttp={resolvingHttp}
          />
        </div>

        <aside
          className={cn(
            'shrink-0 border-l bg-background transition-[width] duration-200 overflow-hidden',
            propsOpen && selectedNode ? 'w-80' : 'w-0 border-l-0'
          )}
        >
          {propsOpen && selectedNode ? (
            <div className="relative flex h-full w-80 flex-col">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 z-10 h-8 w-8"
                onClick={() => {
                  setPropsOpen(false);
                  setSelectedId(null);
                }}
                aria-label="Fechar painel"
              >
                <X className="h-4 w-4" />
              </Button>
              <NodePropertiesPanel
                nodeId={selectedNode.id}
                type={String(selectedNode.type || '')}
                data={(selectedNode.data || {}) as Record<string, unknown>}
                onChange={patchSelectedData}
                crmOptions={crmOptions}
                graphNodes={graphNodesForVars}
                flowId={id}
              />
            </div>
          ) : null}
        </aside>
      </div>

      <ImportFlowDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        replaceTargetFlowId={id}
        onImported={(flow, mode) => {
          if (mode === 'replace_draft') {
            void reload();
          } else {
            navigate(`/chatbot-flows/${flow.id}`);
          }
        }}
      />
    </div>
    </FlowValidationContext.Provider>
    </FlowEditorDirtyProvider>
  );
}
