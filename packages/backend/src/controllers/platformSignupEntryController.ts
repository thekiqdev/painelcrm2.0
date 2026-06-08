import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getPublicSignupEntryPayload,
  getSignupEntryRuntimeConfig,
  setSignupEntryRuntimeConfig,
  type SignupEntryMode,
} from '../platform/platformRuntimeConfig.js';

export async function getPublicSignupEntry(_req: Request, res: Response): Promise<void> {
  const payload = await getPublicSignupEntryPayload();
  res.json(payload);
}

const patchSchema = z.object({
  mode: z.enum(['legacy_checkout', 'acquisition_flow']).optional(),
  post_activation_path: z.string().optional(),
  legacy_checkout_enabled: z.boolean().optional(),
  acquisition_flow_enabled: z.boolean().optional(),
});

export async function getSuperadminSignupAcquisitionSettings(
  _req: AuthRequest,
  res: Response,
): Promise<void> {
  const [config, publicPayload] = await Promise.all([
    getSignupEntryRuntimeConfig(),
    getPublicSignupEntryPayload(),
  ]);
  res.json({
    ok: true,
    config,
    effective_entry_mode: publicPayload.entry_mode,
    paths: publicPayload.paths,
    acquisition_flags: publicPayload.acquisition_flags,
  });
}

export async function patchSuperadminSignupAcquisitionSettings(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const body = patchSchema.parse(req.body ?? {});
    const next = await setSignupEntryRuntimeConfig(
      {
        mode: body.mode as SignupEntryMode | undefined,
        post_activation_path: body.post_activation_path,
        legacy_checkout_enabled: body.legacy_checkout_enabled,
        acquisition_flow_enabled: body.acquisition_flow_enabled,
      },
      req.userId,
    );
    const publicPayload = await getPublicSignupEntryPayload();
    res.json({
      ok: true,
      config: next,
      effective_entry_mode: publicPayload.entry_mode,
      paths: publicPayload.paths,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[platform] patch_signup_entry', e);
    res.status(500).json({ ok: false, error: 'Erro ao salvar configuração' });
  }
}
