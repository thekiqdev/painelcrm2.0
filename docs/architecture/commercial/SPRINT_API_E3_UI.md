# API Etapa 3 — Tela para gerar e usar a chave — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-27 |
| **Etapa** | **3** (**feito**) |
| **Plano-mãe** | [`PLAN_IMPLANTACAO_API_CHAVES_LEAD.md`](./PLAN_IMPLANTACAO_API_CHAVES_LEAD.md) |
| **Anterior** | [`SPRINT_API_E2_CREATE_LEAD.md`](./SPRINT_API_E2_CREATE_LEAD.md) |
| **Próximo** | [`SPRINT_API_E4_GOLIVE.md`](./SPRINT_API_E4_GOLIVE.md) — flag ligada para todos |

---

## Objetivo

O admin do tenant gera, copia e revoga a chave em Configurações, sem chamar a API de gestão no escuro. Com a flag desligada, a secção não aparece.

---

## Entregas

| Peça | Onde |
|------|------|
| Menu | Configurações → Integrações → API, path `/settings/api` |
| Quem vê | Só `is_tenant_admin` e só se `GET /api/integrations/api-keys` responder 200. Flag off (404) esconde o item no desktop e no hub mobile. URL direta volta para `/settings` |
| Gerar | Nome + botão. O segredo abre num diálogo e some ao fechar |
| Lista | Nome, prefixo, criada em, último uso, ativa ou revogada |
| Revogar | Confirmação |
| Exemplo | `curl` de `POST /api/v1/leads` com os campos do contrato e `Idempotency-Key` |
| Textos | `settings.json` em pt-BR, en e es |

A flag `api.keys_v1` continua **off**. Por isso a secção fica oculta até o piloto da Etapa 4.

---

## DoD

- [x] Gerar mostra o segredo uma vez e oferece copiar
- [x] Lista não mostra o segredo
- [x] Revogar pede confirmação
- [x] `curl` aponta para `/api/v1/leads` com Bearer `pcrm_…`, o JSON do contrato e sem `user_id`
- [x] Flag off / não-admin escondem a secção

O fluxo logado no browser não foi exercido nesta etapa: o browser embutido não abriu `http://localhost:8081`. O app local responde nesse endereço. Com a flag off, o item de menu não deve aparecer.

---

## Seguinte

A Etapa 4 ligou `api.keys_v1` para todos os tenants. O admin da conta passa a ver Configurações → Integrações → API. Closeout: [`SPRINT_API_E4_GOLIVE.md`](./SPRINT_API_E4_GOLIVE.md).
