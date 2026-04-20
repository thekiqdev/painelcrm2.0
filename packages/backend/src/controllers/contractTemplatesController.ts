/**
 * Modelos de contrato (contract_templates).
 *
 * Regra adotada (Etapa 1 — menor risco / compatível com o módulo "contracts"):
 * - Permissões: mesmo módulo `contracts` do Permission Engine (não há módulo separado).
 * - Listagem: todos os modelos cujo criador (user_id) pertence ao tenant — sem checagem extra
 *   de permissão no GET (mesmo padrão de `getContracts`: isolamento por tenant + CRM auth).
 * - Criação: exige `contracts.create`; o registro é sempre associado ao usuário atual (criador).
 * - Edição / exclusão: exige `contracts.edit` / `contracts.delete` com ownerId = template.user_id
 *   (criador do modelo), respeitando edit_own_only / delete_own_only como nos contratos.
 *   Ou seja: modelo não é "compartilhável editável" por qualquer usuário do tenant; só o criador
 *   (ou perfis sem restrição own-only) alteram/removem.
 */
import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { z } from 'zod';

const tenancyRulesSchema = z
  .object({
    date_base_type: z.enum(['creation_date', 'signature_date']).optional().nullable(),
    start_rule_type: z.enum(['same_day', 'plus_days']).optional().nullable(),
    start_offset_days: z.number().int().min(0).optional().nullable(),
    duration_days: z.number().int().min(1).optional().nullable(),
  })
  .optional()
  .nullable();

const templateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  default_title: z.string().optional().nullable(),
  content_html: z.string().min(1),
  variables_schema: z.array(z.any()).optional(),
  is_active: z.boolean().optional(),
  default_total_value: z.number().optional().nullable(),
  /** Aceita string ou número do formulário sem quebrar com `.trim()`. */
  default_currency: z.union([z.string(), z.number()]).optional().nullable(),
  tenancy_rules: tenancyRulesSchema,
});

function normalizeTemplateCurrency(raw: unknown): string {
  if (raw == null || raw === '') return 'BRL';
  const s = String(raw).trim().slice(0, 8);
  return s || 'BRL';
}

// Get contract templates
export async function getContractTemplates(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }

    const { activeOnly } = req.query;

    let query = `SELECT ct.* FROM contract_templates ct
       INNER JOIN users u ON u.id = ct.user_id AND u.tenant_id = $1
       WHERE 1=1`;
    const params: any[] = [tenantId];

    if (activeOnly === 'true') {
      query += ' AND ct.is_active = true';
    }

    query += ' ORDER BY ct.name';

    const result = await pool.query(query, params);

    const templates = result.rows.map((template) => formatTemplateRow(template as Record<string, unknown>));

    res.json(templates);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error fetching contract templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function formatTemplateRow(template: Record<string, unknown>) {
  return {
    ...template,
    variables_schema: Array.isArray(template.variables_schema)
      ? template.variables_schema
      : template.variables_schema
        ? JSON.parse(String(template.variables_schema))
        : [],
    tenancy_rules:
      typeof template.tenancy_rules === 'object' && template.tenancy_rules !== null
        ? template.tenancy_rules
        : template.tenancy_rules
          ? JSON.parse(String(template.tenancy_rules))
          : null,
    default_total_value:
      template.default_total_value != null ? parseFloat(String(template.default_total_value)) : null,
  };
}

// Get one template (mesmo isolamento por tenant que a listagem)
export async function getContractTemplateById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ct.* FROM contract_templates ct
       INNER JOIN users u ON u.id = ct.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE ct.id = $1`,
      [id, userId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contract template not found' });
      return;
    }
    res.json(formatTemplateRow(result.rows[0] as Record<string, unknown>));
  } catch (error) {
    console.error('Error fetching contract template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create contract template
export async function createContractTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const templateData = templateSchema.parse(req.body);

    await assertModulePermission(userId, 'contracts', 'create', undefined, req);

    const result = await pool.query(
      `INSERT INTO contract_templates (
        user_id, name, description, default_title, content_html, variables_schema, is_active,
        default_total_value, default_currency, tenancy_rules
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb)
      RETURNING *`,
      [
        userId,
        templateData.name,
        templateData.description || null,
        templateData.default_title ?? null,
        templateData.content_html,
        JSON.stringify(templateData.variables_schema ?? []),
        templateData.is_active !== undefined ? templateData.is_active : true,
        templateData.default_total_value ?? null,
        normalizeTemplateCurrency(templateData.default_currency),
        templateData.tenancy_rules != null ? JSON.stringify(templateData.tenancy_rules) : null,
      ]
    );

    const template = result.rows[0];

    res.status(201).json(formatTemplateRow(template as Record<string, unknown>));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const pg = error as { code?: string; detail?: string; message?: string };
    if (pg?.code === '42703') {
      res.status(503).json({
        error:
          'Base de dados desatualizada: execute as migrações (ex.: 116_contract_templates_value_tenancy) e reinicie o servidor.',
        code: 'DB_SCHEMA_OUTDATED',
      });
      return;
    }
    console.error('Error creating contract template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Update contract template
export async function updateContractTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const templateData = templateSchema.partial().parse(req.body);

    const existing = await pool.query<{ user_id: string }>(
      `SELECT ct.user_id FROM contract_templates ct
       INNER JOIN users u ON u.id = ct.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE ct.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Contract template not found' });
      return;
    }
    const ownerId = existing.rows[0].user_id;
    await assertModulePermission(
      userId,
      'contracts',
      'edit',
      { ownerId, assigneeId: null },
      req
    );

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(templateData).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'variables_schema' || key === 'tenancy_rules') {
          updates.push(`${key} = $${paramIndex}::jsonb`);
          values.push(value === null ? null : JSON.stringify(value));
        } else if (key === 'default_currency') {
          updates.push(`${key} = $${paramIndex}`);
          values.push(normalizeTemplateCurrency(value));
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

    values.push(id);
    const result = await pool.query(
      `UPDATE contract_templates
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    const template = result.rows[0];

    res.json(formatTemplateRow(template as Record<string, unknown>));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating contract template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete contract template
export async function deleteContractTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const existing = await pool.query<{ user_id: string }>(
      `SELECT ct.user_id FROM contract_templates ct
       INNER JOIN users u ON u.id = ct.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE ct.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Contract template not found' });
      return;
    }
    const ownerId = existing.rows[0].user_id;
    await assertModulePermission(
      userId,
      'contracts',
      'delete',
      { ownerId, assigneeId: null },
      req
    );

    const contractsResult = await pool.query(
      `SELECT COUNT(*) FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE c.template_id = $1`,
      [id, userId]
    );

    if (parseInt(contractsResult.rows[0].count, 10) > 0) {
      res.status(409).json({ error: 'Cannot delete template with associated contracts' });
      return;
    }

    const result = await pool.query(
      `DELETE FROM contract_templates WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contract template not found' });
      return;
    }

    res.json({ message: 'Contract template deleted successfully' });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error deleting contract template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
