import { Request, Response } from 'express';
import type { QueryResult } from 'pg';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { z } from 'zod';
import { convertAcceptedProposalToInvoice } from '../services/proposalInvoiceConversionService.js';
import { insertProposalTimelineEvent, listProposalTimelineEvents } from '../services/proposalTimelineService.js';
import { runProposalKanbanAcceptAutomation } from '../services/proposalKanbanAcceptAutomationService.js';
import { issueNewPublicTokenForProposal } from '../services/proposalPublicViewService.js';
import {
  decryptProposalPublicLinkToken,
  proposalPublicLinkPathFromRawToken,
  saveProposalPublicLinkCiphertext,
} from '../services/proposalPublicLinkCrmStore.js';
import { PreconditionFailedError } from '../services/customerBillingService.js';

const paymentMethodSchema = z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']);

/** Coluna ausente (migration ainda não aplicada em produção). */
const PG_UNDEFINED_COLUMN = '42703';
/** Relação/tabela inexistente (ex.: `leads` ainda não criada em BD legado). */
const PG_UNDEFINED_TABLE = '42P01';

function pgErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const c = (error as { code: unknown }).code;
    return c != null ? String(c) : null;
  }
  return null;
}

function pgErrorColumn(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'column' in error) {
    const c = (error as { column: unknown }).column;
    return c != null && String(c).length > 0 ? String(c) : null;
  }
  return null;
}

function pgErrorTable(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'table' in error) {
    const t = (error as { table: unknown }).table;
    return t != null && String(t).length > 0 ? String(t) : null;
  }
  return null;
}

/** Express pode entregar o mesmo query key como string ou string[]. */
function firstQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const s = value.find((v): v is string => typeof v === 'string');
    return s;
  }
  return undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidParam(value: string | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/** Qual extensão de schema em `proposals` falhou (migração parcial). */
type ProposalListSchemaOmit = 'lead' | 'converted_invoice' | 'post_accept_billing';

function proposalListMissingColumnHint(error: unknown): ProposalListSchemaOmit | null {
  const col = pgErrorColumn(error);
  if (col === 'lead_id') return 'lead';
  if (col === 'converted_invoice_id') return 'converted_invoice';
  if (col === 'post_accept_billing_mode') return 'post_accept_billing';
  const msg = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  if (/lead_id/i.test(msg)) return 'lead';
  if (/converted_invoice_id/i.test(msg)) return 'converted_invoice';
  if (/post_accept_billing_mode/i.test(msg)) return 'post_accept_billing';
  return null;
}

/** `42P01` em JOIN com `leads` — remover extensão lead da listagem. */
function proposalListMissingLeadsRelation(error: unknown): boolean {
  if (pgErrorCode(error) !== PG_UNDEFINED_TABLE) return false;
  const tbl = pgErrorTable(error);
  if (tbl === 'leads') return true;
  const msg = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  return /\bleads\b/i.test(msg);
}

function buildProposalListSelectFrom(omit: Set<ProposalListSchemaOmit>): string {
  const withLead = !omit.has('lead');
  const withConv = !omit.has('converted_invoice');
  const withPost = !omit.has('post_accept_billing');

  const leadSel = withLead ? 'p.lead_id' : 'NULL::uuid AS lead_id';
  const convSel = withConv ? 'p.converted_invoice_id' : 'NULL::uuid AS converted_invoice_id';
  const postSel = withPost ? 'p.post_accept_billing_mode' : `'none'::text AS post_accept_billing_mode`;
  const leadNameExpr = withLead
    ? 'CASE WHEN ulead.id IS NOT NULL THEN ld.name ELSE NULL END AS lead_name'
    : 'NULL::text AS lead_name';
  const leadJoins = withLead
    ? `LEFT JOIN leads ld ON ld.id = p.lead_id
      LEFT JOIN users ulead ON ulead.id = ld.user_id AND ulead.tenant_id = $1`
    : '';

  return `
      SELECT p.id, p.user_id, p.client_id, ${leadSel}, p.funnel_id, p.stage_id, p.title, p.description, p.amount,
             p.status, p.sent_date, p.valid_until, p.items, p.created_at, p.updated_at,
             ${convSel}, ${postSel}, u.email AS responsible_email,
             CASE WHEN uclient.id IS NOT NULL THEN c.name ELSE NULL END AS client_name,
             ${leadNameExpr}
      FROM proposals p
      INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN users uclient ON uclient.id = c.user_id AND uclient.tenant_id = $1
      ${leadJoins}
      WHERE 1=1`;
}

const PROPOSAL_DETAIL_SELECT_CORE = `p.id, p.user_id, p.client_id, p.lead_id, p.funnel_id, p.stage_id, p.title, p.description, p.amount,
              p.status, p.sent_date, p.valid_until, p.items, p.created_at, p.updated_at,
              p.converted_invoice_id, p.post_accept_billing_mode`;

const PROPOSAL_DETAIL_FROM = `FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       LEFT JOIN customer_invoices ci_conv ON ci_conv.id = p.converted_invoice_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN users uclient ON uclient.id = c.user_id AND uclient.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       LEFT JOIN leads ld ON ld.id = p.lead_id
       LEFT JOIN users ulead ON ulead.id = ld.user_id AND ulead.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE p.id = $1`;

const proposalItemSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  description: z.string(),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).optional().default(0),
  total: z.number().min(0).optional(),
});

const postAcceptBillingModeSchema = z.enum(['none', 'notify_team', 'auto_pending_invoice']);

const proposalSchema = z.object({
  client_id: z.string().uuid().optional().nullable(),
  lead_id: z.string().uuid().optional().nullable(),
  funnel_id: z.string().uuid().optional().nullable(),
  stage_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional().nullable(),
  amount: z.number().min(0, 'Valor deve ser positivo'),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']).default('draft'),
  sent_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida').optional().nullable(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida').optional().nullable(),
  items: z.array(proposalItemSchema).default([]),
  /** Etapa 4: após aceite público — ver coluna proposals.post_accept_billing_mode */
  post_accept_billing_mode: postAcceptBillingModeSchema.optional(),
});

const proposalPatchSchema = proposalSchema.partial();

const convertProposalBodySchema = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date deve ser YYYY-MM-DD'),
  payment_method: paymentMethodSchema.optional().nullable(),
  allowed_payment_methods: z.array(paymentMethodSchema).min(1).max(3).optional().nullable(),
  gateway_key: z.string().optional().nullable(),
});

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

type NormalizedProposalItem = {
  id?: number | string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
};

function normalizeProposalItems(items: z.infer<typeof proposalItemSchema>[]): {
  items: NormalizedProposalItem[];
  sum: number;
} {
  let sum = 0;
  const out: NormalizedProposalItem[] = items.map((it, idx) => {
    const discount = it.discount ?? 0;
    const total = Math.max(0, roundMoney2(it.quantity * it.unitPrice - discount));
    sum += total;
    return {
      id: it.id ?? idx,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount,
      total,
    };
  });
  return { items: out, sum: roundMoney2(sum) };
}

function mapProposalRow(row: Record<string, unknown>) {
  return {
    ...row,
    items: Array.isArray(row.items) ? row.items : [],
    amount: parseFloat(String(row.amount ?? '0')),
  };
}

async function assertClientIdInTenant(clientId: string, userId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM clients c
     INNER JOIN users uc ON uc.id = c.user_id AND uc.tenant_id = (SELECT tenant_id FROM users WHERE id = $1)
     WHERE c.id = $2 LIMIT 1`,
    [userId, clientId],
  );
  return r.rows.length > 0;
}

async function assertLeadIdInTenant(leadId: string, userId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM leads l
     INNER JOIN users ul ON ul.id = l.user_id AND ul.tenant_id = (SELECT tenant_id FROM users WHERE id = $1)
     WHERE l.id = $2 LIMIT 1`,
    [userId, leadId],
  );
  return r.rows.length > 0;
}

function assertProposalStatusTransition(from: string, to: string): void {
  if (from === to) return;
  const allowed: Record<string, string[]> = {
    draft: ['sent', 'accepted', 'rejected', 'expired'],
    sent: ['draft', 'accepted', 'rejected', 'expired'],
    accepted: [],
    rejected: [],
    expired: [],
    invoiced: [],
  };
  const ok = allowed[from]?.includes(to) ?? false;
  if (!ok) {
    throw new Error(`Transição de status inválida: ${from} → ${to}`);
  }
}

// GET /api/proposals
export const getProposals = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as AuthRequest).tenantId as string | null | undefined;
    const userId = (req as AuthRequest).userId as string | null | undefined;
    if (!tenantId) {
      return res.json([]);
    }
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    await assertModulePermission(userId, 'proposals', 'view', undefined, req as AuthRequest);

    const status = firstQueryString(req.query.status);
    const client_id = firstQueryString(req.query.client_id);
    const lead_id = firstQueryString(req.query.lead_id);
    const funnel_id = firstQueryString(req.query.funnel_id);
    const stage_id = firstQueryString(req.query.stage_id);
    const q = firstQueryString(req.query.q);
    const owner_user_id = firstQueryString(req.query.owner_user_id);
    const validity = firstQueryString(req.query.validity);
    const conversion = firstQueryString(req.query.conversion);

    if (client_id !== undefined && client_id.trim() !== '' && !isUuidParam(client_id.trim())) {
      return res.status(400).json({ error: 'client_id inválido' });
    }
    if (lead_id !== undefined && lead_id.trim() !== '' && !isUuidParam(lead_id.trim())) {
      return res.status(400).json({ error: 'lead_id inválido' });
    }

    const schemaOmit = new Set<ProposalListSchemaOmit>();
    const params: unknown[] = [tenantId];

    let result: QueryResult | undefined;
    for (let attempt = 0; attempt < 8; attempt++) {
      const withLead = !schemaOmit.has('lead');
      const withConverted = !schemaOmit.has('converted_invoice');
      let query = buildProposalListSelectFrom(schemaOmit);

      const pLocal: unknown[] = [tenantId];
      /** Próximo índice de placeholder: $1 já é tenantId nos JOINs; filtros começam em $2. */
      let pc = 1;
      const appendWhere = (): void => {
        params.length = 0;
        params.push(...pLocal);
      };

      if (status) {
        pc++;
        query += ` AND p.status = $${pc}`;
        pLocal.push(status);
      }

      if (client_id && client_id.trim() !== '') {
        pc++;
        query += ` AND p.client_id = $${pc}`;
        pLocal.push(client_id.trim());
      }

      if (lead_id && lead_id.trim() !== '') {
        if (withLead) {
          pc++;
          query += ` AND p.lead_id = $${pc}`;
          pLocal.push(lead_id.trim());
        } else {
          query += ` AND 1=0`;
        }
      }

      if (funnel_id) {
        pc++;
        query += ` AND p.funnel_id = $${pc}`;
        pLocal.push(funnel_id);
      }

      if (stage_id) {
        pc++;
        query += ` AND p.stage_id = $${pc}`;
        pLocal.push(stage_id);
      }

      const qTrim = typeof q === 'string' ? q.trim() : '';
      if (qTrim.length > 0) {
        pc++;
        query += ` AND (p.title ILIKE $${pc} OR COALESCE(p.description, '') ILIKE $${pc})`;
        pLocal.push(`%${qTrim}%`);
      }

      const ownerId = typeof owner_user_id === 'string' ? owner_user_id.trim() : '';
      if (ownerId.length > 0) {
        pc++;
        query += ` AND p.user_id = $${pc}`;
        pLocal.push(ownerId);
      }

      const val = typeof validity === 'string' ? validity.trim().toLowerCase() : '';
      if (val === 'valid') {
        query += ` AND (p.valid_until IS NULL OR p.valid_until::date >= CURRENT_DATE)`;
      } else if (val === 'expired') {
        query += ` AND p.valid_until IS NOT NULL AND p.valid_until::date < CURRENT_DATE`;
      }

      const conv = typeof conversion === 'string' ? conversion.trim().toLowerCase() : '';
      if (withConverted && (conv === 'yes' || conv === 'no')) {
        if (conv === 'yes') {
          query += ` AND p.converted_invoice_id IS NOT NULL`;
        } else {
          query += ` AND p.converted_invoice_id IS NULL`;
        }
      }

      query += ` ORDER BY p.created_at DESC`;
      appendWhere();

      try {
        result = await pool.query(query, params);
        break;
      } catch (e: unknown) {
        const code = pgErrorCode(e);
        if (code === PG_UNDEFINED_COLUMN) {
          const hint = proposalListMissingColumnHint(e);
          if (hint) {
            schemaOmit.add(hint);
          } else {
            schemaOmit.add('lead');
            schemaOmit.add('converted_invoice');
            schemaOmit.add('post_accept_billing');
          }
        } else if (proposalListMissingLeadsRelation(e)) {
          schemaOmit.add('lead');
        } else {
          throw e;
        }
        if (attempt === 7) {
          throw e;
        }
      }
    }

    if (!result) {
      throw new Error('Falha inesperada ao listar propostas');
    }

    const proposals = result.rows.map(row => mapProposalRow(row));

    res.json(proposals);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    const code = pgErrorCode(error);
    console.error('Error fetching proposals:', code ?? '(no code)', error);
    res.status(500).json({ error: 'Erro ao buscar propostas' });
  }
};

// GET /api/proposals/:id
export const getProposalById = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    await assertModulePermission(userId, 'proposals', 'view', undefined, req as AuthRequest);

    let result;
    try {
      result = await pool.query(
        `SELECT ${PROPOSAL_DETAIL_SELECT_CORE},
              p.public_link_token_ciphertext,
              u.email AS responsible_email,
              ci_conv.invoice_number AS converted_invoice_number,
              CASE WHEN uclient.id IS NOT NULL THEN c.name ELSE NULL END AS client_name,
              CASE WHEN ulead.id IS NOT NULL THEN ld.name ELSE NULL END AS lead_name
       ${PROPOSAL_DETAIL_FROM}`,
        [id, userId]
      );
    } catch (e: unknown) {
      if (pgErrorCode(e) === PG_UNDEFINED_COLUMN) {
        result = await pool.query(
          `SELECT ${PROPOSAL_DETAIL_SELECT_CORE},
              u.email AS responsible_email,
              ci_conv.invoice_number AS converted_invoice_number,
              CASE WHEN uclient.id IS NOT NULL THEN c.name ELSE NULL END AS client_name,
              CASE WHEN ulead.id IS NOT NULL THEN ld.name ELSE NULL END AS lead_name
       ${PROPOSAL_DETAIL_FROM}`,
          [id, userId]
        );
      } else {
        throw e;
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    let timeline: Awaited<ReturnType<typeof listProposalTimelineEvents>> = [];
    try {
      timeline = await listProposalTimelineEvents(id);
    } catch (e: unknown) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (code !== '42P01') {
        throw e;
      }
    }

    const row = result.rows[0] as Record<string, unknown> & { public_link_token_ciphertext?: string | null };
    const ct = row.public_link_token_ciphertext ?? null;
    delete row.public_link_token_ciphertext;
    const rawToken = decryptProposalPublicLinkToken(ct);
    const public_link_path = rawToken ? proposalPublicLinkPathFromRawToken(rawToken) : null;

    const proposal = {
      ...mapProposalRow(row),
      timeline,
      public_link_path,
    };

    res.json(proposal);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error fetching proposal:', error);
    res.status(500).json({ error: 'Erro ao buscar proposta' });
  }
};

// POST /api/proposals
export const createProposal = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = (req as AuthRequest).tenantId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const validated = proposalSchema.parse(req.body);
    const norm = normalizeProposalItems(validated.items);
    const amount = norm.items.length > 0 ? norm.sum : validated.amount;

    const sentDateForInsert =
      validated.status === 'sent'
        ? validated.sent_date?.trim() || new Date().toISOString().slice(0, 10)
        : validated.sent_date ?? null;

    await assertModulePermission(userId, 'proposals', 'create', undefined, req as AuthRequest);

    const cid =
      validated.client_id && String(validated.client_id).trim() ? String(validated.client_id).trim() : null;
    const lid = validated.lead_id && String(validated.lead_id).trim() ? String(validated.lead_id).trim() : null;
    if (cid && lid) {
      res.status(400).json({ error: 'Informe apenas cliente ou lead, não ambos.' });
      return;
    }
    if (!cid && !lid) {
      res.status(400).json({ error: 'Vincule a proposta a um cliente ou a um lead.' });
      return;
    }
    if (cid && !(await assertClientIdInTenant(cid, userId))) {
      res.status(400).json({ error: 'Cliente inválido ou inacessível.' });
      return;
    }
    if (lid && !(await assertLeadIdInTenant(lid, userId))) {
      res.status(400).json({ error: 'Lead inválido ou inacessível.' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO proposals (
        user_id, client_id, lead_id, funnel_id, stage_id, title, description, amount,
        status, sent_date, valid_until, items, post_accept_billing_mode
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
      RETURNING id, user_id, client_id, lead_id, funnel_id, stage_id, title, description, amount,
                status, sent_date, valid_until, items, created_at, updated_at, converted_invoice_id,
                post_accept_billing_mode`,
      [
        userId,
        cid,
        lid,
        validated.funnel_id || null,
        validated.stage_id || null,
        validated.title,
        validated.description || null,
        amount,
        validated.status,
        sentDateForInsert,
        validated.valid_until || null,
        JSON.stringify(norm.items),
        validated.post_accept_billing_mode ?? 'none',
      ]
    );

    const insertedRow = result.rows[0] as Record<string, unknown> & { id: string };
    const proposal = mapProposalRow(insertedRow);
    const newProposalId = String(insertedRow.id);

    // Link público nativo no create: pronto para compartilhar (chat/kanban) sem passo manual de "gerar link".
    let public_link_path: string | null = null;
    if (tenantId && newProposalId) {
      try {
        const { rawToken } = await issueNewPublicTokenForProposal({
          proposalId: newProposalId,
          tenantId,
        });
        public_link_path = proposalPublicLinkPathFromRawToken(rawToken);
        try {
          await saveProposalPublicLinkCiphertext(newProposalId, rawToken);
        } catch (saveErr: unknown) {
          if (pgErrorCode(saveErr) === PG_UNDEFINED_COLUMN) {
            console.warn(
              '[createProposal] Coluna public_link_token_ciphertext ausente; aplique a migration correspondente. O path pode vir nesta resposta, mas o GET não reidratará até o ALTER TABLE.'
            );
          } else {
            throw saveErr;
          }
        }
      } catch (e: unknown) {
        console.error('[createProposal] auto public link:', e);
      }
    }

    res.status(201).json({ ...proposal, public_link_path });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating proposal:', error);
    res.status(500).json({ error: 'Erro ao criar proposta' });
  }
};

// PATCH /api/proposals/:id
export const updateProposal = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const { id } = req.params;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const existing = await pool.query<{
      user_id: string;
      status: string;
      converted_invoice_id: string | null;
      client_id: string | null;
      lead_id: string | null;
    }>(
      `SELECT p.user_id, p.status, p.converted_invoice_id, p.client_id, p.lead_id
       FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE p.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }
    await assertModulePermission(userId, 'proposals', 'edit', { ownerId: existing.rows[0].user_id }, req as AuthRequest);

    const cur = existing.rows[0];
    const validated = proposalPatchSchema.parse(req.body);

    if (cur.converted_invoice_id != null || cur.status === 'invoiced') {
      return res.status(409).json({ error: 'Proposta já faturada; não é possível alterar.' });
    }

    if (validated.post_accept_billing_mode !== undefined) {
      if (cur.status === 'rejected' || cur.status === 'expired') {
        return res.status(409).json({
          error: 'Proposta encerrada: não é possível alterar a política de faturamento.',
        });
      }
    }

    if (cur.status === 'accepted') {
      const forbidden: (keyof z.infer<typeof proposalPatchSchema>)[] = [
        'client_id',
        'lead_id',
        'title',
        'amount',
        'items',
        'status',
      ];
      for (const k of forbidden) {
        if (validated[k] !== undefined) {
          return res.status(409).json({
            error: 'Proposta aceita: altere apenas observações, datas ou funil até gerar a fatura.',
          });
        }
      }
    }

    if (cur.status === 'rejected' || cur.status === 'expired') {
      const forbidden: (keyof z.infer<typeof proposalPatchSchema>)[] = [
        'client_id',
        'lead_id',
        'title',
        'amount',
        'items',
        'status',
        'funnel_id',
        'stage_id',
      ];
      for (const k of forbidden) {
        if (validated[k] !== undefined) {
          return res.status(409).json({
            error: 'Proposta encerrada: apenas descrição e datas podem ser ajustadas.',
          });
        }
      }
    }

    let itemsPayload: NormalizedProposalItem[] | undefined;
    let amountOverride: number | undefined;

    if (validated.items !== undefined) {
      const norm = normalizeProposalItems(validated.items);
      itemsPayload = norm.items;
      if (norm.items.length > 0) {
        amountOverride = norm.sum;
      }
    }

    const oldStatus = cur.status;
    if (validated.status !== undefined) {
      if (oldStatus === 'accepted') {
        return res.status(409).json({ error: 'Não é possível alterar o status de uma proposta aceita pelo painel.' });
      }
      assertProposalStatusTransition(oldStatus, validated.status);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (validated.client_id !== undefined && validated.lead_id !== undefined) {
      return res.status(400).json({
        error: 'Altere apenas client_id ou lead_id por requisição (não envie os dois campos juntos).',
      });
    }

    if (validated.client_id !== undefined) {
      const nv = validated.client_id || null;
      if (nv && !(await assertClientIdInTenant(nv, userId))) {
        return res.status(400).json({ error: 'Cliente inválido ou inacessível.' });
      }
      updates.push(`client_id = $${paramCount++}`);
      values.push(nv);
      updates.push(`lead_id = $${paramCount++}`);
      values.push(null);
    } else if (validated.lead_id !== undefined) {
      const nv = validated.lead_id || null;
      if (nv && !(await assertLeadIdInTenant(nv, userId))) {
        return res.status(400).json({ error: 'Lead inválido ou inacessível.' });
      }
      updates.push(`lead_id = $${paramCount++}`);
      values.push(nv);
      updates.push(`client_id = $${paramCount++}`);
      values.push(null);
    }
    if (validated.funnel_id !== undefined) {
      updates.push(`funnel_id = $${paramCount++}`);
      values.push(validated.funnel_id || null);
    }
    if (validated.stage_id !== undefined) {
      updates.push(`stage_id = $${paramCount++}`);
      values.push(validated.stage_id || null);
    }
    if (validated.title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(validated.title);
    }
    if (validated.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(validated.description || null);
    }
    if (validated.amount !== undefined) {
      updates.push(`amount = $${paramCount++}`);
      values.push(amountOverride ?? validated.amount);
    } else if (amountOverride !== undefined) {
      updates.push(`amount = $${paramCount++}`);
      values.push(amountOverride);
    }
    if (validated.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(validated.status);
    }
    if (validated.sent_date !== undefined) {
      updates.push(`sent_date = $${paramCount++}`);
      values.push(validated.sent_date || null);
    }
    if (validated.valid_until !== undefined) {
      updates.push(`valid_until = $${paramCount++}`);
      values.push(validated.valid_until || null);
    }
    if (validated.items !== undefined) {
      updates.push(`items = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(itemsPayload ?? []));
    }
    if (validated.post_accept_billing_mode !== undefined) {
      updates.push(`post_accept_billing_mode = $${paramCount++}`);
      values.push(validated.post_accept_billing_mode);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE proposals
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramCount + 1}))
       RETURNING id, user_id, client_id, lead_id, funnel_id, stage_id, title, description, amount,
                 status, sent_date, valid_until, items, created_at, updated_at, converted_invoice_id,
                 post_accept_billing_mode`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    const newStatus = result.rows[0].status as string;
    if (validated.status !== undefined && newStatus !== oldStatus) {
      try {
        if (newStatus === 'accepted') {
          await insertProposalTimelineEvent({
            proposalId: id,
            eventType: 'proposal_accepted',
            payload: { from: oldStatus, to: newStatus },
            actorUserId: userId,
          });
        } else if (newStatus === 'rejected') {
          await insertProposalTimelineEvent({
            proposalId: id,
            eventType: 'proposal_rejected',
            payload: { from: oldStatus, to: newStatus },
            actorUserId: userId,
          });
        }
      } catch (e: unknown) {
        const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
        if (code !== '42P01') {
          console.error('[updateProposal] timeline insert failed:', e);
        }
      }
    }

    if (validated.status !== undefined && newStatus === 'accepted' && oldStatus !== 'accepted') {
      try {
        const tenantId = (req as AuthRequest).tenantId;
        if (tenantId) {
          const row = result.rows[0] as { client_id?: string | null; lead_id?: string | null };
          await runProposalKanbanAcceptAutomation({
            tenantId,
            proposalId: id,
            clientId: row.client_id ?? null,
            leadId: row.lead_id ?? null,
            actorUserId: userId,
            acceptanceSource: 'panel',
          });
        }
      } catch (e: unknown) {
        console.error('[updateProposal] kanban accept automation:', e);
      }
    }

    const proposal = mapProposalRow(result.rows[0]);

    res.json(proposal);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if (error instanceof Error && error.message.startsWith('Transição de status inválida')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating proposal:', error);
    res.status(500).json({ error: 'Erro ao atualizar proposta' });
  }
};

// POST /api/proposals/:id/convert-to-invoice
export const convertProposalToInvoice = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = (req as AuthRequest).tenantId;
    const { id } = req.params;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant não identificado' });
    }

    const existing = await pool.query<{ user_id: string }>(
      `SELECT p.user_id FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE p.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    await assertModulePermission(userId, 'proposals', 'proposals_convert_invoice', { ownerId: existing.rows[0].user_id }, req as AuthRequest);

    const body = convertProposalBodySchema.parse(req.body);

    const result = await convertAcceptedProposalToInvoice({
      tenantId,
      actorUserId: userId,
      proposalId: id,
      dueDate: body.due_date,
      paymentMethod: body.payment_method ?? null,
      allowedPaymentMethods: body.allowed_payment_methods ?? null,
      gatewayKey: body.gateway_key ?? null,
    });

    res.status(201).json({ invoice: result.invoice });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if (error instanceof PreconditionFailedError) {
      return res.status(400).json({ code: error.code, errors: error.errors });
    }
    if (error instanceof Error && error.message === 'Gateway de pagamento não configurado') {
      return res.status(503).json({ error: error.message });
    }
    if (error instanceof Error) {
      const msg = error.message;
      if (msg === 'Proposta não encontrada') {
        return res.status(404).json({ error: msg });
      }
      if (msg === 'Apenas propostas aceitas podem ser convertidas em fatura' || msg === 'Proposta sem cliente vinculado') {
        return res.status(400).json({ error: msg });
      }
      if (msg === 'Esta proposta já possui fatura gerada' || msg === 'Já existe fatura vinculada a esta proposta') {
        return res.status(409).json({ error: msg, code: 'PROPOSAL_ALREADY_INVOICED' });
      }
      if (msg.includes('Proposta sem itens válidos')) {
        return res.status(400).json({ error: msg });
      }
    }
    const err = error as { code?: string };
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Já existe fatura vinculada a esta proposta.', code: 'PROPOSAL_ALREADY_INVOICED' });
    }
    console.error('Error converting proposal to invoice:', error);
    res.status(500).json({ error: 'Erro ao gerar fatura a partir da proposta' });
  }
};

// DELETE /api/proposals/:id
export const deleteProposal = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const { id } = req.params;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const existing = await pool.query<{
      user_id: string;
      converted_invoice_id: string | null;
      status: string;
    }>(
      `SELECT p.user_id, p.converted_invoice_id, p.status
       FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE p.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }
    if (existing.rows[0].converted_invoice_id != null || existing.rows[0].status === 'invoiced') {
      return res.status(409).json({ error: 'Não é possível excluir proposta já faturada.' });
    }
    await assertModulePermission(userId, 'proposals', 'delete', { ownerId: existing.rows[0].user_id }, req as AuthRequest);

    const result = await pool.query(
      `DELETE FROM proposals
       WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2))
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    res.status(204).send();
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error deleting proposal:', error);
    res.status(500).json({ error: 'Erro ao deletar proposta' });
  }
};
