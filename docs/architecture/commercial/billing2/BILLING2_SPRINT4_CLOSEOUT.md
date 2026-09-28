# Billing 2.0 — Sprint 4 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 4 — UI Cobrança Automática |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação |

## Entregáveis

| Item | Status |
|------|--------|
| Página Financeiro → Cobrança Automática | ✅ |
| Load/Save via GET/PUT `/api/superadmin/billing/collection-policy` | ✅ |
| Validação client (tentativas ≥ 1; suspender ≤ cancelar) | ✅ |
| Preview textual (PRD §7) | ✅ |
| Restaurar padrão PRD §18 | ✅ |
| Confirmação ao ligar suspend/cancel | ✅ |
| Save → audit (`collection_policy.updated` + `last_audit_id`) | ✅ |
| Hub/nav (já existiam; descrição hub atualizada) | ✅ |
| Permissão escrita = Super Admin (`requireSuperAdmin` → 403) | ✅ |
| Lista Assinaturas / Dashboard | ❌ fora (S5/S6) |

## Critérios de aceite

- [x] Defaults batem PRD §18
- [x] Usuário sem Super Admin recebe 403 na API
- [x] Preview descreve comportamento em linguagem de Financeiro
- [x] Engine (S3) lê a policy persistida no próximo evento (se flag ON)
- [ ] Demo / smoke staging com operador Financeiro

## Rollback

1. Reverter página para placeholder ou esconder link no hub  
2. Policy no banco permanece (defaults seguros se reset via “Restaurar padrão” + Salvar)  
3. Engine OFF continua legado  

## Arquivos

- `src/pages/superadmin/billing2/SuperAdminBilling2CollectionPolicyPage.tsx`
- `src/lib/billing2/collectionPolicyForm.ts` (+ testes)
- `packages/backend/src/controllers/superadminBillingController.ts` (meta `updated_*` / `last_audit_id`)
