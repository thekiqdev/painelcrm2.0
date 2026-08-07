/**
 * Runner S3 — bridge inbound WhatsApp → engine + sessões + outbound UazAPI.
 */
import { pool } from '../../utils/db.js';
import { tenantHasFeature } from '../featureFlagService.js';
import { isEditorOnlyNodeType } from './canvasAnnotations.js';
import {
  matchFlowTrigger,
  matchFlowCrmEventTrigger,
  processInboundStep,
  findStartNode,
  type RuntimeGraph,
  type RuntimeSessionSnapshot,
} from './flowRuntimeEngine.js';
import {
  isGlobalOptOutWord,
  isGroupExternalChatId,
  isStartDmOnly,
  getStartSessionPolicy,
} from './flowStartTrigger.js';
import {
  isCooldownActive,
  isInstanceAllowed,
  isWithinScheduleWindow,
  logStartSkip,
  parseStartGuardConfig,
  sortFlowMatchCandidates,
} from './flowStartGuards.js';

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

async function applyTransferHuman(opts: {
  conversationId: string;
  tenantId: string;
}): Promise<void> {
  const { runtimeTransferToHuman } = await import('./flowCrmActions.js');
  await runtimeTransferToHuman({
    conversationId: opts.conversationId,
    tenantId: opts.tenantId,
  });
}

/** Pausa sessões vivas da conversa (humano assumiu / atendimento em curso). */
export async function pauseChatbotFlowSessionsForConversation(
  conversationId: string
): Promise<number> {
  const r = await pool.query(
    `UPDATE chatbot_flow_sessions
     SET status = 'paused',
         ended_at = COALESCE(ended_at, now()),
         resume_at = NULL,
         waiting_variable = NULL,
         updated_at = now()
     WHERE conversation_id = $1::uuid
       AND status IN ('active', 'waiting_input', 'waiting_delay', 'waiting_http')
     RETURNING id`,
    [conversationId]
  );

  // Limpa flag de “à espera de humano” para o inbox não tratar como bot a aguardar.
  try {
    await pool.query(
      `UPDATE chat_conversations
       SET metadata = COALESCE(metadata, '{}'::jsonb) - 'chatbot_flows_waiting_human',
           updated_at = now()
       WHERE id = $1::uuid
         AND metadata ? 'chatbot_flows_waiting_human'`,
      [conversationId]
    );
  } catch {
    /* metadata pode faltar / JSON antigo */
  }

  return r.rowCount ?? 0;
}

/** S31 — encerra sessões vivas (opt-out). */
export async function endChatbotFlowSessionsForConversation(
  conversationId: string,
  reason: string
): Promise<number> {
  const r = await pool.query(
    `UPDATE chatbot_flow_sessions
     SET status = 'ended',
         ended_at = COALESCE(ended_at, now()),
         resume_at = NULL,
         waiting_variable = NULL,
         last_error = $2,
         updated_at = now()
     WHERE conversation_id = $1::uuid
       AND status IN ('active', 'waiting_input', 'waiting_delay', 'waiting_http')
     RETURNING id`,
    [conversationId, reason]
  );

  try {
    await pool.query(
      `UPDATE chat_conversations
       SET metadata = COALESCE(metadata, '{}'::jsonb) - 'chatbot_flows_waiting_human',
           updated_at = now()
       WHERE id = $1::uuid
         AND metadata ? 'chatbot_flows_waiting_human'`,
      [conversationId]
    );
  } catch {
    /* ignore */
  }

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
      `SELECT c.id, c.user_id, c.assigned_to_user_id, c.attendance_status, c.external_chat_id,
              c.instance_id, u.tenant_id AS tenant_id
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
    const conversationInstanceId =
      conv.instance_id != null ? String(conv.instance_id) : null;
    const isGroup = isGroupExternalChatId(
      conv.external_chat_id != null ? String(conv.external_chat_id) : null
    );

    let tenantTimezone = 'America/Sao_Paulo';
    try {
      const tzRes = await pool.query<{ timezone: string | null }>(
        `SELECT timezone FROM tenants WHERE id = $1::uuid LIMIT 1`,
        [tenantId]
      );
      const tz = String(tzRes.rows[0]?.timezone || '').trim();
      if (tz) tenantTimezone = tz;
    } catch {
      /* coluna pode faltar em ambientes antigos */
    }

    const runtimeOn = await tenantHasFeature(tenantId, 'chatbot_flows_runtime');
    if (!runtimeOn) return false;

    // Humano no comando → pausar e não responder
    const assigned = conv.assigned_to_user_id != null;
    const inProgress = String(conv.attendance_status || '') === 'in_progress';
    if (assigned || inProgress) {
      await pauseChatbotFlowSessionsForConversation(opts.conversationId);
      return false;
    }

    // S31 — opt-out global `parar` / `sair` (equals)
    const bodyTrimmed = (opts.messageBody ?? '').trim();
    if (isGlobalOptOutWord(bodyTrimmed)) {
      const ended = await endChatbotFlowSessionsForConversation(opts.conversationId, 'opt_out');
      if (ended > 0) {
        try {
          const { sendKanbanAutomationOutboundText } = await import(
            '../../controllers/chatController.js'
          );
          await sendKanbanAutomationOutboundText({
            conversationId: opts.conversationId,
            actorUserId: ownerUserId,
            text: 'Fluxo encerrado.',
          });
        } catch (e) {
          console.warn('[chatbot_flows_runtime] opt_out ack failed', e);
        }
        console.log(
          JSON.stringify({
            event: 'chatbot_flows_runtime',
            conversationId: opts.conversationId,
            reason: 'opt_out',
            endedSessions: ended,
          })
        );
        return true;
      }
      return false;
    }

    // Sessão viva?
    const sessRes = await pool.query(
      `SELECT s.id, s.flow_id, s.flow_version_id, s.status, s.current_node_id,
              s.variables, s.waiting_variable, v.graph_json
       FROM chatbot_flow_sessions s
       INNER JOIN chatbot_flow_versions v ON v.id = s.flow_version_id
       WHERE s.conversation_id = $1::uuid
         AND s.status IN ('active', 'waiting_input', 'waiting_delay', 'waiting_http')
       ORDER BY s.updated_at DESC
       LIMIT 1`,
      [opts.conversationId]
    );

    let sessionId: string | null = null;
    let graph: RuntimeGraph | null = null;
    let snap: RuntimeSessionSnapshot | null = null;
    let justStarted = false;
    let startReason: 'keyword' | 'first_message' | 'restart' | null = null;

    if (sessRes.rows[0]) {
      const row = sessRes.rows[0] as Record<string, unknown>;
      const liveGraph = normalizeGraph(row.graph_json);
      const startNode = findStartNode(liveGraph);
      const startData = startNode?.data as Record<string, unknown> | undefined;
      const policy = getStartSessionPolicy(startData);
      const bodyForRestart = (opts.messageBody ?? '').trim();

      if (policy === 'restart_on_keyword' && bodyForRestart) {
        const kwHit = matchFlowTrigger({
          graph: liveGraph,
          messageBody: bodyForRestart,
          incomingMessageCount: 999,
        });
        if (kwHit === 'keyword') {
          await pool.query(
            `UPDATE chatbot_flow_sessions
             SET status = 'ended', ended_at = COALESCE(ended_at, now()), updated_at = now(),
                 last_error = NULL
             WHERE id = $1::uuid`,
            [row.id]
          );
          startReason = 'restart';
          // cai no bloco de match (como se não houvesse sessão)
        } else if (String(row.status) === 'waiting_input') {
          sessionId = String(row.id);
          graph = liveGraph;
          snap = {
            status: row.status as RuntimeSessionSnapshot['status'],
            currentNodeId: row.current_node_id != null ? String(row.current_node_id) : null,
            variables:
              row.variables && typeof row.variables === 'object'
                ? (row.variables as Record<string, unknown>)
                : {},
            waitingVariable: row.waiting_variable != null ? String(row.waiting_variable) : null,
          };
        } else {
          // active / delay / http + keyword não casou → não inicia outra sessão
          return false;
        }
      } else if (String(row.status) === 'waiting_input') {
        sessionId = String(row.id);
        graph = liveGraph;
        snap = {
          status: row.status as RuntimeSessionSnapshot['status'],
          currentNodeId: row.current_node_id != null ? String(row.current_node_id) : null,
          variables:
            row.variables && typeof row.variables === 'object'
              ? (row.variables as Record<string, unknown>)
              : {},
          waitingVariable: row.waiting_variable != null ? String(row.waiting_variable) : null,
        };
      } else {
        // active / delay / http com ignore → não avança nem inicia
        return false;
      }
    }

    if (!sessionId) {
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

      // Idle: horas desde a incoming anterior (excluindo a corrente, já inserida)
      let hoursSincePreviousIncoming: number | null = null;
      if (incomingCount > 1) {
        const prevRes = await pool.query<{ ts: Date }>(
          `SELECT COALESCE(sent_at, created_at) AS ts
           FROM chat_messages
           WHERE conversation_id = $1::uuid AND direction = 'incoming'
           ORDER BY COALESCE(sent_at, created_at) DESC
           OFFSET 1
           LIMIT 1`,
          [opts.conversationId]
        );
        const prevTs = prevRes.rows[0]?.ts;
        if (prevTs) {
          hoursSincePreviousIncoming =
            (Date.now() - new Date(prevTs).getTime()) / (1000 * 60 * 60);
        }
      }

      let candidates: Array<{
        flowId: string;
        versionId: string;
        graph: RuntimeGraph;
        reason: 'keyword' | 'first_message';
        priority: number;
        publishedAt: string | Date | null;
      }> = [];

      for (const row of flowsRes.rows as Array<Record<string, unknown>>) {
        const g = normalizeGraph(row.graph_json);
        const startNode = findStartNode(g);
        const startData = startNode?.data as Record<string, unknown> | undefined;
        const guards = parseStartGuardConfig(startData);
        const flowId = String(row.flow_id);

        if (isStartDmOnly(startData) && isGroup) {
          logStartSkip({
            conversationId: opts.conversationId,
            flowId,
            reason: 'dm_only_group',
          });
          continue;
        }
        if (!isInstanceAllowed(guards.instanceIds, conversationInstanceId)) {
          logStartSkip({
            conversationId: opts.conversationId,
            flowId,
            reason: 'instance_mismatch',
          });
          continue;
        }
        if (guards.scheduleEnabled) {
          const okSch = isWithinScheduleWindow({
            timeZone: tenantTimezone,
            startHm: guards.scheduleStartHm,
            endHm: guards.scheduleEndHm,
          });
          if (!okSch) {
            logStartSkip({
              conversationId: opts.conversationId,
              flowId,
              reason: 'outside_schedule',
              detail: `${guards.scheduleStartHm}-${guards.scheduleEndHm} ${tenantTimezone}`,
            });
            continue;
          }
        }

        const reason = matchFlowTrigger({
          graph: g,
          messageBody: body,
          incomingMessageCount: incomingCount,
          hoursSincePreviousIncoming,
        });
        if (!reason) continue;

        if (guards.cooldownMinutes > 0) {
          const coolRes = await pool.query<{ ended_at: Date }>(
            `SELECT ended_at
             FROM chatbot_flow_sessions
             WHERE conversation_id = $1::uuid AND flow_id = $2::uuid
               AND status IN ('ended', 'error', 'paused')
               AND ended_at IS NOT NULL
             ORDER BY ended_at DESC
             LIMIT 1`,
            [opts.conversationId, flowId]
          );
          if (
            isCooldownActive({
              cooldownMinutes: guards.cooldownMinutes,
              lastEndedAt: coolRes.rows[0]?.ended_at ?? null,
            })
          ) {
            logStartSkip({
              conversationId: opts.conversationId,
              flowId,
              reason: 'cooldown',
              detail: `${guards.cooldownMinutes}m`,
            });
            continue;
          }
        }

        candidates.push({
          flowId,
          versionId: String(row.version_id),
          graph: g,
          reason,
          priority: guards.priority,
          publishedAt: (row.published_at as Date | string) ?? null,
        });
      }

      candidates = sortFlowMatchCandidates(candidates);
      const matched = candidates[0] ?? null;
      if (!matched) {
        if (flowsRes.rows.length > 0) {
          logStartSkip({
            conversationId: opts.conversationId,
            reason: 'no_trigger_match',
          });
        }
        return false;
      }

      if (!startReason) startReason = matched.reason;

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

    // Atualiza seed CRM em toda passagem (vínculo mid-flow — S22.1)
    {
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
        reason: startReason || (justStarted ? 'start' : 'continue'),
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
  /** Null = sessão órfã (S28.1); ações WhatsApp/CRM falham com conversation_required. */
  conversationId: string | null;
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
  const {
    CONVERSATION_REQUIRED_ERROR,
    runtimeActionRequiresConversation,
  } = await import('./flowWebhookOrphan.js');

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
    outHandle?: string;
  } | null = null;

  for (const action of opts.result.actions) {
    try {
      if (!opts.conversationId && runtimeActionRequiresConversation(action.type)) {
        console.warn(
          '[chatbot_flows_runtime] conversation_required',
          action.type,
          opts.sessionId
        );
        opts.result.session.status = 'error';
        await persistSession(
          opts.sessionId,
          opts.result.session,
          { lastError: CONVERSATION_REQUIRED_ERROR }
        );
        return CONVERSATION_REQUIRED_ERROR;
      }
      const conversationId = opts.conversationId as string;

      if (action.type === 'send_text') {
        const r = await sendKanbanAutomationOutboundText({
          conversationId,
          text: action.text,
          actorUserId: opts.ownerUserId,
          metadataSource: 'chatbot_flows_runtime',
        });
        if (!r.ok) {
          console.warn(
            JSON.stringify({
              event: 'chatbot_flows_runtime',
              reason: 'send_text',
              error: r.error || 'send_failed',
              conversation_id: conversationId,
              session_id: opts.sessionId,
            })
          );
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
          conversationId,
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
          // S19/S29.1: falha de mídia não trava a sessão — log estruturado + segue.
          console.warn(
            JSON.stringify({
              event: 'chatbot_flows_runtime',
              reason: 'send_media',
              error: r.error || 'send_media_failed',
              conversation_id: conversationId,
              session_id: opts.sessionId,
            })
          );
        }
      } else if (action.type === 'transfer_human') {
        await applyTransferHuman({
          conversationId,
          tenantId: opts.tenantId,
        });
      } else if (action.type === 'conversation_note') {
        await runtimeCreateConversationNote({
          tenantId: opts.tenantId,
          actorUserId: opts.ownerUserId,
          conversationId,
          noteText: action.text,
          noteType: action.noteType || 'internal',
        });
      } else if (action.type === 'update_contact') {
        const r = await runtimeUpdateContact({
          tenantId: opts.tenantId,
          conversationId,
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
            conversationId,
          });
        }
      } else if (action.type === 'add_tag') {
        await runtimeAddTag({
          tenantId: opts.tenantId,
          actorUserId: opts.ownerUserId,
          conversationId,
          tagLabel: action.tagLabel,
          tagId: action.tagId,
        });
      } else if (action.type === 'assign_agent') {
        await runtimeAssignConversation({
          conversationId,
          tenantId: opts.tenantId,
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
            conversationId,
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
          conversationId,
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
          conversationId,
          mode: action.mode,
          limit: action.limit,
        });
        console.log(
          JSON.stringify({
            event: 'chatbot_flows_runtime',
            phase: 'lookup_invoice',
            conversationId,
            sessionId: opts.sessionId,
            client_id: lookupRes.mapped['client.id'] || lookupRes.mapped.client_id || null,
            found: lookupRes.found,
            invoice_count: lookupRes.mapped['invoice.count'] || lookupRes.mapped.invoice_count || '0',
          })
        );
        httpResume = {
          ok: lookupRes.found,
          mappedVariables: lookupRes.mapped,
          failHandle: 'empty',
        };
      } else if (action.type === 'lookup_ticket') {
        const { runtimeLookupTicket } = await import('./flowTicketActions.js');
        const lookupRes = await runtimeLookupTicket({
          tenantId: opts.tenantId,
          conversationId,
          mode: action.mode,
          limit: action.limit,
          includeClosed: action.includeClosed,
        });
        console.log(
          JSON.stringify({
            event: 'chatbot_flows_runtime',
            phase: 'lookup_ticket',
            conversationId,
            sessionId: opts.sessionId,
            client_id: lookupRes.mapped['client.id'] || lookupRes.mapped.client_id || null,
            found: lookupRes.found,
            ticket_count: lookupRes.mapped['ticket.count'] || lookupRes.mapped.ticket_count || '0',
          })
        );
        httpResume = {
          ok: lookupRes.found,
          mappedVariables: lookupRes.mapped,
          failHandle: 'empty',
        };
      } else if (action.type === 'ticket_assist_bootstrap') {
        const { runtimeTicketAssistBootstrap } = await import('./flowTicketActions.js');
        const boot = await runtimeTicketAssistBootstrap({
          tenantId: opts.tenantId,
          conversationId,
          requireClient: action.requireClient,
        });
        const mapped = {
          ...boot.mapped,
          'ticket._bootstrap_reason': boot.reason || '',
        };
        console.log(
          JSON.stringify({
            event: 'chatbot_flows_runtime',
            phase: 'ticket_assist_bootstrap',
            conversationId,
            sessionId: opts.sessionId,
            ok: boot.ok,
            reason: boot.reason || null,
            category_count: boot.categories.length,
          })
        );
        httpResume = {
          ok: boot.ok,
          mappedVariables: mapped,
          failHandle: 'empty',
        };
      } else if (action.type === 'resolve_crm_link') {
        const { runtimeResolveCrmLink } = await import('./flowCrmLinkActions.js');
        const linkRes = await runtimeResolveCrmLink({
          tenantId: opts.tenantId,
          conversationId,
          refreshClientMatch: action.refreshClientMatch,
        });
        console.log(
          JSON.stringify({
            event: 'chatbot_flows_runtime',
            phase: 'resolve_crm_link',
            conversationId,
            sessionId: opts.sessionId,
            kind: linkRes.kind,
            linked_client: linkRes.linkedClient,
          })
        );
        httpResume = {
          ok: true,
          mappedVariables: linkRes.mapped,
          outHandle: linkRes.outHandle,
        };
      } else if (action.type === 'crm_convert') {
        const { runtimeCrmConvert } = await import('./flowCrmConvertActions.js');
        const convRes = await runtimeCrmConvert({
          tenantId: opts.tenantId,
          conversationId,
          actorUserId: opts.ownerUserId,
          mode: action.mode,
        });
        console.log(
          JSON.stringify({
            event: 'chatbot_flows_runtime',
            phase: 'crm_convert',
            conversationId,
            sessionId: opts.sessionId,
            mode: action.mode,
            out_handle: convRes.outHandle,
            convert_result: convRes.mapped['crm.convert_result'] || null,
            convert_error: convRes.mapped['crm.convert_error'] || null,
          })
        );
        httpResume = {
          ok: convRes.ok,
          mappedVariables: convRes.mapped,
          outHandle: convRes.outHandle,
          failHandle: 'error',
        };
      } else if (action.type === 'create_ticket') {
        const { runtimeCreateTicketFromAssist } = await import('./flowTicketActions.js');
        const vars = opts.result.session.variables;
        const createRes = await runtimeCreateTicketFromAssist({
          tenantId: opts.tenantId,
          conversationId,
          sessionId: opts.sessionId,
          subject: String(vars['ticket._draft_subject'] || ''),
          description: String(vars['ticket._draft_description'] || ''),
          categoryId: String(vars['ticket.category_id'] || vars.ticket_category_id || ''),
          categoryName: String(vars['ticket.category_name'] || vars.ticket_category_name || ''),
          priority: action.priority,
        });
        console.log(
          JSON.stringify({
            event: 'chatbot_flows_runtime',
            phase: 'create_ticket',
            conversationId,
            sessionId: opts.sessionId,
            ok: createRes.ok,
            ticket_number: createRes.mapped['ticket.number'] || null,
            error: createRes.error || null,
          })
        );
        httpResume = {
          ok: createRes.ok,
          mappedVariables: createRes.mapped,
          failHandle: 'empty',
        };
      } else if (action.type === 'send_menu') {
        const { sendChatbotFlowOutboundMenu } = await import('./flowMenuOutbound.js');
        const menuRes = await sendChatbotFlowOutboundMenu({
          conversationId,
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
      } else if (action.type === 'ensure_conversation') {
        const {
          runtimeEnsureConversation,
          bindSessionConversation,
          resolveFlowIdFromSession,
        } = await import('./flowEnsureConversation.js');
        const flowId = await resolveFlowIdFromSession(opts.sessionId);
        const ensureRes = await runtimeEnsureConversation({
          tenantId: opts.tenantId,
          ownerUserId: opts.ownerUserId,
          flowId,
          existingConversationId: opts.conversationId,
          phoneTemplate: action.phone,
          normalizeBr: action.normalizeBr,
          instanceId: action.instanceId,
          reusePolicy: action.reusePolicy,
          idempotencyKeyTemplate: action.idempotencyKey,
          variables: opts.result.session.variables,
          graph: opts.graph,
        });
        if (!ensureRes.ok) {
          console.warn(
            JSON.stringify({
              event: 'chatbot_flows_runtime',
              reason: 'ensure_conversation',
              error: ensureRes.error,
              session_id: opts.sessionId,
            })
          );
          httpResume = {
            ok: false,
            failHandle: 'error',
            mappedVariables: ensureRes.mappedVariables,
          };
        } else {
          opts.conversationId = ensureRes.conversationId;
          await bindSessionConversation({
            sessionId: opts.sessionId,
            conversationId: ensureRes.conversationId,
          });
          for (const [k, v] of Object.entries(ensureRes.mappedVariables)) {
            opts.result.session.variables[k] = v;
          }
          try {
            const { buildFlowSessionVariableBag, mergeFlowVariableSeed } = await import(
              './flowVariableContext.js'
            );
            const seed = await buildFlowSessionVariableBag({
              tenantId: opts.tenantId,
              conversationId: ensureRes.conversationId,
              actorUserId: opts.ownerUserId,
            });
            opts.result.session.variables = mergeFlowVariableSeed(
              opts.result.session.variables,
              seed
            );
          } catch (e) {
            console.warn('[chatbot_flows_runtime] ensure_conversation seed vars', e);
          }

          if (ensureRes.humanInProgress) {
            console.log(
              JSON.stringify({
                event: 'chatbot_flows_runtime',
                reason: 'ensure_conversation',
                human_in_progress: true,
                conversation_id: ensureRes.conversationId,
                session_id: opts.sessionId,
                idempotent: ensureRes.idempotent,
              })
            );
            await pauseChatbotFlowSessionsForConversation(ensureRes.conversationId);
            opts.result.session.status = 'paused';
            await persistSession(opts.sessionId, opts.result.session, {
              lastError: 'conversa_em_atendimento_humano',
            });
            return 'conversa_em_atendimento_humano';
          }

          console.log(
            JSON.stringify({
              event: 'chatbot_flows_runtime',
              reason: 'ensure_conversation',
              created: ensureRes.created,
              reused: ensureRes.reused,
              idempotent: ensureRes.idempotent,
              conversation_id: ensureRes.conversationId,
              session_id: opts.sessionId,
            })
          );
          httpResume = {
            ok: true,
            mappedVariables: ensureRes.mappedVariables,
          };
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
            s.variables, s.waiting_variable, v.graph_json, f.created_by AS flow_created_by,
            c.user_id AS owner_user_id, c.assigned_to_user_id, c.attendance_status
     FROM chatbot_flow_sessions s
     INNER JOIN chatbot_flow_versions v ON v.id = s.flow_version_id
     INNER JOIN chatbot_flows f ON f.id = s.flow_id
     LEFT JOIN chat_conversations c ON c.id = s.conversation_id
     WHERE s.id = $1::uuid
     LIMIT 1`,
    [sessionId]
  );
  const row = runtimeOnCheck.rows[0] as Record<string, unknown> | undefined;
  if (!row || row.status !== 'waiting_delay') return false;

  const tenantId = String(row.tenant_id);
  const conversationId =
    row.conversation_id != null ? String(row.conversation_id) : null;
  if (!(await tenantHasFeature(tenantId, 'chatbot_flows_runtime'))) {
    if (conversationId) await pauseChatbotFlowSessionsForConversation(conversationId);
    else {
      await persistSession(sessionId, {
        status: 'paused',
        currentNodeId: row.current_node_id != null ? String(row.current_node_id) : null,
        variables:
          row.variables && typeof row.variables === 'object'
            ? (row.variables as Record<string, unknown>)
            : {},
        waitingVariable: null,
      });
    }
    return false;
  }
  if (
    conversationId &&
    (row.assigned_to_user_id != null || String(row.attendance_status || '') === 'in_progress')
  ) {
    await pauseChatbotFlowSessionsForConversation(conversationId);
    return false;
  }

  const ownerUserId =
    row.owner_user_id != null
      ? String(row.owner_user_id)
      : row.flow_created_by != null
        ? String(row.flow_created_by)
        : null;
  if (!ownerUserId) return false;

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
    ownerUserId,
    conversationId,
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
            s.variables, s.waiting_variable, v.graph_json, f.created_by AS flow_created_by,
            c.user_id AS owner_user_id, c.assigned_to_user_id, c.attendance_status
     FROM chatbot_flow_sessions s
     INNER JOIN chatbot_flow_versions v ON v.id = s.flow_version_id
     INNER JOIN chatbot_flows f ON f.id = s.flow_id
     LEFT JOIN chat_conversations c ON c.id = s.conversation_id
     WHERE s.id = $1::uuid
     LIMIT 1`,
    [sessionId]
  );
  const row = runtimeOnCheck.rows[0] as Record<string, unknown> | undefined;
  if (!row || row.status !== 'waiting_input') return false;

  const tenantId = String(row.tenant_id);
  const conversationId =
    row.conversation_id != null ? String(row.conversation_id) : null;
  // wait_input sem conversa não faz sentido (prompt WhatsApp); encerra com erro claro
  if (!conversationId) {
    await persistSession(
      sessionId,
      {
        status: 'error',
        currentNodeId: row.current_node_id != null ? String(row.current_node_id) : null,
        variables:
          row.variables && typeof row.variables === 'object'
            ? (row.variables as Record<string, unknown>)
            : {},
        waitingVariable: null,
      },
      { lastError: 'conversation_required' }
    );
    return false;
  }
  if (!(await tenantHasFeature(tenantId, 'chatbot_flows_runtime'))) {
    await pauseChatbotFlowSessionsForConversation(conversationId);
    return false;
  }
  if (row.assigned_to_user_id != null || String(row.attendance_status || '') === 'in_progress') {
    await pauseChatbotFlowSessionsForConversation(conversationId);
    return false;
  }

  const ownerUserId =
    row.owner_user_id != null
      ? String(row.owner_user_id)
      : row.flow_created_by != null
        ? String(row.flow_created_by)
        : null;
  if (!ownerUserId) return false;

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
    ownerUserId,
    conversationId,
    sessionId,
    result,
    graph,
  });
  return true;
}

/**
 * Dispara flow publicado via webhook_in (POST /webhooks/chatbot-flows/:token).
 * S28.1: conversationId opcional — sem UUID cria sessão órfã (conversation_id NULL).
 */
export async function runChatbotFlowsRuntimeFromWebhook(opts: {
  token: string;
  conversationId?: string | null;
  variables?: Record<string, unknown>;
  rawPayload?: unknown;
}): Promise<{ ok: true; sessionId: string; flowId: string } | { ok: false; error: string; status: number }> {
  const token = opts.token.trim();
  if (!token) return { ok: false, error: 'token_obrigatorio', status: 400 };

  const conversationId =
    opts.conversationId != null && String(opts.conversationId).trim()
      ? String(opts.conversationId).trim()
      : null;

  const flowRes = await pool.query(
    `SELECT f.id AS flow_id, f.tenant_id, f.created_by, v.id AS version_id, v.graph_json
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
  const { extractWebhookInFromGraph, applyWebhookPayloadMap } = await import('./flowWebhookIn.js');
  const wh = extractWebhookInFromGraph(graph);
  if (!wh || wh.token !== token) {
    return { ok: false, error: 'webhook_inconsistente', status: 404 };
  }

  const { webhookGraphSupportsOrphanSession } = await import('./flowWebhookOrphan.js');
  if (!conversationId && !webhookGraphSupportsOrphanSession(graph)) {
    return { ok: false, error: 'conversation_required', status: 400 };
  }

  let ownerUserId: string | null = null;

  if (conversationId) {
    const convRes = await pool.query(
      `SELECT c.id, c.user_id, c.assigned_to_user_id, c.attendance_status, u.tenant_id
       FROM chat_conversations c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
       LIMIT 1`,
      [conversationId, tenantId]
    );
    const conv = convRes.rows[0] as Record<string, unknown> | undefined;
    if (!conv) return { ok: false, error: 'conversa_nao_encontrada', status: 404 };

    if (conv.assigned_to_user_id != null || String(conv.attendance_status || '') === 'in_progress') {
      await pauseChatbotFlowSessionsForConversation(conversationId);
      return { ok: false, error: 'conversa_em_atendimento_humano', status: 409 };
    }

    ownerUserId = String(conv.user_id);

    // Encerra sessões vivas anteriores desta conversa para este flow
    await pool.query(
      `UPDATE chatbot_flow_sessions
       SET status = 'paused', ended_at = COALESCE(ended_at, now()), updated_at = now()
       WHERE conversation_id = $1::uuid
         AND flow_id = $2::uuid
         AND status IN ('active', 'waiting_input', 'waiting_delay', 'waiting_http')`,
      [conversationId, flowRow.flow_id]
    );
  } else {
    ownerUserId =
      flowRow.created_by != null ? String(flowRow.created_by) : null;
    if (!ownerUserId) {
      const uRes = await pool.query(
        `SELECT id FROM users WHERE tenant_id = $1::uuid ORDER BY created_at ASC NULLS LAST LIMIT 1`,
        [tenantId]
      );
      ownerUserId = uRes.rows[0] ? String((uRes.rows[0] as { id: string }).id) : null;
    }
    if (!ownerUserId) {
      return { ok: false, error: 'tenant_sem_usuario', status: 400 };
    }
  }

  const variables: Record<string, unknown> = {
    ...(opts.variables && typeof opts.variables === 'object' ? opts.variables : {}),
  };
  if (opts.rawPayload !== undefined) {
    variables.webhook_payload =
      typeof opts.rawPayload === 'string' ? opts.rawPayload : JSON.stringify(opts.rawPayload);
    variables['flow_session.webhook_payload'] = variables.webhook_payload;
  }

  // S27 — mapear campos do body → variáveis de sessão
  if (wh.payloadMap.length) {
    const mapped = applyWebhookPayloadMap(opts.rawPayload ?? opts.variables ?? {}, wh.payloadMap);
    for (const [k, v] of Object.entries(mapped)) {
      variables[k] = v;
    }
  }

  const { buildFlowSessionVariableBag, mergeFlowVariableSeed } = await import(
    './flowVariableContext.js'
  );
  const seed = await buildFlowSessionVariableBag({
    tenantId,
    conversationId,
    actorUserId: ownerUserId,
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
      conversationId,
      JSON.stringify(mergedVars),
    ]
  );
  const sessionId = String(ins.rows[0].id);

  console.log(
    JSON.stringify({
      event: 'chatbot_flows_runtime',
      reason: 'webhook',
      session_id: sessionId,
      flow_id: String(flowRow.flow_id),
      conversation_id: conversationId,
      orphan: conversationId == null,
    })
  );

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
    ownerUserId,
    conversationId,
    sessionId,
    result,
    graph,
  });

  return { ok: true, sessionId, flowId: String(flowRow.flow_id) };
}

/**
 * S23 — start manual a partir do chat (operador).
 * Não usa mensagem outgoing como trigger.
 */
/**
 * S31 — inicia flow publicado por evento CRM (tag adicionada / entrada em coluna).
 * Não re-dispara se já houver sessão viva; ignora quando source=chatbot_flows (loop-safe).
 */
export async function runChatbotFlowsRuntimeFromCrmEvent(opts: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
  event:
    | { kind: 'tag'; tagId?: string | null; tagLabel?: string | null }
    | { kind: 'kanban_column'; columnId: string; boardId?: string | null };
  /** Origem: chatbot_flows = skip (evita loop add_tag/move_kanban). */
  source?: 'user' | 'chatbot_flows' | 'system' | string;
}): Promise<{ started: boolean; sessionId?: string; flowId?: string; skipped?: string }> {
  if (opts.source === 'chatbot_flows') {
    return { started: false, skipped: 'source_chatbot_flows' };
  }

  try {
    if (!(await tenantHasFeature(opts.tenantId, 'chatbot_flows_runtime'))) {
      return { started: false, skipped: 'runtime_off' };
    }

    const convRes = await pool.query(
      `SELECT c.id, c.user_id, c.assigned_to_user_id, c.attendance_status, c.external_chat_id,
              c.instance_id, u.tenant_id
       FROM chat_conversations c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
       LIMIT 1`,
      [opts.conversationId, opts.tenantId]
    );
    const conv = convRes.rows[0] as Record<string, unknown> | undefined;
    if (!conv) return { started: false, skipped: 'conversation_not_found' };

    const humanBusy =
      conv.assigned_to_user_id != null || String(conv.attendance_status || '') === 'in_progress';
    if (humanBusy) {
      return { started: false, skipped: 'human_busy' };
    }

    const liveRes = await pool.query(
      `SELECT id FROM chatbot_flow_sessions
       WHERE conversation_id = $1::uuid
         AND status IN ('active', 'waiting_input', 'waiting_delay', 'waiting_http')
       LIMIT 1`,
      [opts.conversationId]
    );
    if (liveRes.rows[0]) {
      return { started: false, skipped: 'session_alive' };
    }

    let tenantTimezone = 'America/Sao_Paulo';
    try {
      const tzRes = await pool.query<{ timezone: string | null }>(
        `SELECT timezone FROM tenants WHERE id = $1::uuid LIMIT 1`,
        [opts.tenantId]
      );
      const tz = String(tzRes.rows[0]?.timezone || '').trim();
      if (tz) tenantTimezone = tz;
    } catch {
      /* ignore */
    }

    const conversationInstanceId =
      conv.instance_id != null ? String(conv.instance_id) : null;
    const isGroup = isGroupExternalChatId(
      conv.external_chat_id != null ? String(conv.external_chat_id) : null
    );
    const ownerUserId = String(conv.user_id);

    const flowsRes = await pool.query(
      `SELECT f.id AS flow_id, v.id AS version_id, v.graph_json, v.published_at
       FROM chatbot_flows f
       INNER JOIN chatbot_flow_versions v ON v.id = f.published_version_id
       WHERE f.tenant_id = $1::uuid AND f.status = 'active' AND f.published_version_id IS NOT NULL
       ORDER BY v.published_at DESC`,
      [opts.tenantId]
    );

    let candidates: Array<{
      flowId: string;
      versionId: string;
      graph: RuntimeGraph;
      reason: 'tag' | 'kanban_column';
      priority: number;
      publishedAt: string | Date | null;
    }> = [];

    for (const row of flowsRes.rows as Array<Record<string, unknown>>) {
      const g = normalizeGraph(row.graph_json);
      const startNode = findStartNode(g);
      const startData = startNode?.data as Record<string, unknown> | undefined;
      const guards = parseStartGuardConfig(startData);
      const flowId = String(row.flow_id);

      if (isStartDmOnly(startData) && isGroup) {
        logStartSkip({ conversationId: opts.conversationId, flowId, reason: 'dm_only_group' });
        continue;
      }
      if (!isInstanceAllowed(guards.instanceIds, conversationInstanceId)) {
        logStartSkip({
          conversationId: opts.conversationId,
          flowId,
          reason: 'instance_mismatch',
        });
        continue;
      }
      if (guards.scheduleEnabled) {
        const okSch = isWithinScheduleWindow({
          timeZone: tenantTimezone,
          startHm: guards.scheduleStartHm,
          endHm: guards.scheduleEndHm,
        });
        if (!okSch) {
          logStartSkip({
            conversationId: opts.conversationId,
            flowId,
            reason: 'outside_schedule',
          });
          continue;
        }
      }

      const reason = matchFlowCrmEventTrigger({ graph: g, event: opts.event });
      if (!reason) continue;

      if (guards.cooldownMinutes > 0) {
        const coolRes = await pool.query<{ ended_at: Date }>(
          `SELECT ended_at
           FROM chatbot_flow_sessions
           WHERE conversation_id = $1::uuid AND flow_id = $2::uuid
             AND status IN ('ended', 'error', 'paused')
             AND ended_at IS NOT NULL
           ORDER BY ended_at DESC
           LIMIT 1`,
          [opts.conversationId, flowId]
        );
        if (
          isCooldownActive({
            cooldownMinutes: guards.cooldownMinutes,
            lastEndedAt: coolRes.rows[0]?.ended_at ?? null,
          })
        ) {
          logStartSkip({
            conversationId: opts.conversationId,
            flowId,
            reason: 'cooldown',
          });
          continue;
        }
      }

      candidates.push({
        flowId,
        versionId: String(row.version_id),
        graph: g,
        reason,
        priority: guards.priority,
        publishedAt: (row.published_at as Date | string) ?? null,
      });
    }

    candidates = sortFlowMatchCandidates(candidates);
    const matched = candidates[0] ?? null;
    if (!matched) {
      return { started: false, skipped: 'no_trigger_match' };
    }

    const { buildFlowSessionVariableBag, mergeFlowVariableSeed } = await import(
      './flowVariableContext.js'
    );
    const seed = await buildFlowSessionVariableBag({
      tenantId: opts.tenantId,
      conversationId: opts.conversationId,
      actorUserId: opts.actorUserId || ownerUserId,
    });
    const mergedVars = mergeFlowVariableSeed({}, seed);

    const ins = await pool.query(
      `INSERT INTO chatbot_flow_sessions
         (tenant_id, flow_id, flow_version_id, conversation_id, status, current_node_id, variables)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'active', NULL, $5::jsonb)
       RETURNING id`,
      [
        opts.tenantId,
        matched.flowId,
        matched.versionId,
        opts.conversationId,
        JSON.stringify(mergedVars),
      ]
    );
    const sessionId = String(ins.rows[0].id);

    const result = processInboundStep({
      graph: matched.graph,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: mergedVars,
        waitingVariable: null,
      },
      messageBody: null,
      justStarted: true,
    });

    const applyError = await applyRuntimeActions({
      tenantId: opts.tenantId,
      ownerUserId,
      conversationId: opts.conversationId,
      sessionId,
      result,
      graph: matched.graph,
    });

    console.log(
      JSON.stringify({
        event: 'chatbot_flows_runtime',
        conversationId: opts.conversationId,
        sessionId,
        status: result.session.status,
        reason: matched.reason,
        flowId: matched.flowId,
        applyError: applyError || null,
        actions: result.actions.map((a) => a.type),
      })
    );

    return { started: true, sessionId, flowId: matched.flowId };
  } catch (e) {
    console.warn('[chatbot_flows_runtime] crm_event failed', e);
    return { started: false, skipped: 'error' };
  }
}

export async function runChatbotFlowsRuntimeManualStart(opts: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
  flowId?: string | null;
  /** Admin force quando conversa em atendimento humano (D22.3). */
  force?: boolean;
  isTenantAdmin?: boolean;
}): Promise<
  | { ok: true; sessionId: string; flowId: string }
  | { ok: false; error: string; status: number }
> {
  if (!(await tenantHasFeature(opts.tenantId, 'chatbot_flows_runtime'))) {
    return { ok: false, error: 'runtime_desligado', status: 403 };
  }

  const convRes = await pool.query(
    `SELECT c.id, c.user_id, c.assigned_to_user_id, c.attendance_status, c.external_chat_id,
            c.instance_id, u.tenant_id
     FROM chat_conversations c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
     LIMIT 1`,
    [opts.conversationId, opts.tenantId]
  );
  const conv = convRes.rows[0] as Record<string, unknown> | undefined;
  if (!conv) return { ok: false, error: 'conversa_nao_encontrada', status: 404 };

  const humanBusy =
    conv.assigned_to_user_id != null || String(conv.attendance_status || '') === 'in_progress';
  if (humanBusy) {
    if (!(opts.force && opts.isTenantAdmin)) {
      await pauseChatbotFlowSessionsForConversation(opts.conversationId);
      return { ok: false, error: 'conversa_em_atendimento_humano', status: 409 };
    }
  }

  let flowSql = `
    SELECT f.id AS flow_id, v.id AS version_id, v.graph_json
    FROM chatbot_flows f
    INNER JOIN chatbot_flow_versions v ON v.id = f.published_version_id
    WHERE f.tenant_id = $1::uuid AND f.status = 'active' AND f.published_version_id IS NOT NULL`;
  const flowParams: unknown[] = [opts.tenantId];
  if (opts.flowId) {
    flowSql += ` AND f.id = $2::uuid`;
    flowParams.push(opts.flowId);
  }
  flowSql += ` ORDER BY v.published_at DESC LIMIT 1`;

  const flowRes = await pool.query(flowSql, flowParams);
  const flowRow = flowRes.rows[0] as Record<string, unknown> | undefined;
  if (!flowRow) return { ok: false, error: 'flow_nao_encontrado_ou_nao_publicado', status: 404 };

  const graph = normalizeGraph(flowRow.graph_json);
  const startNode = findStartNode(graph);
  if (!startNode) return { ok: false, error: 'flow_sem_start', status: 400 };

  const startData = startNode.data as Record<string, unknown> | undefined;
  const guards = parseStartGuardConfig(startData);
  const convInstanceId = conv.instance_id != null ? String(conv.instance_id) : null;

  if (
    isStartDmOnly(startData) &&
    isGroupExternalChatId(conv.external_chat_id != null ? String(conv.external_chat_id) : null)
  ) {
    return { ok: false, error: 'flow_somente_1a1', status: 400 };
  }
  if (!isInstanceAllowed(guards.instanceIds, convInstanceId)) {
    return { ok: false, error: 'flow_instancia_nao_permitida', status: 400 };
  }
  if (guards.cooldownMinutes > 0) {
    const coolRes = await pool.query<{ ended_at: Date }>(
      `SELECT ended_at
       FROM chatbot_flow_sessions
       WHERE conversation_id = $1::uuid AND flow_id = $2::uuid
         AND status IN ('ended', 'error', 'paused')
         AND ended_at IS NOT NULL
       ORDER BY ended_at DESC
       LIMIT 1`,
      [opts.conversationId, flowRow.flow_id]
    );
    if (
      isCooldownActive({
        cooldownMinutes: guards.cooldownMinutes,
        lastEndedAt: coolRes.rows[0]?.ended_at ?? null,
      })
    ) {
      return { ok: false, error: 'flow_em_cooldown', status: 429 };
    }
  }

  await pool.query(
    `UPDATE chatbot_flow_sessions
     SET status = 'ended', ended_at = COALESCE(ended_at, now()), updated_at = now()
     WHERE conversation_id = $1::uuid
       AND status IN ('active', 'waiting_input', 'waiting_delay', 'waiting_http')`,
    [opts.conversationId]
  );

  const ownerUserId = String(conv.user_id);
  const { buildFlowSessionVariableBag, mergeFlowVariableSeed } = await import(
    './flowVariableContext.js'
  );
  const seed = await buildFlowSessionVariableBag({
    tenantId: opts.tenantId,
    conversationId: opts.conversationId,
    actorUserId: opts.actorUserId || ownerUserId,
  });
  const mergedVars = mergeFlowVariableSeed({}, seed);

  const ins = await pool.query(
    `INSERT INTO chatbot_flow_sessions
       (tenant_id, flow_id, flow_version_id, conversation_id, status, current_node_id, variables)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'active', NULL, $5::jsonb)
     RETURNING id`,
    [
      opts.tenantId,
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
    justStarted: true,
  });

  const applyError = await applyRuntimeActions({
    tenantId: opts.tenantId,
    ownerUserId,
    conversationId: opts.conversationId,
    sessionId,
    result,
    graph,
  });

  console.log(
    JSON.stringify({
      event: 'chatbot_flows_runtime',
      conversationId: opts.conversationId,
      sessionId,
      status: result.session.status,
      reason: 'manual',
      flowId: String(flowRow.flow_id),
      applyError: applyError || null,
      actions: result.actions.map((a) => a.type),
    })
  );

  if (applyError) {
    return { ok: false, error: applyError, status: 502 };
  }

  return { ok: true, sessionId, flowId: String(flowRow.flow_id) };
}

