/**
 * M5 S5 — controllers Central de Vendedores + comissões.
 */

import type { Response } from 'express';
import { z } from 'zod';
import { PartnerAdminError } from './partnerAdminService.js';
import type { PartnerAuthRequest } from './partnerAuthMiddleware.js';
import {
  accrueCommissionForBilling,
  clawbackCommission,
  getSellerCommissionSummary,
  listCommissionLedger,
  markCommissionsPaid,
} from './partnerCommissionLedgerService.js';
import {
  archiveCommissionRule,
  listCommissionRules,
  upsertCommissionRule,
} from './partnerCommissionRuleService.js';
import { patchPartnerSeller } from './partnerSellerService.js';

function handleErr(err: unknown, res: Response): void {
  if (err instanceof PartnerAdminError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error('[partnerCommission]', err);
  res.status(500).json({ error: (err as Error)?.message || 'Internal server error' });
}

const ruleSchema = z.object({
  name: z.string().min(1),
  rule_type: z.enum(['percent', 'fixed', 'hybrid']),
  percent_bps: z.number().int().min(0).max(10000).optional().nullable(),
  fixed_cents: z.number().int().min(0).optional().nullable(),
  cycle_mode: z.enum(['recurring', 'custom_cycles']).optional(),
  custom_cycle_config_json: z.record(z.unknown()).optional(),
  applies_to: z.enum(['first_only', 'renewals', 'both']).optional(),
  seller_user_id: z.string().uuid().optional().nullable(),
});

export async function partnerListCommissionRules(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    res.json(await listCommissionRules(ctx.partnerTenantId));
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerUpsertCommissionRule(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = ruleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const row = await upsertCommissionRule(ctx.partnerTenantId, parsed.data);
    res.status(201).json(row);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerArchiveCommissionRule(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    await archiveCommissionRule(ctx.partnerTenantId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerListCommissions(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const seller =
      typeof req.query.seller_user_id === 'string' ? req.query.seller_user_id : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(
      await listCommissionLedger(ctx.partnerTenantId, {
        sellerUserId: seller,
        status,
      })
    );
  } catch (err) {
    handleErr(err, res);
  }
}

const payoutSchema = z.object({
  ledger_ids: z.array(z.string().uuid()).min(1),
  reference: z.string().optional().nullable(),
});

export async function partnerMarkCommissionsPaid(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = payoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const result = await markCommissionsPaid(ctx.partnerTenantId, {
      ledger_ids: parsed.data.ledger_ids,
      reference: parsed.data.reference,
      marked_by_user_id: req.userId ?? null,
    });
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
}

const clawbackSchema = z.object({
  reason: z.string().optional(),
});

export async function partnerClawbackCommission(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = clawbackSchema.safeParse(req.body ?? {});
    const row = await clawbackCommission(
      ctx.partnerTenantId,
      req.params.id,
      parsed.success ? parsed.data.reason : undefined
    );
    res.json(row);
  } catch (err) {
    handleErr(err, res);
  }
}

const accrueSchema = z.object({
  billing_id: z.string().uuid(),
});

export async function partnerAccrueCommission(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = accrueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const result = await accrueCommissionForBilling(parsed.data.billing_id);
    if (!result.ok) {
      res.status(400).json({ error: result.reason, code: result.code });
      return;
    }
    // Isolamento: só aceita ledger do próprio partner
    if (result.ledger && result.ledger.partner_tenant_id !== ctx.partnerTenantId) {
      res.status(403).json({ error: 'Fatura fora do Partner', code: 'FORBIDDEN' });
      return;
    }
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerSellerGetCommissions(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx || !req.userId) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    res.json(await getSellerCommissionSummary(ctx.partnerTenantId, req.userId));
  } catch (err) {
    handleErr(err, res);
  }
}

const patchSellerSchema = z
  .object({
    status: z.enum(['active', 'inactive']).optional(),
    name: z.string().min(1).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Informe ao menos um campo' });

export async function partnerPatchSeller(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const ctx = req.partnerContext;
    if (!ctx) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = patchSellerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const row = await patchPartnerSeller(ctx.partnerTenantId, req.params.id, parsed.data);
    res.json(row);
  } catch (err) {
    handleErr(err, res);
  }
}
