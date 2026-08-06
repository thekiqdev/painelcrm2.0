import { apiClient } from '@/integrations/api/client';

export type ChatbotFlowStatus = 'draft' | 'active' | 'archived';
export type ChatbotFlowPublishState = 'draft' | 'published' | 'outdated' | 'archived';

export type ChatbotFlowGraph = {
  nodes: unknown[];
  edges: unknown[];
};

export type GraphValidationIssue = {
  code: string;
  message: string;
  nodeIds?: string[];
  edgeIds?: string[];
};

export type ChatbotFlow = {
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

export type ChatbotFlowVersion = {
  id: string;
  flow_id: string;
  tenant_id: string;
  version: number;
  graph_json: ChatbotFlowGraph;
  published_by: string | null;
  published_at: string;
};

function throwIfError<T>(res: { data?: T; error?: string }): T {
  if (res.error) throw new Error(res.error);
  if (res.data == null) throw new Error('Resposta vazia');
  return res.data;
}

export async function listChatbotFlows(opts?: { includeArchived?: boolean }): Promise<ChatbotFlow[]> {
  const q = opts?.includeArchived ? '?include_archived=1' : '';
  const res = await apiClient.get<{ flows: ChatbotFlow[] }>(`/api/chatbot-flows${q}`);
  return throwIfError(res).flows ?? [];
}

export async function getChatbotFlow(id: string): Promise<ChatbotFlow> {
  const res = await apiClient.get<{ flow: ChatbotFlow }>(`/api/chatbot-flows/${encodeURIComponent(id)}`);
  return throwIfError(res).flow;
}

export async function createChatbotFlow(name: string): Promise<ChatbotFlow> {
  const res = await apiClient.post<{ flow: ChatbotFlow }>('/api/chatbot-flows', { name });
  return throwIfError(res).flow;
}

export async function updateChatbotFlow(
  id: string,
  body: { name?: string; draft_graph?: ChatbotFlowGraph }
): Promise<ChatbotFlow> {
  const res = await apiClient.patch<{ flow: ChatbotFlow }>(
    `/api/chatbot-flows/${encodeURIComponent(id)}`,
    body
  );
  return throwIfError(res).flow;
}

export async function archiveChatbotFlow(id: string): Promise<ChatbotFlow> {
  const res = await apiClient.post<{ flow: ChatbotFlow }>(
    `/api/chatbot-flows/${encodeURIComponent(id)}/archive`,
    {}
  );
  return throwIfError(res).flow;
}

export async function publishChatbotFlow(
  id: string
): Promise<{ flow: ChatbotFlow; version: ChatbotFlowVersion; warnings?: string[] }> {
  const res = await apiClient.post<{
    flow: ChatbotFlow;
    version: ChatbotFlowVersion;
    warnings?: string[];
  }>(`/api/chatbot-flows/${encodeURIComponent(id)}/publish`, {});
  if (res.error) {
    const err = new Error(res.error) as Error & { issues?: GraphValidationIssue[] };
    const details = res.details as { issues?: GraphValidationIssue[] } | undefined;
    if (Array.isArray(details?.issues)) err.issues = details.issues;
    throw err;
  }
  if (res.data == null) throw new Error('Resposta vazia');
  return res.data;
}

export type ChatbotFlowVersionSummary = {
  id: string;
  version: number;
  published_at: string;
  published_by: string | null;
  is_current: boolean;
};

export async function listChatbotFlowVersions(id: string): Promise<ChatbotFlowVersionSummary[]> {
  const res = await apiClient.get<{ versions: ChatbotFlowVersionSummary[] }>(
    `/api/chatbot-flows/${encodeURIComponent(id)}/versions`
  );
  return throwIfError(res).versions ?? [];
}

/** Restaura o graph de uma versão publicada no rascunho atual. */
export async function restoreChatbotFlowVersion(
  id: string,
  version: number
): Promise<{ flow: ChatbotFlow; restored_version: number }> {
  const res = await apiClient.post<{ flow: ChatbotFlow; restored_version: number }>(
    `/api/chatbot-flows/${encodeURIComponent(id)}/versions/${encodeURIComponent(String(version))}/restore`,
    {}
  );
  return throwIfError(res);
}

export async function deleteChatbotFlowVersion(id: string, version: number): Promise<void> {
  const res = await apiClient.delete<{ ok: boolean }>(
    `/api/chatbot-flows/${encodeURIComponent(id)}/versions/${encodeURIComponent(String(version))}`
  );
  throwIfError(res);
}

export async function revertChatbotFlowToDraft(id: string): Promise<ChatbotFlow> {
  const res = await apiClient.post<{ flow: ChatbotFlow }>(
    `/api/chatbot-flows/${encodeURIComponent(id)}/revert-draft`,
    {}
  );
  return throwIfError(res).flow;
}

export async function exportChatbotFlow(
  id: string,
  opts?: { source?: 'draft' | 'published' }
): Promise<unknown> {
  const q = opts?.source === 'published' ? '?source=published' : '';
  const res = await apiClient.get<{ document: unknown }>(
    `/api/chatbot-flows/${encodeURIComponent(id)}/export${q}`
  );
  return throwIfError(res).document;
}

export async function duplicateChatbotFlow(
  id: string,
  opts?: { usePublishedAsDraft?: boolean; fromVersion?: number }
): Promise<ChatbotFlow> {
  const res = await apiClient.post<{ flow: ChatbotFlow }>(
    `/api/chatbot-flows/${encodeURIComponent(id)}/duplicate`,
    {
      use_published_as_draft: opts?.usePublishedAsDraft === true,
      from_version: opts?.fromVersion,
    }
  );
  return throwIfError(res).flow;
}

export type ChatbotFlowIntegrationTestInput = {
  kind: 'http_request' | 'webhook_out';
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Array<{ key: string; value: string }>;
  body?: string;
  timeout_ms?: number;
  secret?: string;
  include_session_vars?: boolean;
  payload_mode?: 'envelope' | 'envelope_plus' | 'custom';
  body_template?: string;
  variables?: Record<string, string>;
  response_variable?: string;
  status_variable?: string;
  response_map?: Array<{ path: string; variable: string }>;
};

export type ChatbotFlowIntegrationTestResult = {
  ok: boolean;
  status: number;
  body_text: string;
  body_json: unknown;
  mapped: Record<string, string>;
  error: string | null;
  tested_at: string;
};

/** Teste real de HTTP/webhook no editor (S14) — backend aplica SSRF. */
export async function testChatbotFlowIntegration(
  input: ChatbotFlowIntegrationTestInput
): Promise<ChatbotFlowIntegrationTestResult> {
  const res = await apiClient.post<ChatbotFlowIntegrationTestResult>(
    '/api/chatbot-flows/test-integration',
    input
  );
  return throwIfError(res);
}

export type WebhookInListenStartResult = {
  listenId: string;
  expiresAt: string;
  ingestPath: string;
  ingestUrl: string;
  ttlMs: number;
};

export type WebhookInListenPollResult =
  | { status: 'waiting' }
  | {
      status: 'received';
      payload: unknown;
      received_at: string;
      content_type: string | null;
    };

/** S27.1 — inicia janela de listen do webhook_in. */
export async function startWebhookInListen(
  flowId: string,
  body?: { ttl_ms?: number }
): Promise<WebhookInListenStartResult> {
  const res = await apiClient.post<WebhookInListenStartResult>(
    `/api/chatbot-flows/${encodeURIComponent(flowId)}/webhook-in-listen`,
    body || {}
  );
  return throwIfError(res);
}

/** S27.1 — poll/long-poll do payload capturado. */
export async function pollWebhookInListen(
  flowId: string,
  listenId: string,
  opts?: { wait_ms?: number }
): Promise<WebhookInListenPollResult> {
  const wait = opts?.wait_ms ?? 25000;
  const res = await apiClient.get<WebhookInListenPollResult>(
    `/api/chatbot-flows/${encodeURIComponent(flowId)}/webhook-in-listen/${encodeURIComponent(listenId)}?wait_ms=${wait}`
  );
  return throwIfError(res);
}

/** S27.1 — cancela listen. */
export async function cancelWebhookInListen(flowId: string, listenId: string): Promise<void> {
  const res = await apiClient.delete<{ ok: true }>(
    `/api/chatbot-flows/${encodeURIComponent(flowId)}/webhook-in-listen/${encodeURIComponent(listenId)}`
  );
  throwIfError(res);
}

export async function importChatbotFlow(body: {
  document: unknown;
  mode?: 'create' | 'replace_draft';
  target_flow_id?: string;
  name?: string;
}): Promise<{
  flow: ChatbotFlow;
  preview: { name: string; nodeCount: number; edgeCount: number };
  sourceFormat?: 'painelcrm.chatbot_flow' | 'chatbot.flow_data';
  report?: ForeignImportReport;
}> {
  const res = await apiClient.post<{
    flow: ChatbotFlow;
    preview: { name: string; nodeCount: number; edgeCount: number };
    sourceFormat?: 'painelcrm.chatbot_flow' | 'chatbot.flow_data';
    report?: ForeignImportReport;
  }>('/api/chatbot-flows/import', {
    document: body.document,
    mode: body.mode ?? 'create',
    target_flow_id: body.target_flow_id,
    name: body.name,
  });
  return throwIfError(res);
}

export type ForeignImportReport = {
  format: string;
  name: string;
  mapped: Array<{ id: string; fromType: string; toType?: string; reason?: string }>;
  omitted: Array<{ id: string; fromType: string; reason?: string }>;
  needsRelink: Array<{ id: string; fromType: string; toType?: string; fields?: string[]; reason?: string }>;
  brokenEdges: Array<{ id: string; reason: string }>;
  secretsStripped: number;
  nodeCount: number;
  edgeCount: number;
};

export type ChatbotFlowImportPreview = {
  preview: { name: string; nodeCount: number; edgeCount: number };
  document: unknown;
  sourceFormat: 'painelcrm.chatbot_flow' | 'chatbot.flow_data';
  createOnly: boolean;
  report: ForeignImportReport | null;
};

/** Preview de import (nativo ou chatbot.flow_data) sem persistir. */
export async function previewChatbotFlowImport(document: unknown): Promise<ChatbotFlowImportPreview> {
  const res = await apiClient.post<ChatbotFlowImportPreview>('/api/chatbot-flows/import/preview', {
    document,
  });
  return throwIfError(res);
}

/** S23 — inicia flow publicado na conversa (manual). */
export async function startChatbotFlowSession(body: {
  conversation_id: string;
  flow_id?: string | null;
  force?: boolean;
}): Promise<{ ok: true; session_id: string; flow_id: string }> {
  const res = await apiClient.post<{ ok: true; session_id: string; flow_id: string }>(
    '/api/chatbot-flows/sessions/start',
    body
  );
  return throwIfError(res);
}
