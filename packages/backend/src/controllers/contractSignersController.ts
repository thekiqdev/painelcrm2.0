import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { findContractInTenant, findSignerInTenant } from '../utils/contractAccess.js';
import { isDraftStatus } from '../services/contractLifecycle.js';
import { normalizeBrazilTaxIdInput, isBrazilTaxIdDigits } from '../utils/brazilTaxId.js';
import { z } from 'zod';

const taxIdDigitsSchema = z
  .string()
  .min(1)
  .transform((s) => normalizeBrazilTaxIdInput(s))
  .refine(isBrazilTaxIdDigits, { message: 'Informe CPF (11 dígitos) ou CNPJ (14 dígitos)' });

const signerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['CLIENT', 'INTERNAL']),
  signing_order: z.number().int().optional().nullable(),
  tax_id: taxIdDigitsSchema,
});

const signerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['CLIENT', 'INTERNAL']).optional(),
  signing_order: z.number().int().optional().nullable(),
  tax_id: z
    .union([z.string(), z.undefined()])
    .optional()
    .transform((s) => {
      if (s === undefined || s === null || s === '') return undefined;
      return normalizeBrazilTaxIdInput(String(s));
    })
    .refine((d) => d === undefined || isBrazilTaxIdDigits(d), { message: 'CPF/CNPJ inválido' }),
});

// Get contract signers
export async function getContractSigners(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { contractId } = req.params;

    const contract = await findContractInTenant(contractId, userId);
    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    await assertModulePermission(
      userId,
      'contracts',
      'view',
      { ownerId: contract.user_id, assigneeId: contract.responsible_id },
      req
    );

    const result = await pool.query(
      `SELECT cs.*,
              inv_last.created_at AS inv_last_created_at,
              inv_last.expires_at AS inv_last_expires_at,
              inv_last.revoked_at AS inv_last_revoked_at,
              inv_last.consumed_at AS inv_last_consumed_at
       FROM contract_signers cs
       LEFT JOIN LATERAL (
         SELECT i.created_at, i.expires_at, i.revoked_at, i.consumed_at
         FROM contract_signer_signature_invites i
         WHERE i.contract_signer_id = cs.id
         ORDER BY i.created_at DESC
         LIMIT 1
       ) inv_last ON true
       WHERE cs.contract_id = $1
       ORDER BY cs.signing_order, cs.created_at`,
      [contractId]
    );

    const signers = result.rows.map((row) => {
      const hasRow = row.inv_last_created_at != null;
      let lastStatus: 'none' | 'active' | 'expired' | 'revoked' | 'consumed' = 'none';
      if (hasRow) {
        if (row.inv_last_consumed_at) lastStatus = 'consumed';
        else if (row.inv_last_revoked_at) lastStatus = 'revoked';
        else if (
          row.inv_last_expires_at &&
          new Date(String(row.inv_last_expires_at)).getTime() <= Date.now()
        ) {
          lastStatus = 'expired';
        } else lastStatus = 'active';
      }
      const has_active = lastStatus === 'active';
      const signature_invite = {
        has_active,
        created_at: has_active ? (row.inv_last_created_at ?? null) : row.inv_last_created_at ?? null,
        expires_at: row.inv_last_expires_at ?? null,
        last: hasRow
          ? {
              status: lastStatus,
              created_at: row.inv_last_created_at,
              expires_at: row.inv_last_expires_at,
              revoked_at: row.inv_last_revoked_at,
              consumed_at: row.inv_last_consumed_at,
            }
          : null,
      };
      return {
        id: row.id,
        contract_id: row.contract_id,
        name: row.name,
        email: row.email,
        tax_id: row.tax_id ?? null,
        role: row.role,
        signing_order: row.signing_order,
        signed_at: row.signed_at,
        created_at: row.created_at,
        signature_data:
          typeof row.signature_data === 'object' && row.signature_data !== null
            ? row.signature_data
            : row.signature_data
              ? JSON.parse(String(row.signature_data))
              : null,
        signature_invite,
      };
    });

    res.json(signers);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
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

    const contract = await findContractInTenant(contractId, userId);
    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    if (!isDraftStatus(contract.status)) {
      res.status(409).json({
        error: 'Signatários só podem ser alterados enquanto o contrato está em rascunho.',
        code: 'CONTRACT_SIGNERS_LOCKED',
      });
      return;
    }
    await assertModulePermission(
      userId,
      'contracts',
      'edit',
      { ownerId: contract.user_id, assigneeId: contract.responsible_id },
      req
    );

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
        contract_id, name, email, tax_id, role, signing_order
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [contractId, signerData.name, signerData.email, signerData.tax_id, signerData.role, signingOrder]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
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
    const signerData = signerUpdateSchema.parse(req.body);

    const row = await findSignerInTenant(signerId, userId);
    if (!row) {
      res.status(404).json({ error: 'Contract signer not found' });
      return;
    }
    if (!isDraftStatus(row.status)) {
      res.status(409).json({
        error: 'Signatários só podem ser alterados enquanto o contrato está em rascunho.',
        code: 'CONTRACT_SIGNERS_LOCKED',
      });
      return;
    }
    await assertModulePermission(
      userId,
      'contracts',
      'edit',
      { ownerId: row.user_id, assigneeId: row.responsible_id },
      req
    );

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
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
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

    const row = await findSignerInTenant(signerId, userId);
    if (!row) {
      res.status(404).json({ error: 'Contract signer not found' });
      return;
    }
    if (!isDraftStatus(row.status)) {
      res.status(409).json({
        error: 'Signatários só podem ser alterados enquanto o contrato está em rascunho.',
        code: 'CONTRACT_SIGNERS_LOCKED',
      });
      return;
    }
    await assertModulePermission(
      userId,
      'contracts',
      'edit',
      { ownerId: row.user_id, assigneeId: row.responsible_id },
      req
    );

    await pool.query('DELETE FROM contract_signers WHERE id = $1', [signerId]);
    res.json({ message: 'Contract signer deleted successfully' });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error deleting contract signer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
