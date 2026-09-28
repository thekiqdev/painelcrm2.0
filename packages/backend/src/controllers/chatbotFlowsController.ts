import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import {
  archiveChatbotFlow,
  createChatbotFlow,
  duplicateChatbotFlow,
  exportChatbotFlowDocument,
  getChatbotFlowById,
  importChatbotFlow,
  listChatbotFlows,
  publishChatbotFlow,
  PublishValidationError,
  revertChatbotFlowToDraft,
  listChatbotFlowVersions,
  restoreChatbotFlowVersionToDraft,
  deleteChatbotFlowVersion,
  updateChatbotFlow,
} from '../services/chatbotFlows/chatbotFlowsService.js';
import { resolveImportDocument } from '../services/chatbotFlows/flowPortability.js';
import {
  executeFlowHttpRequest,
  executeFlowWebhookOut,
} from '../services/chatbotFlows/flowHttpActions.js';
import { buildMockFlowVariableSeedForTest } from '../services/chatbotFlows/flowHttpTestSeed.js';

const MODULE = 'chatbot_flows' as const;

function tenantIdOrThrow(req: AuthRequest): string {
  const tid = req.tenantId?.trim();
  if (!tid) {
    const err = new Error('Tenant obrigatório');
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return tid;
}

function respondPerm(res: Response, error: unknown): boolean {
  if (error instanceof ModulePermissionError) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  return false;
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  draft_graph: z
    .object({
      nodes: z.array(z.unknown()),
      edges: z.array(z.unknown()),
    })
    .optional(),
});

export async function listChatbotFlowsHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'view', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const includeArchived =
      req.query.include_archived === '1' || req.query.include_archived === 'true';
    const flows = await listChatbotFlows(tenantId, { includeArchived });
    return res.json({ flows });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao listar flows';
    return res.status(status === 403 ? 403 : status).json({ error: message });
  }
}

export async function getChatbotFlowHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'view', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const id = String(req.params.id || '').trim();
    const flow = await getChatbotFlowById(tenantId, id);
    if (!flow) return res.status(404).json({ error: 'Flow não encontrado' });
    return res.json({ flow });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao obter flow';
    return res.status(status === 403 ? 403 : status).json({ error: message });
  }
}

export async function createChatbotFlowHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'create', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
    }
    const flow = await createChatbotFlow({
      tenantId,
      name: parsed.data.name,
      createdBy: userId,
    });
    return res.status(201).json({ flow });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao criar flow';
    return res.status(status === 403 ? 403 : status).json({ error: message });
  }
}

export async function patchChatbotFlowHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const id = String(req.params.id || '').trim();
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
    }
    const flow = await updateChatbotFlow({
      tenantId,
      id,
      name: parsed.data.name,
      draft_graph: parsed.data.draft_graph,
    });
    if (!flow) return res.status(404).json({ error: 'Flow não encontrado ou arquivado' });
    return res.json({ flow });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao atualizar flow';
    return res.status(status === 403 ? 403 : status).json({ error: message });
  }
}

export async function archiveChatbotFlowHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const id = String(req.params.id || '').trim();
    const flow = await archiveChatbotFlow(tenantId, id);
    if (!flow) return res.status(404).json({ error: 'Flow não encontrado ou já arquivado' });
    return res.json({ flow });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao arquivar flow';
    return res.status(status === 403 ? 403 : status).json({ error: message });
  }
}

export async function publishChatbotFlowHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const id = String(req.params.id || '').trim();
    const result = await publishChatbotFlow({
      tenantId,
      id,
      publishedBy: userId,
    });
    return res.json(result);
  } catch (e) {
    if (respondPerm(res, e)) return;
    if (e instanceof PublishValidationError) {
      return res.status(400).json({ error: e.message, issues: e.issues });
    }
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao publicar flow';
    return res.status(status === 404 ? 404 : status === 400 ? 400 : status).json({ error: message });
  }
}

export async function revertChatbotFlowToDraftHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const id = String(req.params.id || '').trim();
    const flow = await revertChatbotFlowToDraft(tenantId, id);
    if (!flow) return res.status(404).json({ error: 'Flow não encontrado ou arquivado' });
    return res.json({ flow });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao voltar ao rascunho';
    return res.status(status === 403 ? 403 : status).json({ error: message });
  }
}

export async function listChatbotFlowVersionsHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'view', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const id = String(req.params.id || '').trim();
    const flow = await getChatbotFlowById(tenantId, id);
    if (!flow) return res.status(404).json({ error: 'Flow não encontrado' });
    const versions = await listChatbotFlowVersions(tenantId, id);
    return res.json({ versions, published_version: flow.published_version });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const message = e instanceof Error ? e.message : 'Erro ao listar versões';
    return res.status(500).json({ error: message });
  }
}

export async function restoreChatbotFlowVersionHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const id = String(req.params.id || '').trim();
    const version = Number(req.params.version);
    if (!Number.isFinite(version) || version < 1) {
      return res.status(400).json({ error: 'Versão inválida' });
    }
    const result = await restoreChatbotFlowVersionToDraft(tenantId, id, version);
    if (!result) return res.status(404).json({ error: 'Versão ou flow não encontrado' });
    return res.json({ flow: result.flow, restored_version: result.restored_version });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao restaurar versão';
    return res.status(status === 403 ? 403 : status).json({ error: message });
  }
}

export async function deleteChatbotFlowVersionHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const id = String(req.params.id || '').trim();
    const version = Number(req.params.version);
    if (!Number.isFinite(version) || version < 1) {
      return res.status(400).json({ error: 'Versão inválida' });
    }
    const result = await deleteChatbotFlowVersion(tenantId, id, version);
    if (!result) return res.status(404).json({ error: 'Versão ou flow não encontrado' });
    return res.json({ ok: true });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao excluir versão';
    return res.status(status === 400 ? 400 : status === 403 ? 403 : status).json({ error: message });
  }
}

export async function exportChatbotFlowHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'view', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const id = String(req.params.id || '').trim();
    const source = req.query.source === 'published' ? 'published' : 'draft';
    const doc = await exportChatbotFlowDocument(tenantId, id, { source });
    if (!doc) return res.status(404).json({ error: 'Flow não encontrado' });
    return res.json({ document: doc });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao exportar flow';
    return res.status(status === 400 ? 400 : status === 404 ? 404 : status).json({ error: message });
  }
}

export async function duplicateChatbotFlowHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'create', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const id = String(req.params.id || '').trim();
    const usePublished =
      req.body?.use_published_as_draft === true || req.body?.use_published_as_draft === '1';
    const fromVersionRaw = req.body?.from_version;
    const fromVersion =
      fromVersionRaw != null && fromVersionRaw !== ''
        ? Number(fromVersionRaw)
        : undefined;
    const flow = await duplicateChatbotFlow({
      tenantId,
      id,
      createdBy: userId,
      usePublishedAsDraft: usePublished,
      fromVersion:
        fromVersion != null && Number.isFinite(fromVersion) && fromVersion >= 1
          ? fromVersion
          : undefined,
    });
    if (!flow) return res.status(404).json({ error: 'Flow não encontrado' });
    return res.status(201).json({ flow });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao duplicar flow';
    return res.status(status === 400 ? 400 : status === 404 ? 404 : status).json({ error: message });
  }
}

const importSchema = z.object({
  document: z.unknown(),
  mode: z.enum(['create', 'replace_draft']).default('create'),
  target_flow_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
});

export async function importChatbotFlowHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    const mode = req.body?.mode === 'replace_draft' ? 'replace_draft' : 'create';
    await assertModulePermission(
      userId,
      MODULE,
      mode === 'create' ? 'create' : 'edit',
      undefined,
      req
    );
    const tenantId = tenantIdOrThrow(req);
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
    }
    const result = await importChatbotFlow({
      tenantId,
      createdBy: userId,
      document: parsed.data.document,
      mode: parsed.data.mode,
      targetFlowId: parsed.data.target_flow_id,
      nameOverride: parsed.data.name,
    });
    return res.status(mode === 'create' ? 201 : 200).json(result);
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao importar flow';
    return res.status(status === 400 ? 400 : status === 404 ? 404 : status).json({ error: message });
  }
}

/** Preview client-side helper: valida documento sem persistir (nativo ou estrangeiro S21). */
export async function previewImportChatbotFlowHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'view', undefined, req);
    const resolved = resolveImportDocument(req.body?.document ?? req.body);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });
    return res.json({
      preview: resolved.preview,
      document: resolved.doc,
      sourceFormat: resolved.sourceFormat,
      createOnly: resolved.createOnly,
      report: resolved.report ?? null,
    });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const message = e instanceof Error ? e.message : 'Erro ao validar import';
    return res.status(500).json({ error: message });
  }
}

const MAX_TEST_BODY_CHARS = 64_000;

const testIntegrationSchema = z.object({
  kind: z.enum(['http_request', 'webhook_out']),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  url: z.string().trim().min(1),
  headers: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .optional()
    .default([]),
  body: z.string().optional().default(''),
  timeout_ms: z.coerce.number().int().min(500).max(30000).optional().default(10000),
  secret: z.string().optional().default(''),
  include_session_vars: z.boolean().optional().default(true),
  payload_mode: z.enum(['envelope', 'envelope_plus', 'custom']).optional().default('envelope'),
  body_template: z.string().optional().default(''),
  variables: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  response_variable: z.string().optional(),
  status_variable: z.string().optional(),
  response_map: z
    .array(z.object({ path: z.string(), variable: z.string() }))
    .optional()
    .default([]),
});

function truncateBody(text: string): string {
  if (text.length <= MAX_TEST_BODY_CHARS) return text;
  return `${text.slice(0, MAX_TEST_BODY_CHARS)}\n…[truncado]`;
}

/**
 * Teste autenticado de HTTP / webhook out no editor (S14).
 * Não persiste; aplica SSRF/allowlist do runtime.
 */
export async function testChatbotFlowIntegrationHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);

    const parsed = testIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
    }
    const input = parsed.data;

    const seed = buildMockFlowVariableSeedForTest();
    const variables: Record<string, unknown> = { ...seed };
    if (input.variables) {
      for (const [k, v] of Object.entries(input.variables)) {
        if (v == null) continue;
        variables[k] = String(v);
      }
    }
    if (!variables['conversation.id']) variables['conversation.id'] = 'test-conversation-id';
    if (!variables.conversation_id) variables.conversation_id = 'test-conversation-id';

    const conversationId = String(variables.conversation_id || variables['conversation.id']);

    const result =
      input.kind === 'webhook_out'
        ? await executeFlowWebhookOut({
            url: input.url,
            method: input.method || 'POST',
            secret: input.secret,
            timeoutMs: input.timeout_ms,
            variables,
            conversationId,
            tenantId,
            includeSessionVars: input.include_session_vars,
            payloadMode: input.payload_mode,
            bodyTemplate: input.body_template,
            headers: input.headers,
          })
        : await executeFlowHttpRequest({
            method: input.method || 'GET',
            url: input.url,
            headers: input.headers,
            body: input.body,
            timeoutMs: input.timeout_ms,
            variables,
            responseVariable: input.response_variable,
            statusVariable: input.status_variable,
            responseMap: input.response_map,
          });

    return res.json({
      ok: result.ok,
      status: result.status,
      body_text: truncateBody(result.bodyText || ''),
      body_json: result.bodyJson,
      mapped: result.mapped,
      error: result.error || null,
      tested_at: new Date().toISOString(),
    });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const message = e instanceof Error ? e.message : 'Erro ao testar integração';
    return res.status(400).json({ error: message });
  }
}

const webhookInListenStartSchema = z.object({
  ttl_ms: z.coerce.number().int().min(5000).max(120000).optional(),
});

/** S27.1 — inicia janela de listen do webhook_in (sem runtime). */
export async function startWebhookInListenHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const flowId = String(req.params.id || '').trim();
    const flow = await getChatbotFlowById(tenantId, flowId);
    if (!flow) return res.status(404).json({ error: 'Flow não encontrado' });

    const parsed = webhookInListenStartSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
    }

    const { createWebhookInListenSession } = await import(
      '../services/chatbotFlows/flowWebhookInListen.js'
    );
    const session = createWebhookInListenSession({
      tenantId,
      flowId,
      ttlMs: parsed.data.ttl_ms,
    });
    return res.status(201).json(session);
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao iniciar listen';
    return res.status(status === 403 ? 403 : status).json({ error: message });
  }
}

/** S27.1 — poll/long-poll do payload capturado. */
export async function pollWebhookInListenHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const flowId = String(req.params.id || '').trim();
    const listenId = String(req.params.listenId || '').trim();
    const waitMs = Number(req.query.wait_ms);
    const flow = await getChatbotFlowById(tenantId, flowId);
    if (!flow) return res.status(404).json({ error: 'Flow não encontrado' });

    const { waitWebhookInListenPayload } = await import(
      '../services/chatbotFlows/flowWebhookInListen.js'
    );
    const result = await waitWebhookInListenPayload({
      tenantId,
      flowId,
      listenId,
      waitMs: Number.isFinite(waitMs) ? waitMs : 25_000,
    });

    if (result.status === 'not_found') {
      return res.status(404).json({ status: 'not_found', error: 'listen_nao_encontrado' });
    }
    if (result.status === 'forbidden') {
      return res.status(403).json({ status: 'forbidden', error: 'listen_proibido' });
    }
    if (result.status === 'expired') {
      return res.status(410).json({ status: 'expired', error: 'listen_expirado' });
    }
    if (result.status === 'waiting') {
      return res.json({ status: 'waiting' });
    }
    if (result.status === 'received') {
      return res.json({
        status: 'received',
        payload: result.payload,
        received_at: result.received_at,
        content_type: result.content_type,
      });
    }
    return res.status(500).json({ error: 'listen_status_desconhecido' });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const message = e instanceof Error ? e.message : 'Erro ao consultar listen';
    return res.status(500).json({ error: message });
  }
}

/** S27.1 — cancela janela de listen. */
export async function cancelWebhookInListenHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const flowId = String(req.params.id || '').trim();
    const listenId = String(req.params.listenId || '').trim();
    const { cancelWebhookInListenSession } = await import(
      '../services/chatbotFlows/flowWebhookInListen.js'
    );
    const ok = cancelWebhookInListenSession({ tenantId, flowId, listenId });
    if (!ok) return res.status(404).json({ error: 'listen_nao_encontrado' });
    return res.json({ ok: true });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const message = e instanceof Error ? e.message : 'Erro ao cancelar listen';
    return res.status(500).json({ error: message });
  }
}

/** S28 — estado da URL de amostra fixa (+ ensure token). */
export async function getWebhookInSampleHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const flowId = String(req.params.id || '').trim();
    const { getWebhookInSampleState } = await import(
      '../services/chatbotFlows/flowWebhookInSample.js'
    );
    const state = await getWebhookInSampleState({ tenantId, flowId });
    return res.json({
      sampleToken: state.sampleToken,
      ingestPath: state.ingestPath,
      ingestUrl: state.ingestUrl,
      payload: state.payload,
      captured_at: state.capturedAt,
    });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao obter sample';
    return res.status(status === 404 ? 404 : status).json({ error: message });
  }
}

/** S28 — rotaciona token de amostra (invalida URL antiga). */
export async function rotateWebhookInSampleHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'edit', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const flowId = String(req.params.id || '').trim();
    const { rotateWebhookInSampleToken } = await import(
      '../services/chatbotFlows/flowWebhookInSample.js'
    );
    const state = await rotateWebhookInSampleToken({ tenantId, flowId });
    return res.json({
      sampleToken: state.sampleToken,
      ingestPath: state.ingestPath,
      ingestUrl: state.ingestUrl,
      payload: state.payload,
      captured_at: state.capturedAt,
    });
  } catch (e) {
    if (respondPerm(res, e)) return;
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro ao rotacionar sample';
    return res.status(status === 404 ? 404 : status).json({ error: message });
  }
}

const manualStartSchema = z.object({
  conversation_id: z.string().uuid(),
  flow_id: z.string().uuid().optional().nullable(),
  force: z.boolean().optional().default(false),
});

/** S23 — iniciar flow publicado na conversa (manual). */
export async function startChatbotFlowSessionHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    await assertModulePermission(userId, MODULE, 'view', undefined, req);
    const tenantId = tenantIdOrThrow(req);
    const body = manualStartSchema.parse(req.body);

    const { isTenantAdmin } = await import('../utils/tenant.js');
    const { runChatbotFlowsRuntimeManualStart } = await import(
      '../services/chatbotFlows/chatbotFlowsRuntimeRunner.js'
    );
    const result = await runChatbotFlowsRuntimeManualStart({
      tenantId,
      actorUserId: userId,
      conversationId: body.conversation_id,
      flowId: body.flow_id,
      force: body.force === true,
      isTenantAdmin: (await isTenantAdmin(userId)) || req.user?.is_super_admin === true,
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(201).json({
      ok: true,
      session_id: result.sessionId,
      flow_id: result.flowId,
    });
  } catch (e) {
    if (respondPerm(res, e)) return;
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: e.errors });
    }
    const message = e instanceof Error ? e.message : 'Erro ao iniciar flow';
    return res.status(500).json({ error: message });
  }
}
