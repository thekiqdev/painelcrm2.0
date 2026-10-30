/**
 * OS-S1 — domínio Ordem de Serviço (CRUD + itens + totais + timeline).
 */
import { randomInt } from 'crypto';
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';

/** Número público da OS: 6 dígitos aleatórios (100000–999999), único por tenant. */
const SERVICE_ORDER_NUMBER_MIN = 100_000;
const SERVICE_ORDER_NUMBER_MAX = 999_999;
const SERVICE_ORDER_NUMBER_ALLOC_ATTEMPTS = 48;

export const SERVICE_ORDER_STATUSES = [
  'draft',
  'scheduled',
  'in_progress',
  'sent',
  'awaiting_signature',
  'signed',
  'invoiced',
  'completed',
  'cancelled',
] as const;

export type ServiceOrderStatus = (typeof SERVICE_ORDER_STATUSES)[number];

export const SERVICE_ORDER_BILLING_MODES = ['none', 'manual', 'auto_on_sign'] as const;
export type ServiceOrderBillingMode = (typeof SERVICE_ORDER_BILLING_MODES)[number];

export type ServiceOrderItemKind = 'service' | 'product';

export type ServiceOrderItemInput = {
  id?: string;
  kind: ServiceOrderItemKind;
  product_id?: string | null;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price_cents: number;
  discount_cents?: number;
  sort_order?: number;
};

export type ServiceOrderItemRow = {
  id: string;
  tenant_id: string;
  service_order_id: string;
  kind: ServiceOrderItemKind;
  product_id: string | null;
  name: string;
  description: string | null;
  unit: string;
  quantity: string;
  unit_price_cents: string;
  discount_cents: string;
  subtotal_cents: string;
  sort_order: number;
  created_at: string;
};

export type ServiceOrderRow = {
  id: string;
  tenant_id: string;
  created_by: string;
  responsible_user_id: string | null;
  service_order_number: number;
  status: ServiceOrderStatus;
  client_id: string | null;
  client_snapshot: Record<string, unknown>;
  execution_address: Record<string, unknown>;
  period_start_at: string | null;
  period_end_at: string | null;
  /** Objeto legado ou lista JSON de equipamentos. */
  equipment: unknown;
  observations: string | null;
  billing_mode: ServiceOrderBillingMode;
  appointment_id: string | null;
  converted_invoice_id: string | null;
  content_html: string | null;
  content_snapshot_html: string | null;
  document_frozen_at: string | null;
  total_services_cents: string;
  total_products_cents: string;
  total_cents: string;
  currency: string;
  signed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string | null;
  responsible_email?: string | null;
  created_by_email?: string | null;
};

export type ServiceOrderEventRow = {
  id: string;
  tenant_id: string;
  service_order_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};

export type ServiceOrderEquipmentItem = {
  name: string | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  defects: string | null;
};

export type CreateServiceOrderInput = {
  client_id?: string | null;
  responsible_user_id?: string | null;
  status?: ServiceOrderStatus;
  client_snapshot?: Record<string, unknown>;
  execution_address?: Record<string, unknown>;
  period_start_at?: string | null;
  period_end_at?: string | null;
  equipment?: ServiceOrderEquipmentItem | ServiceOrderEquipmentItem[] | Record<string, unknown> | null;
  observations?: string | null;
  billing_mode?: ServiceOrderBillingMode;
  currency?: string;
  items?: ServiceOrderItemInput[];
};

export type UpdateServiceOrderInput = {
  client_id?: string | null;
  responsible_user_id?: string | null;
  status?: ServiceOrderStatus;
  client_snapshot?: Record<string, unknown>;
  execution_address?: Record<string, unknown>;
  period_start_at?: string | null;
  period_end_at?: string | null;
  equipment?: ServiceOrderEquipmentItem | ServiceOrderEquipmentItem[] | Record<string, unknown> | null;
  observations?: string | null;
  billing_mode?: ServiceOrderBillingMode;
  currency?: string;
  items?: ServiceOrderItemInput[];
};

export type ListServiceOrdersFilters = {
  status?: ServiceOrderStatus;
  client_id?: string;
  responsible_user_id?: string;
  created_by?: string;
  q?: string;
  limit?: number;
  offset?: number;
  /** Quando true, restringe a OS criadas pelo usuário (view_own). */
  onlyOwn?: boolean;
  viewerUserId?: string;
};

const EDITABLE_STATUSES: ReadonlySet<ServiceOrderStatus> = new Set([
  'draft',
  'scheduled',
  'in_progress',
  'sent',
]);

export class ServiceOrderDomainError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ServiceOrderDomainError';
  }
}

function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Aceita objeto legado ou lista; devolve lista limpa ou null. */
export function normalizeServiceOrderEquipmentList(
  raw: unknown,
): ServiceOrderEquipmentItem[] | null {
  if (raw == null) return null;
  const items = Array.isArray(raw) ? raw : [raw];
  const out: ServiceOrderEquipmentItem[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    const item: ServiceOrderEquipmentItem = {
      name: strOrNull(r.name),
      brand: strOrNull(r.brand),
      model: strOrNull(r.model),
      serial: strOrNull(r.serial),
      defects: strOrNull(r.defects),
    };
    if (item.name || item.brand || item.model || item.serial || item.defects) {
      out.push(item);
    }
  }
  return out.length ? out : null;
}

export function computeItemSubtotalCents(
  quantity: number,
  unitPriceCents: number,
  discountCents: number,
): number {
  const raw = quantity * unitPriceCents - discountCents;
  return roundMoney(raw);
}

export function computeTotalsFromItems(items: Array<{ kind: ServiceOrderItemKind; subtotal_cents: number }>): {
  total_services_cents: number;
  total_products_cents: number;
  total_cents: number;
} {
  let services = 0;
  let products = 0;
  for (const it of items) {
    if (it.kind === 'service') services += it.subtotal_cents;
    else products += it.subtotal_cents;
  }
  return {
    total_services_cents: services,
    total_products_cents: products,
    total_cents: services + products,
  };
}

function normalizeItemInput(raw: ServiceOrderItemInput, index: number): {
  kind: ServiceOrderItemKind;
  product_id: string | null;
  name: string;
  description: string | null;
  unit: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  subtotal_cents: number;
  sort_order: number;
} {
  const name = String(raw.name ?? '').trim();
  if (!name) {
    throw new ServiceOrderDomainError(`Item ${index + 1}: nome é obrigatório.`);
  }
  if (raw.kind !== 'service' && raw.kind !== 'product') {
    throw new ServiceOrderDomainError(`Item ${index + 1}: kind inválido.`);
  }
  const quantity = Number(raw.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ServiceOrderDomainError(`Item ${index + 1}: quantidade deve ser > 0.`);
  }
  const unit_price_cents = roundMoney(Number(raw.unit_price_cents ?? 0));
  const discount_cents = roundMoney(Number(raw.discount_cents ?? 0));
  return {
    kind: raw.kind,
    product_id: raw.product_id ? String(raw.product_id) : null,
    name,
    description: raw.description != null ? String(raw.description) : null,
    unit: (raw.unit && String(raw.unit).trim()) || 'UN',
    quantity,
    unit_price_cents,
    discount_cents,
    subtotal_cents: computeItemSubtotalCents(quantity, unit_price_cents, discount_cents),
    sort_order: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : index,
  };
}

async function allocateServiceOrderNumber(client: PoolClient, tenantId: string): Promise<number> {
  for (let attempt = 0; attempt < SERVICE_ORDER_NUMBER_ALLOC_ATTEMPTS; attempt++) {
    const candidate = randomInt(SERVICE_ORDER_NUMBER_MIN, SERVICE_ORDER_NUMBER_MAX + 1);
    const exists = await client.query(
      `SELECT 1
       FROM public.service_orders
       WHERE tenant_id = $1 AND service_order_number = $2
       LIMIT 1`,
      [tenantId, candidate],
    );
    if (!exists.rows[0]) {
      return candidate;
    }
  }
  throw new ServiceOrderDomainError(
    'Não foi possível gerar um número único de 6 dígitos para a ordem de serviço.',
    500,
    'number_alloc_exhausted',
  );
}

function isUniqueServiceOrderNumberViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string; detail?: string };
  if (e.code !== '23505') return false;
  const c = String(e.constraint || '');
  const d = String(e.detail || '');
  return c.includes('service_orders_number_unique') || d.includes('service_order_number');
}

async function assertClientInTenant(
  client: PoolClient,
  tenantId: string,
  clientId: string,
): Promise<void> {
  const r = await client.query(
    `SELECT c.id
     FROM public.clients c
     INNER JOIN public.users u ON u.id = c.user_id AND u.tenant_id = $1
     WHERE c.id = $2
     LIMIT 1`,
    [tenantId, clientId],
  );
  if (!r.rows[0]) {
    throw new ServiceOrderDomainError('Cliente não encontrado neste tenant.', 404, 'client_not_found');
  }
}

async function assertUserInTenant(
  client: PoolClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  const r = await client.query(
    `SELECT id FROM public.users WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [userId, tenantId],
  );
  if (!r.rows[0]) {
    throw new ServiceOrderDomainError('Usuário responsável não pertence ao tenant.', 400, 'user_not_in_tenant');
  }
}

async function insertItems(
  client: PoolClient,
  tenantId: string,
  serviceOrderId: string,
  items: ServiceOrderItemInput[],
): Promise<{
  rows: ServiceOrderItemRow[];
  totals: ReturnType<typeof computeTotalsFromItems>;
}> {
  const normalized = items.map((it, i) => normalizeItemInput(it, i));
  const rows: ServiceOrderItemRow[] = [];
  for (const it of normalized) {
    const ins = await client.query<ServiceOrderItemRow>(
      `INSERT INTO public.service_order_items (
         tenant_id, service_order_id, kind, product_id, name, description, unit,
         quantity, unit_price_cents, discount_cents, subtotal_cents, sort_order
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12
       )
       RETURNING *`,
      [
        tenantId,
        serviceOrderId,
        it.kind,
        it.product_id,
        it.name,
        it.description,
        it.unit,
        it.quantity,
        it.unit_price_cents,
        it.discount_cents,
        it.subtotal_cents,
        it.sort_order,
      ],
    );
    rows.push(ins.rows[0]!);
  }
  const totals = computeTotalsFromItems(
    normalized.map((n) => ({ kind: n.kind, subtotal_cents: n.subtotal_cents })),
  );
  return { rows, totals };
}

async function replaceItemsAndUpdateTotals(
  client: PoolClient,
  tenantId: string,
  serviceOrderId: string,
  items: ServiceOrderItemInput[],
): Promise<ServiceOrderItemRow[]> {
  await client.query(`DELETE FROM public.service_order_items WHERE service_order_id = $1 AND tenant_id = $2`, [
    serviceOrderId,
    tenantId,
  ]);
  const { rows, totals } = await insertItems(client, tenantId, serviceOrderId, items);
  await client.query(
    `UPDATE public.service_orders
     SET total_services_cents = $3,
         total_products_cents = $4,
         total_cents = $5,
         updated_at = now()
     WHERE id = $1 AND tenant_id = $2`,
    [serviceOrderId, tenantId, totals.total_services_cents, totals.total_products_cents, totals.total_cents],
  );
  return rows;
}

export async function insertServiceOrderEvent(
  client: PoolClient | typeof pool,
  input: {
    tenantId: string;
    serviceOrderId: string;
    eventType: string;
    payload?: Record<string, unknown>;
    createdBy?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO public.service_order_events (tenant_id, service_order_id, event_type, payload, created_by)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [
      input.tenantId,
      input.serviceOrderId,
      input.eventType,
      JSON.stringify(input.payload ?? {}),
      input.createdBy ?? null,
    ],
  );
}

const LIST_SELECT = `
  SELECT so.*,
         c.name AS client_name,
         ur.email AS responsible_email,
         uc.email AS created_by_email
  FROM public.service_orders so
  LEFT JOIN public.clients c ON c.id = so.client_id
  LEFT JOIN public.users ur ON ur.id = so.responsible_user_id
  LEFT JOIN public.users uc ON uc.id = so.created_by
`;

export async function listServiceOrders(
  tenantId: string,
  filters: ListServiceOrdersFilters = {},
): Promise<{ rows: ServiceOrderRow[]; total: number }> {
  const params: unknown[] = [tenantId];
  const where: string[] = ['so.tenant_id = $1'];

  if (filters.status) {
    params.push(filters.status);
    where.push(`so.status = $${params.length}`);
  }
  if (filters.client_id) {
    params.push(filters.client_id);
    where.push(`so.client_id = $${params.length}`);
  }
  if (filters.responsible_user_id) {
    params.push(filters.responsible_user_id);
    where.push(`so.responsible_user_id = $${params.length}`);
  }
  if (filters.created_by) {
    params.push(filters.created_by);
    where.push(`so.created_by = $${params.length}`);
  }
  if (filters.onlyOwn && filters.viewerUserId) {
    params.push(filters.viewerUserId);
    where.push(`so.created_by = $${params.length}`);
  }
  if (filters.q && filters.q.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const p = params.length;
    where.push(
      `(CAST(so.service_order_number AS TEXT) ILIKE $${p} OR COALESCE(c.name, '') ILIKE $${p} OR COALESCE(so.observations, '') ILIKE $${p})`,
    );
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const whereSql = where.join(' AND ');
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM public.service_orders so
     LEFT JOIN public.clients c ON c.id = so.client_id
     WHERE ${whereSql}`,
    params,
  );

  params.push(limit);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  const listResult = await pool.query<ServiceOrderRow>(
    `${LIST_SELECT}
     WHERE ${whereSql}
     ORDER BY so.created_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params,
  );

  return {
    rows: listResult.rows,
    total: parseInt(countResult.rows[0]?.count ?? '0', 10) || 0,
  };
}

export async function getServiceOrderById(
  tenantId: string,
  id: string,
): Promise<(ServiceOrderRow & { items: ServiceOrderItemRow[]; events: ServiceOrderEventRow[] }) | null> {
  const head = await pool.query<ServiceOrderRow>(
    `${LIST_SELECT}
     WHERE so.id = $1 AND so.tenant_id = $2
     LIMIT 1`,
    [id, tenantId],
  );
  const row = head.rows[0];
  if (!row) return null;

  const items = await pool.query<ServiceOrderItemRow>(
    `SELECT * FROM public.service_order_items
     WHERE service_order_id = $1 AND tenant_id = $2
     ORDER BY sort_order ASC, created_at ASC`,
    [id, tenantId],
  );
  const events = await pool.query<ServiceOrderEventRow>(
    `SELECT * FROM public.service_order_events
     WHERE service_order_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC
     LIMIT 100`,
    [id, tenantId],
  );

  return { ...row, items: items.rows, events: events.rows };
}

export async function createServiceOrder(
  tenantId: string,
  userId: string,
  input: CreateServiceOrderInput,
): Promise<ServiceOrderRow & { items: ServiceOrderItemRow[] }> {
  const status = input.status ?? 'draft';
  if (!SERVICE_ORDER_STATUSES.includes(status)) {
    throw new ServiceOrderDomainError('Status inválido.');
  }
  if (
    status === 'cancelled' ||
    status === 'signed' ||
    status === 'invoiced' ||
    status === 'awaiting_signature' ||
    status === 'sent'
  ) {
    throw new ServiceOrderDomainError('Status inicial inválido; use draft, scheduled ou in_progress.');
  }

  const billingMode = input.billing_mode ?? 'manual';
  const itemsInput = input.items ?? [];
  const normalizedPreview = itemsInput.map((it, i) => normalizeItemInput(it, i));
  const totals = computeTotalsFromItems(
    normalizedPreview.map((n) => ({ kind: n.kind, subtotal_cents: n.subtotal_cents })),
  );

  // Retry em colisão rara de número (UNIQUE) sob concorrência.
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (input.client_id) {
        await assertClientInTenant(client, tenantId, input.client_id);
      }
      if (input.responsible_user_id) {
        await assertUserInTenant(client, tenantId, input.responsible_user_id);
      }

      const number = await allocateServiceOrderNumber(client, tenantId);

      const ins = await client.query<ServiceOrderRow>(
        `INSERT INTO public.service_orders (
           tenant_id, created_by, responsible_user_id, service_order_number, status,
           client_id, client_snapshot, execution_address,
           period_start_at, period_end_at, equipment, observations, billing_mode,
           total_services_cents, total_products_cents, total_cents, currency
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7::jsonb, $8::jsonb,
           $9::timestamptz, $10::timestamptz, $11::jsonb, $12, $13,
           $14, $15, $16, $17
         )
         RETURNING *`,
        [
          tenantId,
          userId,
          input.responsible_user_id ?? null,
          number,
          status,
          input.client_id ?? null,
          JSON.stringify(input.client_snapshot ?? {}),
          JSON.stringify(input.execution_address ?? {}),
          input.period_start_at ?? null,
          input.period_end_at ?? null,
          input.equipment === undefined
            ? null
            : JSON.stringify(normalizeServiceOrderEquipmentList(input.equipment)),
          input.observations ?? null,
          billingMode,
          totals.total_services_cents,
          totals.total_products_cents,
          totals.total_cents,
          input.currency ?? 'BRL',
        ],
      );
      const created = ins.rows[0]!;

      const { rows: itemRows } = await insertItems(client, tenantId, created.id, itemsInput);

      await insertServiceOrderEvent(client, {
        tenantId,
        serviceOrderId: created.id,
        eventType: 'created',
        payload: { service_order_number: number, status },
        createdBy: userId,
      });

      await client.query('COMMIT');

      const full = await getServiceOrderById(tenantId, created.id);
      if (!full) {
        return { ...created, items: itemRows };
      }
      return full;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      if (isUniqueServiceOrderNumberViolation(e) && attempt < 7) {
        lastError = e;
        continue;
      }
      throw e;
    } finally {
      client.release();
    }
  }

  throw (
    lastError ??
    new ServiceOrderDomainError(
      'Não foi possível criar a ordem de serviço com número único.',
      500,
      'number_alloc_exhausted',
    )
  );
}

export async function updateServiceOrder(
  tenantId: string,
  userId: string,
  id: string,
  input: UpdateServiceOrderInput,
): Promise<ServiceOrderRow & { items: ServiceOrderItemRow[]; events: ServiceOrderEventRow[] }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query<ServiceOrderRow>(
      `SELECT * FROM public.service_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId],
    );
    const row = current.rows[0];
    if (!row) {
      throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
    }

    if (row.status === 'cancelled') {
      throw new ServiceOrderDomainError('Ordem cancelada não pode ser editada.', 409, 'cancelled');
    }

    const touchingBody =
      input.client_id !== undefined ||
      input.client_snapshot !== undefined ||
      input.execution_address !== undefined ||
      input.period_start_at !== undefined ||
      input.period_end_at !== undefined ||
      input.equipment !== undefined ||
      input.observations !== undefined ||
      input.billing_mode !== undefined ||
      input.currency !== undefined ||
      input.items !== undefined ||
      input.responsible_user_id !== undefined;

    if (touchingBody && !EDITABLE_STATUSES.has(row.status)) {
      throw new ServiceOrderDomainError(
        'Documento congelado ou finalizado; edição de corpo/itens bloqueada.',
        409,
        'frozen',
      );
    }

    if (input.client_id) {
      await assertClientInTenant(client, tenantId, input.client_id);
    }
    if (input.responsible_user_id) {
      await assertUserInTenant(client, tenantId, input.responsible_user_id);
    }

    if (input.status !== undefined && input.status !== row.status) {
      if (!SERVICE_ORDER_STATUSES.includes(input.status)) {
        throw new ServiceOrderDomainError('Status inválido.');
      }
      // Status de fluxo: só via endpoints (enviar OS / assinatura / fatura)
      if (
        input.status === 'sent' ||
        input.status === 'awaiting_signature' ||
        input.status === 'signed' ||
        input.status === 'invoiced'
      ) {
        throw new ServiceOrderDomainError(
          'Este status só muda pelo fluxo de envio, assinatura ou fatura.',
          400,
          'status_flow_only',
        );
      }
    }

    const nextStatus = input.status ?? row.status;
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    const push = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (input.client_id !== undefined) {
      sets.push(`client_id = ${push(input.client_id)}`);
    }
    if (input.responsible_user_id !== undefined) {
      sets.push(`responsible_user_id = ${push(input.responsible_user_id)}`);
    }
    if (input.status !== undefined) {
      sets.push(`status = ${push(input.status)}`);
      if (input.status === 'cancelled') {
        sets.push(`cancelled_at = now()`);
      }
    }
    if (input.client_snapshot !== undefined) {
      sets.push(`client_snapshot = ${push(JSON.stringify(input.client_snapshot))}::jsonb`);
    }
    if (input.execution_address !== undefined) {
      sets.push(`execution_address = ${push(JSON.stringify(input.execution_address))}::jsonb`);
    }
    if (input.period_start_at !== undefined) {
      sets.push(`period_start_at = ${push(input.period_start_at)}::timestamptz`);
    }
    if (input.period_end_at !== undefined) {
      sets.push(`period_end_at = ${push(input.period_end_at)}::timestamptz`);
    }
    if (input.equipment !== undefined) {
      const eqList = normalizeServiceOrderEquipmentList(input.equipment);
      sets.push(
        eqList === null
          ? `equipment = NULL`
          : `equipment = ${push(JSON.stringify(eqList))}::jsonb`,
      );
    }
    if (input.observations !== undefined) {
      sets.push(`observations = ${push(input.observations)}`);
    }
    if (input.billing_mode !== undefined) {
      sets.push(`billing_mode = ${push(input.billing_mode)}`);
    }
    if (input.currency !== undefined) {
      sets.push(`currency = ${push(input.currency)}`);
    }

    params.push(id, tenantId);
    const idParam = params.length - 1;
    const tenantParam = params.length;

    await client.query(
      `UPDATE public.service_orders
       SET ${sets.join(', ')}
       WHERE id = $${idParam} AND tenant_id = $${tenantParam}`,
      params,
    );

    if (input.items !== undefined) {
      await replaceItemsAndUpdateTotals(client, tenantId, id, input.items);
    }

    await insertServiceOrderEvent(client, {
      tenantId,
      serviceOrderId: id,
      eventType: input.status === 'cancelled' ? 'cancelled' : 'updated',
      payload: {
        from_status: row.status,
        to_status: nextStatus,
        items_replaced: input.items !== undefined,
      },
      createdBy: userId,
    });

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const full = await getServiceOrderById(tenantId, id);
  if (!full) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }
  return full;
}

export async function deleteServiceOrder(
  tenantId: string,
  id: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query<{ status: ServiceOrderStatus }>(
      `SELECT status FROM public.service_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId],
    );
    const row = current.rows[0];
    if (!row) {
      throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
    }
    if (row.status !== 'draft' && row.status !== 'cancelled') {
      throw new ServiceOrderDomainError(
        'Só é possível excluir OS em rascunho ou cancelada.',
        409,
        'not_deletable',
      );
    }
    await client.query(`DELETE FROM public.service_orders WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
