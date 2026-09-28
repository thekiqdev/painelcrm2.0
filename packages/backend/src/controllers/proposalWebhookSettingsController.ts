/**
 * Configuração de webhook outbound de propostas (tenant).
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import {
  getTenantProposalWebhookSettings,
  upsertTenantProposalWebhookSettings,
  PROPOSAL_WEBHOOK_EVENT_KEYS,
} from '../services/proposalWebhookSettingsService.js';

const eventKeyZod = z.enum([
  PROPOSAL_WEBHOOK_EVENT_KEYS[0],
  PROPOSAL_WEBHOOK_EVENT_KEYS[1],
  PROPOSAL_WEBHOOK_EVENT_KEYS[2],
]);
import { retryWebhookDeliveryById } from '../services/proposalWebhookDeliveryService.js';
import { isWebhookSecretEncryptionConfigured } from '../services/proposalWebhookSecretCrypto.js';

const putSchema = z.object({
  enabled: z.boolean(),
  webhook_url: z.string().max(2048).optional().nullable(),
  event_keys: z.array(eventKeyZod).default([]),
  /** Novo secret (plain). Omitir ou vazio para manter o atual. */
  secret: z.string().max(512).optional().nullable(),
});

export async function getProposalWebhookSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const tenantId = req.tenantId;
    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertModulePermission(userId, 'proposals', 'proposals_manage_integrations', undefined, req);
    try {
      const row = await getTenantProposalWebhookSettings(tenantId);
      res.json({
        settings: row,
        encryption_configured: isWebhookSecretEncryptionConfigured(),
        allowed_event_keys: PROPOSAL_WEBHOOK_EVENT_KEYS,
      });
    } catch (inner: unknown) {
      const code = typeof inner === 'object' && inner !== null && 'code' in inner ? String((inner as { code: string }).code) : '';
      if (code === '42P01') {
        res.json({
          settings: null,
          encryption_configured: isWebhookSecretEncryptionConfigured(),
          allowed_event_keys: PROPOSAL_WEBHOOK_EVENT_KEYS,
        });
        return;
      }
      throw inner;
    }
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('getProposalWebhookSettings:', e);
    res.status(500).json({ error: 'Erro ao carregar configuração' });
  }
}

export async function putProposalWebhookSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const tenantId = req.tenantId;
    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertModulePermission(userId, 'proposals', 'proposals_manage_integrations', undefined, req);
    const body = putSchema.parse(req.body ?? {});
    const secretRaw = (body.secret ?? '').trim();
    if (secretRaw.length > 0 && secretRaw.length < 8) {
      res.status(400).json({ error: 'Secret deve ter pelo menos 8 caracteres.' });
      return;
    }
    const updated = await upsertTenantProposalWebhookSettings({
      tenantId,
      userId,
      enabled: body.enabled,
      webhook_url: body.webhook_url ?? null,
      event_keys: body.event_keys,
      secret_plain: secretRaw.length > 0 ? secretRaw : null,
    });
    res.json({
      settings: updated,
      encryption_configured: isWebhookSecretEncryptionConfigured(),
      allowed_event_keys: PROPOSAL_WEBHOOK_EVENT_KEYS,
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: e.flatten() });
      return;
    }
    if (e instanceof Error) {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error('putProposalWebhookSettings:', e);
    res.status(500).json({ error: 'Erro ao salvar' });
  }
}

export async function postProposalWebhookDeliveryRetry(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const tenantId = req.tenantId;
    const { id } = req.params;
    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertModulePermission(userId, 'proposals', 'proposals_manage_integrations', undefined, req);
    const r = await retryWebhookDeliveryById(id, tenantId);
    if (!r.ok) {
      res.status(404).json({ error: r.error ?? 'Não encontrado' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('postProposalWebhookDeliveryRetry:', e);
    res.status(500).json({ error: 'Erro ao reenfileirar' });
  }
}
