import type { Request, Response } from 'express';
import {
  getSignupStrategy,
  getSignupStrategyHealth,
} from '../platform/signupStrategyService.js';

export async function getPublicSignupFlow(_req: Request, res: Response): Promise<void> {
  const strategy = await getSignupStrategy();
  res.json({
    flow: strategy.flow,
    entry_url: strategy.entry_url,
    closed_trial: strategy.closed_trial,
    features: strategy.features,
  });
}

export async function getPublicSignupHealth(_req: Request, res: Response): Promise<void> {
  const health = await getSignupStrategyHealth();
  res.json(health);
}
