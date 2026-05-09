import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, assertPermissionKey, ModulePermissionError } from '../permissions/index.js';
import { findSignerInTenant } from '../utils/contractAccess.js';
import {
  getSignatureInviteMetaForSigner,
  issueSignatureInvite,
  revokeSignatureInvite,
} from '../services/contractSignatureInviteService.js';

const issueBodySchema = z.object({
  regenerate: z.boolean().optional(),
});

export async function getSignatureInviteMeta(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { contractId, signerId } = req.params;
    const signer = await findSignerInTenant(signerId, userId);
    if (!signer || signer.contract_id !== contractId) {
      res.status(404).json({ error: 'Signatário não encontrado' });
      return;
    }
    await assertModulePermission(
      userId,
      'contracts',
      'view',
      { ownerId: signer.user_id, assigneeId: signer.responsible_id },
      req
    );
    const meta = await getSignatureInviteMetaForSigner({ contractId, signerId, requesterUserId: userId });
    if (!meta) {
      res.status(404).json({ error: 'Signatário não encontrado' });
      return;
    }
    res.json(meta);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getSignatureInviteMeta:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function issueSignatureInviteHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { contractId, signerId } = req.params;
    const { regenerate } = issueBodySchema.parse(req.body ?? {});

    const signer = await findSignerInTenant(signerId, userId);
    if (!signer || signer.contract_id !== contractId) {
      res.status(404).json({ error: 'Signatário não encontrado' });
      return;
    }
    await assertModulePermission(
      userId,
      'contracts',
      'edit',
      { ownerId: signer.user_id, assigneeId: signer.responsible_id },
      req
    );
    await assertPermissionKey(userId, 'contracts.request_signature', req);

    const result = await issueSignatureInvite({
      contractId,
      signerId,
      requesterUserId: userId,
      regenerate: regenerate === true,
      createdByUserId: userId,
    });

    if (!result.ok) {
      if (result.code === 'NOT_ELIGIBLE') {
        res.status(400).json({
          error:
            'Não é possível emitir convite: contrato deve estar pendente/parcial de assinatura, com snapshot válido, e o signatário ainda não pode ter assinado.',
          code: 'SIGNATURE_INVITE_NOT_ELIGIBLE',
        });
        return;
      }
      if (result.code === 'ALREADY_EXISTS') {
        res.status(409).json({
          error:
            'Já existe um convite ativo para este signatário. Use regenerar para criar um novo link (o anterior deixa de funcionar).',
          code: 'SIGNATURE_INVITE_ALREADY_EXISTS',
          created_at: result.created_at,
        });
        return;
      }
      if (result.code === 'CONFLICT') {
        res.status(409).json({
          error: 'Conflito ao gravar o convite. Tente novamente.',
          code: 'SIGNATURE_INVITE_CONFLICT',
        });
        return;
      }
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }

    res.status(201).json({
      token: result.raw_token,
      frontend_path: result.frontend_path,
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
    console.error('issueSignatureInviteHandler:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function revokeSignatureInviteHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { contractId, signerId } = req.params;
    const signer = await findSignerInTenant(signerId, userId);
    if (!signer || signer.contract_id !== contractId) {
      res.status(404).json({ error: 'Signatário não encontrado' });
      return;
    }
    await assertModulePermission(
      userId,
      'contracts',
      'edit',
      { ownerId: signer.user_id, assigneeId: signer.responsible_id },
      req
    );
    await assertPermissionKey(userId, 'contracts.request_signature', req);
    await revokeSignatureInvite({
      contractId,
      signerId,
      requesterUserId: userId,
      createdByUserId: userId,
    });
    res.status(204).send();
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('revokeSignatureInviteHandler:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
