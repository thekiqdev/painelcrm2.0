import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { pool } from '../utils/db.js';
import {
  getActiveViewTokenMetaForContract,
  getEditorPublicViewBootstrap,
  issuePublicViewToken,
  revokePublicViewToken,
} from '../services/contractPublicViewService.js';

async function loadContractPermissionRow(contractId: string, requesterUserId: string) {
  const r = await pool.query<{ user_id: string; responsible_id: string | null }>(
    `SELECT c.user_id, c.responsible_id
     FROM contracts c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
     WHERE c.id = $1`,
    [contractId, requesterUserId]
  );
  return r.rows[0] ?? null;
}

export async function getContractPublicViewLinkMeta(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const perm = await loadContractPermissionRow(id, userId);
    if (!perm) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    await assertModulePermission(userId, 'contracts', 'view', { ownerId: perm.user_id, assigneeId: perm.responsible_id }, req);
    const meta = await getActiveViewTokenMetaForContract(id, userId);
    res.json({
      has_active_link: meta != null,
      created_at: meta?.created_at ?? null,
      expires_at: meta?.expires_at ?? null,
    });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getContractPublicViewLinkMeta:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** Link público materializado para o painel (token + URL); cria token em falta (contratos antigos). */
export async function getContractPublicViewBootstrap(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const perm = await loadContractPermissionRow(id, userId);
    if (!perm) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    await assertModulePermission(userId, 'contracts', 'view', { ownerId: perm.user_id, assigneeId: perm.responsible_id }, req);
    const fe = String(process.env.FRONTEND_URL || '').trim();
    const bootstrap = await getEditorPublicViewBootstrap(id, userId, fe);
    res.json(bootstrap);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getContractPublicViewBootstrap:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const issueBodySchema = z.object({
  regenerate: z.boolean().optional(),
});

export async function issueContractPublicViewLink(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { regenerate } = issueBodySchema.parse(req.body ?? {});

    const perm = await loadContractPermissionRow(id, userId);
    if (!perm) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    await assertModulePermission(userId, 'contracts', 'edit', { ownerId: perm.user_id, assigneeId: perm.responsible_id }, req);

    const result = await issuePublicViewToken({ contractId: id, requesterUserId: userId, regenerate: regenerate === true });
    if (!result.ok) {
      if (result.code === 'NOT_ELIGIBLE') {
        res.status(400).json({
          error: 'Não é possível emitir link público de visualização para contrato cancelado.',
          code: 'CONTRACT_PUBLIC_VIEW_NOT_ELIGIBLE',
        });
        return;
      }
      if (result.code === 'ALREADY_EXISTS') {
        res.status(409).json({
          error:
            'Já existe um link de visualização ativo. Use regenerar para criar um novo (o link anterior deixa de funcionar).',
          code: 'CONTRACT_PUBLIC_VIEW_TOKEN_ALREADY_EXISTS',
          created_at: result.created_at,
        });
        return;
      }
      if (result.code === 'CONFLICT') {
        res.status(409).json({
          error: 'Conflito ao gravar o link. Tente novamente.',
          code: 'CONTRACT_PUBLIC_VIEW_CONFLICT',
        });
        return;
      }
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }

    await pool.query(
      `INSERT INTO contract_events (contract_id, event_type, description, metadata, created_by)
       VALUES ($1, 'PUBLIC_VIEW_LINK_ISSUED', $2, $3::jsonb, $4)`,
      [
        id,
        regenerate === true
          ? 'Link público de visualização regenerado (o anterior foi invalidado).'
          : 'Link público de visualização emitido.',
        JSON.stringify({
          regenerate: regenerate === true,
          action: regenerate === true ? 'REGENERATE' : 'ISSUE',
          expires_at: result.expires_at,
        }),
        userId,
      ]
    );

    res.status(201).json({
      token: result.raw_token,
      /** Caminho no front: /contract-view/:token */
      frontend_path: `/contract-view/${result.raw_token}`,
      created_at: result.created_at,
      expires_at: result.expires_at,
    });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('issueContractPublicViewLink:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function revokeContractPublicViewLink(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const perm = await loadContractPermissionRow(id, userId);
    if (!perm) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    await assertModulePermission(userId, 'contracts', 'edit', { ownerId: perm.user_id, assigneeId: perm.responsible_id }, req);
    const revokedRows = await revokePublicViewToken(id, userId);
    if (revokedRows < 0) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    if (revokedRows > 0) {
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, description, metadata, created_by)
         VALUES ($1, 'PUBLIC_VIEW_LINK_REVOKED', $2, $3::jsonb, $4)`,
        [
          id,
          'Link público de visualização revogado.',
          JSON.stringify({ action: 'REVOKE', revoked_tokens: revokedRows }),
          userId,
        ]
      );
    }
    res.status(204).send();
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('revokeContractPublicViewLink:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
