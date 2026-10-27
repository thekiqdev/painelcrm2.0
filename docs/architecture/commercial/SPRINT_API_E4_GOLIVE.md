# API Etapa 4 — Ligada para todos — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-27 |
| **Etapa** | **4** (**feito**) |
| **Plano-mãe** | [`PLAN_IMPLANTACAO_API_CHAVES_LEAD.md`](./PLAN_IMPLANTACAO_API_CHAVES_LEAD.md) |
| **Anterior** | [`SPRINT_API_E3_UI.md`](./SPRINT_API_E3_UI.md) |

---

## Decisão desta etapa

A flag `api.keys_v1` fica **ligada por padrão para todos os tenants**. O plano original falava em piloto; isso foi substituído: qualquer admin da conta vê Configurações → Integrações → API e pode gerar a chave. Quem não é admin continua sem a secção.

Um override no Super Admin ainda desliga a API de uma conta só. Não há kill switch `api.master_off`.

---

## Entregas

| Peça | Onde |
|------|------|
| Flag global | `database/init/357_api_keys_default_on.sql` (`default_enabled`, `rollout_type=global`, `rollout_percent=100`). A `355` também grava esses valores, para instalação nova |
| Log de uso | `logApiV1Request`: `key_id`, rota `POST /api/v1/leads`, `status`. Sem corpo, sem segredo, sem header |
| Limpeza | `purgeExpiredApiIdempotencyKeys` apaga `api_idempotency_keys` com mais de 24 h, com bypass de RLS, ao subir o servidor e de hora em hora |
| Checklist | §5 do plano-mãe |

---

## DoD

- [x] A flag resolvida com a linha do banco fica ligada para qualquer tenant sem override
- [x] O log da chamada de sucesso traz o id da chave e o status, e não o segredo nem o nome do lead
- [x] A limpeza apaga só linhas com `created_at` anterior a 24 h
- [x] Revogar continua a cortar a chamada seguinte (Etapa 1)

O clique logado em `http://localhost:8081/settings/api` não foi repetido nesta etapa. Com a flag ligada, o item aparece para o admin da conta.
