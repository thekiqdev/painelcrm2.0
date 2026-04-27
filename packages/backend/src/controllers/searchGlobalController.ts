import { Request, Response } from 'express';
import { pool } from '../utils/db.js';

export type GlobalSearchTypes =
  | 'clients'
  | 'leads'
  | 'invoices'
  | 'proposals'
  | 'contracts'
  | 'tickets'
  | 'projects'
  | 'products';

const DEFAULT_TYPES: GlobalSearchTypes[] = [
  'clients',
  'leads',
  'invoices',
  'proposals',
  'contracts',
  'tickets',
  'projects',
  'products',
];

function parseTypes(raw: unknown): GlobalSearchTypes[] {
  if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_TYPES;
  const parts = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as string[];
  const allowed = new Set<string>(DEFAULT_TYPES);
  const out = parts.filter((p) => allowed.has(p)) as GlobalSearchTypes[];
  return out.length ? out : DEFAULT_TYPES;
}

/**
 * GET /api/search/global?q=...&types=clients,leads,...
 * Resposta agrupada para busca inteligente no desktop (PainelCRM).
 */
export const searchGlobalGrouped = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId as string | null | undefined;
    if (!tenantId) {
      return res.json({
        clients: [],
        leads: [],
        invoices: [],
        proposals: [],
        contracts: [],
        tickets: [],
        projects: [],
        products: [],
      });
    }

    const { q, types: typesQuery } = req.query;
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.json({
        clients: [],
        leads: [],
        invoices: [],
        proposals: [],
        contracts: [],
        tickets: [],
        projects: [],
        products: [],
      });
    }

    const searchTerm = `%${q.trim()}%`;
    const typeFilter = parseTypes(typesQuery);

    const clientsP =
      typeFilter.includes('clients')
        ? pool.query(
            `SELECT c.id,
                    c.name,
                    c.email,
                    c.phone,
                    c.company,
                    c.status,
                    'client' AS kind,
                    CONCAT('/clients/', c.id) AS href,
                    wa.wa_url AS whatsapp_avatar_url
             FROM clients c
             INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
             LEFT JOIN LATERAL (
               SELECT COALESCE(
                 NULLIF(TRIM(cc.metadata->>'whatsapp_profile_photo'), ''),
                 NULLIF(TRIM(cc.metadata->>'image'), ''),
                 NULLIF(TRIM(cc.metadata->>'imagePreview'), ''),
                 NULLIF(TRIM(cc.metadata->>'image_preview'), '')
               ) AS wa_url
               FROM chat_conversations cc
               INNER JOIN users cu ON cu.id = cc.user_id AND cu.tenant_id = $1
               WHERE cc.client_id = c.id
               ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC NULLS LAST
               LIMIT 1
             ) wa ON true
             WHERE (c.name ILIKE $2 OR c.email ILIKE $2 OR c.company ILIKE $2 OR c.phone ILIKE $2 OR COALESCE(c.cpf_cnpj, '') ILIKE $2)
             ORDER BY c.name ASC
             LIMIT 8`,
            [tenantId, searchTerm],
          )
        : Promise.resolve({ rows: [] as any[] });

    const leadsP =
      typeFilter.includes('leads')
        ? pool.query(
            `SELECT l.id,
                    l.name,
                    l.email,
                    l.phone,
                    l.company,
                    l.status,
                    'lead' AS kind,
                    '/leads' AS href,
                    wa.wa_url AS whatsapp_avatar_url
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
               WHERE cc.lead_id = l.id
               ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC NULLS LAST
               LIMIT 1
             ) wa ON true
             WHERE (l.name ILIKE $2 OR l.email ILIKE $2 OR l.company ILIKE $2 OR l.phone ILIKE $2)
             ORDER BY l.name ASC
             LIMIT 8`,
            [tenantId, searchTerm],
          )
        : Promise.resolve({ rows: [] as any[] });

    const invoicesP =
      typeFilter.includes('invoices')
        ? pool.query(
            `SELECT ci.id,
                    ci.invoice_number,
                    ci.amount_cents,
                    ci.status,
                    ci.due_date::text AS due_date,
                    cl.name AS client_name,
                    CONCAT('/customer-invoices/', ci.id) AS href
             FROM customer_invoices ci
             INNER JOIN clients cl ON cl.id = ci.client_id
             WHERE ci.tenant_id = $1
               AND ci.invoice_type IS DISTINCT FROM 'child'
               AND (
                 COALESCE(ci.invoice_number, '') ILIKE $2
                 OR COALESCE(ci.description, '') ILIKE $2
                 OR cl.name ILIKE $2
               )
             ORDER BY ci.created_at DESC
             LIMIT 8`,
            [tenantId, searchTerm],
          )
        : Promise.resolve({ rows: [] as any[] });

    const proposalsP =
      typeFilter.includes('proposals')
        ? pool.query(
            `SELECT p.id,
                    p.title,
                    p.amount::text AS amount,
                    p.status,
                    p.valid_until::text AS valid_until,
                    cl.name AS client_name,
                    CONCAT('/proposals/', p.id) AS href
             FROM proposals p
             INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
             LEFT JOIN clients cl ON cl.id = p.client_id
             WHERE (p.title ILIKE $2 OR COALESCE(cl.name, '') ILIKE $2)
             ORDER BY p.updated_at DESC
             LIMIT 8`,
            [tenantId, searchTerm],
          )
        : Promise.resolve({ rows: [] as any[] });

    const contractsP =
      typeFilter.includes('contracts')
        ? pool.query(
            `SELECT c.id,
                    c.title,
                    c.contract_number,
                    c.status::text AS status,
                    cl.name AS client_name,
                    CASE
                      WHEN c.status::text IN ('ACTIVE', 'INACTIVE', 'EXPIRED') THEN 'signed_or_closed'
                      WHEN c.status::text IN ('PENDING_SIGNATURE', 'PARTIALLY_SIGNED') THEN 'awaiting_signature'
                      ELSE 'other'
                    END AS signature_state,
                    CONCAT('/contracts/', c.id) AS href
             FROM contracts c
             INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
             LEFT JOIN clients cl ON cl.id = c.client_id
             WHERE (c.title ILIKE $2 OR c.contract_number ILIKE $2 OR COALESCE(cl.name, '') ILIKE $2)
             ORDER BY c.updated_at DESC
             LIMIT 8`,
            [tenantId, searchTerm],
          )
        : Promise.resolve({ rows: [] as any[] });

    const ticketsP =
      typeFilter.includes('tickets')
        ? pool.query(
            `SELECT t.id,
                    t.ticket_number,
                    t.subject,
                    t.status::text AS status,
                    t.priority::text AS priority,
                    t.contact_name,
                    CONCAT('/support/tickets/', t.id) AS href
             FROM tickets t
             INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
             WHERE (t.subject ILIKE $2 OR t.ticket_number ILIKE $2 OR t.contact_name ILIKE $2 OR t.contact_email ILIKE $2)
             ORDER BY t.updated_at DESC
             LIMIT 8`,
            [tenantId, searchTerm],
          )
        : Promise.resolve({ rows: [] as any[] });

    const projectsP =
      typeFilter.includes('projects')
        ? pool.query(
            `SELECT p.id,
                    p.name,
                    p.status,
                    p.due_date::text AS due_date,
                    CONCAT('/projects?project=', p.id) AS href
             FROM projects p
             INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
             WHERE (p.name ILIKE $2 OR COALESCE(p.description, '') ILIKE $2)
             ORDER BY p.updated_at DESC
             LIMIT 8`,
            [tenantId, searchTerm],
          )
        : Promise.resolve({ rows: [] as any[] });

    const productsP =
      typeFilter.includes('products')
        ? pool.query(
            `SELECT p.id,
                    p.name,
                    p.description,
                    p.type,
                    p.status,
                    CONCAT('/admin/products/', p.id, '/edit') AS href
             FROM products p
             INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
             WHERE (p.name ILIKE $2 OR COALESCE(p.description, '') ILIKE $2 OR COALESCE(p.sku, '') ILIKE $2)
             ORDER BY p.name ASC
             LIMIT 8`,
            [tenantId, searchTerm],
          )
        : Promise.resolve({ rows: [] as any[] });

    const [clients, leads, invoices, proposals, contracts, tickets, projects, products] = await Promise.all([
      clientsP,
      leadsP,
      invoicesP,
      proposalsP,
      contractsP,
      ticketsP,
      projectsP,
      productsP,
    ]);

    res.json({
      clients: clients.rows,
      leads: leads.rows,
      invoices: invoices.rows,
      proposals: proposals.rows,
      contracts: contracts.rows,
      tickets: tickets.rows,
      projects: projects.rows,
      products: products.rows,
    });
  } catch (error) {
    console.error('Error in global grouped search:', error);
    res.status(500).json({ error: 'Erro ao realizar busca' });
  }
};
