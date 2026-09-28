/**
 * Sprint J — leitura observacional de ops_lifecycle_transitions (sem efeitos colaterais).
 */
import { pool } from '../utils/db.js';

export const LIFECYCLE_DASHBOARD_DEFAULT_LIMIT = 50;
export const LIFECYCLE_DASHBOARD_MAX_LIMIT = 200;

export const LIFECYCLE_DASHBOARD_EVENT_FILTERS = [
  'onboarding.started',
  'onboarding.completed',
  'trial.started',
  'trial.expired',
  'trial.recovery.day1',
  'trial.recovery.day3',
  'trial.recovery.day7',
  'trial.recovery.last_attempt',
  'subscription.activated',
  'subscription.cancelled',
] as const;

export const LIFECYCLE_DASHBOARD_RESULT_FILTERS = [
  'moved',
  'already_at_destination',
  'promotion_disabled',
  'card_not_found',
  'board_not_found',
  'column_not_found',
  'error',
] as const;

const FAILURE_RESULTS = new Set([
  'card_not_found',
  'board_not_found',
  'column_not_found',
  'error',
  'route_unmatched',
  'migration_required',
  'no_actor',
]);

export type LifecycleTransitionListFilters = {
  eventType?: string | null;
  result?: string | null;
  tenantQuery?: string | null;
  leadQuery?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  limit?: number;
  sort?: 'created_at';
  order?: 'asc' | 'desc';
};

export type LifecycleTransitionRowDto = {
  id: string;
  created_at: string;
  event_type: string;
  result: string;
  correlation_id: string | null;
  acquisition_lead_id: string | null;
  tenant_id: string | null;
  card_id: string | null;
  lead_label: string | null;
  tenant_label: string | null;
  source_board_name: string | null;
  source_column_name: string | null;
  destination_board_name: string | null;
  destination_column_name: string | null;
  metadata_json: Record<string, unknown>;
};

export type LifecycleDashboardMetricsDto = {
  today: {
    events_observed: number;
    promotions_moved: number;
    failures: number;
  };
  last_30_days: {
    onboarding_completed: number;
    subscription_activated: number;
    trial_expired: number;
    subscription_cancelled: number;
  };
};

export type LifecycleTransitionsListResponse = {
  items: LifecycleTransitionRowDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  metrics: LifecycleDashboardMetricsDto;
};

function clampLimit(raw: number | undefined): number {
  if (!Number.isFinite(raw) || !raw) return LIFECYCLE_DASHBOARD_DEFAULT_LIMIT;
  return Math.min(LIFECYCLE_DASHBOARD_MAX_LIMIT, Math.max(1, Math.floor(raw)));
}

function clampPage(raw: number | undefined): number {
  if (!Number.isFinite(raw) || !raw) return 1;
  return Math.max(1, Math.floor(raw));
}

function parseMetadataJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

function buildWhereClause(filters: LifecycleTransitionListFilters): {
  whereSql: string;
  params: unknown[];
} {
  const clauses: string[] = ['1=1'];
  const params: unknown[] = [];
  let i = 1;

  if (filters.eventType?.trim()) {
    clauses.push(`t.event_type = $${i++}`);
    params.push(filters.eventType.trim());
  }
  if (filters.result?.trim()) {
    clauses.push(`t.result = $${i++}`);
    params.push(filters.result.trim());
  }
  if (filters.from?.trim()) {
    clauses.push(`t.created_at >= $${i++}::timestamptz`);
    params.push(`${filters.from.trim()}T00:00:00.000Z`);
  }
  if (filters.to?.trim()) {
    clauses.push(`t.created_at < ($${i++}::date + interval '1 day')`);
    params.push(filters.to.trim());
  }
  if (filters.tenantQuery?.trim()) {
    const q = `%${filters.tenantQuery.trim().toLowerCase()}%`;
    clauses.push(`(
      lower(coalesce(ten.name, '')) LIKE $${i}
      OR lower(coalesce(ten.slug, '')) LIKE $${i}
      OR t.tenant_id::text ILIKE $${i}
    )`);
    params.push(q);
    i++;
  }
  if (filters.leadQuery?.trim()) {
    const q = `%${filters.leadQuery.trim().toLowerCase()}%`;
    clauses.push(`(
      lower(coalesce(al.email, '')) LIKE $${i}
      OR lower(coalesce(al.name, '')) LIKE $${i}
      OR t.acquisition_lead_id::text ILIKE $${i}
      OR lower(coalesce(al.correlation_id, '')) LIKE $${i}
    )`);
    params.push(q);
    i++;
  }

  return { whereSql: clauses.join(' AND '), params };
}

const SELECT_BODY = `
  SELECT
    t.id::text,
    t.created_at,
    t.event_type,
    t.result,
    t.correlation_id,
    t.acquisition_lead_id::text,
    t.tenant_id::text,
    t.card_id::text,
    COALESCE(NULLIF(btrim(al.name), ''), NULLIF(btrim(al.email), '')) AS lead_label,
    COALESCE(NULLIF(btrim(ten.name), ''), NULLIF(btrim(ten.slug), '')) AS tenant_label,
    sb.name AS source_board_name,
    sc.name AS source_column_name,
    db.name AS destination_board_name,
    dc.name AS destination_column_name,
    t.metadata_json
  FROM ops_lifecycle_transitions t
  LEFT JOIN acquisition_leads al ON al.id = t.acquisition_lead_id
  LEFT JOIN tenants ten ON ten.id = t.tenant_id
  LEFT JOIN chat_kanban_boards sb ON sb.id = t.source_board_id
  LEFT JOIN chat_kanban_columns sc ON sc.id = t.source_column_id
  LEFT JOIN chat_kanban_boards db ON db.id = t.destination_board_id
  LEFT JOIN chat_kanban_columns dc ON dc.id = t.destination_column_id
`;

function mapRow(row: Record<string, unknown>): LifecycleTransitionRowDto {
  return {
    id: String(row.id),
    created_at: new Date(String(row.created_at)).toISOString(),
    event_type: String(row.event_type),
    result: String(row.result),
    correlation_id: row.correlation_id != null ? String(row.correlation_id) : null,
    acquisition_lead_id: row.acquisition_lead_id != null ? String(row.acquisition_lead_id) : null,
    tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
    card_id: row.card_id != null ? String(row.card_id) : null,
    lead_label: row.lead_label != null ? String(row.lead_label) : null,
    tenant_label: row.tenant_label != null ? String(row.tenant_label) : null,
    source_board_name: row.source_board_name != null ? String(row.source_board_name) : null,
    source_column_name: row.source_column_name != null ? String(row.source_column_name) : null,
    destination_board_name: row.destination_board_name != null ? String(row.destination_board_name) : null,
    destination_column_name: row.destination_column_name != null ? String(row.destination_column_name) : null,
    metadata_json: parseMetadataJson(row.metadata_json),
  };
}

export async function listSuperadminLifecycleTransitions(
  filters: LifecycleTransitionListFilters,
): Promise<LifecycleTransitionsListResponse> {
  const page = clampPage(filters.page);
  const limit = clampLimit(filters.limit);
  const offset = (page - 1) * limit;
  const order = filters.order === 'asc' ? 'ASC' : 'DESC';
  const sortCol = filters.sort === 'created_at' ? 't.created_at' : 't.created_at';

  const { whereSql, params } = buildWhereClause(filters);
  const countParams = [...params];
  const listParams = [...params, limit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const [rowsResult, totalResult, metrics] = await Promise.all([
    pool.query(
      `${SELECT_BODY}
       WHERE ${whereSql}
       ORDER BY ${sortCol} ${order}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams,
    ),
    pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c
       FROM ops_lifecycle_transitions t
       LEFT JOIN acquisition_leads al ON al.id = t.acquisition_lead_id
       LEFT JOIN tenants ten ON ten.id = t.tenant_id
       WHERE ${whereSql}`,
      countParams,
    ),
    loadLifecycleDashboardMetrics(),
  ]);

  const total = totalResult.rows[0]?.c ?? 0;

  return {
    items: rowsResult.rows.map((r) => mapRow(r as Record<string, unknown>)),
    pagination: {
      page,
      limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / limit),
    },
    metrics,
  };
}

async function loadLifecycleDashboardMetrics(): Promise<LifecycleDashboardMetricsDto> {
  const [todayResult, last30Result] = await Promise.all([
    pool.query<{
      events_observed: number;
      promotions_moved: number;
      failures: number;
    }>(
      `SELECT
         COUNT(*)::int AS events_observed,
         COUNT(*) FILTER (WHERE result = 'moved')::int AS promotions_moved,
         COUNT(*) FILTER (WHERE result IN (
           'card_not_found', 'board_not_found', 'column_not_found', 'error',
           'route_unmatched', 'migration_required', 'no_actor'
         ))::int AS failures
       FROM ops_lifecycle_transitions
       WHERE created_at >= timezone(
         'America/Sao_Paulo',
         date_trunc('day', timezone('America/Sao_Paulo', now()))
       )`,
    ),
    pool.query<{
      onboarding_completed: number;
      subscription_activated: number;
      trial_expired: number;
      subscription_cancelled: number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'onboarding.completed')::int AS onboarding_completed,
         COUNT(*) FILTER (WHERE event_type = 'subscription.activated')::int AS subscription_activated,
         COUNT(*) FILTER (WHERE event_type = 'trial.expired')::int AS trial_expired,
         COUNT(*) FILTER (WHERE event_type = 'subscription.cancelled')::int AS subscription_cancelled
       FROM ops_lifecycle_transitions
       WHERE created_at >= now() - interval '30 days'`,
    ),
  ]);

  const today = todayResult.rows[0];
  const last30 = last30Result.rows[0];

  return {
    today: {
      events_observed: today?.events_observed ?? 0,
      promotions_moved: today?.promotions_moved ?? 0,
      failures: today?.failures ?? 0,
    },
    last_30_days: {
      onboarding_completed: last30?.onboarding_completed ?? 0,
      subscription_activated: last30?.subscription_activated ?? 0,
      trial_expired: last30?.trial_expired ?? 0,
      subscription_cancelled: last30?.subscription_cancelled ?? 0,
    },
  };
}

export function isLifecycleFailureResult(result: string): boolean {
  return FAILURE_RESULTS.has(result);
}
