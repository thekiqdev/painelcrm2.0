import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { rewriteStoredCatalogMediaUrlForClient } from '../utils/catalogMediaPublicSignedUrl.js';
import { notifyTenantTicketCreated } from '../services/ticketNotificationsService.js';
import { brPhoneSearchKeys, findTenantClientsByPhoneKeys, ticketContactPhoneMatchesInput } from '../services/supportPortalPhoneMatch.js';

const ticketBodySchema = z.object({
  name: z.string().min(1).max(120),
  email: z.preprocess(
    (v) => (v == null || v === '' ? '' : String(v).trim().toLowerCase()),
    z.union([z.literal(''), z.string().email().max(254)]),
  ),
  phone: z
    .string()
    .max(32)
    .transform((s) => s.trim())
    .refine((s) => s.length >= 8, { message: 'Telefone inválido.' }),
  subject: z.string().min(1).max(160),
  category_id: z.string().uuid().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  message: z.string().min(1).max(5000),
  company_website: z.string().max(200).optional().nullable(),
});

const ticketLookupSchema = z.object({
  ticket_number: z
    .string()
    .min(2)
    .max(80)
    .transform((s) => s.trim()),
  phone: z
    .string()
    .max(32)
    .transform((s) => s.trim())
    .refine((s) => s.replace(/\D/g, '').length >= 8, { message: 'Telefone inválido.' }),
});

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function sanitizeMultiline(input: string): string {
  return stripHtml(input).slice(0, 5000);
}

function portalNotFound(res: Response): void {
  res.status(404).json({
    ok: false,
    code: 'portal_not_found',
    message: 'Este portal de suporte não está disponível.',
  });
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const v of values) {
    if (v == null) continue;
    const t = String(v).trim();
    if (t) return t;
  }
  return null;
}

/**
 * Logótipo público: marca da empresa/home (tenants) primeiro; depois override legado do portal.
 */
function resolvePublicSupportLogoUrl(req: Request, row: Record<string, unknown>): string | null {
  const raw = firstNonEmptyString(
    row.logo_light_url,
    row.tenant_logo_url,
    row.logo_dark_url,
    row.portal_settings_logo_url,
  );
  return raw ? rewriteStoredCatalogMediaUrlForClient(req, raw) : null;
}

async function loadEnabledPortalBySlug(slug: string) {
  const r = await pool.query(
    `SELECT s.id, s.tenant_id, t.slug AS tenant_slug, s.title, s.description, s.welcome_message,
            s.logo_url AS portal_settings_logo_url, s.primary_color, s.default_priority, s.allowed_category_ids,
            t.name AS company_name,
            t.logo_light_url, t.logo_url AS tenant_logo_url, t.logo_dark_url
     FROM tenants t
     INNER JOIN tenant_support_portal_settings s ON s.tenant_id = t.id AND s.enabled = true
     WHERE lower(trim(t.slug)) = lower(trim($1))`,
    [slug],
  );
  return r.rows[0] as
    | (Record<string, unknown> & {
        tenant_id: string;
        tenant_slug: string;
        default_priority: string;
        allowed_category_ids: string[] | null;
        company_name: string;
      })
    | undefined;
}

export async function getPublicSupportPortalBySlug(req: Request, res: Response): Promise<void> {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!slug) {
      portalNotFound(res);
      return;
    }
    const portal = await loadEnabledPortalBySlug(slug);
    if (!portal) {
      portalNotFound(res);
      return;
    }
    const tenantId = portal.tenant_id as string;
    const allowed = portal.allowed_category_ids as string[] | null;

    let catSql = `SELECT c.id, c.name
       FROM ticket_categories c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1`;
    const params: unknown[] = [tenantId];
    if (allowed && allowed.length > 0) {
      catSql += ` WHERE c.id = ANY($2::uuid[])`;
      params.push(allowed);
    }
    catSql += ' ORDER BY c.name ASC';
    const cats = await pool.query<{ id: string; name: string }>(catSql, params);

    const logoUrl = resolvePublicSupportLogoUrl(req, portal);

    res.json({
      enabled: true,
      slug: String(portal.tenant_slug ?? '').trim(),
      company_name: String(portal.company_name ?? ''),
      title: portal.title != null ? String(portal.title) : null,
      description: portal.description != null ? String(portal.description) : null,
      welcome_message: portal.welcome_message != null ? String(portal.welcome_message) : null,
      logo_url: logoUrl,
      primary_color: portal.primary_color != null ? String(portal.primary_color) : null,
      categories: cats.rows,
      default_priority: String(portal.default_priority ?? 'normal'),
    });
  } catch (e) {
    console.error('[public-support-portal] get', e);
    res.status(500).json({ ok: false, message: 'Erro interno' });
  }
}

async function pickPortalActorUserId(tenantId: string): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT u.id FROM users u WHERE u.tenant_id = $1 ORDER BY u.created_at ASC LIMIT 1`,
    [tenantId],
  );
  return r.rows[0]?.id ?? null;
}

export async function postPublicSupportTicket(req: Request, res: Response): Promise<void> {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!slug) {
      portalNotFound(res);
      return;
    }

    const parsed = ticketBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: parsed.error.errors[0]?.message ?? 'Dados inválidos',
      });
      return;
    }
    const body = parsed.data;

    const hp = (body.company_website ?? '').trim();
    if (hp.length > 0) {
      res.status(200).json({
        ok: true,
        ticket_number: null,
        ticket_id_public: null,
        message: 'O seu pedido foi recebido.',
      });
      return;
    }

    const portal = await loadEnabledPortalBySlug(slug);
    if (!portal) {
      portalNotFound(res);
      return;
    }

    const tenantId = portal.tenant_id as string;
    const defaultPriority = String(portal.default_priority ?? 'normal') as
      | 'low'
      | 'normal'
      | 'high'
      | 'urgent';
    const priority = body.priority ?? defaultPriority;
    if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
      res.status(400).json({ ok: false, message: 'Prioridade inválida.' });
      return;
    }

    const allowed = portal.allowed_category_ids as string[] | null;

    const cats = await pool.query<{ id: string }>(
      allowed && allowed.length > 0
        ? `SELECT c.id FROM ticket_categories c
           INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
           WHERE c.id = ANY($2::uuid[])`
        : `SELECT c.id FROM ticket_categories c
           INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1`,
      allowed && allowed.length > 0 ? [tenantId, allowed] : [tenantId],
    );
    const validCatIds = new Set(cats.rows.map((r) => r.id));

    let categoryId: string | null = body.category_id ?? null;
    if (validCatIds.size > 0) {
      if (!categoryId || !validCatIds.has(categoryId)) {
        res.status(400).json({ ok: false, message: 'Selecione uma categoria válida.' });
        return;
      }
    } else {
      categoryId = null;
    }

    const actorId = await pickPortalActorUserId(tenantId);
    if (!actorId) {
      res.status(503).json({ ok: false, message: 'Portal temporariamente indisponível.' });
      return;
    }

    const phoneKeys = brPhoneSearchKeys(body.phone);
    if (phoneKeys.length === 0) {
      res.status(400).json({ ok: false, message: 'Telefone inválido.' });
      return;
    }

    const { clients: phoneHits, ambiguous } = await findTenantClientsByPhoneKeys(tenantId, phoneKeys);

    let clientId: string | null = null;
    let profileId: string | null = null;
    let matchedClient: (typeof phoneHits)[0] | null = null;
    let phoneMatchConflict = false;

    if (ambiguous) {
      phoneMatchConflict = true;
    } else if (phoneHits.length === 1) {
      matchedClient = phoneHits[0];
      clientId = matchedClient.id;
      profileId = matchedClient.profile_id;
    }

    const contactNameRaw = stripHtml(body.name).slice(0, 120);
    const contactName =
      contactNameRaw || (matchedClient?.name ? stripHtml(matchedClient.name).slice(0, 120) : '');
    if (!contactName) {
      res.status(400).json({ ok: false, message: 'Indique o nome.' });
      return;
    }

    let contactEmail = (body.email ?? '').trim().toLowerCase().slice(0, 254);
    if (!contactEmail && matchedClient?.email) {
      contactEmail = String(matchedClient.email).trim().toLowerCase().slice(0, 254);
    }
    if (!contactEmail) {
      contactEmail = '';
    }

    const canonicalPhone =
      [...phoneKeys].sort((a, b) => b.length - a.length)[0] ?? body.phone.trim().replace(/\D/g, '');
    const contactPhone = canonicalPhone.slice(0, 32);

    const subject = stripHtml(body.subject).slice(0, 160);
    const message = sanitizeMultiline(body.message);
    if (!subject || !message) {
      res.status(400).json({ ok: false, message: 'Preencha os campos obrigatórios.' });
      return;
    }

    const customFields: Record<string, unknown> = {};
    if (phoneMatchConflict) {
      customFields.phone_match_conflict = true;
    }

    const dbClient = await pool.connect();
    let created: Record<string, unknown>;
    try {
      await dbClient.query('BEGIN');
      try {
        const ins = await dbClient.query(
          `INSERT INTO tickets (
          user_id, contact_name, contact_email, contact_phone,
          subject, description, category_id, priority, status, channel,
          client_id, profile_id, custom_fields
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::ticket_priority, 'new', 'portal'::ticket_channel,
          $9::uuid, $10::uuid, $11::jsonb)
        RETURNING *`,
          [
            actorId,
            contactName,
            contactEmail,
            contactPhone,
            subject,
            message,
            categoryId,
            priority,
            clientId,
            profileId,
            JSON.stringify(customFields),
          ],
        );
        created = ins.rows[0] as Record<string, unknown>;
        const ticketId = String(created.id);

        await dbClient.query(
          `INSERT INTO ticket_messages (
          ticket_id, user_id, content, visibility, attachments, mentions
        ) VALUES ($1, $2, $3, 'public', '[]'::jsonb, '[]'::jsonb)`,
          [ticketId, actorId, message],
        );

        await dbClient.query('COMMIT');
      } catch (e) {
        await dbClient.query('ROLLBACK');
        throw e;
      }
    } finally {
      dbClient.release();
    }

    try {
      await notifyTenantTicketCreated(
        tenantId,
        {
          id: String(created.id),
          ticket_number: String(created.ticket_number),
          subject: String(created.subject),
          user_id: String(created.user_id),
          assignee_id: created.assignee_id ? String(created.assignee_id) : null,
          team_id: created.team_id ? String(created.team_id) : null,
        },
        {
          fromPublicPortal: true,
          clientId: matchedClient?.id ?? null,
          clientName: matchedClient?.name ?? null,
          phoneMatchConflict,
        },
      );
    } catch (e) {
      console.warn('[public-support-portal] notifyTenantTicketCreated', e);
    }

    res.status(201).json({
      ok: true,
      ticket_number: String(created.ticket_number),
      ticket_id_public: String(created.id),
      message: 'Chamado aberto com sucesso',
    });
  } catch (e) {
    console.error('[public-support-portal] post', e);
    res.status(500).json({ ok: false, message: 'Erro interno' });
  }
}

export async function postPublicSupportTicketLookup(req: Request, res: Response): Promise<void> {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!slug) {
      portalNotFound(res);
      return;
    }
    const portal = await loadEnabledPortalBySlug(slug);
    if (!portal) {
      portalNotFound(res);
      return;
    }

    const parsed = ticketLookupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        code: 'invalid_request',
        message: parsed.error.errors[0]?.message ?? 'Dados inválidos.',
      });
      return;
    }

    const { ticket_number, phone } = parsed.data;
    const tenantId = portal.tenant_id as string;

    const tq = await pool.query<{
      id: string;
      ticket_number: string;
      subject: string;
      status: string;
      priority: string;
      contact_phone: string | null;
      created_at: Date;
      updated_at: Date;
      category_name: string | null;
    }>(
      `SELECT t.id::text, t.ticket_number, t.subject, t.status::text, t.priority::text,
              t.contact_phone, t.created_at, t.updated_at,
              cat.name AS category_name
       FROM tickets t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       LEFT JOIN ticket_categories cat ON cat.id = t.category_id
       WHERE lower(trim(t.ticket_number)) = lower(trim($2))
         AND t.channel = 'portal'::ticket_channel
       LIMIT 1`,
      [tenantId, ticket_number],
    );

    const row = tq.rows[0];
    if (!row || !ticketContactPhoneMatchesInput(row.contact_phone, phone)) {
      res.status(404).json({
        ok: false,
        code: 'ticket_lookup_failed',
        message:
          'Não encontramos um chamado com estes dados. Verifique o protocolo e o telefone usados na abertura.',
      });
      return;
    }

    const msgs = await pool.query<{ content: string; created_at: Date }>(
      `SELECT m.content, m.created_at
       FROM ticket_messages m
       WHERE m.ticket_id = $1::uuid AND m.visibility = 'public'
       ORDER BY m.created_at ASC
       LIMIT 200`,
      [row.id],
    );

    const messages = msgs.rows.map((m) => ({
      content: stripHtml(m.content).slice(0, 8000),
      created_at: m.created_at.toISOString(),
    }));

    res.json({
      ok: true,
      ticket: {
        ticket_number: row.ticket_number,
        subject: row.subject,
        status: row.status,
        priority: row.priority,
        category_name: row.category_name,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        messages,
      },
    });
  } catch (e) {
    console.error('[public-support-portal] lookup', e);
    res.status(500).json({ ok: false, message: 'Erro interno' });
  }
}
