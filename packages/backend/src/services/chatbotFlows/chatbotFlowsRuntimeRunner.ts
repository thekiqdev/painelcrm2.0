/**
 * Runner S3 — bridge inbound WhatsApp → engine + sessões + outbound UazAPI.
 */
import { pool } from '../../utils/db.js';
import { tenantHasFeature } from '../featureFlagService.js';
import { isEditorOnlyNodeType } from './canvasAnnotations.js';
import {
  matchFlowTrigger,
  processInboundStep,
  type RuntimeGraph,
  type RuntimeSessionSnapshot,
} from './flowRuntimeEngine.js';

function normalizeGraph(raw: unknown): RuntimeGraph {
  if (!raw || typeof raw !== 'object') return { nodes: [], edges: [] };
  const g = raw as Record<string, unknown>;
  const nodes = Array.isArray(g.nodes)
    ? g.nodes
        .map((n) => {
          if (!n || typeof n !== 'object') return null;
          const item = n as Record<string, unknown>;
          if (typeof item.id !== 'string') return null;
          const type = typeof item.type === 'string' ? item.type : '';
          if (isEditorOnlyNodeType(type)) return null;
          return {
            id: item.id,
            type,
            data:
              item.data && typeof item.data === 'object'
                ? (item.data as Record<string, unknown>)
                : {},
          };
        })
        .filter(Boolean)
    : [];
  const nodeIds = new Set(
    (nodes as Array<{ id: string }>).map((n) => n.id)
  );
  const edges = Array.isArray(g.edges)
    ? g.edges
        .map((e) => {
          if (!e || typeof e !== 'object') return null;
          const item = e as Record<string, unknown>;
          if (typeof item.source !== 'string' || typeof item.target !== 'string') return null;
          if (!nodeIds.has(item.source) || !nodeIds.has(item.target)) return null;
          return {
            id: typeof item.id === 'string' ? item.id : `${item.source}-${item.target}`,
            source: item.source,
            target: item.target,
            sourceHandle: typeof item.sourceHandle === 'string' ? item.sourceHandle : null,
          };
        })
        .filter(Boolean)
    : [];
  return { nodes: nodes as RuntimeGraph['nodes'], edges: edges as RuntimeGraph['edges'] };
}

async function persistSession(
  sessionId: string,
  snap: RuntimeSessionSnapshot,
  opts?: { lastError?: string | null; resumeAt?: Date | null }
): Promise<void> {
  const ended =
    snap.status === 'ended' ||
    snap.status === 'transferred' ||
    snap.status === 'error' ||
    snap.status === 'paused';
  const resumeAt =
    opts?.resumeAt !== undefined
      ? opts.resumeAt
      : snap.resumeAt
        ? new Date(snap.resumeAt)
        : null;
  await pool.query(
    `UPDATE chatbot_flow_sessions
     SET status = $2,
         current_node_id = $3,
         variables = $4::jsonb,
         waiting_variable = $5,
         last_error = $6,
         resume_at = CASE
           WHEN $2 = 'waiting_delay' THEN COALESCE($8::timestamptz, resume_at)
           WHEN $2 = 'waiting_input' THEN $8::timestamptz
           ELSE NULL
         END,
         ended_at = CASE WHEN $7::boolean THEN COALESCE(ended_at, now()) ELSE ended_at END,
         updated_at = now()
     WHERE id = $1::uuid`,
    [
      sessionId,
      snap.status,
      snap.currentNodeId,
      JSON.stringify(snap.variables || {}),
      snap.waitingVariable,
      opts?.lastError ?? null,
      ended,
      resumeAt,
    ]
  );
}

async function applyTransferHuman(conversationId: string): Promise<void> {
  await pool.query(
    `UPDATE chat_conversations
     SET attendance_status = CASE
           WHEN attendance_status IN ('closed', 'archived') THEN attendance_status
           ELSE 'pending'
         END,
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = now()
     WHERE id = $1::uuid`,
    [
      conversationId,
      JSON.stringify({
        chatbot_flows_transferred_at: new Date().toISOString(),
        chatbot_flows_waiting_human: true,
      }),
    ]
  );
}

/** Pausa sessões vivas da conversa (humano assumiu). */
export async function pauseChatbotFlowSessionsForConversation(
  conversationId: string
): Promise<number> {
  const r = await pool.query(
    `UPDATE chatbot_flow_sessions
     SET status = 'paused', ended_at = COALESCE(ended_at, now()), updated_at = now()
     WHERE conversation_id = $1::uuid AND status IN ('active', 'waiting_input', 'waiting_delay', 'waiting_http')
     RETURNING id`,
    [conversationId]
  );
  return r.rowCount ?? 0;
}

/**
 * @returns true se o runtime consumiu a mensagem (Phase 8 deve ser pulado).
 */
export async function runChatbotFlowsRuntimeInbound(opts: {
  conversationId: string;
  messageBody: string | null;
  inserted: boolean;
  /** ID de botão/lista UazAPI (S13). */
  interactiveReplyId?: string | null;
}): Promise<boolean> {
  if (!opts.inserted) return false;

  try {
    const convRes = await pool.query(
      `SELECT c.id, c.user_id, c.assigned_to_user_id, c.attendance_status,
              u.tenant_id AS tenant_id
       FROM chat_conversations c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = $1::uuid
       LIMIT 1`,
      [opts.conversationId]
    );
    const conv = convRes.rows[0] as Record<string, unknown> | undefined;
    if (!conv?.tenant_id) return false;

    const tenantId = String(conv.tenant_id);
    const ownerUserId = String(conv.user_id);

    const runtimeOn = await tenantHasFeature(tenantId, 'chatbot_flows_runtime');
    if (!runtimeOn) return false;

    // Humano no comando → pausar e não responder
    const assigned = conv.assigned_to_user_id != null;
    const inProgress = String(conv.attendance_status || '') === 'in_progress';
    if (assigned || inProgress) {
      await pauseChatbotFlowSessionsForConversation(opts.conversationId);
      return false;
    }

    // Sessão viva?
    const sessRes = await pool.query(
      `SELECT s.id, s.flow_id, s.flow_version_id, s.status, s.current_node_id,
              s.variables, s.waiting_variable, v.graph_json
       FROM chatbot_flow_sessions s
       INNER JOIN chatbot_flow_versions v ON v.id = s.flow_version_id
       WHERE s.conversation_id = $1::uuid AND s.status IN ('active', 'waiting_input')
       ORDER BY s.updated_at DESC
       LIMIT 1`,
      [opts.conversationId]
    );

    let sessionId: string | null = null;
    let graph: RuntimeGraph | null = null;
    let snap: RuntimeSessionSnapshot | null = null;
    let justStarted = false;

    if (sessRes.rows[0]) {
      const row = sessRes.rows[0] as Record<string, unknown>;
      sessionId = String(row.id);
      graph = normalizeGraph(row.graph_json);
      snap = {
        status: row.status as RuntimeSessionSnapshot['status'],
        currentNodeId: row.current_node_id != null ? String(row.current_node_id) : null,
        variables:
          row.variables && typeof row.variables === 'object'
            ? (row.variables as Record<string, unknown>)
            : {},
        waitingVariable: row.waiting_variable != null ? String(row.waiting_variable) : null,
      };
      // Só processa inbound se waiting_input (ou active raro)
      if (snap.status === 'active') {
        // Mensagem fora de wait: não avançar automaticamente (evitar loop).
        // Considera handled=false para Phase 8, mas mantém sessão.
        return false;
      }
    } else {
      // Match trigger em flows publicados (status active + published_version)
      const flowsRes = await pool.query(
        `SELECT f.id AS flow_id, v.id AS version_id, v.graph_json, v.published_at
         FROM chatbot_flows f
         INNER JOIN chatbot_flow_versions v ON v.id = f.published_version_id
         WHERE f.tenant_id = $1::uuid AND f.status = 'active' AND f.published_version_id IS NOT NULL
         ORDER BY v.published_at DESC`,
        [tenantId]
      );

      const cntRes = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM chat_messages
         WHERE conversation_id = $1::uuid AND direction = 'incoming'`,
        [opts.conversationId]
      );
      const incomingCount = cntRes.rows[0]?.n ?? 0;
      const body = (opts.messageBody ?? '').trim();

      let matched: { flowId: string; versionId: string; graph: RuntimeGraph } | null = null;
      for (const row of flowsRes.rows as Array<Record<string, unknown>>) {
        const g = normalizeGraph(row.graph_json);
        const reason = matchFlowTrigger({
          graph: g,
          messageBody: body,
          incomingMessageCount: incomingCount,
        });
        if (reason) {
          matched = {
            flowId: String(row.flow_id),
            versionId: String(row.version_id),
            graph: g,
          };
          break;
        }
      }
      if (!matched) return false;

      const ins = await pool.query(
        `INSERT INTO chatbot_flow_sessions
           (tenant_id, flow_id, flow_version_id, conversation_id, status, current_node_id, variables)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'active', NULL, '{}'::jsonb)
         RETURNING id`,
        [tenantId, matched.flowId, matched.versionId, opts.conversationId]
      );
      sessionId = String(ins.rows[0].id);
      graph = matched.graph;
      const { buildFlowSessionVariableBag, mergeFlowVariableSeed } = await import(
        './flowVariableContext.js'
      );
      const seed = await buildFlowSessionVariableBag({
        tenantId,
        conversationId: opts.conversationId,
        actorUserId: ownerUserId,
      });
      snap = {
        status: 'active',
        currentNodeId: null,
        variables: mergeFlowVariableSeed({}, seed),
        waitingVariable: null,
      };
      justStarted = true;
    }

    if (!sessionId || !graph || !snap) return false;

    // Atualiza data do sistema em sessões já abertas (não sobrescreve vars do flow)
    if (!justStarted) {
      const { buildFlowSessionVariableBag, mergeFlowVariableSeed } = await import(
        './flowVariableContext.js'
      );
      const seed = await buildFlowSessionVariableBag({
        tenantId,
        conversationId: opts.conversationId,
        actorUserId: ownerUserId,
      });
      snap.variables = mergeFlowVariableSeed(snap.variables, seed);
    }

    const result = processInboundStep({
      graph,
      session: snap,
      messageBody: opts.messageBody,
      interactiveReplyId: opts.interactiveReplyId,
      justStarted,
    });

    const applyError = await applyRuntimeActions({
      tenantId,
      ownerUserId,
      conversationId: opts.conversationId,
      sessionId,
      result,
      graph,
    });
    if (applyError) return true;

    console.log(
      JSON.stringify({
        event: 'chatbot_flows_runtime',
        conversationId: opts.conversationId,
        sessionId,
        status: result.session.status,
        actions: result.actions.map((a) => a.type),
      })
    );

    return result.handled;
  } catch (e) {
    console.warn('[chatbot_flows_runtime] failed', e);
    return false;
  }
}

async function applyRuntimeActions(opts: {
  tenantId: string;
  ownerUserId: string;
  conversationId: string;
  sessionId: string;
  result: ReturnType<typeof processInboundStep>;
  graph?: RuntimeGraph;
  depth?: number;
}): Promise<string | null> {
  const { sendKanbanAutomationOutboundText, sendKanbanAutomationOutboundMedia } = await import(
    '../../controllers/chatController.js'
  );
  const {
    runtimeAddTag,
    runtimeAssignConversation,
    runtimeEnsureKanbanCard,
    runtimeCreateConversationNote,
    runtimeResolveConversation,
    runtimeUpdateContact,
  } = await import('./flowCrmActions.js');
  const { computeScheduledForFromDelay } = await import('../../utils/kanbanPhase2.js');
  const { executeFlowHttpRequest, executeFlowWebhookOut } = await import('./flowHttpActions.js');

  const depth = opts.depth ?? 0;
  if (depth > 5) {
    await persistSession(
      opts.sessionId,
      { ...opts.result.session, status: 'error' },
      { lastError: 'http_chain_too_deep' }
    );
    return 'http_chain_too_deep';
  }

  let resumeAt: Date | null = null;
  let httpResume: {
    ok: boolean;
    mappedVariables?: Record<string, string>;
    failHandle?: string;
  } | null = null;

  for (const action of opts.result.actions) {
    try {
      if (action.type === 'send_text') {
        const r = await sendKanbanAutomationOutboundText({
          conversationId: opts.conversationId,
          text: action.text,
          actorUserId: opts.ownerUserId,
          metadataSource: 'chatbot_flows_runtime',
        });
        if (!r.ok) {
          console.warn('[chatbot_flows_runtime] send failed', r.error);
          await persistSession(
            opts.sessionId,
            { ...opts.result.session, status: 'error' },
            { lastError: r.error || 'send_failed' }
          );
          return r.error || 'send_failed';
        }
      } else if (action.type === 'send_media') {
        const mediaType =
          action.mediaType === 'document' || action.mediaType === 'audio'
            ? action.mediaType
            : 'image';
        const r = await sendKanbanAutomationOutboundMedia({
          conversationId: opts.conversationId,
          actorUserId: opts.ownerUserId,
          type: mediaType,
          fileUrl: action.mediaUrl,
          caption: mediaType === 'audio' ? null : action.caption || null,
          fileName: action.filename || null,
          mimeType:
            mediaType === 'document'
              ? 'application/pdf'
              : mediaType === 'audio'
                ? 'audio/mpeg'
                : undefined,
          metadataSource: 'chatbot_flows_runtime',
        });
        if (!r.ok) {
          // S19: falha de mídia não trava a sessão — log + segue.
          console.warn('[chatbot_flows_runtime] send_media failed', r.error);
        }
      } else if (action.type === 'transfer_human') {
        await applyTransferHuman(opts.conversationId);
      } else if (action.type === 'conversation_note') {
        await runtimeCreateConversationNote({
          tenantId: opts.tenantId,
          actorUserId: opts.ownerUserId,
          conversationId: opts.conversationId,
          noteText: action.text,
          noteType: action.noteType || 'internal',
        });
      } else if (action.type === 'update_contact') {
        const r = await runtimeUpdateContact({
          tenantId: opts.tenantId,
          conversationId: opts.conversationId,
          field: action.field,
          value: action.value,
        });
        if (!r.ok) {
          // S20: sem cliente/lead ou valor inválido — não trava o flow
          console.warn('[chatbot_flows_runtime] update_contact skipped', r.reason);
        } else if (action.field === 'name' || action.field === 'email' || action.field === 'phone') {
          opts.result.session.variables[`contact.${action.field}`] = action.value;
        }
      } else if (action.type === 'resolve_conversation') {
        if (action.closeAttendance !== false) {
          await runtimeResolveConversation({
            tenantId: opts.tenantId,
            actorUserId: opts.ownerUserId,
            conversationId: opts.conversationId,
          });
        }
      } else if (action.type === 'add_tag') {
        await runtimeAddTag({
          tenantId: opts.tenantId,
          actorUserId: opts.ownerUserId,
          conversationId: opts.conversationId,
          tagLabel: action.tagLabel,
          tagId: action.tagId,
        });
      } else if (action.type === 'assign_agent') {
        await runtimeAssignConversation({
          conversationId: opts.conversationId,
          mode: action.mode,
          userId: action.userId,
          teamId: action.teamId,
          queueId: action.queueId ?? undefined,
        });
        if (action.mode === 'user') {
          opts.result.session.status = 'paused';
        }
      } else if (action.type === 'move_kanban' || action.type === 'kanban_add_card') {
        const columnId = action.columnId;
        const boardId =
          action.type === 'kanban_add_card'
            ? action.boardId
            : 'boardId' in action
              ? action.boardId
              : undefined;
        if (!columnId) {
          httpResume = { ok: false, mappedVariables: {}, failHandle: 'error' };
        } else {
          const cardRes = await runtimeEnsureKanbanCard({
            tenantId: opts.tenantId,
            actorUserId: opts.ownerUserId,
            conversationId: opts.conversationId,
            boardId: boardId || undefined,
            columnId,
            title: 'title' in action ? action.title : undefined,
            description: 'description' in action ? action.description : undefined,
            tagLabel: 'tagLabel' in action ? action.tagLabel : undefined,
            tagId: 'tagId' in action ? action.tagId : undefined,
          });
          httpResume = {
            ok: cardRes.ok,
            failHandle: 'error',
            mappedVariables: cardRes.ok
              ? {
                  'kanban.card_id': cardRes.cardId || '',
                  'kanban.board_id': cardRes.boardId || boardId || '',
                  'kanban.column_id': cardRes.columnId || columnId,
                  'kanban.created': cardRes.created ? 'true' : 'false',
                  'kanban.moved': cardRes.moved ? 'true' : 'false',
                }
              : {
                  'kanban.error': cardRes.error || 'falha no Kanban',
                },
          };
          if (!cardRes.ok) {
            console.warn('[chatbot_flows_runtime] move_kanban failed', cardRes.error);
          }
        }
      } else if (action.type === 'delay') {
        resumeAt = computeScheduledForFromDelay(action.amount, action.unit);
        opts.result.session.resumeAt = resumeAt.toISOString();
      } else if (action.type === 'http_request') {
        const httpRes = await executeFlowHttpRequest({
          method: action.method,
          url: action.url,
          headers: action.headers,
          body: action.body,
          timeoutMs: action.timeoutMs,
          variables: opts.result.session.variables,
          responseVariable: action.responseVariable,
          statusVariable: action.statusVariable,
          responseMap: action.responseMap,
        });
        httpResume = { ok: httpRes.ok, mappedVariables: httpRes.mapped };
        if (!httpRes.ok) {
          console.warn('[chatbot_flows_runtime] http_request failed', httpRes.error || httpRes.status);
        }
      } else if (action.type === 'webhook_out') {
        const httpRes = await executeFlowWebhookOut({
          url: action.url,
          method: action.method,
          secret: action.secret,
          timeoutMs: action.timeoutMs,
          variables: opts.result.session.variables,
          conversationId: opts.conversationId,
          tenantId: opts.tenantId,
          includeSessionVars: action.includeSessionVars,
          payloadMode: action.payloadMode,
          bodyTemplate: action.bodyTemplate,
          headers: action.headers,
        });
        httpResume = { ok: httpRes.ok, mappedVariables: httpRes.mapped };
        if (!httpRes.ok) {
          console.warn('[chatbot_flows_runtime] webhook_out failed', httpRes.error || httpRes.status);
        }
      } else if (action.type === 'lookup_invoice') {
        const { runtimeLookupInvoice } = await import('./flowInvoiceActions.js');
        const lookupRes = await runtimeLookupInvoice({
          tenantId: opts.tenantId,
          conversationId: opts.conversationId,
          mode: action.mode,
          limit: action.limit,
        });
        httpResume = {
          ok: lookupRes.found,
          mappedVariables: lookupRes.mapped,
          failHandle: 'empty',
        };
      } else if (action.type === 'send_menu') {
        const { sendChatbotFlowOutboundMenu } = await import('./flowMenuOutbound.js');
        const menuRes = await sendChatbotFlowOutboundMenu({
          conversationId: opts.conversationId,
          actorUserId: opts.ownerUserId,
          mode: action.mode,
          text: action.text,
          footerText: action.footerText,
          listButton: action.listButton,
          choices: action.choices,
          options: action.options,
        });
        if (!menuRes.ok) {
          console.warn('[chatbot_flows_runtime] send_menu failed', menuRes.error);
          await persistSession(
            opts.sessionId,
            { ...opts.result.session, status: 'error' },
            { lastError: menuRes.error || 'send_menu_failed' }
          );
          return menuRes.error || 'send_menu_failed';
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'crm_action_failed';
      console.warn('[chatbot_flows_runtime] action failed', action.type, msg);
      await persistSession(
        opts.sessionId,
        { ...opts.result.session, status: 'error' },
        { lastError: `${action.type}: ${msg}` }
      );
      return msg;
    }
  }

  if (httpResume && opts.result.session.status === 'waiting_http' && opts.graph) {
    const continued = processInboundStep({
      graph: opts.graph,
      session: opts.result.session,
      messageBody: null,
      resumeFromHttp: httpResume,
    });
    const err = await applyRuntimeActions({
      ...opts,
      result: continued,
      depth: depth + 1,
    });
    opts.result.session = continued.session;
    opts.result.actions = [...opts.result.actions, ...continued.actions];
    return err;
  }

  // Nunca persistir waiting_http sem retomada (falha de wiring).
  if (opts.result.session.status === 'waiting_http') {
    opts.result.session.status = 'error';
    await persistSession(opts.sessionId, opts.result.session, {
      lastError: 'waiting_http_unresolved',
    });
    return 'waiting_http_unresolved';
  }

  const errAction = opts.result.actions.find((a) => a.type === 'error') as
    | { type: 'error'; message: string }
    | undefined;
  await persistSession(opts.sessionId, opts.result.session, {
    lastError: errAction?.message ?? null,
    resumeAt,
  });
  return null;
}

/** Worker: retoma delays e timeouts de input vencidos (S4 + S18). */
export async function processDueChatbotFlowDelaysBatch(limit = 20): Promise<number> {
  const due = await pool.query(
    `SELECT s.id, s.status
     FROM chatbot_flow_sessions s
     WHERE s.status IN ('waiting_delay', 'waiting_input')
       AND s.resume_at IS NOT NULL
       AND s.resume_at <= now()
     ORDER BY s.resume_at ASC
     LIMIT $1`,
    [limit]
  );

  let n = 0;
  for (const row of due.rows as Array<{ id: string; status: string }>) {
    try {
      const ok =
        row.status === 'waiting_input'
          ? await resumeChatbotFlowSessionAfterInputTimeout(String(row.id))
          : await resumeChatbotFlowSessionAfterDelay(String(row.id));
      if (ok) n += 1;
    } catch (e) {
      console.warn('[chatbot_flows_delay] resume failed', row.id, e);
    }
  }
  return n;
}

export async function resumeChatbotFlowSessionAfterDelay(sessionId: string): Promise<boolean> {
  const runtimeOnCheck = await pool.query(
    `SELECT s.id, s.tenant_id, s.conversation_id, s.status, s.current_node_id,
            s.variables, s.waiting_variable, v.graph_json,
            c.user_id AS owner_user_id, c.assigned_to_user_id, c.attendance_status
     FROM chatbot_flow_sessions s
     INNER JOIN chatbot_flow_versions v ON v.id = s.flow_version_id
     INNER JOIN chat_conversations c ON c.id = s.conversation_id
     WHERE s.id = $1::uuid
     LIMIT 1`,
    [sessionId]
  );
  const row = runtimeOnCheck.rows[0] as Record<string, unknown> | undefined;
  if (!row || row.status !== 'waiting_delay') return false;

  const tenantId = String(row.tenant_id);
  if (!(await tenantHasFeature(tenantId, 'chatbot_flows_runtime'))) {
    await pauseChatbotFlowSessionsForConversation(String(row.conversation_id));
    return false;
  }
  if (row.assigned_to_user_id != null || String(row.attendance_status || '') === 'in_progress') {
    await pauseChatbotFlowSessionsForConversation(String(row.conversation_id));
    return false;
  }

  const graph = normalizeGraph(row.graph_json);
  const snap: RuntimeSessionSnapshot = {
    status: 'waiting_delay',
    currentNodeId: row.current_node_id != null ? String(row.current_node_id) : null,
    variables:
      row.variables && typeof row.variables === 'object'
        ? (row.variables as Record<string, unknown>)
        : {},
    waitingVariable: row.waiting_variable != null ? String(row.waiting_variable) : null,
  };

  const result = processInboundStep({
    graph,
    session: snap,
    messageBody: null,
    resumeFromDelay: true,
  });

  await applyRuntimeActions({
    tenantId,
    ownerUserId: String(row.owner_user_id),
    conversationId: String(row.conversation_id),
    sessionId,
    result,
    graph,
  });
  return true;
}

/** Worker: timeout de inatividade em wait_input / menu_choice (S18). */
export async function resumeChatbotFlowSessionAfterInputTimeout(
  sessionId: string
): Promise<boolean> {
  const runtimeOnCheck = await pool.query(
    `SELECT s.id, s.tenant_id, s.conversation_id, s.status, s.current_node_id,
            s.variables, s.waiting_variable, v.graph_json,
            c.user_id AS owner_user_id, c.assigned_to_user_id, c.attendance_status
     FROM chatbot_flow_sessions s
     INNER JOIN chatbot_flow_versions v ON v.id = s.flow_version_id
     INNER JOIN chat_conversations c ON c.id = s.conversation_id
     WHERE s.id = $1::uuid
     LIMIT 1`,
    [sessionId]
  );
  const row = runtimeOnCheck.rows[0] as Record<string, unknown> | undefined;
  if (!row || row.status !== 'waiting_input') return false;

  const tenantId = String(row.tenant_id);
  if (!(await tenantHasFeature(tenantId, 'chatbot_flows_runtime'))) {
    await pauseChatbotFlowSessionsForConversation(String(row.conversation_id));
    return false;
  }
  if (row.assigned_to_user_id != null || String(row.attendance_status || '') === 'in_progress') {
    await pauseChatbotFlowSessionsForConversation(String(row.conversation_id));
    return false;
  }

  const graph = normalizeGraph(row.graph_json);
  const snap: RuntimeSessionSnapshot = {
    status: 'waiting_input',
    currentNodeId: row.current_node_id != null ? String(row.current_node_id) : null,
    variables:
      row.variables && typeof row.variables === 'object'
        ? (row.variables as Record<string, unknown>)
        : {},
    waitingVariable: row.waiting_variable != null ? String(row.waiting_variable) : null,
  };

  const result = processInboundStep({
    graph,
    session: snap,
    messageBody: null,
    resumeFromTimeout: true,
  });

  await applyRuntimeActions({
    tenantId,
    ownerUserId: String(row.owner_user_id),
    conversationId: String(row.conversation_id),
    sessionId,
    result,
    graph,
  });
  return true;
}

/**
 * Dispara flow publicado via webhook_in (POST /webhooks/chatbot-flows/:token).
 */
export async function runChatbotFlowsRuntimeFromWebhook(opts: {
  token: string;
  conversationId: string;
  variables?: Record<string, unknown>;
  rawPayload?: unknown;
}): Promise<{ ok: true; sessionId: string; flowId: string } | { ok: false; error: string; status: number }> {
  const token = opts.token.trim();
  if (!token) return { ok: false, error: 'token_obrigatorio', status: 400 };

  const flowRes = await pool.query(
    `SELECT f.id AS flow_id, f.tenant_id, v.id AS version_id, v.graph_json
     FROM chatbot_flows f
     INNER JOIN chatbot_flow_versions v ON v.id = f.published_version_id
     WHERE f.inbound_webhook_token = $1
       AND f.status = 'active'
       AND f.published_version_id IS NOT NULL
     LIMIT 1`,
    [token]
  );
  const flowRow = flowRes.rows[0] as Record<string, unknown> | undefined;
  if (!flowRow) return { ok: false, error: 'webhook_nao_encontrado', status: 404 };

  const tenantId = String(flowRow.tenant_id);
  if (!(await tenantHasFeature(tenantId, 'chatbot_flows_runtime'))) {
    return { ok: false, error: 'runtime_desligado', status: 403 };
  }

  const graph = normalizeGraph(flowRow.graph_json);
  const { extractWebhookInFromGraph } = await import('./flowWebhookIn.js');
  const wh = extractWebhookInFromGraph(graph);
  if (!wh || wh.token !== token) {
    return { ok: false, error: 'webhook_inconsistente', status: 404 };
  }

  const convRes = await pool.query(
    `SELECT c.id, c.user_id, c.assigned_to_user_id, c.attendance_status, u.tenant_id
     FROM chat_conversations c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
     LIMIT 1`,
    [opts.conversationId, tenantId]
  );
  const conv = convRes.rows[0] as Record<string, unknown> | undefined;
  if (!conv) return { ok: false, error: 'conversa_nao_encontrada', status: 404 };

  if (conv.assigned_to_user_id != null || String(conv.attendance_status || '') === 'in_progress') {
    await pauseChatbotFlowSessionsForConversation(opts.conversationId);
    return { ok: false, error: 'conversa_em_atendimento_humano', status: 409 };
  }

  // Encerra sessões vivas anteriores desta conversa para este flow
  await pool.query(
    `UPDATE chatbot_flow_sessions
     SET status = 'paused', ended_at = COALESCE(ended_at, now()), updated_at = now()
     WHERE conversation_id = $1::uuid
       AND flow_id = $2::uuid
       AND status IN ('active', 'waiting_input', 'waiting_delay', 'waiting_http')`,
    [opts.conversationId, flowRow.flow_id]
  );

  const variables: Record<string, unknown> = {
    ...(opts.variables && typeof opts.variables === 'object' ? opts.variables : {}),
  };
  if (opts.rawPayload !== undefined) {
    variables.webhook_payload =
      typeof opts.rawPayload === 'string' ? opts.rawPayload : JSON.stringify(opts.rawPayload);
    variables['flow_session.webhook_payload'] = variables.webhook_payload;
  }

  const { buildFlowSessionVariableBag, mergeFlowVariableSeed } = await import(
    './flowVariableContext.js'
  );
  const seed = await buildFlowSessionVariableBag({
    tenantId,
    conversationId: opts.conversationId,
    actorUserId: String(conv.user_id),
  });
  const mergedVars = mergeFlowVariableSeed(variables, seed);

  const ins = await pool.query(
    `INSERT INTO chatbot_flow_sessions
       (tenant_id, flow_id, flow_version_id, conversation_id, status, current_node_id, variables)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'active', NULL, $5::jsonb)
     RETURNING id`,
    [
      tenantId,
      flowRow.flow_id,
      flowRow.version_id,
      opts.conversationId,
      JSON.stringify(mergedVars),
    ]
  );
  const sessionId = String(ins.rows[0].id);

  const result = processInboundStep({
    graph,
    session: {
      status: 'active',
      currentNodeId: null,
      variables: mergedVars,
      waitingVariable: null,
    },
    messageBody: null,
    startFromWebhook: { nodeId: wh.nodeId, variables: mergedVars },
  });

  await applyRuntimeActions({
    tenantId,
    ownerUserId: String(conv.user_id),
    conversationId: opts.conversationId,
    sessionId,
    result,
    graph,
  });

  return { ok: true, sessionId, flowId: String(flowRow.flow_id) };
}

