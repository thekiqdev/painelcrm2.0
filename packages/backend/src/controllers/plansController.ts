import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { FEATURE_KEYS, FEATURE_LABELS, isValidFeatureKey } from '../constants/features.js';
import { z } from 'zod';

const BILLING_INTERVALS = ['monthly', 'quarterly', 'semi_annual', 'yearly'] as const;
const intervalPriceSchema = z.object({
  billing_interval: z.enum(BILLING_INTERVALS),
  price_per_user_cents: z.number().int().min(0),
});

const createPlanSchemaBase = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug: apenas letras minúsculas, números e hífen'),
  description: z.string().optional().nullable(),
  price_cents: z.number().int().min(0).optional().default(0),
  billing_interval: z.enum(['monthly', 'yearly']).optional().default('monthly'),
  max_users: z.number().int().min(0).optional().nullable(),
  max_profiles: z.number().int().min(0).optional().nullable(),
  max_whatsapp_instances: z.number().int().min(0).optional().nullable(),
  plan_type: z.enum(['standard', 'custom']).optional().default('standard'),
  is_default: z.boolean().optional().default(false),
  interval_prices: z.array(intervalPriceSchema).optional(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

const createPlanSchema = createPlanSchemaBase.refine(
  (data) => {
    if (data.plan_type !== 'custom') return true;
    return data.interval_prices && data.interval_prices.length > 0;
  },
  { message: 'Plano personalizado exige pelo menos um preço por intervalo em interval_prices', path: ['interval_prices'] }
);

const updatePlanSchema = createPlanSchemaBase.partial().extend({
  interval_prices: z.array(intervalPriceSchema).optional(),
}).refine(
  (data) => {
    if (data.plan_type !== 'custom' || !data.interval_prices) return true;
    return data.interval_prices.length > 0;
  },
  { message: 'Plano personalizado exige pelo menos um preço por intervalo', path: ['interval_prices'] }
);

export async function listPlans(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT p.*, 
        (SELECT COUNT(*)::int FROM plan_features pf WHERE pf.plan_id = p.id AND pf.enabled = true) AS enabled_features_count
       FROM plans p
       ORDER BY p.sort_order ASC, p.name ASC`
    );
    const plans = result.rows;
    for (const plan of plans) {
      if (plan.plan_type === 'custom') {
        const pricesRows = await pool.query(
          'SELECT billing_interval, price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1',
          [plan.id]
        );
        plan.interval_prices = pricesRows.rows;
      }
    }
    res.json(plans);
  } catch (error: any) {
    console.error('listPlans error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function getPlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const planResult = await pool.query('SELECT * FROM plans WHERE id = $1', [id]);
    if (planResult.rows.length === 0) {
      res.status(404).json({ error: 'Plano não encontrado' });
      return;
    }
    const plan = planResult.rows[0];
    const featuresResult = await pool.query(
      'SELECT feature_key, enabled FROM plan_features WHERE plan_id = $1',
      [id]
    );
    plan.features = featuresResult.rows;
    if (plan.plan_type === 'custom') {
      const pricesRows = await pool.query(
        'SELECT billing_interval, price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1',
        [id]
      );
      plan.interval_prices = pricesRows.rows;
    }
    res.json(plan);
  } catch (error: any) {
    console.error('getPlan error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function createPlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = createPlanSchema.parse(req.body);
    const slug = body.slug.trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM plans WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'Já existe um plano com este slug' });
      return;
    }
    const planType = body.plan_type ?? 'standard';
    const isDefault = body.is_default === true;
    if (isDefault) {
      await pool.query("UPDATE plans SET is_default = false WHERE is_default = true");
    }
    const result = await pool.query(
      `INSERT INTO plans (name, slug, description, price_cents, billing_interval, max_users, max_profiles, max_whatsapp_instances, plan_type, is_default, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        body.name.trim(),
        slug,
        body.description?.trim() || null,
        body.price_cents ?? 0,
        body.billing_interval ?? 'monthly',
        body.max_users ?? null,
        body.max_profiles ?? null,
        body.max_whatsapp_instances ?? null,
        planType,
        isDefault,
        body.is_active,
        body.sort_order ?? 0,
      ]
    );
    const plan = result.rows[0];
    if (planType === 'custom' && body.interval_prices?.length) {
      for (const ip of body.interval_prices) {
        await pool.query(
          `INSERT INTO plan_interval_prices (plan_id, billing_interval, price_per_user_cents)
           VALUES ($1, $2, $3)`,
          [plan.id, ip.billing_interval, ip.price_per_user_cents]
        );
      }
      const pricesRows = await pool.query(
        'SELECT billing_interval, price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1',
        [plan.id]
      );
      plan.interval_prices = pricesRows.rows;
    }
    res.status(201).json(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('createPlan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updatePlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = updatePlanSchema.parse(req.body);
    const planResult = await pool.query('SELECT id, plan_type FROM plans WHERE id = $1', [id]);
    if (planResult.rows.length === 0) {
      res.status(404).json({ error: 'Plano não encontrado' });
      return;
    }
    const currentPlanType = planResult.rows[0].plan_type;
    const willBeCustom = body.plan_type === 'custom' || (body.plan_type === undefined && currentPlanType === 'custom');
    if (willBeCustom) {
      const hasBodyPrices = body.interval_prices && body.interval_prices.length > 0;
      if (!hasBodyPrices) {
        const countResult = await pool.query(
          'SELECT COUNT(*)::int AS c FROM plan_interval_prices WHERE plan_id = $1',
          [id]
        );
        const count = countResult.rows[0]?.c ?? 0;
        if (count === 0) {
          res.status(400).json({
            error: 'Plano personalizado exige pelo menos um preço por intervalo. Envie interval_prices com pelo menos um item.',
          });
          return;
        }
      }
    }
    if (body.slug !== undefined) {
      const slug = body.slug.trim().toLowerCase();
      const existing = await pool.query('SELECT id FROM plans WHERE slug = $1 AND id != $2', [slug, id]);
      if (existing.rows.length > 0) {
        res.status(400).json({ error: 'Já existe outro plano com este slug' });
        return;
      }
    }
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (body.is_default === true) {
      await pool.query("UPDATE plans SET is_default = false WHERE id != $1", [id]);
    }
    const fields: (keyof typeof body)[] = ['name', 'slug', 'description', 'price_cents', 'billing_interval', 'max_users', 'max_profiles', 'max_whatsapp_instances', 'plan_type', 'is_default', 'is_active', 'sort_order'];
    for (const key of fields) {
      if (body[key] !== undefined) {
        if (key === 'slug') {
          updates.push(`${key} = $${i}`);
          values.push((body[key] as string).trim().toLowerCase());
        } else {
          updates.push(`${key} = $${i}`);
          values.push(body[key]);
        }
        i++;
      }
    }
    if (updates.length > 0) {
      values.push(id);
      await pool.query(
        `UPDATE plans SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i}`,
        values
      );
    }
    if (body.interval_prices !== undefined) {
      await pool.query('DELETE FROM plan_interval_prices WHERE plan_id = $1', [id]);
      for (const ip of body.interval_prices) {
        await pool.query(
          `INSERT INTO plan_interval_prices (plan_id, billing_interval, price_per_user_cents)
           VALUES ($1, $2, $3)`,
          [id, ip.billing_interval, ip.price_per_user_cents]
        );
      }
    }
    const r = await pool.query('SELECT * FROM plans WHERE id = $1', [id]);
    const plan = r.rows[0];
    if (plan?.plan_type === 'custom') {
      const pricesRows = await pool.query(
        'SELECT billing_interval, price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1',
        [id]
      );
      plan.interval_prices = pricesRows.rows;
    }
    res.json(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('updatePlan error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deletePlan(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM plans WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Plano não encontrado' });
      return;
    }
    res.status(204).send();
  } catch (error: any) {
    console.error('deletePlan error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/** GET /plans/default - plano marcado como padrão (para novos cadastros no site) */
export async function getDefaultPlan(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const row = await pool.query(
      `SELECT * FROM plans WHERE is_active = true AND is_default = true LIMIT 1`
    );
    if (row.rows.length === 0) {
      const fallback = await pool.query(
        `SELECT * FROM plans WHERE is_active = true ORDER BY sort_order ASC, name ASC LIMIT 1`
      );
      if (fallback.rows.length === 0) {
        res.status(404).json({ error: 'Nenhum plano ativo encontrado' });
        return;
      }
      const plan = fallback.rows[0];
      if (plan.plan_type === 'custom') {
        const pricesRows = await pool.query(
          'SELECT billing_interval, price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1',
          [plan.id]
        );
        plan.interval_prices = pricesRows.rows;
      }
      return void res.json(plan);
    }
    const plan = row.rows[0];
    if (plan.plan_type === 'custom') {
      const pricesRows = await pool.query(
        'SELECT billing_interval, price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1',
        [plan.id]
      );
      plan.interval_prices = pricesRows.rows;
    }
    res.json(plan);
  } catch (error: any) {
    console.error('getDefaultPlan error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/** Lista de feature keys com labels para o Super Admin */
export async function listFeatureKeys(_req: AuthRequest, res: Response): Promise<void> {
  res.json(
    FEATURE_KEYS.map((key) => ({
      key,
      label: FEATURE_LABELS[key] || key,
    }))
  );
}

/** GET /plans/:id/features - retorna { features: { key: boolean } } */
export async function getPlanFeatures(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const planResult = await pool.query('SELECT id FROM plans WHERE id = $1', [id]);
    if (planResult.rows.length === 0) {
      res.status(404).json({ error: 'Plano não encontrado' });
      return;
    }
    const rows = await pool.query(
      'SELECT feature_key, enabled FROM plan_features WHERE plan_id = $1',
      [id]
    );
    const features: Record<string, boolean> = {};
    for (const key of FEATURE_KEYS) {
      const row = rows.rows.find((r) => r.feature_key === key);
      features[key] = row ? row.enabled === true : false;
    }
    res.json({ plan_id: id, features });
  } catch (error: any) {
    console.error('getPlanFeatures error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

const putPlanFeaturesSchema = z.object({
  features: z.record(z.string(), z.boolean()),
});

/** PUT /plans/:id/features - body: { features: { "dashboard": true, "leads": false, ... } } */
export async function putPlanFeatures(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = putPlanFeaturesSchema.parse(req.body);
    const planResult = await pool.query('SELECT id FROM plans WHERE id = $1', [id]);
    if (planResult.rows.length === 0) {
      res.status(404).json({ error: 'Plano não encontrado' });
      return;
    }
    await pool.query('BEGIN');
    for (const [key, enabled] of Object.entries(body.features)) {
      if (!isValidFeatureKey(key)) continue;
      await pool.query(
        `INSERT INTO plan_features (plan_id, feature_key, enabled, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (plan_id, feature_key)
         DO UPDATE SET enabled = $3, updated_at = now()`,
        [id, key, enabled]
      );
    }
    await pool.query('COMMIT');
    const rows = await pool.query(
      'SELECT feature_key, enabled FROM plan_features WHERE plan_id = $1',
      [id]
    );
    const features: Record<string, boolean> = {};
    for (const key of FEATURE_KEYS) {
      const row = rows.rows.find((r) => r.feature_key === key);
      features[key] = row ? row.enabled === true : false;
    }
    res.json({ plan_id: id, features });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('putPlanFeatures error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
