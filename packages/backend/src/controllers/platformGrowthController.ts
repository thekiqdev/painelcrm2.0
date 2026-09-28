import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getSignupStrategy,
  getSignupStrategyHealth,
  setActiveSignupFlow,
  type ActiveSignupFlow,
} from '../platform/signupStrategyService.js';

export async function getSuperadminSignupStrategy(_req: AuthRequest, res: Response): Promise<void> {
  const [strategy, health] = await Promise.all([getSignupStrategy(), getSignupStrategyHealth()]);
  res.json({
    ok: true,
    active_signup_flow: strategy.flow,
    strategy,
    health,
  });
}

const patchSchema = z.object({
  active_signup_flow: z.enum(['checkout', 'exclusive_signup']),
});

export async function patchSuperadminSignupStrategy(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = patchSchema.parse(req.body ?? {});
    const strategy = await setActiveSignupFlow(
      body.active_signup_flow as ActiveSignupFlow,
      req.userId,
    );
    const health = await getSignupStrategyHealth();
    res.json({
      ok: true,
      active_signup_flow: strategy.flow,
      strategy,
      health,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[platform_growth] patch_signup_strategy', e);
    res.status(500).json({ ok: false, error: 'Erro ao salvar estratégia' });
  }
}
