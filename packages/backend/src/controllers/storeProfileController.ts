import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const THEME_KEYS = ['default', 'minimal', 'moderno', 'luzmodas'] as const;

const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);

/** Evita falha de parse quando o front/DB envia null em campos opcionais. */
const optStr = z.preprocess(emptyToUndef, z.string().optional());

/** URLs de logo/banner: vazio ou null → null; não transformar undefined (PATCH parcial). */
const optStrNullable = z.preprocess((v) => {
  if (v === '' || v === null) return null;
  if (v === undefined) return undefined;
  return String(v);
}, z.union([z.string(), z.null()]).optional());

const contactEmailSchema = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  if (s === '') return '';
  return s;
}, z.union([z.string().email(), z.literal('')]).optional());

const themeOptionsSchema = z.preprocess(
  (v) => (v === null || v === undefined ? {} : v),
  z.record(z.string(), z.unknown()).default({})
);

const storeProfileSchema = z.object({
  store_name: z.string().min(1),
  store_description: optStr,
  store_logo: optStrNullable,
  store_banner_url: optStrNullable,
  contact_phone: optStr,
  contact_email: contactEmailSchema,
  contact_whatsapp: optStr,
  store_slug: z.string().min(1),
  is_active: z.boolean().default(true),
  /** Opt-in: checkout online na vitrine (requer flags globais no deploy). */
  store_checkout_enabled: z.boolean().default(false),
  theme_key: z.enum(THEME_KEYS).default('default'),
  theme_options: themeOptionsSchema,
});

export async function getStoreProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;

    const result = await pool.query(
      'SELECT * FROM store_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching store profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createStoreProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const storeData = storeProfileSchema.parse(req.body);

    // Check if store profile already exists
    const existingResult = await pool.query(
      'SELECT id FROM store_profiles WHERE user_id = $1',
      [userId]
    );

    if (existingResult.rows.length > 0) {
      res.status(400).json({ error: 'Store profile already exists. Use PATCH to update.' });
      return;
    }

    // Check if slug is already taken
    const slugCheck = await pool.query(
      'SELECT id FROM store_profiles WHERE store_slug = $1',
      [storeData.store_slug]
    );

    if (slugCheck.rows.length > 0) {
      res.status(400).json({ error: 'Store slug already taken' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO store_profiles (
        user_id, store_name, store_description, store_logo, store_banner_url,
        contact_phone, contact_email, contact_whatsapp,
        store_slug, is_active, store_checkout_enabled, theme_key, theme_options
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      RETURNING *`,
      [
        userId,
        storeData.store_name,
        storeData.store_description,
        storeData.store_logo ?? null,
        storeData.store_banner_url ?? null,
        storeData.contact_phone,
        storeData.contact_email || null,
        storeData.contact_whatsapp,
        storeData.store_slug,
        storeData.is_active,
        storeData.store_checkout_enabled,
        storeData.theme_key,
        JSON.stringify(storeData.theme_options ?? {}),
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating store profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateStoreProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const storeData = storeProfileSchema.partial().parse(req.body);

    // If updating slug, check if it's already taken by another user
    if (storeData.store_slug) {
      const slugCheck = await pool.query(
        'SELECT id FROM store_profiles WHERE store_slug = $1 AND user_id != $2',
        [storeData.store_slug, userId]
      );

      if (slugCheck.rows.length > 0) {
        res.status(400).json({ error: 'Store slug already taken' });
        return;
      }
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(storeData).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'theme_options') {
          updates.push(`theme_options = $${paramIndex}::jsonb`);
          values.push(JSON.stringify(value ?? {}));
        } else {
          updates.push(`${key} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(userId);
    const result = await pool.query(
      `UPDATE store_profiles 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE user_id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Store profile not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating store profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPublicStoreProfile(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT * FROM store_profiles 
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching public store profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPublicStoreBySlug(req: Request, res: Response): Promise<void> {
  try {
    const { slug } = req.params;

    const result = await pool.query(
      `SELECT * FROM store_profiles 
       WHERE store_slug = $1 AND is_active = true`,
      [slug]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching store by slug:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


