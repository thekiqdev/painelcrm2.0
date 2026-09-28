import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';

export type ChatKanbanTagRow = {
  id: string;
  tenant_id: string;
  label: string;
  color: string | null;
  created_at: string;
};

const LABEL_MAX = 80;

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

/** Cor padrão alinhada ao produto (UI usa a mesma quando color é null). */
export const DEFAULT_KANBAN_TAG_COLOR_UI = '#2563EB';

export function normalizeKanbanTagColor(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  if (!HEX_COLOR_RE.test(t)) return null;
  return t;
}

export function normalizeKanbanTagLabel(raw: string): string {
  return raw.trim().slice(0, LABEL_MAX);
}

function selectKanbanTagRowFields(): string {
  return `id::text, tenant_id::text, label, color, created_at::text`;
}

export async function listKanbanTagsForTenant(tenantId: string): Promise<ChatKanbanTagRow[]> {
  const r = await pool.query<ChatKanbanTagRow>(
    `SELECT ${selectKanbanTagRowFields()}
     FROM chat_kanban_tags
     WHERE tenant_id = $1
     ORDER BY lower(trim(label)) ASC`,
    [tenantId],
  );
  return r.rows;
}

export async function getKanbanTagById(tenantId: string, tagId: string): Promise<ChatKanbanTagRow | null> {
  const r = await pool.query<ChatKanbanTagRow>(
    `SELECT ${selectKanbanTagRowFields()}
     FROM chat_kanban_tags
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, tagId],
  );
  return r.rows[0] ?? null;
}

/** Cria tag ou devolve existente (unique por tenant + lower(label)). */
export async function getOrCreateKanbanTag(
  tenantId: string,
  label: string,
  opts?: { color?: string | null },
): Promise<ChatKanbanTagRow> {
  const t = normalizeKanbanTagLabel(label);
  if (!t) {
    const err = new Error('Label da tag inválido');
    (err as Error & { code?: string }).code = 'BAD_REQUEST';
    throw err;
  }
  const colorSql = normalizeKanbanTagColor(opts?.color ?? null);
  const existing = await getKanbanTagByLabel(tenantId, t);
  if (existing) return existing;
  try {
    const ins = await pool.query<ChatKanbanTagRow>(
      `INSERT INTO chat_kanban_tags (tenant_id, label, color) VALUES ($1, $2, $3)
       RETURNING ${selectKanbanTagRowFields()}`,
      [tenantId, t, colorSql],
    );
    return ins.rows[0]!;
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
    if (code === '23505') {
      const again = await getKanbanTagByLabel(tenantId, t);
      if (again) return again;
    }
    throw e;
  }
}

export async function patchKanbanTag(
  tenantId: string,
  tagId: string,
  patch: { label?: string; color?: string | null },
): Promise<ChatKanbanTagRow | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.label !== undefined) {
    const lab = normalizeKanbanTagLabel(patch.label);
    if (!lab) {
      const err = new Error('Label da tag inválido');
      (err as Error & { code?: string }).code = 'BAD_REQUEST';
      throw err;
    }
    sets.push(`label = $${vals.length + 1}`);
    vals.push(lab);
  }
  if (patch.color !== undefined) {
    const c =
      patch.color === null || patch.color === ''
        ? null
        : normalizeKanbanTagColor(typeof patch.color === 'string' ? patch.color : String(patch.color));
    if (patch.color && String(patch.color).trim() && c === null) {
      const err = new Error('Cor inválida (use #RGB ou #RRGGBB)');
      (err as Error & { code?: string }).code = 'BAD_REQUEST';
      throw err;
    }
    sets.push(`color = $${vals.length + 1}`);
    vals.push(c);
  }
  if (sets.length === 0) {
    return getKanbanTagById(tenantId, tagId);
  }
  vals.push(tenantId, tagId);
  const r = await pool.query<ChatKanbanTagRow>(
    `UPDATE chat_kanban_tags SET ${sets.join(', ')}
     WHERE tenant_id = $${vals.length - 1} AND id = $${vals.length}
     RETURNING ${selectKanbanTagRowFields()}`,
    vals,
  );
  return r.rows[0] ?? null;
}

async function getKanbanTagByLabel(tenantId: string, label: string): Promise<ChatKanbanTagRow | null> {
  const r = await pool.query<ChatKanbanTagRow>(
    `SELECT ${selectKanbanTagRowFields()}
     FROM chat_kanban_tags
     WHERE tenant_id = $1 AND lower(trim(label)) = lower(trim($2))
     LIMIT 1`,
    [tenantId, label],
  );
  return r.rows[0] ?? null;
}

/** Próxima posição na coluna (cartões não arquivados). */
export async function nextKanbanCardPosition(client: PoolClient, columnId: string): Promise<number> {
  const r = await client.query<{ n: string }>(
    `SELECT (COALESCE(MAX(position), 0)::float8 + 1)::text AS n FROM chat_kanban_cards
     WHERE column_id = $1 AND archived_at IS NULL`,
    [columnId],
  );
  const n = r.rows[0]?.n;
  return typeof n === 'string' ? Number(n) || 1 : Number(n) || 1;
}
