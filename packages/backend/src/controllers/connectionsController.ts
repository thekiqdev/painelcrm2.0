import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { isWhatsappOfficialSuperadminEnabled } from '../config/whatsappOfficialEnv.js';
import {
  listConnectionsSummary,
  setGlobalConnectionFlag,
} from '../services/connectionsService.js';
import { disconnectSuperadminOfficialAccount } from '../services/whatsappOfficial/whatsappOfficialConfigService.js';

const flagBodySchema = z.object({
  key: z.enum([
    'whatsapp_official_enabled',
    'whatsapp_official_tenant_enabled',
    'whatsapp_groups_enabled',
  ]),
  value: z.boolean(),
});

export async function getConnections(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const summary = await listConnectionsSummary(req.userId);
    res.json(summary);
  } catch (e) {
    console.error('[connections] list', e);
    res.status(500).json({ error: 'Erro ao listar conexões' });
  }
}

export async function putConnectionFlag(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = flagBodySchema.parse(req.body);
    const r = await setGlobalConnectionFlag(body.key, body.value);
    if (!r.ok) {
      res.status(400).json({ error: r.error || 'Falha ao atualizar' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.flatten() });
      return;
    }
    console.error('[connections] flag', e);
    res.status(500).json({ error: 'Erro ao atualizar flag' });
  }
}

export async function postWhatsappOfficialDisconnect(_req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isWhatsappOfficialSuperadminEnabled()) {
      res.status(403).json({ error: 'WhatsApp oficial desativado.' });
      return;
    }
    await disconnectSuperadminOfficialAccount();
    res.json({ ok: true });
  } catch (e) {
    console.error('[connections] wa disconnect', e);
    res.status(500).json({ error: 'Erro ao desligar' });
  }
}
