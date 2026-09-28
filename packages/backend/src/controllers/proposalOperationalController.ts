/**
 * Preview de mensagens operacionais e eventos de integração (Etapa 4).
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { assertModulePermission, assertPermissionKey, ModulePermissionError } from '../permissions/index.js';
import { loadProposalOperationalContext } from '../services/proposalOperationalContextService.js';
import { buildProposalOperationalSnippets } from '../services/proposalOperationalCopy.js';
import { listProposalIntegrationEvents } from '../services/proposalIntegrationEventsService.js';
import { listWebhookDeliveriesForProposal } from '../services/proposalWebhookDeliveryService.js';

const previewBodySchema = z.object({
  public_url: z.string().min(1).optional().nullable(),
});

export async function postProposalOperationalPreview(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const tenantId = req.tenantId;
    const { id } = req.params;
    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    const existing = await pool.query<{ user_id: string }>(
      `SELECT p.user_id FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
       WHERE p.id = $1`,
      [id, tenantId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Proposta não encontrada' });
      return;
    }
    await assertModulePermission(userId, 'proposals', 'view', undefined, req);
    await assertPermissionKey(userId, 'proposals.send', req);

    const body = previewBodySchema.parse(req.body ?? {});
    const publicUrl = (body.public_url || '').trim();

    const ctx = await loadProposalOperationalContext({
      proposalId: id,
      tenantId,
      publicUrl: publicUrl || '[Gere o link público na aba Faturamento e copie a URL completa]',
    });
    if (!ctx) {
      res.status(404).json({ error: 'Proposta não encontrada' });
      return;
    }

    const snippets = await buildProposalOperationalSnippets({
      tenantId,
      requesterUserId: userId,
      ctx,
    });

    res.json({ snippets });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: e.flatten() });
      return;
    }
    console.error('postProposalOperationalPreview:', e);
    res.status(500).json({ error: 'Erro ao montar mensagens' });
  }
}

export async function getProposalIntegrationEvents(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const tenantId = req.tenantId;
    const { id } = req.params;
    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    const existing = await pool.query<{ user_id: string }>(
      `SELECT p.user_id FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
       WHERE p.id = $1`,
      [id, tenantId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Proposta não encontrada' });
      return;
    }
    await assertModulePermission(userId, 'proposals', 'view', undefined, req);

    const events = await listProposalIntegrationEvents(id, tenantId, 100);
    res.json({ events });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    const err = e as { code?: string };
    if (err.code === '42P01') {
      res.json({ events: [] });
      return;
    }
    console.error('getProposalIntegrationEvents:', e);
    res.status(500).json({ error: 'Erro ao listar eventos' });
  }
}

export async function getProposalWebhookDeliveries(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const tenantId = req.tenantId;
    const { id } = req.params;
    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    const existing = await pool.query<{ user_id: string }>(
      `SELECT p.user_id FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
       WHERE p.id = $1`,
      [id, tenantId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Proposta não encontrada' });
      return;
    }
    await assertModulePermission(userId, 'proposals', 'view', undefined, req);

    const deliveries = await listWebhookDeliveriesForProposal(id, tenantId, 50);
    res.json({ deliveries });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    const err = e as { code?: string };
    if (err.code === '42P01') {
      res.json({ deliveries: [] });
      return;
    }
    console.error('getProposalWebhookDeliveries:', e);
    res.status(500).json({ error: 'Erro ao listar entregas' });
  }
}
