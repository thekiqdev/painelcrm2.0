/**
 * Helpers para escopo de queries por tenant (isolamento multi-tenant).
 *
 * Regra: toda query que toca dado de tenant deve usar um destes helpers ou o
 * padrão documentado em docs/PLANO-ISOLAMENTO-MULTI-TENANT.md.
 *
 * Padrões:
 * - Tabelas com tenant_id: WHERE tenant_id = $N (N = índice do param com req.tenantId).
 * - Tabelas com user_id: JOIN users por tenant_id ou WHERE user_id IN (tenantUserIdsSubquery(N)).
 */

/**
 * Subquery SQL que retorna os user_ids do tenant.
 * Uso: WHERE entity.user_id IN ${tenantUserIdsSubquery(1)} com params [tenantId, ...].
 *
 * @param tenantParamIndex Índice do parâmetro ($1, $2, ...) que receberá o tenant_id.
 */
export function tenantUserIdsSubquery(tenantParamIndex: number): string {
  return `(SELECT id FROM users WHERE tenant_id = $${tenantParamIndex})`;
}

/**
 * Cláusula WHERE para filtrar por tenant em tabelas com coluna user_id.
 * Uso em UPDATE/DELETE: WHERE id = $x AND ${whereUserInTenant('user_id', x+1)} com params [..., tenantId].
 *
 * @param userIdColumn Nome da coluna user_id (ex: 'user_id', 'p.user_id').
 * @param tenantParamIndex Índice do parâmetro que receberá o tenant_id.
 */
export function whereUserInTenant(userIdColumn: string, tenantParamIndex: number): string {
  return `${userIdColumn} IN (SELECT id FROM users WHERE tenant_id = $${tenantParamIndex})`;
}

/**
 * Cláusula JOIN para listagens por tenant (tabelas com user_id).
 * Uso: FROM entity e ${joinUserTenant('e', 'user_id', 1)} WHERE ... com params [tenantId, ...].
 *
 * @param entityAlias Alias da tabela da entidade (ex: 'p', 'c').
 * @param userColumn Coluna user_id na entidade (ex: 'user_id').
 * @param tenantParamIndex Índice do parâmetro que receberá o tenant_id.
 */
export function joinUserTenant(
  entityAlias: string,
  userColumn: string,
  tenantParamIndex: number
): string {
  return `INNER JOIN users u ON u.id = ${entityAlias}.${userColumn} AND u.tenant_id = $${tenantParamIndex}`;
}

/**
 * Subquery para getById/update/delete quando se usa userId para derivar o tenant.
 * Retorna: (SELECT tenant_id FROM users WHERE id = $userIdParamIndex).
 *
 * @param userIdParamIndex Índice do parâmetro que receberá o user_id do request.
 */
export function tenantIdFromUserSubquery(userIdParamIndex: number): string {
  return `(SELECT tenant_id FROM users WHERE id = $${userIdParamIndex})`;
}

/**
 * JOIN para getById/update/delete: garante que a entidade pertence ao mesmo tenant do userId.
 * Uso: FROM entity e ${joinUserTenantByUserId('e', 'user_id', 2)} WHERE e.id = $1 com params [id, userId].
 *
 * @param entityAlias Alias da tabela da entidade.
 * @param userColumn Coluna user_id na entidade.
 * @param userIdParamIndex Índice do parâmetro com o user_id do request.
 */
export function joinUserTenantByUserId(
  entityAlias: string,
  userColumn: string,
  userIdParamIndex: number
): string {
  const subquery = tenantIdFromUserSubquery(userIdParamIndex);
  return `INNER JOIN users u ON u.id = ${entityAlias}.${userColumn} AND u.tenant_id = ${subquery}`;
}

/**
 * WHERE para update/delete por id + tenant (tabelas com user_id).
 * Uso: WHERE id = $idParamIndex AND ${whereUserInTenantById('user_id', idParamIndex+1)} com params [..., id, userId].
 * Para derivar tenant do userId: use whereUserInTenantFromUserId('user_id', tenantFromUserIdParamIndex).
 *
 * @param userIdColumn Coluna user_id (ex: 'user_id').
 * @param tenantParamIndex Índice do parâmetro com tenant_id (ou use subquery por userId).
 */
export function whereUserInTenantFromUserId(
  userIdColumn: string,
  userIdParamIndex: number
): string {
  return `${userIdColumn} IN (SELECT id FROM users WHERE tenant_id = ${tenantIdFromUserSubquery(userIdParamIndex)})`;
}

/**
 * Garante que o valor é um tenant_id válido (não null/undefined).
 * Use em rotas que exigem tenant; retorna 403 se não houver tenant.
 *
 * @throws Error se tenantId for null ou undefined.
 */
export function assertTenantId(tenantId: string | null | undefined): asserts tenantId is string {
  if (tenantId == null || tenantId === '') {
    throw new Error('Tenant required');
  }
}

/**
 * Retorna o tenantId do request ou null. Não lança.
 * Útil para listagens que retornam [] quando não há tenant.
 */
export function getTenantIdOrNull(tenantId: string | null | undefined): string | null {
  return tenantId ?? null;
}

// ---------------------------------------------------------------------------
// Etapa 4: Validação para criação/atualização (sempre usar tenant/user do request)
// ---------------------------------------------------------------------------

/** Request com userId e tenantId (setados pelo auth + setCurrentTenant). */
export interface RequestWithTenant {
  userId?: string;
  tenantId?: string | null;
}

/**
 * Retorna o tenant_id a ser usado em INSERT em tabelas com coluna tenant_id.
 * Nunca use body.tenant_id; sempre use este helper (ou req.tenantId) vindo do request.
 *
 * @throws Error com message 'Tenant required' se req.tenantId for null/undefined.
 */
export function ensureTenantIdForInsert(req: RequestWithTenant): string {
  const tenantId = req.tenantId ?? null;
  if (!tenantId) {
    throw new Error('Tenant required');
  }
  return tenantId;
}

/**
 * Retorna o user_id a ser usado em INSERT em tabelas com coluna user_id (dono no tenant).
 * O usuário já pertence ao tenant (garantido pelo auth + setCurrentTenant).
 *
 * @throws Error com message 'Authentication required' se req.userId for null/undefined.
 */
export function ensureUserIdForInsert(req: RequestWithTenant): string {
  const userId = req.userId;
  if (!userId) {
    throw new Error('Authentication required');
  }
  return userId;
}

/**
 * Remove tenant_id do body para garantir que nunca seja tomado do cliente.
 * Use antes de montar o objeto de INSERT em tabelas com tenant_id; o tenant_id
 * deve vir sempre de ensureTenantIdForInsert(req).
 */
export function stripTenantIdFromBody<T extends Record<string, unknown>>(
  body: T
): Omit<T, 'tenant_id'> {
  const { tenant_id: _unused, ...rest } = body as T & { tenant_id?: unknown };
  return rest as Omit<T, 'tenant_id'>;
}
