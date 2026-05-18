import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { rewriteStoredCatalogMediaUrlForClient } from '../utils/catalogMediaPublicSignedUrl.js';
import {
  notifyTenantTicketCreated,
  notifyTenantTicketPublicReply,
} from '../services/ticketNotificationsService.js';
import {
  brPhoneSearchKeysExpanded,
  findTenantClientsByEmail,
  findTenantLeadsByEmail,
  insertSupportPortalLead,
  resolveTenantClientByPhone,
  resolveTenantLeadByPhone,
  ticketContactPhoneMatchesInput,
  type PhoneMatchClientRow,
  type PhoneMatchLeadRow,
} from '../services/supportPortalPhoneMatch.js';
import { isBrazilianNationalPhoneValid, normalizeBrazilianNationalDigits } from '../utils/phone.js';
import { applyCustomerMessageSideEffects } from '../services/ticketMessageSideEffects.js';

function supportPortalLog(label: string, payload?: unknown): void {
  if (payload !== undefined) {
    console.log(`[support-portal] ${label}`, payload);
  } else {
    console.log(`[support-portal] ${label}`);
  }
}

function supportPortalLogError(label: string, error: unknown): void {
  console.error(`[support-portal] ${label}`, error);
}

const ticketBodySchema = z.object({
  name: z.string().min(1).max(120),
  email: z.preprocess(
    (v) => (v == null || v === '' ? '' : String(v).trim().toLowerCase()),
    z.union([z.literal(''), z.string().email().max(254)]),
  ),
  phone: z
    .string()
    .max(40)
    .transform((s) => s.trim())
    .refine((s) => isBrazilianNationalPhoneValid(normalizeBrazilianNationalDigits(s)), {
      message: 'Informe um telefone válido (DDD + número, 10 ou 11 dígitos).',
    }),
  subject: z.string().min(1).max(160),
  category_id: z.string().uuid().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  message: z.string().min(1).max(5000),
  company_website: z.string().max(200).optional().nullable(),
});

const portalPhoneSchema = z
  .string()
  .max(32)
  .transform((s) => s.trim())
  .refine((s) => s.replace(/\D/g, '').length >= 8, { message: 'Telefone inválido.' });

const ticketLookupSchema = z.object({
  ticket_number: z
    .string()
    .min(2)
    .max(80)
    .transform((s) => s.trim()),
  phone: portalPhoneSchema,
});

const ticketReplySchema = z.object({
  phone: portalPhoneSchema,
  message: z.string().min(1).max(5000),
  company_website: z.string().max(200).optional().nullable(),
});

const publicTicketTokenReplySchema = z.object({
  message: z.string().min(1).max(5000),
  company_website: z.string().max(200).optional().nullable(),
});

const PORTAL_TICKET_TERMINAL_STATUSES = new Set(['closed', 'cancelled']);

type PortalTicketContactRow = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  contact_phone: string | null;
  contact_name: string | null;
  created_at: Date;
  updated_at: Date;
  category_name: string | null;
  user_id: string;
  assignee_id: string | null;
  team_id: string | null;
};

function buildPublicPortalMessageMetadata(contactName: string, contactPhone: string): string {
  return JSON.stringify({
    source: 'public_portal',
    author_name: contactName.slice(0, 120),
    author_phone: contactPhone.slice(0, 40),
  });
}

function publicMessageAuthorRole(metadata: unknown): 'customer' | 'support' {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const src = (metadata as Record<string, unknown>).source;
    if (src === 'public_portal') return 'customer';
  }
  return 'support';
}

async function findPortalTicketForContact(
  tenantId: string,
  ticketNumber: string,
  phone: string,
): Promise<PortalTicketContactRow | null> {
  const tq = await pool.query<PortalTicketContactRow>(
    `SELECT t.id::text, t.ticket_number, t.subject, t.status::text, t.priority::text,
            t.contact_phone, t.contact_name, t.created_at, t.updated_at,
            t.user_id::text, t.assignee_id::text, t.team_id::text,
            cat.name AS category_name
     FROM tickets t
     INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
     LEFT JOIN ticket_categories cat ON cat.id = t.category_id
     WHERE lower(trim(t.ticket_number)) = lower(trim($2))
       AND t.channel = 'portal'::ticket_channel
     LIMIT 1`,
    [tenantId, ticketNumber],
  );
  const row = tq.rows[0];
  if (!row || !ticketContactPhoneMatchesInput(row.contact_phone, phone)) return null;
  return row;
}

async function loadPublicTicketMessages(ticketId: string): Promise<
  { content: string; created_at: string; author_role: 'customer' | 'support' }[]
> {
  try {
    const msgs = await pool.query<{ content: string; created_at: Date; metadata: unknown }>(
      `SELECT m.content, m.created_at, m.metadata
       FROM ticket_messages m
       WHERE m.ticket_id = $1::uuid AND m.visibility = 'public'
       ORDER BY m.created_at ASC
       LIMIT 200`,
      [ticketId],
    );
    return msgs.rows.map((m) => ({
      content: stripHtml(m.content).slice(0, 8000),
      created_at: m.created_at.toISOString(),
      author_role: publicMessageAuthorRole(m.metadata),
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/metadata|column.*does not exist/i.test(msg)) throw e;
    const msgs = await pool.query<{ content: string; created_at: Date }>(
      `SELECT m.content, m.created_at
       FROM ticket_messages m
       WHERE m.ticket_id = $1::uuid AND m.visibility = 'public'
       ORDER BY m.created_at ASC
       LIMIT 200`,
      [ticketId],
    );
    return msgs.rows.map((m) => ({
      content: stripHtml(m.content).slice(0, 8000),
      created_at: m.created_at.toISOString(),
      author_role: 'support' as const,
    }));
  }
}

type DbQueryable = Pick<typeof pool, 'query'>;

async function insertPublicPortalTicketMessage(
  db: DbQueryable,
  params: {
    ticketId: string;
    actorUserId: string;
    content: string;
    metadataJson: string;
  },
): Promise<void> {
  const { ticketId, actorUserId, content, metadataJson } = params;
  try {
    await db.query(
      `INSERT INTO ticket_messages (
        ticket_id, user_id, content, visibility, attachments, mentions, metadata
      ) VALUES ($1, $2, $3, 'public', '[]'::jsonb, '[]'::jsonb, $4::jsonb)`,
      [ticketId, actorUserId, content, metadataJson],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/metadata|column.*does not exist/i.test(msg)) {
      await db.query(
        `INSERT INTO ticket_messages (
          ticket_id, user_id, content, visibility, attachments, mentions
        ) VALUES ($1, $2, $3, 'public', '[]'::jsonb, '[]'::jsonb)`,
        [ticketId, actorUserId, content],
      );
      return;
    }
    throw e;
  }
}

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

function publicTicketNotFound(res: Response): void {
  res.status(404).json({
    ok: false,
    code: 'ticket_not_found',
    message: 'Ticket não encontrado ou link inválido.',
  });
}

type PublicTicketByTokenRow = PortalTicketContactRow & {
  tenant_id: string;
  company_name: string | null;
  logo_light_url: string | null;
  tenant_logo_url: string | null;
  logo_dark_url: string | null;
  portal_settings_logo_url: string | null;
  primary_color: string | null;
};

async function findPublicTicketByToken(token: string): Promise<PublicTicketByTokenRow | null> {
  const r = await pool.query<PublicTicketByTokenRow>(
    `SELECT t.id::text, t.ticket_number, t.subject, t.status::text, t.priority::text,
            t.contact_phone, t.contact_name, t.created_at, t.updated_at,
            t.user_id::text, t.assignee_id::text, t.team_id::text,
            u.tenant_id::text AS tenant_id,
            tenant.name AS company_name,
            tenant.logo_light_url, tenant.logo_url AS tenant_logo_url, tenant.logo_dark_url,
            s.logo_url AS portal_settings_logo_url, s.primary_color,
            cat.name AS category_name
     FROM tickets t
     INNER JOIN users u ON u.id = t.user_id
     INNER JOIN tenants tenant ON tenant.id = u.tenant_id
     LEFT JOIN tenant_support_portal_settings s ON s.tenant_id = tenant.id
     LEFT JOIN ticket_categories cat ON cat.id = t.category_id
     WHERE t.public_access_token = $1
     LIMIT 1`,
    [token],
  );
  return r.rows[0] ?? null;
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

    console.log('[support-portal-ticket] input', {
      slug,
      name: body.name,
      phoneRaw: body.phone,
      email: body.email,
    });

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

    const nationalPhone = normalizeBrazilianNationalDigits(body.phone);
    const phoneKeys = brPhoneSearchKeysExpanded(body.phone);

    console.log('[support-portal-ticket] normalized', {
      normalizedPhone: nationalPhone,
      phoneSearchKeys: phoneKeys,
    });

    if (!isBrazilianNationalPhoneValid(nationalPhone)) {
      res.status(400).json({ ok: false, message: 'Informe um telefone válido (DDD + número, 10 ou 11 dígitos).' });
      return;
    }

    if (phoneKeys.length === 0) {
      res.status(400).json({ ok: false, message: 'Telefone inválido.' });
      return;
    }

    const emailTrim = (body.email ?? '').trim().toLowerCase();

    let clientId: string | null = null;
    let profileId: string | null = null;
    let leadId: string | null = null;
    let matchedClient: PhoneMatchClientRow | null = null;
    let matchedLead: PhoneMatchLeadRow | null = null;
    let matchedLeadName: string | null = null;
    let phoneMatchConflict = false;
    let createdLead: { id: string; name: string } | null = null;
    let phoneMatchAutoPicked = false;
    let phoneMatchCandidates = 0;

    const clientResolution = await resolveTenantClientByPhone(tenantId, phoneKeys, emailTrim || null);
    if (clientResolution.unresolvedConflict) {
      phoneMatchConflict = true;
    } else if (clientResolution.match) {
      matchedClient = clientResolution.match;
      clientId = matchedClient.id;
      profileId = matchedClient.profile_id;
      phoneMatchAutoPicked = clientResolution.autoPicked;
      phoneMatchCandidates = clientResolution.candidateCount;
    }

    if (!clientId && !phoneMatchConflict) {
      const leadResolution = await resolveTenantLeadByPhone(tenantId, phoneKeys, emailTrim || null);
      if (leadResolution.unresolvedConflict) {
        phoneMatchConflict = true;
      } else if (leadResolution.match) {
        matchedLead = leadResolution.match;
        leadId = matchedLead.id;
        profileId = profileId ?? matchedLead.profile_id;
        matchedLeadName = matchedLead.name;
        phoneMatchAutoPicked = leadResolution.autoPicked;
        phoneMatchCandidates = leadResolution.candidateCount;
      }
    }

    if (!clientId && !leadId && !phoneMatchConflict && emailTrim) {
      const ec = await findTenantClientsByEmail(tenantId, emailTrim);
      if (ec.ambiguous) {
        phoneMatchConflict = true;
      } else if (ec.clients.length === 1) {
        matchedClient = ec.clients[0];
        clientId = ec.clients[0].id;
        profileId = ec.clients[0].profile_id;
      } else {
        const el = await findTenantLeadsByEmail(tenantId, emailTrim);
        if (el.ambiguous) {
          phoneMatchConflict = true;
        } else if (el.leads.length === 1) {
          matchedLead = el.leads[0];
          leadId = el.leads[0].id;
          profileId = profileId ?? el.leads[0].profile_id;
          matchedLeadName = el.leads[0].name;
        }
      }
    }

    const contactNameRaw = stripHtml(body.name).slice(0, 120);
    const contactName =
      contactNameRaw ||
      (matchedClient?.name ? stripHtml(matchedClient.name).slice(0, 120) : '') ||
      (matchedLeadName ? stripHtml(matchedLeadName).slice(0, 120) : '');
    if (!contactName) {
      res.status(400).json({ ok: false, message: 'Indique o nome.' });
      return;
    }

    let contactEmail = emailTrim.slice(0, 254);
    if (!contactEmail && matchedClient?.email) {
      contactEmail = String(matchedClient.email).trim().toLowerCase().slice(0, 254);
    }
    if (!contactEmail) {
      contactEmail = '';
    }

    const contactPhone = nationalPhone.slice(0, 32);

    const subject = stripHtml(body.subject).slice(0, 160);
    const message = sanitizeMultiline(body.message);
    if (!subject || !message) {
      res.status(400).json({ ok: false, message: 'Preencha os campos obrigatórios.' });
      return;
    }

    const customFields: Record<string, unknown> = {};
    if (phoneMatchConflict) {
      customFields.phone_match_conflict = true;
    } else if (clientId) {
      customFields.phone_match = 'client';
    } else if (leadId) {
      customFields.phone_match = 'lead';
    }
    if (phoneMatchAutoPicked && phoneMatchCandidates > 1) {
      customFields.phone_match_auto_picked = true;
      customFields.phone_match_candidates = phoneMatchCandidates;
    }

    let phoneMatch: string | null =
      (customFields.phone_match as string | undefined) ?? null;

    console.log('[support-portal-ticket] match-result', {
      matchedClientId: matchedClient?.id ?? null,
      matchedLeadId: matchedLead?.id ?? null,
      createdLeadId: null,
      conflict: phoneMatchConflict,
      clientCandidates: clientResolution.candidateCount,
      autoPicked: phoneMatchAutoPicked,
    });

    const dbClient = await pool.connect();
    let created: Record<string, unknown>;
    let createdLeadId: string | null = null;
    try {
      await dbClient.query('BEGIN');
      try {
        if (!clientId && !leadId && !phoneMatchConflict) {
          supportPortalLog('creating-lead', {
            ownerUserId: actorId,
            name: contactName,
            phoneDigits: nationalPhone,
          });
          try {
            const lr = await insertSupportPortalLead({
              db: dbClient,
              ownerUserId: actorId,
              name: contactName,
              phoneDigits: nationalPhone,
              email: contactEmail || null,
              notes: 'Lead criado automaticamente a partir de ticket público.',
            });
            leadId = lr.id;
            profileId = profileId ?? lr.profile_id;
            matchedLeadName = lr.name;
            createdLeadId = lr.id;
            createdLead = { id: lr.id, name: lr.name };
            customFields.phone_match = 'created_lead';
            phoneMatch = 'created_lead';
            supportPortalLog('lead-created', { leadId: lr.id, name: lr.name });
          } catch (leadErr) {
            supportPortalLogError('lead-create-error', leadErr);
            console.error('[support-portal-ticket] create-error', leadErr);
            throw leadErr;
          }
        }

        console.log('[support-portal-ticket] insert-ticket-payload', {
          client_id: clientId,
          lead_id: leadId,
          contact_phone: contactPhone,
          phone_match: phoneMatch,
        });

        let ins;
        try {
          ins = await dbClient.query(
            `INSERT INTO tickets (
          user_id, contact_name, contact_email, contact_phone,
          subject, description, category_id, priority, status, channel,
          client_id, profile_id, lead_id, custom_fields
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::ticket_priority, 'new', 'portal'::ticket_channel,
          $9::uuid, $10::uuid, $11::uuid, $12::jsonb)
        RETURNING id, ticket_number, subject, user_id, assignee_id, team_id, priority, contact_name,
                  client_id, lead_id, custom_fields`,
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
              leadId,
              JSON.stringify(customFields),
            ],
          );
        } catch (ticketInsErr) {
          const msg = ticketInsErr instanceof Error ? ticketInsErr.message : String(ticketInsErr);
          if (/lead_id|column.*does not exist/i.test(msg)) {
            supportPortalLogError('ticket-insert-missing-lead_id-column', ticketInsErr);
            supportPortalLog('ticket-insert-retry-without-lead_id', { lead_id: leadId });
            ins = await dbClient.query(
              `INSERT INTO tickets (
          user_id, contact_name, contact_email, contact_phone,
          subject, description, category_id, priority, status, channel,
          client_id, profile_id, custom_fields
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::ticket_priority, 'new', 'portal'::ticket_channel,
          $9::uuid, $10::uuid, $11::jsonb)
        RETURNING id, ticket_number, subject, user_id, assignee_id, team_id, priority, contact_name,
                  client_id, custom_fields`,
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
          } else {
            supportPortalLogError('ticket-insert-error', ticketInsErr);
            throw ticketInsErr;
          }
        }

        created = ins.rows[0] as Record<string, unknown>;
        console.log('[support-portal-ticket] match-result-after-insert', {
          matchedClientId: matchedClient?.id ?? null,
          matchedLeadId: matchedLead?.id ?? leadId,
          createdLeadId: createdLeadId ?? createdLead?.id ?? null,
          conflict: phoneMatchConflict,
          persisted_client_id: created.client_id ?? null,
          persisted_lead_id: created.lead_id ?? null,
        });
        supportPortalLog('ticket-persisted', {
          id: created.id,
          ticket_number: created.ticket_number,
          client_id: created.client_id ?? null,
          lead_id: created.lead_id ?? null,
          custom_fields: created.custom_fields,
        });
        const ticketId = String(created.id);
        const ticketNumber = String(created.ticket_number);

        if (createdLeadId) {
          try {
            await dbClient.query(
              `UPDATE leads SET notes = $2 WHERE id = $1::uuid`,
              [
                createdLeadId,
                `Lead criado automaticamente a partir de ticket público #${ticketNumber}`,
              ],
            );
          } catch (notesErr) {
            supportPortalLogError('lead-notes-update-error', notesErr);
            throw notesErr;
          }
        }

        const portalMsgMeta = buildPublicPortalMessageMetadata(contactName, contactPhone);
        try {
          await dbClient.query(
            `INSERT INTO ticket_messages (
          ticket_id, user_id, content, visibility, attachments, mentions, metadata
        ) VALUES ($1, $2, $3, 'public', '[]'::jsonb, '[]'::jsonb, $4::jsonb)`,
            [ticketId, actorId, message, portalMsgMeta],
          );
        } catch (msgInsErr) {
          const msgErr = msgInsErr instanceof Error ? msgInsErr.message : String(msgInsErr);
          if (/metadata|column.*does not exist/i.test(msgErr)) {
            await dbClient.query(
              `INSERT INTO ticket_messages (
          ticket_id, user_id, content, visibility, attachments, mentions
        ) VALUES ($1, $2, $3, 'public', '[]'::jsonb, '[]'::jsonb)`,
              [ticketId, actorId, message],
            );
          } else {
            throw msgInsErr;
          }
        }

        await applyCustomerMessageSideEffects(dbClient, ticketId, 'new');

        await dbClient.query('COMMIT');
      } catch (e) {
        await dbClient.query('ROLLBACK');
        supportPortalLogError('transaction-rollback', e);
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
          priority: created.priority ? String(created.priority) : 'normal',
          contact_name: created.contact_name ? String(created.contact_name) : null,
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
    console.error('[support-portal-ticket] create-error', e);
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

    const row = await findPortalTicketForContact(tenantId, ticket_number, phone);
    if (!row) {
      res.status(404).json({
        ok: false,
        code: 'ticket_lookup_failed',
        message:
          'Não encontramos um chamado com estes dados. Verifique o protocolo e o telefone usados na abertura.',
      });
      return;
    }

    const messages = await loadPublicTicketMessages(row.id);
    const can_reply = !PORTAL_TICKET_TERMINAL_STATUSES.has(row.status);

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
        can_reply,
        messages,
      },
    });
  } catch (e) {
    console.error('[public-support-portal] lookup', e);
    res.status(500).json({ ok: false, message: 'Erro interno' });
  }
}

export async function postPublicSupportTicketMessage(req: Request, res: Response): Promise<void> {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const ticketNumberParam = String(req.params.ticketNumber || '').trim();
    if (!slug || !ticketNumberParam) {
      portalNotFound(res);
      return;
    }

    const parsed = ticketReplySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        code: 'invalid_request',
        message: parsed.error.errors[0]?.message ?? 'Dados inválidos.',
      });
      return;
    }

    const body = parsed.data;
    if (body.company_website?.trim()) {
      res.status(201).json({ ok: true });
      return;
    }

    const portal = await loadEnabledPortalBySlug(slug);
    if (!portal) {
      portalNotFound(res);
      return;
    }

    const tenantId = portal.tenant_id as string;
    const row = await findPortalTicketForContact(tenantId, ticketNumberParam, body.phone);
    if (!row) {
      res.status(404).json({
        ok: false,
        code: 'ticket_lookup_failed',
        message:
          'Não encontramos um chamado com estes dados. Verifique o protocolo e o telefone usados na abertura.',
      });
      return;
    }

    if (PORTAL_TICKET_TERMINAL_STATUSES.has(row.status)) {
      res.status(409).json({
        ok: false,
        code: 'ticket_closed',
        message: 'Este chamado está encerrado e não aceita novas respostas.',
      });
      return;
    }

    const actorId = await pickPortalActorUserId(tenantId);
    if (!actorId) {
      res.status(503).json({ ok: false, message: 'Portal temporariamente indisponível.' });
      return;
    }

    const content = sanitizeMultiline(body.message);
    if (!content) {
      res.status(400).json({
        ok: false,
        code: 'invalid_request',
        message: 'Informe uma mensagem válida.',
      });
      return;
    }

    const contactName = String(row.contact_name ?? '').trim() || 'Cliente';
    const contactPhone = String(row.contact_phone ?? body.phone).trim();
    const metadataJson = buildPublicPortalMessageMetadata(contactName, contactPhone);

    const client = await pool.connect();
    let createdAt: Date;
    try {
      await client.query('BEGIN');
      await insertPublicPortalTicketMessage(client, {
        ticketId: row.id,
        actorUserId: actorId,
        content,
        metadataJson,
      });

      await applyCustomerMessageSideEffects(client, row.id, row.status);

      const ts = await client.query<{ created_at: Date }>(
        `SELECT created_at FROM ticket_messages
         WHERE ticket_id = $1::uuid AND visibility = 'public'
         ORDER BY created_at DESC LIMIT 1`,
        [row.id],
      );
      createdAt = ts.rows[0]?.created_at ?? new Date();
      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }

    try {
      await notifyTenantTicketPublicReply({
        tenantId,
        ticket: {
          id: row.id,
          ticket_number: row.ticket_number,
          subject: row.subject,
          user_id: row.user_id,
          assignee_id: row.assignee_id,
          team_id: row.team_id,
        },
        preview: content,
        contactName,
      });
    } catch (e) {
      console.warn('[public-support-portal] notifyTenantTicketPublicReply', e);
    }

    res.status(201).json({
      ok: true,
      message: {
        content,
        created_at: createdAt.toISOString(),
        author_role: 'customer' as const,
      },
    });
  } catch (e) {
    console.error('[public-support-portal] reply', e);
    res.status(500).json({ ok: false, message: 'Erro interno' });
  }
}

export async function getPublicTicketByToken(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      publicTicketNotFound(res);
      return;
    }

    const row = await findPublicTicketByToken(token);
    if (!row) {
      publicTicketNotFound(res);
      return;
    }

    const messages = await loadPublicTicketMessages(row.id);
    const can_reply = !PORTAL_TICKET_TERMINAL_STATUSES.has(row.status);
    const logoUrl = resolvePublicSupportLogoUrl(req, row as Record<string, unknown>);

    res.json({
      ok: true,
      company: {
        name: row.company_name,
        logo_url: logoUrl,
        primary_color: row.primary_color,
      },
      ticket: {
        ticket_number: row.ticket_number,
        subject: row.subject,
        status: row.status,
        priority: row.priority,
        category_name: row.category_name,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        can_reply,
        messages,
      },
    });
  } catch (e) {
    console.error('[public-ticket-token] get', e);
    res.status(500).json({ ok: false, message: 'Erro interno' });
  }
}

export async function postPublicTicketMessageByToken(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      publicTicketNotFound(res);
      return;
    }

    const parsed = publicTicketTokenReplySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        code: 'invalid_request',
        message: parsed.error.errors[0]?.message ?? 'Dados inválidos.',
      });
      return;
    }
    const body = parsed.data;
    if (body.company_website?.trim()) {
      res.status(201).json({ ok: true });
      return;
    }

    const row = await findPublicTicketByToken(token);
    if (!row) {
      publicTicketNotFound(res);
      return;
    }

    if (PORTAL_TICKET_TERMINAL_STATUSES.has(row.status)) {
      res.status(409).json({
        ok: false,
        code: 'ticket_closed',
        message: 'Este chamado está encerrado e não aceita novas respostas.',
      });
      return;
    }

    const actorId = await pickPortalActorUserId(row.tenant_id);
    if (!actorId) {
      res.status(503).json({ ok: false, message: 'Ticket temporariamente indisponível.' });
      return;
    }

    const content = sanitizeMultiline(body.message);
    if (!content) {
      res.status(400).json({
        ok: false,
        code: 'invalid_request',
        message: 'Informe uma mensagem válida.',
      });
      return;
    }

    const contactName = String(row.contact_name ?? '').trim() || 'Cliente';
    const contactPhone = String(row.contact_phone ?? '').trim();
    const metadataJson = buildPublicPortalMessageMetadata(contactName, contactPhone);

    const client = await pool.connect();
    let createdAt: Date;
    try {
      await client.query('BEGIN');
      await insertPublicPortalTicketMessage(client, {
        ticketId: row.id,
        actorUserId: actorId,
        content,
        metadataJson,
      });
      await applyCustomerMessageSideEffects(client, row.id, row.status);
      const ts = await client.query<{ created_at: Date }>(
        `SELECT created_at FROM ticket_messages
         WHERE ticket_id = $1::uuid AND visibility = 'public'
         ORDER BY created_at DESC LIMIT 1`,
        [row.id],
      );
      createdAt = ts.rows[0]?.created_at ?? new Date();
      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }

    try {
      await notifyTenantTicketPublicReply({
        tenantId: row.tenant_id,
        ticket: {
          id: row.id,
          ticket_number: row.ticket_number,
          subject: row.subject,
          user_id: row.user_id,
          assignee_id: row.assignee_id,
          team_id: row.team_id,
        },
        preview: content,
        contactName,
      });
    } catch (e) {
      console.warn('[public-ticket-token] notifyTenantTicketPublicReply', e);
    }

    res.status(201).json({
      ok: true,
      message: {
        content,
        created_at: createdAt.toISOString(),
        author_role: 'customer' as const,
      },
    });
  } catch (e) {
    console.error('[public-ticket-token] reply', e);
    res.status(500).json({ ok: false, message: 'Erro interno' });
  }
}
