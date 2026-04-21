/**
 * Visualização pública de proposta/orçamento por token (Etapa 3).
 * Sem JWT; isolamento por hash de token + verificação tenant/proposta.
 */
import type { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import {
  resolveProposalByPublicRawToken,
  loadProposalPublicPayload,
} from '../services/proposalPublicViewService.js';
import {
  insertProposalTimelineEvent,
  maybeRecordProposalViewedPublic,
} from '../services/proposalTimelineService.js';
import {
  onProposalPublicAccepted,
  onProposalPublicRejected,
} from '../services/proposalPublicAcceptHooks.js';
import { runProposalKanbanAcceptAutomation } from '../services/proposalKanbanAcceptAutomationService.js';

const VIEW_DISCLAIMER =
  'Esta página é somente para visualização da proposta comercial. O pagamento e a emissão de fatura são tratados pela equipe após o aceite.';

/** Coluna Etapa 4 — se a migração 121 ainda não rodou, assume `none`. */
async function loadPostAcceptBillingMode(proposalId: string): Promise<string> {
  try {
    const r = await pool.query<{ post_accept_billing_mode: string }>(
      `SELECT post_accept_billing_mode FROM proposals WHERE id = $1`,
      [proposalId]
    );
    return r.rows[0]?.post_accept_billing_mode || 'none';
  } catch (e) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
    if (code === '42703') return 'none';
    throw e;
  }
}

function statusLabelPt(displayStatus: string): string {
  const m: Record<string, string> = {
    draft: 'Rascunho (pré-visualização)',
    sent: 'Enviada',
    accepted: 'Aceita',
    rejected: 'Recusada',
    expired: 'Expirada',
    invoiced: 'Faturada',
  };
  return m[displayStatus] ?? displayStatus;
}

export async function getPublicProposalView(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const resolved = await resolveProposalByPublicRawToken(raw);
    if (!resolved) {
      res.status(404).json({
        error: 'Link inválido ou revogado.',
        code: 'PROPOSAL_PUBLIC_NOT_FOUND',
      });
      return;
    }

    const payload = await loadProposalPublicPayload(resolved.proposal_id, resolved.tenant_id);
    if (!payload) {
      res.status(404).json({
        error: 'Proposta não encontrada.',
        code: 'PROPOSAL_PUBLIC_NOT_FOUND',
      });
      return;
    }

    try {
      await maybeRecordProposalViewedPublic(resolved.proposal_id);
    } catch (e) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (code !== '42P01') {
        console.error('[getPublicProposalView] timeline viewed:', e);
      }
    }

    res.json({
      ...payload,
      status_label: statusLabelPt(payload.display_status),
      disclaimer: VIEW_DISCLAIMER,
    });
  } catch (e) {
    console.error('getPublicProposalView:', e);
    res.status(500).json({ error: 'Erro ao carregar proposta.' });
  }
}

export async function postPublicProposalAccept(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const resolved = await resolveProposalByPublicRawToken(raw);
    if (!resolved) {
      res.status(404).json({
        error: 'Link inválido ou revogado.',
        code: 'PROPOSAL_PUBLIC_NOT_FOUND',
      });
      return;
    }

    const upd = await pool.query<{
      id: string;
      user_id: string;
      valid_until: string | null;
      client_id: string | null;
      lead_id: string | null;
    }>(
      `UPDATE proposals p
       SET status = 'accepted', updated_at = now()
       WHERE p.id = $1
         AND EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id AND u.tenant_id = $2)
         AND p.status = 'sent'
         AND p.converted_invoice_id IS NULL
         AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE)
       RETURNING p.id::text AS id, p.user_id::text AS user_id,
                 p.valid_until::text AS valid_until, p.client_id::text AS client_id,
                 p.lead_id::text AS lead_id`,
      [resolved.proposal_id, resolved.tenant_id]
    );

    if (upd.rows.length === 0) {
      res.status(409).json({
        error: 'Esta proposta não pode mais ser aceita (status, validade ou vínculo com fatura).',
        code: 'PROPOSAL_PUBLIC_ACTION_BLOCKED',
      });
      return;
    }

    const row = upd.rows[0]!;
    const billingMode = await loadPostAcceptBillingMode(resolved.proposal_id);

    try {
      await insertProposalTimelineEvent({
        proposalId: resolved.proposal_id,
        eventType: 'proposal_accepted',
        payload: { source: 'public_link' },
        actorUserId: null,
      });
    } catch (e) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (code !== '42P01') {
        console.error('[postPublicProposalAccept] timeline:', e);
      }
    }

    try {
      await onProposalPublicAccepted({
        tenantId: resolved.tenant_id,
        proposalId: resolved.proposal_id,
        ownerUserId: row.user_id,
        billingMode,
        validUntil: row.valid_until,
        clientId: row.client_id,
      });
    } catch (e) {
      console.error('[postPublicProposalAccept] hooks:', e);
    }

    try {
      await runProposalKanbanAcceptAutomation({
        tenantId: resolved.tenant_id,
        proposalId: resolved.proposal_id,
        clientId: row.client_id,
        leadId: row.lead_id,
        actorUserId: row.user_id,
        acceptanceSource: 'public_link',
      });
    } catch (e) {
      console.error('[postPublicProposalAccept] kanban accept automation:', e);
    }

    res.json({ ok: true, status: 'accepted' });
  } catch (e) {
    console.error('postPublicProposalAccept:', e);
    res.status(500).json({ error: 'Erro ao registrar aceite.' });
  }
}

export async function postPublicProposalReject(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.token || '').trim();
    const resolved = await resolveProposalByPublicRawToken(raw);
    if (!resolved) {
      res.status(404).json({
        error: 'Link inválido ou revogado.',
        code: 'PROPOSAL_PUBLIC_NOT_FOUND',
      });
      return;
    }

    const upd = await pool.query<{ id: string; user_id: string }>(
      `UPDATE proposals p
       SET status = 'rejected', updated_at = now()
       WHERE p.id = $1
         AND EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id AND u.tenant_id = $2)
         AND p.status = 'sent'
         AND p.converted_invoice_id IS NULL
         AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE)
       RETURNING p.id::text AS id, p.user_id::text AS user_id`,
      [resolved.proposal_id, resolved.tenant_id]
    );

    if (upd.rows.length === 0) {
      res.status(409).json({
        error: 'Esta proposta não pode mais ser recusada (status, validade ou vínculo com fatura).',
        code: 'PROPOSAL_PUBLIC_ACTION_BLOCKED',
      });
      return;
    }

    const rj = upd.rows[0]!;

    try {
      await insertProposalTimelineEvent({
        proposalId: resolved.proposal_id,
        eventType: 'proposal_rejected',
        payload: { source: 'public_link' },
        actorUserId: null,
      });
    } catch (e) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (code !== '42P01') {
        console.error('[postPublicProposalReject] timeline:', e);
      }
    }

    try {
      await onProposalPublicRejected({
        tenantId: resolved.tenant_id,
        proposalId: resolved.proposal_id,
        ownerUserId: rj.user_id,
      });
    } catch (e) {
      console.error('[postPublicProposalReject] hooks:', e);
    }

    res.json({ ok: true, status: 'rejected' });
  } catch (e) {
    console.error('postPublicProposalReject:', e);
    res.status(500).json({ error: 'Erro ao registrar recusa.' });
  }
}
