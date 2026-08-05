/**
 * Chatbot Flows — CRUD + publish (S0/S1).
 */
import { pool } from '../../utils/db.js';
import type { PoolClient } from 'pg';
import {
  validateGraphForPublish,
  type ChatbotFlowGraph,
  type GraphValidationIssue,
} from './graphValidation.js';
import {
  buildExportDocument,
  parseExportDocument,
  resolveImportDocument,
  sanitizeGraph,
  stripEditorSamplesFromGraph,
  type ChatbotFlowExportDocument,
} from './flowPortability.js';
import { extractWebhookInFromGraph } from './flowWebhookIn.js';
import { resolveKeywordList, type StartTriggerKeyword } from './flowStartTrigger.js';
import { parseStartGuardConfig } from './flowStartGuards.js';

export type { ChatbotFlowGraph, GraphValidationIssue, ChatbotFlowExportDocument };

export type ChatbotFlowStatus = 'draft' | 'active' | 'archived';
export type ChatbotFlowPublishState = 'draft' | 'published' | 'outdated' | 'archived';

export type ChatbotFlowVersionRow = {
  id: string;
  flow_id: string;
  tenant_id: string;
  version: number;
  graph_json: ChatbotFlowGraph;
  published_by: string | null;
  published_at: string;
};

export type ChatbotFlowRow = {
  id: string;
  tenant_id: string;
  name: string;
  status: ChatbotFlowStatus;
  draft_graph: ChatbotFlowGraph;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  published_version_id: string | null;
  published_version: number | null;
  publish_state: ChatbotFlowPublishState;
};

const DEFAULT_STUB_GRAPH: ChatbotFlowGraph = {
  nodes: [
    {
      id: 'start',
      type: 'start',
      position: { x: 80, y: 160 },
      data: {
        label: 'Início',
        trigger: { type: 'first_message' },
        dm_only: true,
      },
    },
  ],
  edges: [],
};

function normalizeGraph(raw: unknown): ChatbotFlowGraph {
  if (!raw || typeof raw !== 'object') return { nodes: [], edges: [] };
  const g = raw as Record<string, unknown>;
  return {
    nodes: Array.isArray(g.nodes) ? g.nodes : [],
    edges: Array.isArray(g.edges) ? g.edges : [],
  };
}

function computePublishState(opts: {
  status: ChatbotFlowStatus;
  publishedVersion: number | null;
  draftEqualsPublished: boolean | null;
}): ChatbotFlowPublishState {
  if (opts.status === 'archived') return 'archived';
  if (opts.publishedVersion == null) return 'draft';
  if (opts.status !== 'active') return 'draft';
  if (opts.draftEqualsPublished === false) return 'outdated';
  return 'published';
}

function mapRow(r: Record<string, unknown>): ChatbotFlowRow {
  const status = r.status as ChatbotFlowStatus;
  const publishedVersion =
    r.published_version != null && r.published_version !== ''
      ? Number(r.published_version)
      : null;
  const draftEquals =
    r.draft_equals_published == null ? null : r.draft_equals_published === true;
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    name: String(r.name),
    status,
    draft_graph: normalizeGraph(r.draft_graph),
    created_by: r.created_by != null ? String(r.created_by) : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    archived_at: r.archived_at != null ? String(r.archived_at) : null,
    published_version_id:
      r.published_version_id != null ? String(r.published_version_id) : null,
    published_version: Number.isFinite(publishedVersion) ? publishedVersion : null,
    publish_state: computePublishState({
      status,
      publishedVersion: Number.isFinite(publishedVersion) ? publishedVersion : null,
      draftEqualsPublished: draftEquals,
    }),
  };
}

const FLOW_SELECT = `
  SELECT f.id, f.tenant_id, f.name, f.status, f.draft_graph, f.created_by,
         f.created_at::text, f.updated_at::text, f.archived_at::text,
         f.published_version_id,
         v.version AS published_version,
         CASE
           WHEN v.id IS NULL THEN NULL
           WHEN f.draft_graph = v.graph_json THEN true
           ELSE false
         END AS draft_equals_published
  FROM chatbot_flows f
  LEFT JOIN chatbot_flow_versions v ON v.id = f.published_version_id
`;

export async function listChatbotFlows(
  tenantId: string,
  opts: { includeArchived?: boolean } = {}
): Promise<ChatbotFlowRow[]> {
  const includeArchived = opts.includeArchived === true;
  const r = await pool.query(
    `${FLOW_SELECT}
     WHERE f.tenant_id = $1::uuid
       AND ($2::boolean OR f.status IS DISTINCT FROM 'archived')
     ORDER BY f.updated_at DESC`,
    [tenantId, includeArchived]
  );
  return r.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function getChatbotFlowById(
  tenantId: string,
  id: string
): Promise<ChatbotFlowRow | null> {
  const r = await pool.query(
    `${FLOW_SELECT}
     WHERE f.tenant_id = $1::uuid AND f.id = $2::uuid
     LIMIT 1`,
    [tenantId, id]
  );
  const row = r.rows[0];
  return row ? mapRow(row as Record<string, unknown>) : null;
}

export async function createChatbotFlow(opts: {
  tenantId: string;
  name: string;
  createdBy: string | null;
}): Promise<ChatbotFlowRow> {
  const name = opts.name.trim();
  if (!name) throw new Error('Nome é obrigatório');
  const r = await pool.query(
    `INSERT INTO chatbot_flows (tenant_id, name, status, draft_graph, created_by)
     VALUES ($1::uuid, $2, 'draft', $3::jsonb, $4::uuid)
     RETURNING id`,
    [opts.tenantId, name.slice(0, 200), JSON.stringify(DEFAULT_STUB_GRAPH), opts.createdBy]
  );
  const id = String(r.rows[0].id);
  const flow = await getChatbotFlowById(opts.tenantId, id);
  if (!flow) throw new Error('Falha ao criar flow');
  return flow;
}

export async function updateChatbotFlow(opts: {
  tenantId: string;
  id: string;
  name?: string;
  draft_graph?: ChatbotFlowGraph;
}): Promise<ChatbotFlowRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [opts.tenantId, opts.id];
  let i = 3;

  if (opts.name !== undefined) {
    const name = opts.name.trim();
    if (!name) throw new Error('Nome é obrigatório');
    sets.push(`name = $${i++}`);
    params.push(name.slice(0, 200));
  }
  if (opts.draft_graph !== undefined) {
    const graph = normalizeGraph(opts.draft_graph);
    sets.push(`draft_graph = $${i++}::jsonb`);
    params.push(JSON.stringify(graph));
  }
  if (sets.length === 0) {
    return getChatbotFlowById(opts.tenantId, opts.id);
  }

  const r = await pool.query(
    `UPDATE chatbot_flows
     SET ${sets.join(', ')}
     WHERE tenant_id = $1::uuid AND id = $2::uuid AND status IS DISTINCT FROM 'archived'
     RETURNING id`,
    params
  );
  if (!r.rows[0]) return null;
  return getChatbotFlowById(opts.tenantId, opts.id);
}

export async function archiveChatbotFlow(
  tenantId: string,
  id: string
): Promise<ChatbotFlowRow | null> {
  const r = await pool.query(
    `UPDATE chatbot_flows
     SET status = 'archived', archived_at = now()
     WHERE tenant_id = $1::uuid AND id = $2::uuid AND status IS DISTINCT FROM 'archived'
     RETURNING id`,
    [tenantId, id]
  );
  if (!r.rows[0]) return null;
  return getChatbotFlowById(tenantId, id);
}

export class PublishValidationError extends Error {
  issues: GraphValidationIssue[];
  constructor(issues: GraphValidationIssue[]) {
    super(issues[0]?.message || 'Grafo inválido para publicação');
    this.name = 'PublishValidationError';
    this.issues = issues;
  }
}

function keywordsFromGraph(graph: ChatbotFlowGraph): string[] {
  const start = (graph.nodes || []).find(
    (n) => n && typeof n === 'object' && (n as { type?: string }).type === 'start'
  ) as { data?: Record<string, unknown> } | undefined;
  const trigger = start?.data?.trigger;
  if (!trigger || typeof trigger !== 'object') return [];
  const t = trigger as StartTriggerKeyword;
  if (t.type !== 'keyword') return [];
  return resolveKeywordList(t);
}

/** S24 D24.1 — aviso (não bloqueia) se keyword overlap com outro flow publicado. */
async function collectKeywordOverlapWarnings(opts: {
  client: PoolClient;
  tenantId: string;
  flowId: string;
  draft: ChatbotFlowGraph;
}): Promise<string[]> {
  const mine = keywordsFromGraph(opts.draft);
  if (mine.length === 0) return [];
  const others = await opts.client.query<{
    id: string;
    name: string;
    graph_json: unknown;
  }>(
    `SELECT f.id, f.name, v.graph_json
     FROM chatbot_flows f
     INNER JOIN chatbot_flow_versions v ON v.id = f.published_version_id
     WHERE f.tenant_id = $1::uuid
       AND f.status = 'active'
       AND f.published_version_id IS NOT NULL
       AND f.id <> $2::uuid`,
    [opts.tenantId, opts.flowId]
  );
  const warnings: string[] = [];
  const mySet = new Set(mine);
  const myPriority = parseStartGuardConfig(
    (
      (opts.draft.nodes || []).find(
        (n) => n && typeof n === 'object' && (n as { type?: string }).type === 'start'
      ) as { data?: Record<string, unknown> } | undefined
    )?.data
  ).priority;

  for (const row of others.rows) {
    const g = normalizeGraph(row.graph_json);
    const theirs = keywordsFromGraph(g);
    const overlap = theirs.filter((k) => mySet.has(k));
    if (overlap.length === 0) continue;
    const otherPriority = parseStartGuardConfig(
      (
        (g.nodes || []).find(
          (n) => n && typeof n === 'object' && (n as { type?: string }).type === 'start'
        ) as { data?: Record<string, unknown> } | undefined
      )?.data
    ).priority;
    warnings.push(
      `Keyword(s) em comum com "${row.name}" (${overlap.join(', ')}). ` +
        `Prioridade deste flow=${myPriority}, outro=${otherPriority} — o maior vence no runtime.`
    );
  }
  return warnings;
}

export async function publishChatbotFlow(opts: {
  tenantId: string;
  id: string;
  publishedBy: string | null;
}): Promise<{
  flow: ChatbotFlowRow;
  version: ChatbotFlowVersionRow;
  warnings: string[];
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const flowRes = await client.query(
      `SELECT id, tenant_id, name, status, draft_graph, published_version_id
       FROM chatbot_flows
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       FOR UPDATE`,
      [opts.tenantId, opts.id]
    );
    const row = flowRes.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return Promise.reject(Object.assign(new Error('Flow não encontrado'), { status: 404 }));
    }
    if (row.status === 'archived') {
      await client.query('ROLLBACK');
      return Promise.reject(Object.assign(new Error('Flow arquivado'), { status: 400 }));
    }

    const draft = stripEditorSamplesFromGraph(normalizeGraph(row.draft_graph));
    const validation = validateGraphForPublish(draft);
    if (!validation.ok) {
      await client.query('ROLLBACK');
      throw new PublishValidationError(validation.issues);
    }

    const warnings = await collectKeywordOverlapWarnings({
      client,
      tenantId: opts.tenantId,
      flowId: opts.id,
      draft,
    });

    const verRes = await client.query(
      `SELECT COALESCE(MAX(version), 0)::int AS max_version
       FROM chatbot_flow_versions
       WHERE flow_id = $1::uuid`,
      [opts.id]
    );
    const nextVersion = Number(verRes.rows[0].max_version) + 1;

    const insert = await client.query(
      `INSERT INTO chatbot_flow_versions
         (flow_id, tenant_id, version, graph_json, published_by)
       VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::uuid)
       RETURNING id, flow_id, tenant_id, version, graph_json, published_by,
                 published_at::text`,
      [
        opts.id,
        opts.tenantId,
        nextVersion,
        JSON.stringify(draft),
        opts.publishedBy,
      ]
    );
    const v = insert.rows[0] as Record<string, unknown>;
    const webhookIn = extractWebhookInFromGraph(draft);
    await client.query(
      `UPDATE chatbot_flows
       SET status = 'active',
           published_version_id = $3::uuid,
           archived_at = NULL,
           inbound_webhook_token = $4
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [opts.tenantId, opts.id, v.id, webhookIn?.token ?? null]
    );
    await client.query('COMMIT');

    const flow = await getChatbotFlowById(opts.tenantId, opts.id);
    if (!flow) throw new Error('Flow não encontrado após publicar');
    return {
      flow,
      version: {
        id: String(v.id),
        flow_id: String(v.flow_id),
        tenant_id: String(v.tenant_id),
        version: Number(v.version),
        graph_json: normalizeGraph(v.graph_json),
        published_by: v.published_by != null ? String(v.published_by) : null,
        published_at: String(v.published_at),
      },
      warnings,
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

/** Volta status para draft; versões publicadas permanecem intactas. */
export async function revertChatbotFlowToDraft(
  tenantId: string,
  id: string
): Promise<ChatbotFlowRow | null> {
  const r = await pool.query(
    `UPDATE chatbot_flows
     SET status = 'draft'
     WHERE tenant_id = $1::uuid AND id = $2::uuid AND status IS DISTINCT FROM 'archived'
     RETURNING id`,
    [tenantId, id]
  );
  if (!r.rows[0]) return null;
  return getChatbotFlowById(tenantId, id);
}

export async function getPublishedVersionSnapshot(
  tenantId: string,
  flowId: string,
  version: number
): Promise<ChatbotFlowVersionRow | null> {
  const r = await pool.query(
    `SELECT id, flow_id, tenant_id, version, graph_json, published_by, published_at::text
     FROM chatbot_flow_versions
     WHERE tenant_id = $1::uuid AND flow_id = $2::uuid AND version = $3
     LIMIT 1`,
    [tenantId, flowId, version]
  );
  const v = r.rows[0] as Record<string, unknown> | undefined;
  if (!v) return null;
  return {
    id: String(v.id),
    flow_id: String(v.flow_id),
    tenant_id: String(v.tenant_id),
    version: Number(v.version),
    graph_json: normalizeGraph(v.graph_json),
    published_by: v.published_by != null ? String(v.published_by) : null,
    published_at: String(v.published_at),
  };
}

/** Lista versões publicadas (mais recente primeiro), sem graph completo. */
export async function listChatbotFlowVersions(
  tenantId: string,
  flowId: string
): Promise<
  Array<{
    id: string;
    version: number;
    published_at: string;
    published_by: string | null;
    is_current: boolean;
  }>
> {
  const flow = await getChatbotFlowById(tenantId, flowId);
  if (!flow) return [];
  const r = await pool.query(
    `SELECT id, version, published_by, published_at::text
     FROM chatbot_flow_versions
     WHERE tenant_id = $1::uuid AND flow_id = $2::uuid
     ORDER BY version DESC
     LIMIT 100`,
    [tenantId, flowId]
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    version: Number(row.version),
    published_at: String(row.published_at),
    published_by: row.published_by != null ? String(row.published_by) : null,
    is_current: flow.published_version_id === String(row.id),
  }));
}

/**
 * Copia o graph de uma versão publicada para o draft atual.
 * Não altera a versão publicada ativa (usuário precisa republicar se quiser).
 */
export async function restoreChatbotFlowVersionToDraft(
  tenantId: string,
  flowId: string,
  version: number
): Promise<{ flow: ChatbotFlowRow; restored_version: number } | null> {
  const snap = await getPublishedVersionSnapshot(tenantId, flowId, version);
  if (!snap) return null;
  const r = await pool.query(
    `UPDATE chatbot_flows
     SET draft_graph = $3::jsonb,
         updated_at = NOW()
     WHERE tenant_id = $1::uuid AND id = $2::uuid AND status IS DISTINCT FROM 'archived'
     RETURNING id`,
    [tenantId, flowId, JSON.stringify(snap.graph_json)]
  );
  if (!r.rows[0]) return null;
  const flow = await getChatbotFlowById(tenantId, flowId);
  if (!flow) return null;
  return { flow, restored_version: version };
}

/** Exclui snapshot de versão. Bloqueia a versão atualmente em produção. */
export async function deleteChatbotFlowVersion(
  tenantId: string,
  flowId: string,
  version: number
): Promise<{ deleted: true } | null> {
  const flow = await getChatbotFlowById(tenantId, flowId);
  if (!flow) return null;
  const snap = await getPublishedVersionSnapshot(tenantId, flowId, version);
  if (!snap) return null;
  if (flow.published_version_id === snap.id) {
    throw Object.assign(new Error('Não é possível excluir a versão em produção'), { status: 400 });
  }
  const r = await pool.query(
    `DELETE FROM chatbot_flow_versions
     WHERE tenant_id = $1::uuid AND flow_id = $2::uuid AND version = $3
     RETURNING id`,
    [tenantId, flowId, version]
  );
  if (!r.rows[0]) return null;
  return { deleted: true };
}

export async function exportChatbotFlowDocument(
  tenantId: string,
  id: string,
  opts: { source?: 'draft' | 'published' } = {}
): Promise<ChatbotFlowExportDocument | null> {
  const flow = await getChatbotFlowById(tenantId, id);
  if (!flow) return null;

  let graph = flow.draft_graph;
  if (opts.source === 'published') {
    if (!flow.published_version_id) {
      throw Object.assign(new Error('Flow sem versão publicada'), { status: 400 });
    }
    const v = await pool.query(
      `SELECT graph_json FROM chatbot_flow_versions
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND flow_id = $3::uuid
       LIMIT 1`,
      [flow.published_version_id, tenantId, id]
    );
    if (!v.rows[0]) {
      throw Object.assign(new Error('Versão publicada não encontrada'), { status: 404 });
    }
    graph = normalizeGraph(v.rows[0].graph_json);
  }

  return buildExportDocument({ name: flow.name, graph });
}

export async function duplicateChatbotFlow(opts: {
  tenantId: string;
  id: string;
  createdBy: string | null;
  usePublishedAsDraft?: boolean;
  /** Copia o graph de uma versão específica (tem prioridade sobre usePublishedAsDraft). */
  fromVersion?: number;
}): Promise<ChatbotFlowRow | null> {
  const source = await getChatbotFlowById(opts.tenantId, opts.id);
  if (!source) return null;

  let graph = source.draft_graph;
  let nameSuffix = '(cópia)';
  if (opts.fromVersion != null && Number.isFinite(opts.fromVersion)) {
    const snap = await getPublishedVersionSnapshot(opts.tenantId, opts.id, opts.fromVersion);
    if (!snap) {
      throw Object.assign(new Error('Versão não encontrada'), { status: 404 });
    }
    graph = snap.graph_json;
    nameSuffix = `(cópia v${opts.fromVersion})`;
  } else if (opts.usePublishedAsDraft) {
    if (!source.published_version_id) {
      throw Object.assign(new Error('Flow sem versão publicada para copiar'), { status: 400 });
    }
    const v = await pool.query(
      `SELECT graph_json FROM chatbot_flow_versions
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND flow_id = $3::uuid
       LIMIT 1`,
      [source.published_version_id, opts.tenantId, opts.id]
    );
    if (!v.rows[0]) {
      throw Object.assign(new Error('Versão publicada não encontrada'), { status: 404 });
    }
    graph = normalizeGraph(v.rows[0].graph_json);
  }

  const clean = sanitizeGraph(graph);
  const name = `${source.name} ${nameSuffix}`.slice(0, 200);

  const r = await pool.query(
    `INSERT INTO chatbot_flows (tenant_id, name, status, draft_graph, created_by)
     VALUES ($1::uuid, $2, 'draft', $3::jsonb, $4::uuid)
     RETURNING id`,
    [opts.tenantId, name, JSON.stringify(clean), opts.createdBy]
  );
  return getChatbotFlowById(opts.tenantId, String(r.rows[0].id));
}

export async function importChatbotFlow(opts: {
  tenantId: string;
  createdBy: string | null;
  document: unknown;
  mode: 'create' | 'replace_draft';
  targetFlowId?: string;
  nameOverride?: string;
}): Promise<{
  flow: ChatbotFlowRow;
  preview: { name: string; nodeCount: number; edgeCount: number };
  sourceFormat?: 'painelcrm.chatbot_flow' | 'chatbot.flow_data';
  report?: import('./flowForeignImport.js').ForeignImportReport;
}> {
  const resolved = resolveImportDocument(opts.document);
  if (!resolved.ok) {
    throw Object.assign(new Error(resolved.error), { status: 400 });
  }

  if (resolved.createOnly && opts.mode === 'replace_draft') {
    throw Object.assign(
      new Error('Import de formato externo só cria flow novo (não substitui draft)'),
      { status: 400 }
    );
  }

  const name = (opts.nameOverride?.trim() || resolved.doc.flow.name).slice(0, 200);
  const graph = resolved.doc.graph;

  if (opts.mode === 'create' || resolved.createOnly) {
    const r = await pool.query(
      `INSERT INTO chatbot_flows (tenant_id, name, status, draft_graph, created_by)
       VALUES ($1::uuid, $2, 'draft', $3::jsonb, $4::uuid)
       RETURNING id`,
      [opts.tenantId, name, JSON.stringify(graph), opts.createdBy]
    );
    const flow = await getChatbotFlowById(opts.tenantId, String(r.rows[0].id));
    if (!flow) throw new Error('Falha ao importar flow');
    return {
      flow,
      preview: resolved.preview,
      sourceFormat: resolved.sourceFormat,
      report: resolved.report,
    };
  }

  const targetId = opts.targetFlowId?.trim();
  if (!targetId) {
    throw Object.assign(new Error('target_flow_id obrigatório para substituir draft'), {
      status: 400,
    });
  }

  const updated = await updateChatbotFlow({
    tenantId: opts.tenantId,
    id: targetId,
    name,
    draft_graph: graph,
  });
  if (!updated) {
    throw Object.assign(new Error('Flow alvo não encontrado ou arquivado'), { status: 404 });
  }
  return {
    flow: updated,
    preview: resolved.preview,
    sourceFormat: resolved.sourceFormat,
    report: resolved.report,
  };
}

