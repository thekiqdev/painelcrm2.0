/**
 * Utilitário de segurança multi-tenant para ambiente de desenvolvimento.
 * Detecta SELECTs que tocam tabelas tenant-scoped mas não aplicam filtro de tenant,
 * ajudando a evitar regressões futuras.
 *
 * Uso: assertTenantScopedQuery(sql) — só gera warning em NODE_ENV=development.
 */

/** Tabelas que contêm dados por tenant (lista alinhada ao RLS em 57_rls_tenant_isolation.sql). */
const TENANT_SCOPED_TABLES = [
  'teams',
  'tenant_plan',
  'tenant_billing',
  'tenant_feature_overrides',
  'tenant_admin_notes',
  'tenant_tags',
  'project_templates',
  'team_members',
  'user_profiles',
  'clients',
  'client_groups',
  'client_tasks',
  'leads',
  'lead_statuses',
  'lead_tasks',
  'sales_funnels',
  'funnel_stages',
  'products',
  'proposals',
  'contracts',
  'contract_templates',
  'invoices',
  'expenses',
  'tickets',
  'ticket_categories',
  'message_templates',
  'projects',
  'project_lists',
  'project_tasks',
  'project_areas',
  'project_versions',
  'project_area_comments',
  'tasks',
  'notifications',
  'user_roles',
  'user_permissions',
  'chat_instances',
  'chat_conversations',
  'chat_messages',
  'store_profiles',
  'registration_steps',
] as const;

/** Padrões que indicam filtro por tenant (query considerada segura se algum estiver presente). */
const SAFETY_PATTERNS = [
  /\btenant_id\b/i,
  /user_id\s+IN\s*\(/i,
  /owner_id\s+IN\s*\(\s*SELECT\s+.*\s+FROM\s+.*users\s+WHERE\s+tenant_id/i,
  /(?:INNER\s+)?JOIN\s+users\s+\w*\s+ON\s+[^]+?\btenant_id\b/i,
  /FROM\s+users\s+\w*\s+[^]+?\btenant_id\b/i,
];

function normalizeSql(sql: string): string {
  return sql
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Verifica se a query é um SELECT (inclui SELECT ... INTO e CTEs com SELECT). */
function isSelectQuery(normalized: string): boolean {
  const trimmed = normalized.trimStart();
  return /^\s*WITH\s+/i.test(trimmed) || /^\s*SELECT\s+/i.test(trimmed);
}

/** Verifica se a query referencia alguma tabela tenant-scoped. */
function referencesTenantScopedTable(normalized: string): boolean {
  const upper = normalized.toUpperCase();
  for (const table of TENANT_SCOPED_TABLES) {
    const tableUpper = table.toUpperCase();
    const wordBoundary = new RegExp(`\\b${tableUpper}\\b`);
    if (wordBoundary.test(upper)) return true;
  }
  return false;
}

/** Verifica se a query contém algum padrão de filtro por tenant. */
function hasTenantFilter(normalized: string): boolean {
  return SAFETY_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Em desenvolvimento, verifica se um SELECT que toca tabelas tenant-scoped
 * contém filtro por tenant. Se não contiver, registra um warning no log.
 *
 * Padrões considerados seguros:
 * - Uso de `tenant_id` (WHERE, JOIN, etc.)
 * - `user_id IN (SELECT ... FROM users WHERE tenant_id ...)`
 * - `JOIN users ... tenant_id` ou `FROM users ... tenant_id`
 *
 * @param sql - Texto da query SQL (pode ser multi-linha).
 */
export function assertTenantScopedQuery(sql: string): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (typeof sql !== 'string' || !sql.trim()) return;

  const normalized = normalizeSql(sql);
  if (!isSelectQuery(normalized)) return;
  if (!referencesTenantScopedTable(normalized)) return;
  if (hasTenantFilter(normalized)) return;

  const preview = normalized.length > 400 ? `${normalized.slice(0, 400)}...` : normalized;
  console.warn(
    '[tenantSecurity] SELECT em tabela(s) tenant-scoped sem filtro de tenant detectado. ' +
      'Garanta: tenant_id, user_id IN (SELECT ... users ... tenant_id), ou JOIN users ... tenant_id.\n' +
      `Query (preview): ${preview}`
  );
}
