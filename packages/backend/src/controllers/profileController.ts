import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const profileUpdateSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company_name: z.string().optional(),
  whatsapp_number: z.string().optional(),
  whatsapp_connected: z.boolean().optional(),
  registration_complete: z.boolean().optional(),
});

export async function getProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;

    const result = await pool.query(
      `SELECT u.id, u.email, u.whatsapp_number, u.created_at,
              p.first_name, p.last_name, p.company_name, 
              p.whatsapp_connected, p.registration_complete
       FROM users u
       LEFT JOIN profiles p ON u.id = p.id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const profileData = profileUpdateSchema.parse(req.body);

    const existingResult = await pool.query(
      'SELECT first_name, last_name, company_name, whatsapp_number, whatsapp_connected, registration_complete FROM profiles WHERE id = $1',
      [userId]
    );
    const existingProfile = existingResult.rows[0] || {};

    const mergedProfile = {
      first_name: profileData.first_name ?? existingProfile.first_name ?? null,
      last_name: profileData.last_name ?? existingProfile.last_name ?? null,
      company_name: profileData.company_name ?? existingProfile.company_name ?? null,
      whatsapp_number: profileData.whatsapp_number ?? existingProfile.whatsapp_number ?? '',
      whatsapp_connected: profileData.whatsapp_connected ?? existingProfile.whatsapp_connected ?? false,
      registration_complete: profileData.registration_complete ?? existingProfile.registration_complete ?? false,
    };

    // Update or insert profile
    const result = await pool.query(
      `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, whatsapp_connected, registration_complete)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         company_name = EXCLUDED.company_name,
         whatsapp_number = EXCLUDED.whatsapp_number,
         whatsapp_connected = EXCLUDED.whatsapp_connected,
         registration_complete = EXCLUDED.registration_complete,
         updated_at = now()
       RETURNING *`,
      [
        userId,
        mergedProfile.first_name,
        mergedProfile.last_name,
        mergedProfile.company_name,
        mergedProfile.whatsapp_number,
        mergedProfile.whatsapp_connected,
        mergedProfile.registration_complete,
      ]
    );

    if (mergedProfile.company_name) {
      await pool.query(
        `UPDATE user_profiles
         SET name = $1, updated_at = now()
         WHERE owner_id = $2`,
        [mergedProfile.company_name, userId]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

