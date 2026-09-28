# Sprint P0-E — Gestão de usuários pelo Super Admin

## Endpoints (`is_super_admin` obrigatório)

| Método | Rota |
|--------|------|
| GET | `/api/superadmin/companies/:tenantId/users/:userId` |
| PATCH | `/api/superadmin/companies/:tenantId/users/:userId` |
| POST | `/api/superadmin/companies/:tenantId/users/:userId/reset-password` |

Listagem existente: `GET /api/superadmin/tenants/:id/users`

## Auditoria (`super_admin_audit_log`)

- `user_updated_by_superadmin` — `changes` com from/to por campo
- `user_password_reset_by_superadmin` — sem senha no payload

## UI

`Super Admin → Empresas → Empresa → Usuários` — ações Editar, Alterar senha, Acessar como.

## Testes

```bash
cd packages/backend
npx vitest run src/services/superadminCompanyUsers.test.ts
```
