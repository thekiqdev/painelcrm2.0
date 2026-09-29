# TD Sprint 3 — UI Settings (seletor de uso) + Super Admin

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S3** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md`](./PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md) |
| **Anterior** | [`SPRINT_TD_S2_HOST_RESOLVE.md`](./SPRINT_TD_S2_HOST_RESOLVE.md) |
| **Próximo** | **S5** — Hardening |

---

## Entregas

### Settings (`DomainSection`)
- Stub removido
- Cards por papel: **Loja** (`store`) e **Abertura de chamados** (`support`)
- Salvar hostname, instruções DNS (TXT + CNAME), Verificar, Remover
- Pré-visualização “Abrir” quando `active`
- Empty / gate: `FEATURE_DISABLED`, `TENANT_NOT_ELIGIBLE`
- Confirmação ao substituir hostname
- **TD12** — “Mudar uso” com `AlertDialog` → `POST /api/me/tenant/domain/change-role` (DNS permanece)

### API (extra S3)
- `POST /api/me/tenant/domain/change-role` `{ from_role, to_role }`

### Super Admin
- Card em Configurações do cliente: lista `hostname` + `role` + `status` + clear
- Só relevante para `platform_customer` (mensagem se outro tipo)

### FE service
- `src/services/tenantDomain.ts`

---

## Como validar

1. Flag `tenant.custom_domain_v1` ON (e bypass DNS em dev)
2. Tenant admin → **Configurações → Domínio**
3. Configurar hostname Loja → Verificar → Abrir
4. Configurar outro hostname Chamados (ou Mudar uso com confirmação se o slot destino estiver livre)
5. Super Admin → Cliente → Configurações → card Domínios personalizados → Remover

---

## DoD S3

- [x] Admin configura sem Postman
- [x] Seletor / cards Loja \| Abertura de chamados
- [x] DNS + verify + clear
- [x] Troca de papel com confirmação (TD12)
- [x] Stub removido
- [x] Super Admin: hostname + role + status + clear

**Kickoff chat:** `ok sprint 3`
