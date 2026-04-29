import { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { canChatAction } from '../services/chatAccess.js';
import { pool } from '../utils/db.js';
import { hasChatAutomationTables } from '../utils/chatAttendanceSchema.js';
import {
  getOrCreateAutomationSettings,
  patchAutomationSettings,
} from '../services/chatAutomationSettingsService.js';
import { hasChatAutomationLogsTable } from '../utils/chatAttendanceSchema.js';
import { listAutomationLogsForTenant } from '../services/chatAutomationLogService.js';

async function allowAutomationManagement(req: AuthRequest, userId: string): Promise<boolean> {
  return (
    (await canChatAction(userId, 'manage_automation', req)) ||
    (await canChatAction(userId, 'manage_queues', req))
  );
}

const settingsPatchSchema = z.object({
  automation_enabled: z.boolean().optional(),
  auto_status_from_customer: z.boolean().optional(),
  auto_status_from_agent: z.boolean().optional(),
  distribution_enabled: z.boolean().optional(),
  sla_alerts_enabled: z.boolean().optional(),
  sla_risk_percent: z.number().int().min(50).max(99).nullable().optional(),
  sla_first_response_minutes: z.number().int().positive().nullable().optional(),
  sla_next_response_minutes: z.number().int().positive().nullable().optional(),
  inactivity_reset_minutes: z.number().int().positive().nullable().optional(),
});

const ruleCreateSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  priority: z.number().int().optional(),
  is_active: z.boolean().optional(),
  match_type: z.enum(['keyword_body', 'client_tag', 'client_new', 'client_existing']),
  pattern: z.string().min(1),
  action: z.enum(['set_queue', 'set_team', 'set_priority', 'assign_user']),
  target_queue_id: z.string().uuid().nullable().optional(),
  target_team_id: z.string().uuid().nullable().optional(),
  target_user_id: z.string().uuid().nullable().optional(),
  priority_value: z.string().nullable().optional(),
});

const rulePatchSchema = ruleCreateSchema.partial();

const distributionPutSchema = z.object({
  team_id: z.string().uuid().nullable(),
  strategy: z.enum(['none', 'round_robin', 'least_open']),
  auto_assign: z.boolean(),
});

export async function getChatAutomationSettings(req: AuthRequest, res: Response) {
  if (!(await hasChatAutomationTables())) {
    return res.status(503).json({ error: 'Migração Fase 6 não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await allowAutomationManagement(req, req.userId!))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const row = await getOrCreateAutomationSettings(tenantId);
  return res.json(row);
}

export async function patchChatAutomationSettings(req: AuthRequest, res: Response) {
  if (!(await hasChatAutomationTables())) {
    return res.status(503).json({ error: 'Migração Fase 6 não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await allowAutomationManagement(req, req.userId!))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const p = settingsPatchSchema.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'Dados inválidos', details: p.error.flatten() });
  const row = await patchAutomationSettings(tenantId, p.data);
  return res.json(row);
}

export async function listChatAutomationRules(req: AuthRequest, res: Response) {
  if (!(await hasChatAutomationTables())) {
    return res.status(503).json({ error: 'Migração Fase 6 não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await allowAutomationManagement(req, req.userId!))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const r = await pool.query(
    `SELECT * FROM chat_automation_rules WHERE tenant_id = $1 ORDER BY priority ASC, created_at ASC`,
    [tenantId]
  );
  return res.json({ items: r.rows });
}

export async function getChatAutomationLogs(req: AuthRequest, res: Response) {
  if (!(await hasChatAutomationLogsTable())) {
    return res.status(503).json({ error: 'Migração Fase 7 não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  const canSee =
    (await canChatAction(req.userId!, 'view_metrics', req)) ||
    (await allowAutomationManagement(req, req.userId!));
  if (!canSee) return res.status(403).json({ error: 'Sem permissão' });
  const lim = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '40'), 10) || 40));
  const rows = await listAutomationLogsForTenant(tenantId, lim);
  return res.json({
    items: rows.map((l) => ({
      ...l,
      created_at: l.created_at.toISOString(),
    })),
  });
}

export async function postChatAutomationRule(req: AuthRequest, res: Response) {
  if (!(await hasChatAutomationTables())) {
    return res.status(503).json({ error: 'Migração Fase 6 não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await allowAutomationManagement(req, req.userId!))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const p = ruleCreateSchema.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'Dados inválidos', details: p.error.flatten() });
  const ins = await pool.query(
    `INSERT INTO chat_automation_rules (
       tenant_id, name, priority, is_active, match_type, pattern, action,
       target_queue_id, target_team_id, target_user_id, priority_value
     ) VALUES ($1, $2, $3, COALESCE($4, true), $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      tenantId,
      p.data.name ?? null,
      p.data.priority ?? 100,
      p.data.is_active,
      p.data.match_type,
      p.data.pattern,
      p.data.action,
      p.data.target_queue_id ?? null,
      p.data.target_team_id ?? null,
      p.data.target_user_id ?? null,
      p.data.priority_value ?? null,
    ]
  );
  return res.status(201).json(ins.rows[0]);
}

export async function patchChatAutomationRule(req: AuthRequest, res: Response) {
  if (!(await hasChatAutomationTables())) {
    return res.status(503).json({ error: 'Migração Fase 6 não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await allowAutomationManagement(req, req.userId!))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const p = rulePatchSchema.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'Dados inválidos', details: p.error.flatten() });
  const keys = Object.keys(p.data).filter((k) => (p.data as Record<string, unknown>)[k] !== undefined);
  if (keys.length === 0) {
    const cur = await pool.query(`SELECT * FROM chat_automation_rules WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      tenantId,
    ]);
    if (cur.rowCount === 0) return res.status(404).json({ error: 'Regra não encontrada' });
    return res.json(cur.rows[0]);
  }
  const vals: unknown[] = [];
  const sets = keys.map((k, i) => {
    vals.push((p.data as Record<string, unknown>)[k]);
    return `${k} = $${i + 1}`;
  });
  const idParam = keys.length + 1;
  const tenantParam = keys.length + 2;
  vals.push(req.params.id, tenantId);
  const r = await pool.query(
    `UPDATE chat_automation_rules SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${idParam} AND tenant_id = $${tenantParam}
     RETURNING *`,
    vals
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'Regra não encontrada' });
  return res.json(r.rows[0]);
}

export async function deleteChatAutomationRule(req: AuthRequest, res: Response) {
  if (!(await hasChatAutomationTables())) {
    return res.status(503).json({ error: 'Migração Fase 6 não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await allowAutomationManagement(req, req.userId!))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const r = await pool.query(`DELETE FROM chat_automation_rules WHERE id = $1 AND tenant_id = $2 RETURNING id`, [
    req.params.id,
    tenantId,
  ]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Regra não encontrada' });
  return res.status(204).send();
}

export async function listChatQueueDistribution(req: AuthRequest, res: Response) {
  if (!(await hasChatAutomationTables())) {
    return res.status(503).json({ error: 'Migração Fase 6 não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await allowAutomationManagement(req, req.userId!))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const r = await pool.query(
    `SELECT q.id AS queue_id, q.name AS queue_name,
            d.id AS distribution_row_id, d.team_id, d.strategy, d.auto_assign, d.updated_at AS distribution_updated_at
     FROM chat_queues q
     LEFT JOIN chat_queue_distribution d ON d.queue_id = q.id AND d.tenant_id = q.tenant_id
     WHERE q.tenant_id = $1
     ORDER BY q.name`,
    [tenantId]
  );
  return res.json({ items: r.rows });
}

export async function putChatQueueDistribution(req: AuthRequest, res: Response) {
  if (!(await hasChatAutomationTables())) {
    return res.status(503).json({ error: 'Migração Fase 6 não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await allowAutomationManagement(req, req.userId!))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const queueId = req.params.queueId;
  const p = distributionPutSchema.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'Dados inválidos', details: p.error.flatten() });

  const qok = await pool.query(`SELECT 1 FROM chat_queues WHERE id = $1 AND tenant_id = $2`, [
    queueId,
    tenantId,
  ]);
  if ((qok.rowCount ?? 0) === 0) return res.status(404).json({ error: 'Fila não encontrada' });

  if (p.data.team_id) {
    const tok = await pool.query(`SELECT 1 FROM teams WHERE id = $1 AND tenant_id = $2`, [
      p.data.team_id,
      tenantId,
    ]);
    if ((tok.rowCount ?? 0) === 0) return res.status(400).json({ error: 'Equipa inválida' });
  }

  const r = await pool.query(
    `INSERT INTO chat_queue_distribution (tenant_id, queue_id, team_id, strategy, auto_assign)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, queue_id) DO UPDATE SET
       team_id = EXCLUDED.team_id,
       strategy = EXCLUDED.strategy,
       auto_assign = EXCLUDED.auto_assign,
       updated_at = now()
     RETURNING *`,
    [tenantId, queueId, p.data.team_id, p.data.strategy, p.data.auto_assign]
  );
  return res.json(r.rows[0]);
}
