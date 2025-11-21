import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const signerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['CLIENT', 'INTERNAL']),
  signing_order: z.number().int().optional().nullable(),
});

// Get contract signers
export async function getContractSigners(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { contractId } = req.params;

    // Verify contract belongs to user
    const contractResult = await pool.query(
      'SELECT id FROM contracts WHERE id = $1 AND user_id = $2',
      [contractId, userId]
    );

    if (contractResult.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    const result = await pool.query(
      'SELECT * FROM contract_signers WHERE contract_id = $1 ORDER BY signing_order, created_at',
      [contractId]
    );

    // Parse signature_data JSON
    const signers = result.rows.map(signer => ({
      ...signer,
      signature_data: typeof signer.signature_data === 'object' && signer.signature_data !== null
        ? signer.signature_data
        : (signer.signature_data ? JSON.parse(signer.signature_data) : null),
    }));

    res.json(signers);
  } catch (error) {
    console.error('Error fetching contract signers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create contract signer
export async function createContractSigner(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { contractId } = req.params;
    const signerData = signerSchema.parse(req.body);

    // Verify contract belongs to user
    const contractResult = await pool.query(
      'SELECT id FROM contracts WHERE id = $1 AND user_id = $2',
      [contractId, userId]
    );

    if (contractResult.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    // Determine signing_order if not provided
    let signingOrder = signerData.signing_order;
    if (signingOrder === null || signingOrder === undefined) {
      const maxOrderResult = await pool.query(
        'SELECT MAX(signing_order) FROM contract_signers WHERE contract_id = $1',
        [contractId]
      );
      signingOrder = (maxOrderResult.rows[0].max || 0) + 1;
    }

    const result = await pool.query(
      `INSERT INTO contract_signers (
        contract_id, name, email, role, signing_order
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [contractId, signerData.name, signerData.email, signerData.role, signingOrder]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating contract signer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Update contract signer
export async function updateContractSigner(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { signerId } = req.params;
    const signerData = signerSchema.partial().parse(req.body);

    // Verify signer belongs to a contract owned by user
    const verifyResult = await pool.query(
      `SELECT cs.id FROM contract_signers cs
       INNER JOIN contracts c ON cs.contract_id = c.id
       WHERE cs.id = $1 AND c.user_id = $2`,
      [signerId, userId]
    );

    if (verifyResult.rows.length === 0) {
      res.status(404).json({ error: 'Contract signer not found' });
      return;
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(signerData).forEach(([key, value]) => {
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

    values.push(signerId);
    const result = await pool.query(
      `UPDATE contract_signers 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating contract signer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete contract signer
export async function deleteContractSigner(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { signerId } = req.params;

    // Verify signer belongs to a contract owned by user
    const verifyResult = await pool.query(
      `SELECT cs.id FROM contract_signers cs
       INNER JOIN contracts c ON cs.contract_id = c.id
       WHERE cs.id = $1 AND c.user_id = $2`,
      [signerId, userId]
    );

    if (verifyResult.rows.length === 0) {
      res.status(404).json({ error: 'Contract signer not found' });
      return;
    }

    await pool.query('DELETE FROM contract_signers WHERE id = $1', [signerId]);
    res.json({ message: 'Contract signer deleted successfully' });
  } catch (error) {
    console.error('Error deleting contract signer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

