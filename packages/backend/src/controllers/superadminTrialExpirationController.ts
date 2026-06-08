/**
 * Sprint K.2 — execução manual de expiração de trials (superadmin).
 */
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { expireTrialsPastDue } from '../services/subscriptionService.js';

export async function postSuperadminTrialExpirationExecute(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    if (!req.user?.is_super_admin) {
      res.status(403).json({ error: 'Acesso restrito a super administradores' });
      return;
    }

    const result = await expireTrialsPastDue();

    console.info('[trial_expiration_manual]', {
      user_id: req.user.id,
      user_email: req.user.email,
      executed_at: new Date().toISOString(),
      result,
    });

    res.json({ ok: true, result });
  } catch (e) {
    console.error('[trial_expiration_manual] error', e);
    res.status(500).json({ error: 'Erro ao executar expiração de trials' });
  }
}
