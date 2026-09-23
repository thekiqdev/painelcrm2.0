/**
 * M5 S3 — controllers licenses + sell-plans.
 */

import type { Response } from 'express';
import { z } from 'zod';
import type { PartnerAuthRequest } from './partnerAuthMiddleware.js';
import { PartnerAdminError } from './partnerAdminService.js';
import { getPartnerLicenseSummary } from './partnerLicenseService.js';
import { listPartnerLicenseLedger } from './partnerLicenseLedgerService.js';
import {
  createPartnerLicenseTopupCheckout,
  LICENSE_TOPUP_PACKS,
  quotePartnerLicenseTopup,
} from './partnerLicenseTopupService.js';
import { getInvoiceById } from '../services/invoiceService.js';
import { getSaasBillingCheckoutPresentation } from '../services/subscriptionService.js';
import {
  archivePartnerSellPlan,
  createPartnerSellPlan,
  getPartnerSellPlan,
  listPartnerSellPlans,
  patchPartnerSellPlan,
  projectSellPlanEarnings,
} from './partnerSellPlanService.js';

function handleErr(err: unknown, res: Response): void {
  if (err instanceof PartnerAdminError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error('[partnerS3]', err);
  res.status(500).json({ error: (err as Error)?.message || 'Internal server error' });
}

export async function partnerGetLicenses(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const summary = await getPartnerLicenseSummary(id);
    res.json({
      ...summary,
      topup_packs: Object.entries(LICENSE_TOPUP_PACKS).map(([id, qty]) => ({ id, qty })),
    });
  } catch (err) {
    handleErr(err, res);
  }
}

/** GET /api/partner/licenses/ledger */
export async function partnerGetLicenseLedger(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const limit = Number(req.query.limit || 50);
    const items = await listPartnerLicenseLedger(id, limit);
    res.json(items);
  } catch (err) {
    handleErr(err, res);
  }
}

const purchaseSchema = z
  .object({
    qty: z.number().int().optional(),
    pack_id: z.string().optional(),
    payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']).optional(),
  })
  .refine((b) => b.qty != null || (b.pack_id != null && b.pack_id.length > 0), {
    message: 'Informe qty ou pack_id',
  });

/** POST /api/partner/licenses/purchase */
export async function partnerPurchaseLicenses(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const checkout = await createPartnerLicenseTopupCheckout({
      partnerTenantId: id,
      qty: parsed.data.qty,
      pack_id: parsed.data.pack_id,
      paymentMethod: parsed.data.payment_method ?? 'PIX',
      actorUserId: req.user?.id ?? null,
    });

    res.status(201).json({
      billing: checkout.billing,
      quote: checkout.quote,
      paymentUrls: checkout.paymentUrls ?? null,
      settled: checkout.settled === true,
    });
  } catch (err) {
    handleErr(err, res);
  }
}

/** GET /api/partner/licenses/quote?qty=|pack_id= */
export async function partnerQuoteLicensePurchase(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const qtyRaw = req.query.qty != null ? Number(req.query.qty) : undefined;
    const pack_id =
      typeof req.query.pack_id === 'string' ? req.query.pack_id : undefined;
    const quote = await quotePartnerLicenseTopup(id, {
      qty: qtyRaw,
      pack_id,
    });
    res.json(quote);
  } catch (err) {
    handleErr(err, res);
  }
}

/** GET /api/partner/licenses/billing/:billingId */
export async function partnerGetLicenseTopupBilling(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const partnerId = req.partnerContext?.partnerTenantId;
    if (!partnerId) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const billing = await getInvoiceById(req.params.billingId);
    if (!billing || billing.tenant_id !== partnerId) {
      res.status(404).json({ error: 'Cobrança não encontrada' });
      return;
    }
    if ((billing.billing_reason ?? '') !== 'partner_license_topup') {
      res.status(404).json({ error: 'Cobrança não encontrada' });
      return;
    }
    if (billing.status === 'paid') {
      res.json({ billing, paymentUrls: null, paid: true });
      return;
    }
    const presentation = await getSaasBillingCheckoutPresentation(partnerId, billing.id);
    res.json({
      billing,
      paymentUrls: presentation
        ? {
            invoiceUrl: presentation.invoice_url,
            bankSlipUrl: presentation.bank_slip_url,
            bankSlipDigitableLine: presentation.bank_slip_digitable_line,
            pixQrCode: presentation.pix_qr_code,
            pixCopyPaste: presentation.pix_copy_paste,
          }
        : null,
      paid: false,
    });
  } catch (err) {
    handleErr(err, res);
  }
}

const sellPlanBody = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  price_cents: z.number().int().min(0),
  billing_interval: z.enum(['monthly', 'yearly', 'quarterly', 'semiannual']).optional(),
  features_json: z.record(z.unknown()).optional(),
  source_platform_plan_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  trial_days: z.coerce.number().int().min(0).max(365).optional(),
});

const sellPlanPatch = sellPlanBody.partial().refine((b) => Object.keys(b).length > 0, {
  message: 'Informe ao menos um campo',
});

const projectionQuery = z.object({
  price_cents: z.coerce.number().int().min(0),
  billing_interval: z.enum(['monthly', 'yearly', 'quarterly', 'semiannual']).optional(),
  estimated_customers: z.coerce.number().int().min(0).optional(),
  estimated_users_per_customer: z.coerce.number().int().min(1).optional(),
});

export async function partnerListSellPlans(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    res.json(await listPartnerSellPlans(id));
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerGetSellPlan(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const plan = await getPartnerSellPlan(id, req.params.id);
    if (!plan) {
      res.status(404).json({ error: 'Plano não encontrado', code: 'NOT_FOUND' });
      return;
    }
    res.json(plan);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerCreateSellPlan(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = sellPlanBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const plan = await createPartnerSellPlan(id, parsed.data);
    res.status(201).json(plan);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerPatchSellPlan(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = sellPlanPatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }
    const plan = await patchPartnerSellPlan(id, req.params.id, parsed.data);
    res.json(plan);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerArchiveSellPlan(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const plan = await archivePartnerSellPlan(id, req.params.id);
    res.json(plan);
  } catch (err) {
    handleErr(err, res);
  }
}

export async function partnerSellPlanProjection(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const id = req.partnerContext?.partnerTenantId;
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = projectionQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Query inválida', details: parsed.error.flatten() });
      return;
    }
    const projection = await projectSellPlanEarnings(id, parsed.data);
    res.json(projection);
  } catch (err) {
    handleErr(err, res);
  }
}
