import { pool } from '../utils/db.js';

export type AvailabilityBlockRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  block_scope: 'tenant' | 'user';
  block_type: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
};

export type ListAvailabilityBlocksFilters = {
  dateFromIso: string;
  dateToIso: string;
  userId?: string;
  blockScope?: 'tenant' | 'user';
  blockType?: string;
};

function rowFromDb(r: Record<string, unknown>): AvailabilityBlockRow {
  return {
    id: String(r.id),
    tenant_id: String(r.tenant_id),
    user_id: r.user_id != null ? String(r.user_id) : null,
    title: String(r.title),
    description: r.description != null ? String(r.description) : null,
    starts_at: String(r.starts_at),
    ends_at: String(r.ends_at),
    all_day: r.all_day === true,
    block_scope: r.block_scope === 'tenant' ? 'tenant' : 'user',
    block_type: String(r.block_type),
    created_by: r.created_by != null ? String(r.created_by) : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    cancelled_at: r.cancelled_at != null ? String(r.cancelled_at) : null,
  };
}

export async function listAvailabilityBlocks(
  tenantId: string,
  filters: ListAvailabilityBlocksFilters,
): Promise<AvailabilityBlockRow[]> {
  const args: unknown[] = [tenantId];
  let cond = `b.tenant_id = $1 AND b.cancelled_at IS NULL
    AND b.starts_at < $${args.length + 2}::timestamptz AND b.ends_at > $${args.length + 1}::timestamptz`;
  args.push(filters.dateFromIso, filters.dateToIso);

  if (filters.userId) {
    args.push(filters.userId);
    cond += ` AND (b.block_scope = 'tenant' OR b.user_id = $${args.length})`;
  }
  if (filters.blockScope) {
    args.push(filters.blockScope);
    cond += ` AND b.block_scope = $${args.length}`;
  }
  if (filters.blockType) {
    args.push(filters.blockType);
    cond += ` AND b.block_type = $${args.length}`;
  }

  const r = await pool.query(
    `SELECT b.id, b.tenant_id, b.user_id, b.title, b.description, b.starts_at, b.ends_at, b.all_day,
            b.block_scope, b.block_type, b.created_by, b.created_at, b.updated_at, b.cancelled_at
     FROM public.appointment_availability_blocks b
     WHERE ${cond}
     ORDER BY b.starts_at ASC`,
    args,
  );
  return r.rows.map((row) => rowFromDb(row as Record<string, unknown>));
}

export async function getAvailabilityBlockById(
  tenantId: string,
  id: string,
): Promise<AvailabilityBlockRow | null> {
  const r = await pool.query(
    `SELECT id, tenant_id, user_id, title, description, starts_at, ends_at, all_day,
            block_scope, block_type, created_by, created_at, updated_at, cancelled_at
     FROM public.appointment_availability_blocks
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  const row = r.rows[0];
  return row ? rowFromDb(row as Record<string, unknown>) : null;
}

export type CreateAvailabilityBlockInput = {
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
  block_scope: 'tenant' | 'user';
  user_id?: string | null;
  block_type: string;
  created_by: string | null;
};

export async function createAvailabilityBlock(
  tenantId: string,
  input: CreateAvailabilityBlockInput,
): Promise<AvailabilityBlockRow> {
  const userId = input.block_scope === 'tenant' ? null : input.user_id ?? null;
  const r = await pool.query(
    `INSERT INTO public.appointment_availability_blocks (
       tenant_id, user_id, title, description, starts_at, ends_at, all_day,
       block_scope, block_type, created_by
     ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10)
     RETURNING id, tenant_id, user_id, title, description, starts_at, ends_at, all_day,
               block_scope, block_type, created_by, created_at, updated_at, cancelled_at`,
    [
      tenantId,
      userId,
      input.title.trim(),
      input.description?.trim() || null,
      input.starts_at,
      input.ends_at,
      input.all_day === true,
      input.block_scope,
      input.block_type,
      input.created_by,
    ],
  );
  const row = r.rows[0];
  if (!row) throw new Error('block_create_failed');
  return rowFromDb(row as Record<string, unknown>);
}

export type PatchAvailabilityBlockInput = {
  title?: string;
  description?: string | null;
  starts_at?: string;
  ends_at?: string;
  all_day?: boolean;
  block_type?: string;
  block_scope?: 'tenant' | 'user';
  user_id?: string | null;
};

export async function patchAvailabilityBlock(
  tenantId: string,
  id: string,
  patch: PatchAvailabilityBlockInput,
): Promise<AvailabilityBlockRow | null> {
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  let n = 1;

  const add = (col: string, v: unknown) => {
    sets.push(`${col} = $${n}`);
    vals.push(v);
    n += 1;
  };

  if (patch.title !== undefined) add('title', patch.title.trim());
  if (patch.description !== undefined) add('description', patch.description?.trim() || null);
  if (patch.starts_at !== undefined) add('starts_at', patch.starts_at);
  if (patch.ends_at !== undefined) add('ends_at', patch.ends_at);
  if (patch.all_day !== undefined) add('all_day', patch.all_day);
  if (patch.block_type !== undefined) add('block_type', patch.block_type);
  if (patch.block_scope !== undefined) add('block_scope', patch.block_scope);
  if (patch.user_id !== undefined) add('user_id', patch.user_id);

  if (sets.length === 1) {
    return getAvailabilityBlockById(tenantId, id);
  }

  const tidParam = vals.length + 1;
  const idParam = vals.length + 2;
  vals.push(tenantId, id);
  const r = await pool.query(
    `UPDATE public.appointment_availability_blocks SET ${sets.join(', ')}
     WHERE tenant_id = $${tidParam} AND id = $${idParam} AND cancelled_at IS NULL
     RETURNING id, tenant_id, user_id, title, description, starts_at, ends_at, all_day,
               block_scope, block_type, created_by, created_at, updated_at, cancelled_at`,
    vals,
  );
  const row = r.rows[0];
  return row ? rowFromDb(row as Record<string, unknown>) : null;
}

export async function cancelAvailabilityBlock(tenantId: string, id: string): Promise<AvailabilityBlockRow | null> {
  const r = await pool.query(
    `UPDATE public.appointment_availability_blocks
     SET cancelled_at = now(), updated_at = now()
     WHERE tenant_id = $1 AND id = $2 AND cancelled_at IS NULL
     RETURNING id, tenant_id, user_id, title, description, starts_at, ends_at, all_day,
               block_scope, block_type, created_by, created_at, updated_at, cancelled_at`,
    [tenantId, id],
  );
  const row = r.rows[0];
  return row ? rowFromDb(row as Record<string, unknown>) : null;
}

/** Normaliza escopo após PATCH: garante coerência tenant/user ↔ user_id */
export async function normalizeBlockScopeRow(tenantId: string, id: string): Promise<void> {
  await pool.query(
    `UPDATE public.appointment_availability_blocks
     SET user_id = CASE WHEN block_scope = 'tenant' THEN NULL ELSE user_id END,
         updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
}
