/**
 * GET/PUT /api/me/tenant/company — dados comerciais do tenant (Configurações → Dados da Empresa).
 */
import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { rewriteStoredCatalogMediaUrlForClient } from '../utils/catalogMediaPublicSignedUrl.js';

const putBodySchema = z.object({
  name: z.string().min(1).max(500).optional(),
  cpf_cnpj: z.union([z.string(), z.null()]).optional(),
  billing_phone: z.union([z.string(), z.null()]).optional(),
  company_whatsapp: z.union([z.string(), z.null()]).optional(),
  company_address_line: z.union([z.string(), z.null()]).optional(),
  company_city: z.union([z.string(), z.null()]).optional(),
  company_state: z.union([z.string(), z.null()]).optional(),
  company_postal_code: z.union([z.string(), z.null()]).optional(),
  logo_light_url: z.union([z.string().max(2048), z.literal(''), z.null()]).optional(),
  logo_dark_url: z.union([z.string().max(2048), z.literal(''), z.null()]).optional(),
  /** Mantém compat: ao gravar logo clara, espelha em logo_url legado */
  sync_legacy_logo_url: z.boolean().optional(),
});

export type TenantCompanyRow = {
  id: string;
  name: string;
  cpf_cnpj: string | null;
  billing_phone: string | null;
  company_whatsapp: string | null;
  company_address_line: string | null;
  company_city: string | null;
  company_state: string | null;
  company_postal_code: string | null;
  logo_url: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
};

function emptyToNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === '' ? null : t;
}

function mapTenantCompanyLogosForClient(req: AuthRequest, row: TenantCompanyRow): TenantCompanyRow {
  return {
    ...row,
    logo_url: rewriteStoredCatalogMediaUrlForClient(req, row.logo_url),
    logo_light_url: rewriteStoredCatalogMediaUrlForClient(req, row.logo_light_url),
    logo_dark_url: rewriteStoredCatalogMediaUrlForClient(req, row.logo_dark_url),
  };
}

/** GET /api/me/tenant/company — leitura para qualquer utilizador do tenant (sidebar/logo). */
export async function getMyTenantCompany(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;

    const r = await pool.query<TenantCompanyRow>(
      `SELECT id, name,
              cpf_cnpj, billing_phone,
              company_whatsapp,
              company_address_line, company_city, company_state, company_postal_code,
              logo_url, logo_light_url, logo_dark_url
       FROM tenants WHERE id = $1`,
      [tenantId]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'Tenant não encontrado' });
      return;
    }
    res.json(mapTenantCompanyLogosForClient(req, r.rows[0]));
  } catch (error) {
    console.error('getMyTenantCompany error:', error);
    res.status(500).json({ error: 'Erro ao carregar dados da empresa' });
  }
}

/** PUT /api/me/tenant/company */
export async function putMyTenantCompany(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    await assertModulePermission(userId, 'settings', 'edit', undefined, req);

    const body = putBodySchema.parse(req.body);
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    const set = (col: string, val: unknown) => {
      updates.push(`${col} = $${i}`);
      values.push(val);
      i++;
    };

    if (body.name !== undefined) set('name', body.name.trim());
    if (body.cpf_cnpj !== undefined) set('cpf_cnpj', emptyToNull(body.cpf_cnpj));
    if (body.billing_phone !== undefined) set('billing_phone', emptyToNull(body.billing_phone));
    if (body.company_whatsapp !== undefined) set('company_whatsapp', emptyToNull(body.company_whatsapp));
    if (body.company_address_line !== undefined) set('company_address_line', emptyToNull(body.company_address_line));
    if (body.company_city !== undefined) set('company_city', emptyToNull(body.company_city));
    if (body.company_state !== undefined) set('company_state', emptyToNull(body.company_state));
    if (body.company_postal_code !== undefined) set('company_postal_code', emptyToNull(body.company_postal_code));

    if (body.logo_light_url !== undefined) {
      const v = body.logo_light_url === '' ? null : body.logo_light_url;
      set('logo_light_url', v);
      if (body.sync_legacy_logo_url !== false) {
        set('logo_url', v);
      }
    }
    if (body.logo_dark_url !== undefined) {
      const v = body.logo_dark_url === '' ? null : body.logo_dark_url;
      set('logo_dark_url', v);
    }

    if (updates.length === 0) {
      const cur = await pool.query<TenantCompanyRow>(
        `SELECT id, name,
                cpf_cnpj, billing_phone,
                company_whatsapp,
                company_address_line, company_city, company_state, company_postal_code,
                logo_url, logo_light_url, logo_dark_url
         FROM tenants WHERE id = $1`,
        [tenantId]
      );
      const curRow = cur.rows[0];
      res.json(curRow ? mapTenantCompanyLogosForClient(req, curRow) : {});
      return;
    }

    values.push(tenantId);
    const result = await pool.query<TenantCompanyRow>(
      `UPDATE tenants SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING
        id, name,
        cpf_cnpj, billing_phone,
        company_whatsapp,
        company_address_line, company_city, company_state, company_postal_code,
        logo_url, logo_light_url, logo_dark_url`,
      values
    );
    res.json(mapTenantCompanyLogosForClient(req, result.rows[0]!));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: error.errors });
      return;
    }
    console.error('putMyTenantCompany error:', error);
    res.status(500).json({ error: 'Erro ao salvar dados da empresa' });
  }
}
