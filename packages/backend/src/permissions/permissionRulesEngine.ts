/**
 * Motor de regras ABAC (Attribute-Based Access Control).
 * Avalia regras baseadas em atributos do usuário e do recurso.
 *
 * Implementação inicial: retorna sempre null (nenhuma regra se aplica).
 * O permissionEngine trata null como "continuar com RBAC e own_only".
 * Comportamento atual inalterado (RBAC + own_only). Nenhuma alteração em controllers nem no banco.
 *
 * Futuro: permissionRulesEngine preparado para regras ABAC (ex.: usuário só vê projetos da mesma
 * equipe, só edita clientes atribuídos a ele, só vê tickets do departamento). Inicialmente retorna
 * sempre null; não altera controllers nem banco.
 */

import type { ModuleId, PermissionAction } from './permissionTypes.js';

/** Usuário para avaliação de regras (atributos estendíveis: tenantId, role, teamIds, departmentId, etc.). */
export interface RuleUser {
  id: string;
  tenantId?: string | null;
  role?: string | null;
}

/** Recurso opcional para regras que dependem de owner/assignee. */
export interface RuleResource {
  ownerId?: string | null;
  assigneeId?: string | null;
}

/**
 * Avalia regras ABAC para o par (usuário, módulo, ação, recurso).
 *
 * @returns true = permite, false = nega, null = nenhuma regra se aplica (decisão fica com RBAC/own_only)
 */
export async function evaluateRules(
  _user: RuleUser,
  _module: ModuleId | string,
  _action: PermissionAction,
  _resource?: RuleResource | null
): Promise<boolean | null> {
  return null;
}
