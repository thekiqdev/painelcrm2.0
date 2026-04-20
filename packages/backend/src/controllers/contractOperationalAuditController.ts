/**
 * Etapa 6 — Rastreabilidade operacional (sem motor de envio): regista ações assistidas no painel.
 */
import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { findContractInTenant } from '../utils/contractAccess.js';

const auditBodySchema = z.object({
  action_kind: z.enum([
    'MESSAGE_INVITE_COPIED',
    'MESSAGE_INVITE_OPENED',
    'MESSAGE_REMINDER_COPIED',
    'MESSAGE_REMINDER_OPENED',
    'MESSAGE_VIEW_COPIED',
    'MESSAGE_VIEW_OPENED',
    'MESSAGE_COMPLETION_COPIED',
    'MESSAGE_COMPLETION_OPENED',
    'LINK_SIGNATURE_COPIED',
    'LINK_SIGNATURE_OPENED',
  ]),
  signer_id: z.string().uuid().optional().nullable(),
});

const DESCRIPTIONS: Record<string, string> = {
  MESSAGE_INVITE_COPIED: 'Assistido: texto de convite inicial copiado (envio manual).',
  MESSAGE_INVITE_OPENED: 'Assistido: modal de convite inicial aberto.',
  MESSAGE_REMINDER_COPIED: 'Assistido: texto de lembrete copiado (mesmo convite ativo).',
  MESSAGE_REMINDER_OPENED: 'Assistido: modal de lembrete aberto.',
  MESSAGE_VIEW_COPIED: 'Assistido: texto de link só visualização copiado.',
  MESSAGE_VIEW_OPENED: 'Assistido: modal de mensagem de visualização aberto.',
  MESSAGE_COMPLETION_COPIED: 'Assistido: texto de conclusão copiado.',
  MESSAGE_COMPLETION_OPENED: 'Assistido: modal de conclusão aberto.',
  LINK_SIGNATURE_COPIED: 'Assistido: URL de assinatura copiada.',
  LINK_SIGNATURE_OPENED: 'Assistido: URL de assinatura aberta no browser.',
};

export async function postContractOperationalAudit(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const body = auditBodySchema.parse(req.body ?? {});

    const contract = await findContractInTenant(id, userId);
    if (!contract) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    await assertModulePermission(
      userId,
      'contracts',
      'view',
      { ownerId: contract.user_id, assigneeId: contract.responsible_id },
      req
    );

    await pool.query(
      `INSERT INTO contract_events (contract_id, event_type, description, metadata, created_by)
       VALUES ($1, 'CONTRACT_OPERATIONS_AUDIT', $2, $3::jsonb, $4)`,
      [
        id,
        DESCRIPTIONS[body.action_kind] ?? 'Assistido: ação operacional registada.',
        JSON.stringify({
          channel: 'panel_assisted',
          action_kind: body.action_kind,
          signer_id: body.signer_id ?? null,
        }),
        userId,
      ]
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('postContractOperationalAudit:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
