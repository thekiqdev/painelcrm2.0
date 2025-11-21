import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const storeProfileSchema = z.object({
  store_name: z.string().min(1),
  store_description: z.string().optional(),
  store_logo: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_whatsapp: z.string().optional(),
  store_slug: z.string().min(1),
  is_active: z.boolean().default(true),
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
        user_id, store_name, store_description, store_logo,
        contact_phone, contact_email, contact_whatsapp,
        store_slug, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        userId,
        storeData.store_name,
        storeData.store_description,
        storeData.store_logo,
        storeData.contact_phone,
        storeData.contact_email,
        storeData.contact_whatsapp,
        storeData.store_slug,
        storeData.is_active,
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
        updates.push(`${key} = $${paramIndex}`);
        values.push(value);
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


