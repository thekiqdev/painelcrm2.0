import { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { canChatAction } from '../services/chatAccess.js';
import { hasChatBotRulesTable } from '../utils/chatAttendanceSchema.js';
import {
  listChatBotRulesForTenant,
  insertChatBotRule,
  updateChatBotRule,
  deleteChatBotRule,
} from '../services/chatBotRulesService.js';
import type { ChatBotRuleRow } from '../services/chatbotEngine.js';

const ruleTypeSchema = z.enum(['welcome_message', 'out_of_hours', 'menu', 'keyword']);

const postSchema = z.object({
  name: z.string().min(1).max(200),
  type: ruleTypeSchema,
  is_active: z.boolean().optional(),
  trigger_config: z.record(z.string(), z.unknown()).optional(),
  action_config: z.record(z.string(), z.unknown()).optional(),
  priority: z.number().int().optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  is_active: z.boolean().optional(),
  trigger_config: z.record(z.string(), z.unknown()).optional(),
  action_config: z.record(z.string(), z.unknown()).optional(),
  priority: z.number().int().optional(),
});

async function allowManage(req: AuthRequest): Promise<boolean> {
  return canChatAction(req.userId!, 'manage_automation', req);
}

export async function getChatBotRules(req: AuthRequest, res: Response) {
  if (!(await hasChatBotRulesTable())) {
    return res.status(503).json({ error: 'Migração Fase 8 (chatbot) não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await canChatAction(req.userId!, 'view', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const items = await listChatBotRulesForTenant(tenantId);
  return res.json({ items });
}

export async function postChatBotRule(req: AuthRequest, res: Response) {
  if (!(await hasChatBotRulesTable())) {
    return res.status(503).json({ error: 'Migração Fase 8 (chatbot) não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await allowManage(req))) return res.status(403).json({ error: 'Sem permissão' });
  const p = postSchema.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'Dados inválidos', details: p.error.flatten() });
  const row = await insertChatBotRule({
    tenantId,
    name: p.data.name,
    type: p.data.type as ChatBotRuleRow['type'],
    is_active: p.data.is_active,
    trigger_config: p.data.trigger_config,
    action_config: p.data.action_config,
    priority: p.data.priority,
  });
  return res.status(201).json(row);
}

export async function patchChatBotRule(req: AuthRequest, res: Response) {
  if (!(await hasChatBotRulesTable())) {
    return res.status(503).json({ error: 'Migração Fase 8 (chatbot) não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await allowManage(req))) return res.status(403).json({ error: 'Sem permissão' });
  const p = patchSchema.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'Dados inválidos', details: p.error.flatten() });
  const row = await updateChatBotRule(tenantId, req.params.id, p.data);
  if (!row) return res.status(404).json({ error: 'Regra não encontrada' });
  return res.json(row);
}

export async function deleteChatBotRuleRoute(req: AuthRequest, res: Response) {
  if (!(await hasChatBotRulesTable())) {
    return res.status(503).json({ error: 'Migração Fase 8 (chatbot) não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await allowManage(req))) return res.status(403).json({ error: 'Sem permissão' });
  const ok = await deleteChatBotRule(tenantId, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Regra não encontrada' });
  return res.status(204).send();
}
