/**
 * Emissão e revogação do link público de proposta (autenticado, CRM).
 */
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { assertModulePermission, assertPermissionKey, ModulePermissionError } from '../permissions/index.js';
import {
  issueNewPublicTokenForProposal,
  revokeActivePublicTokensForProposal,
  getActiveTokenMetaForProposal,
} from '../services/proposalPublicViewService.js';
import {
  clearProposalPublicLinkCiphertext,
  decryptProposalPublicLinkToken,
  proposalPublicLinkPathFromRawToken,
  saveProposalPublicLinkCiphertext,
} from '../services/proposalPublicLinkCrmStore.js';

/** Rascunho incluído: link nasce no create e permite pré-visualização pública sem aceite. */
const LINKABLE_STATUSES = new Set(['draft', 'sent', 'accepted']);

export async function getProposalPublicLinkMeta(req: AuthRequest, res: Response): Promise<void> {
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

    const meta = await getActiveTokenMetaForProposal(id, tenantId);

    /** Caminho relativo para o cliente (quando a cifra existe no CRM), alinhado ao GET /proposals/:id. */
    let path: string | null = null;
    try {
      const ctRes = await pool.query<{ ct: string | null }>(
        `SELECT p.public_link_token_ciphertext AS ct
         FROM proposals p
         INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
         WHERE p.id = $1`,
        [id, tenantId],
      );
      const raw = decryptProposalPublicLinkToken(ctRes.rows[0]?.ct ?? null);
      if (raw) path = proposalPublicLinkPathFromRawToken(raw);
    } catch {
      path = null;
    }

    res.json({
      active: meta != null,
      created_at: meta?.created_at ?? null,
      path,
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('getProposalPublicLinkMeta:', e);
    res.status(500).json({ error: 'Erro ao consultar link público' });
  }
}

export async function issueProposalPublicLink(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const tenantId = req.tenantId;
    const { id } = req.params;
    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    const existing = await pool.query<{ user_id: string; status: string }>(
      `SELECT p.user_id, p.status FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
       WHERE p.id = $1`,
      [id, tenantId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Proposta não encontrada' });
      return;
    }

    await assertModulePermission(userId, 'proposals', 'edit', { ownerId: existing.rows[0].user_id }, req);
    await assertPermissionKey(userId, 'proposals.send', req);

    const st = existing.rows[0].status;
    if (!LINKABLE_STATUSES.has(st)) {
      res.status(400).json({
        error: 'Não é possível emitir link para esta proposta (status encerrado ou incompatível).',
        code: 'PROPOSAL_PUBLIC_LINK_STATUS',
      });
      return;
    }

    const { rawToken } = await issueNewPublicTokenForProposal({ proposalId: id, tenantId });
    try {
      await saveProposalPublicLinkCiphertext(id, rawToken);
    } catch (e) {
      console.error('[issueProposalPublicLink] persist ciphertext:', e);
    }

    res.status(201).json({
      token: rawToken,
      /** Caminho relativo no frontend (mesma origem). */
      path: `/proposal-view/${encodeURIComponent(rawToken)}`,
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    const err = e as { code?: string };
    if (err.code === '42P01') {
      res.status(503).json({
        error: 'Migração de link público pendente (tabela proposal_public_view_tokens).',
        code: 'MIGRATION_REQUIRED',
      });
      return;
    }
    console.error('issueProposalPublicLink:', e);
    res.status(500).json({ error: 'Erro ao gerar link público' });
  }
}

export async function revokeProposalPublicLink(req: AuthRequest, res: Response): Promise<void> {
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

    await assertModulePermission(userId, 'proposals', 'edit', { ownerId: existing.rows[0].user_id }, req);
    await assertPermissionKey(userId, 'proposals.send', req);

    const n = await revokeActivePublicTokensForProposal(id, tenantId);
    try {
      await clearProposalPublicLinkCiphertext(id);
    } catch (e) {
      console.error('[revokeProposalPublicLink] clear ciphertext:', e);
    }
    res.json({ ok: true, revoked: n });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('revokeProposalPublicLink:', e);
    res.status(500).json({ error: 'Erro ao revogar link' });
  }
}
