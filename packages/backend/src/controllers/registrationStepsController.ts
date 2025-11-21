import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const registrationStepSchema = z.object({
  step_name: z.string(),
  completed: z.boolean(),
});

export async function upsertRegistrationStep(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const stepData = registrationStepSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO registration_steps (user_id, step_name, completed)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, step_name) DO UPDATE SET
         completed = EXCLUDED.completed,
         updated_at = now()
       RETURNING *`,
      [userId, stepData.step_name, stepData.completed]
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating registration step:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

