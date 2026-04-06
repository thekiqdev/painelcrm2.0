import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { normalizeConversationPhone } from '../services/conversationMatchingService.js';
import { migrateConversationLeadToClient } from '../services/conversationLinkService.js';

const MODULE_LEADS = 'leads';

const leadSchema = z.object({
  name: z.string().min(1),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  phone: z.union([z.string(), z.literal(""), z.null()]).optional(),
  company: z.union([z.string(), z.literal(""), z.null()]).optional(),
  source: z.union([z.string().min(1), z.literal("")]).optional(),
  status: z.union([z.string(), z.literal(""), z.null()]).optional(),
  notes: z.union([z.string(), z.literal(""), z.null()]).optional(),
  profile_id: z.string().uuid().optional().nullable(),
});

/** PATCH: aceita `migrated_client_id` para migrar conversas lead→cliente sem depender só do match por telefone. */
const updateLeadBodySchema = leadSchema.partial().extend({
  migrated_client_id: z.string().uuid().optional(),
});

export async function getLeads(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }
    const { profileId, onlyConverted } = req.query;
    const onlyConv = onlyConverted === 'true' || onlyConverted === '1';

    let query = `
      SELECT l.*, wa.wa_url AS whatsapp_avatar_url
      FROM leads l
      INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          NULLIF(TRIM(cc.metadata->>'whatsapp_profile_photo'), ''),
          NULLIF(TRIM(cc.metadata->>'image'), ''),
          NULLIF(TRIM(cc.metadata->>'imagePreview'), ''),
          NULLIF(TRIM(cc.metadata->>'image_preview'), '')
        ) AS wa_url
        FROM chat_conversations cc
        INNER JOIN users cu ON cu.id = cc.user_id AND cu.tenant_id = $1
        WHERE (
          cc.lead_id = l.id
          OR (
            l.status = 'Convertido'
            AND (cc.metadata->'link_migration'->>'previous_lead_id') = l.id::text
          )
          OR (
            l.status = 'Convertido'
            AND EXISTS (
              SELECT 1
              FROM clients c
              INNER JOIN users uc ON uc.id = c.user_id AND uc.tenant_id = $1
              CROSS JOIN LATERAL (
                SELECT CASE
                  WHEN length(regexp_replace(l.phone, '\\D', '', 'g')) IN (10, 11)
                    THEN '55' || regexp_replace(l.phone, '\\D', '', 'g')
                  WHEN length(regexp_replace(l.phone, '\\D', '', 'g')) IN (12, 13)
                    AND left(regexp_replace(l.phone, '\\D', '', 'g'), 2) = '55'
                    THEN regexp_replace(l.phone, '\\D', '', 'g')
                  ELSE NULL
                END AS n
              ) nl
              WHERE c.id = cc.client_id
                AND l.phone IS NOT NULL AND btrim(l.phone) <> ''
                AND nl.n IS NOT NULL
                AND (
                  regexp_replace(c.phone, '\\D', '', 'g') = nl.n
                  OR regexp_replace(c.phone, '\\D', '', 'g') = substring(nl.n from 3)
                )
            )
          )
        )
        ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC NULLS LAST
        LIMIT 1
      ) wa ON true
      WHERE 1=1
    `;
    const params: any[] = [tenantId];

    if (onlyConv) {
      query += ` AND l.status = 'Convertido'`;
    } else {
      // Lista principal: sem convertidos (multi-tenant inalterado).
      query += ` AND (l.status IS NULL OR l.status <> 'Convertido')`;
    }

    if (profileId) {
      query += ` AND l.profile_id = $${params.length + 1}`;
      params.push(profileId);
    }

    query += ' ORDER BY l.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getLeadById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT l.*, wa.wa_url AS whatsapp_avatar_url
       FROM leads l
       INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       LEFT JOIN LATERAL (
         SELECT COALESCE(
           NULLIF(TRIM(cc.metadata->>'whatsapp_profile_photo'), ''),
           NULLIF(TRIM(cc.metadata->>'image'), ''),
           NULLIF(TRIM(cc.metadata->>'imagePreview'), ''),
           NULLIF(TRIM(cc.metadata->>'image_preview'), '')
         ) AS wa_url
         FROM chat_conversations cc
         INNER JOIN users cu ON cu.id = cc.user_id AND cu.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
         WHERE (
           cc.lead_id = l.id
           OR (
             l.status = 'Convertido'
             AND (cc.metadata->'link_migration'->>'previous_lead_id') = l.id::text
           )
           OR (
             l.status = 'Convertido'
             AND EXISTS (
               SELECT 1
               FROM clients c
               INNER JOIN users uc ON uc.id = c.user_id AND uc.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
               CROSS JOIN LATERAL (
                 SELECT CASE
                   WHEN length(regexp_replace(l.phone, '\\D', '', 'g')) IN (10, 11)
                     THEN '55' || regexp_replace(l.phone, '\\D', '', 'g')
                   WHEN length(regexp_replace(l.phone, '\\D', '', 'g')) IN (12, 13)
                     AND left(regexp_replace(l.phone, '\\D', '', 'g'), 2) = '55'
                     THEN regexp_replace(l.phone, '\\D', '', 'g')
                   ELSE NULL
                 END AS n
               ) nl
               WHERE c.id = cc.client_id
                 AND l.phone IS NOT NULL AND btrim(l.phone) <> ''
                 AND nl.n IS NOT NULL
                 AND (
                   regexp_replace(c.phone, '\\D', '', 'g') = nl.n
                   OR regexp_replace(c.phone, '\\D', '', 'g') = substring(nl.n from 3)
                 )
             )
           )
         )
         ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC NULLS LAST
         LIMIT 1
       ) wa ON true
       WHERE l.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createLead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    await assertModulePermission(userId, MODULE_LEADS, 'create', undefined, req);
    const leadData = leadSchema.parse(req.body);

    // Clean up the data - convert empty strings to null for optional fields
    const cleanData: any = {
      name: leadData.name,
    };
    
    // Validate and clean email
    if (leadData.email && typeof leadData.email === 'string' && leadData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(leadData.email.trim())) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }
      cleanData.email = leadData.email.trim();
    } else {
      cleanData.email = null;
    }
    
    // Clean phone
    if (leadData.phone && typeof leadData.phone === 'string' && leadData.phone.trim()) {
      cleanData.phone = leadData.phone.trim();
    } else {
      cleanData.phone = null;
    }
    
    // Clean company
    if (leadData.company && typeof leadData.company === 'string' && leadData.company.trim()) {
      cleanData.company = leadData.company.trim();
    } else {
      cleanData.company = null;
    }
    
    // Source is required, but we'll use a default if empty
    if (leadData.source && typeof leadData.source === 'string' && leadData.source.trim()) {
      cleanData.source = leadData.source.trim();
    } else {
      cleanData.source = 'Outros'; // Default source
    }
    
    // Clean status
    if (leadData.status && typeof leadData.status === 'string' && leadData.status.trim()) {
      cleanData.status = leadData.status.trim();
    } else {
      cleanData.status = null;
    }
    
    // Clean notes
    if (leadData.notes && typeof leadData.notes === 'string' && leadData.notes.trim()) {
      cleanData.notes = leadData.notes.trim();
    } else {
      cleanData.notes = null;
    }
    
    // Clean profile_id
    if (leadData.profile_id && typeof leadData.profile_id === 'string' && leadData.profile_id.trim()) {
      cleanData.profile_id = leadData.profile_id.trim();
    } else {
      cleanData.profile_id = null;
    }

    const result = await pool.query(
      `INSERT INTO leads (
        user_id, name, email, phone, company, source, status, notes, profile_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        userId, cleanData.name, cleanData.email, cleanData.phone,
        cleanData.company, cleanData.source, cleanData.status,
        cleanData.notes, cleanData.profile_id
      ]
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
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateLead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const existing = await pool.query(
      `SELECT l.user_id FROM leads l
       INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE l.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    await assertModulePermission(userId, MODULE_LEADS, 'edit', {
      ownerId: existing.rows[0].user_id,
    }, req);
    const leadData = updateLeadBodySchema.parse(req.body);
    const { migrated_client_id, ...leadFields } = leadData;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(leadFields).forEach(([key, value]) => {
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

    values.push(id);
    const result = await pool.query(
      `UPDATE leads 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramIndex + 1}))
       RETURNING *`,
      [...values, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const updatedLead = result.rows[0];
    if ((leadFields.status ?? null) === 'Convertido' || updatedLead.status === 'Convertido') {
      try {
        const tenantRow = await pool.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM users WHERE id = $1 LIMIT 1`,
          [userId]
        );
        const tenantId = tenantRow.rows[0]?.tenant_id ?? null;
        if (tenantId) {
        let targetClientId: string | null = null;
        if (migrated_client_id) {
          const okClient = await pool.query<{ id: string }>(
            `
            SELECT c.id
            FROM clients c
            INNER JOIN users u ON u.id = c.user_id
            WHERE c.id = $1 AND u.tenant_id = $2
            LIMIT 1
            `,
            [migrated_client_id, tenantId]
          );
          if (okClient.rows.length === 1) {
            targetClientId = okClient.rows[0].id;
          }
        }

        if (!targetClientId) {
          const normalizedPhone = normalizeConversationPhone(updatedLead.phone);
          if (normalizedPhone) {
            const clientRows = await pool.query<{ id: string }>(
              `
              SELECT c.id
              FROM clients c
              INNER JOIN users u ON u.id = c.user_id
              WHERE u.tenant_id = $1
                AND c.phone IS NOT NULL
                AND c.phone <> ''
                AND (
                  regexp_replace(c.phone, '\\D', '', 'g') = $2
                  OR regexp_replace(c.phone, '\\D', '', 'g') = substring($2 from 3)
                )
              LIMIT 2
              `,
              [tenantId, normalizedPhone]
            );
            if (clientRows.rows.length === 1) {
              targetClientId = clientRows.rows[0].id;
            }
          }
        }

        if (targetClientId) {
          const conversationRows = await pool.query<{ id: string; user_id: string }>(
            `
            SELECT c.id, c.user_id
            FROM chat_conversations c
            INNER JOIN users u ON u.id = c.user_id
            WHERE u.tenant_id = $1
              AND c.lead_id = $2
            `,
            [tenantId, id]
          );
          for (const c of conversationRows.rows) {
            await migrateConversationLeadToClient({
              conversationId: c.id,
              userId: c.user_id,
              clientId: targetClientId,
              previousLeadId: id,
              context: { actorUserId: userId, reason: 'lead_converted' },
            });
          }
        }
        }
      } catch (migrateError) {
        console.error('[updateLead] lead->client link migration failed:', migrateError);
      }
    }

    res.json(updatedLead);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteLead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const existing = await pool.query(
      `SELECT l.user_id FROM leads l
       INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE l.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    await assertModulePermission(userId, MODULE_LEADS, 'delete', {
      ownerId: existing.rows[0].user_id,
    }, req);
    const result = await pool.query(
      `DELETE FROM leads WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2)) RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

