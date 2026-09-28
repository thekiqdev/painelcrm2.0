/**
 * Kanban operacional do Super Admin é isolado em um "tenant virtual" fixo.
 *
 * Motivo: reutilizar 100% das tabelas/serviços do Kanban existente (chat_kanban_*)
 * sem misturar com tenants reais e sem criar um segundo engine de Kanban.
 *
 * Segurança: apenas rotas /api/superadmin/* conseguem operar nesse tenant virtual.
 */
export const SUPERADMIN_OPS_KANBAN_TENANT_ID = '1f1a0f0a-0000-4000-8000-000000000001';

