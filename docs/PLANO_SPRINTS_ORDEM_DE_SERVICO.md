# Plano de sprints — Ordem de Serviço

**Data:** 28/10/2026  
**Base:** [`INVESTIGACAO_ORDEM_DE_SERVICO.md`](./INVESTIGACAO_ORDEM_DE_SERVICO.md)  
**Objetivo:** entregar Ordem de Serviço completa para o cliente do tenant (criação → visita → PDF → assinatura → fatura), reutilizando agenda, catálogo, faturas e o padrão de assinatura online.

---

## 1. Visão da entrega

```
[Criar OS] → [Cliente + período + itens] → [Visita técnica ± Google]
     → [PDF/página A4] → [Assinatura online] → [Fatura auto | botão]
```

**Fora da v1 (backlog explícito):** baixa de estoque, múltiplas visitas, upload PDF livre tipo contratos `pdf_signature`, sync Google two-way, endereço completo no cadastro de clientes (pode ser sprint paralelo).

---

## 2. Premissas e decisões travadas para o plano

| ID | Decisão | Valor no plano |
|----|---------|----------------|
| D1 | Domínio próprio | Tabelas `service_orders*` — não misturar com `contracts` |
| D2 | Documento v1 | HTML A4 → PDFKit (layout do PDF anexo) |
| D3 | Assinatura | Padrão tokens/view/sign dos contratos; cliente (+ técnico opcional) |
| D4 | Faturamento | `billing_mode`: `none` \| `manual` \| `auto_on_sign` |
| D5 | Visita | `POST /api/appointments` + `service_order_id`; checkbox Google |
| D6 | Itens | Tabela `service_order_items` com `kind` + snapshot; catálogo opcional |
| D7 | Feature | Flag `service_orders` + módulo de permissões |
| D8 | Duração sprint | ~1 semana de foco (5–8 dias úteis) por sprint |

---

## 3. Quantidade de sprints recomendada

| Pacote | Sprints | Resultado |
|--------|---------|-----------|
| **MVP operacional** (criar OS, itens, PDF interno, listagem) | **S0–S2** (3) | Time usa OS internamente sem assinatura/fatura |
| **Cliente final** (assinatura + envio + PDF público) | **S3–S4** (2) | Cliente recebe e assina |
| **Financeiro + visita Google** | **S5–S6** (2) | Fatura auto/manual + marcar agenda ± Google |
| **Hardening / go-live** | **S7** (1) | Permissões, QA, flag rollout |

### Recomendação oficial: **8 sprints (S0–S7)**

- Equipe pequena (1–2 devs full-stack): ~**8–10 semanas**.
- Se priorizar só MVP interno: parar após **S2** e retomar S3+.
- Se já houver pressão comercial por cobrança: manter ordem; **não** pular S3 (assinatura) antes de S5 — o gancho `auto_on_sign` depende do fluxo de assinatura.

```
S0 Inventário/ADR ✅  S1 Schema+API ✅   S2 UI criação/lista ✅
S3 PDF A4 ✅          S4 Assinatura ✅   S5 Fatura ✅
S6 Agenda/Google ✅   S7 Hardening ✅
```

---

## 4. Detalhamento por sprint

### Sprint 0 — Kickoff técnico e ADR (0,5–1 sprint) — **FEITO** (2026-10-28)

| Campo | Conteúdo |
|-------|----------|
| **Objetivo** | Congelar layout do PDF, schema draft, event keys, feature flag nome, critérios de aceite. |
| **Entregas** | ✅ [`service-orders/ADR_OS_S0_DECISOES.md`](./service-orders/ADR_OS_S0_DECISOES.md) · ✅ [`MERGE_FIELDS_OS.md`](./service-orders/MERGE_FIELDS_OS.md) · ✅ [`wireframe/ordem_servico_a4.html`](./service-orders/wireframe/ordem_servico_a4.html) · ✅ [`SPRINT_OS_S0_NOTES.md`](./service-orders/SPRINT_OS_S0_NOTES.md) |
| **Dependências** | Investigação (este pacote). |
| **Critérios de aceite** | ✅ D1–D12 + checklist tenant-scope; wireframe e merge fields publicados. |
| **Risco** | Baixo. |

---

### Sprint 1 — Schema, API CRUD e permissões base — **FEITO** (2026-10-28)

| Campo | Conteúdo |
|-------|----------|
| **Objetivo** | Persistência multi-tenant + API autenticada mínima. |
| **Backend** | ✅ `360_service_orders_module.sql` · service/controller/routes · `serviceOrdersAuth` · MODULE_IDS · permission catalog |
| **Frontend** | ✅ `src/services/serviceOrders.ts` + `src/types/serviceOrders.ts` (sem menu) |
| **Notas** | [`service-orders/SPRINT_OS_S1_NOTES.md`](./service-orders/SPRINT_OS_S1_NOTES.md) |
| **Critérios de aceite** | ✅ CRUD + numeração + totais; itens no create/patch |
| **Risco** | Médio (migração). Rollback: desligar feature no plano + não expor menu. |

**Endpoints**

- `GET/POST /api/service-orders`
- `GET/PATCH/DELETE /api/service-orders/:id` (itens no body create/patch)

---

### Sprint 2 — UI criação, listagem e detalhe (sem público) — **FEITO** (2026-10-28)

| Campo | Conteúdo |
|-------|----------|
| **Objetivo** | Fluxo interno usável: buscar cliente, período, serviços/produtos manuais ou catálogo. |
| **Frontend** | ✅ páginas + `ServiceOrderForm` + `ServiceOrderItemsEditor` · menu desktop/mobile · i18n |
| **Notas** | [`service-orders/SPRINT_OS_S2_NOTES.md`](./service-orders/SPRINT_OS_S2_NOTES.md) |
| **Critérios de aceite** | ✅ criar / listar / filtrar / editar draft / totais |
| **Risco** | Médio (UX). |

---

### Sprint 3 — Documento A4 + PDF download (painel) — **FEITO** (2026-10-28)

| Campo | Conteúdo |
|-------|----------|
| **Objetivo** | Página/PDF visualmente alinhada ao modelo anexo. |
| **Backend** | ✅ `serviceOrderDocumentModel` + `serviceOrderPdfService` · `GET /:id/document` · `GET /:id/pdf` |
| **Frontend** | ✅ preview A4 + baixar PDF no detalhe |
| **Notas** | [`service-orders/SPRINT_OS_S3_NOTES.md`](./service-orders/SPRINT_OS_S3_NOTES.md) |
| **Critérios de aceite** | ✅ blocos do modelo (cabeçalho → assinaturas) |
| **Risco** | Médio (fidelidade visual). |

---

### Sprint 4 — Assinatura online + links públicos + notificação — **FEITO** (2026-10-28)

| Campo | Conteúdo |
|-------|----------|
| **Objetivo** | Cliente (e opcionalmente técnico) assina fora do painel. |
| **Backend** | ✅ `361_service_orders_signature.sql` · send/revoke/reissue · rotas públicas view/sign · `service_order.sent`/`signed` · snapshot HTML com PNG |
| **Frontend** | ✅ `/service-order-view/:token`, `/service-order-sign/:token`; SignaturePad; Enviar / Reenviar / Revogar / Reemitir |
| **Notas** | [`service-orders/SPRINT_OS_S4_NOTES.md`](./service-orders/SPRINT_OS_S4_NOTES.md) |
| **Critérios de aceite** | ✅ view só lê; sign coleta; status `signed`; rate limit; hash isolation |
| **Risco** | **Alto** (superfície pública) — mitigações espelhadas de contratos. |

---

### Sprint 5 — Pagamento: botão Gerar fatura + auto ao assinar — **FEITO** (2026-10-29)

| Campo | Conteúdo |
|-------|----------|
| **Objetivo** | Cobrar o cliente do tenant a partir da OS. |
| **Backend** | ✅ `362_customer_invoices_service_order_id.sql` · `serviceOrderInvoiceConversionService` · `POST /:id/convert-to-invoice` · hook `auto_on_sign` |
| **Frontend** | ✅ seção Faturamento + **Gerar fatura** + link fatura no painel; seletor `billing_mode` no form |
| **Notas** | [`service-orders/SPRINT_OS_S5_NOTES.md`](./service-orders/SPRINT_OS_S5_NOTES.md) |
| **Critérios de aceite** | ✅ manual; ✅ auto; ✅ 409/unique; ✅ preconditions gateway |
| **Risco** | Médio–alto (dinheiro). Testar Asaas sandbox. |

---

### Sprint 6 — Visita técnica + Agenda ± Google — **FEITO** (2026-10-29)

| Campo | Conteúdo |
|-------|----------|
| **Objetivo** | Marcar visita a partir da OS, com ou sem Google Calendar. |
| **Backend** | ✅ `363_appointments_service_order_id.sql` · `POST /:id/schedule-visit` · tipo `visit` · vínculo bidirecional |
| **Frontend** | ✅ **Marcar visita técnica** + checkbox Google/Meet + sync + `/agenda?appointment_id=` |
| **Notas** | [`service-orders/SPRINT_OS_S6_NOTES.md`](./service-orders/SPRINT_OS_S6_NOTES.md) |
| **Critérios de aceite** | ✅ Agenda + detalhe; ✅ Google off/on + retry |
| **Risco** | Médio (OAuth do criador ≠ técnico) — aviso no dialog. |

---

### Sprint 7 — Hardening, QA e go-live — **FEITO** (2026-10-29)

| Campo | Conteúdo |
|-------|----------|
| **Objetivo** | Produção segura e observável. |
| **Backend** | ✅ `service_orders` em `FEATURE_KEYS` · asserts send/signature/cancel/invoice · testes unit (token, conversion, catalog, features) · rate limit público (S4) |
| **Frontend** | ✅ RolePermissions extras OS · ClientProfile tab/nav/overview · i18n `serviceOrders` · empty states lista |
| **Ops** | ✅ [`RUNBOOK_SERVICE_ORDERS.md`](./service-orders/RUNBOOK_SERVICE_ORDERS.md) · rollout por flag de plano |
| **Notas** | [`service-orders/SPRINT_OS_S7_NOTES.md`](./service-orders/SPRINT_OS_S7_NOTES.md) |
| **Critérios de aceite** | ✅ Flag ligável por plano; ✅ perms granulares; ✅ ClientProfile; ✅ runbook; checklist QA manual abaixo |
| **Risco** | Baixo–médio. |

---

## 5. Checklist de aceite (go-live)

- [ ] Criar OS com busca de cliente e snapshot correto  
- [ ] Período de execução (entrada/saída) no PDF  
- [ ] Serviços do catálogo **e** manuais  
- [ ] Produtos do catálogo **e** manuais (com UND)  
- [ ] Totais serviços + produtos + geral  
- [ ] Preview + download PDF alinhado ao modelo  
- [ ] Enviar para assinatura → WhatsApp/e-mail com links  
- [ ] Assinatura pública persiste e trava edição indevida  
- [ ] Botão Gerar fatura → `/pay/:token` funcional  
- [ ] Modo auto ao assinar gera fatura uma única vez  
- [ ] Marcar visita com e sem Google  
- [ ] Isolamento multi-tenant e permissões  
- [ ] Feature desligável sem quebrar outros módulos  

---

## 6. Ordem de PRs sugerida (por sprint)

| Sprint | PR típico |
|--------|-----------|
| S1 | `feat(os): schema + CRUD API + module permissions` |
| S2 | `feat(os): list/create/detail UI + client/items` |
| S3 | `feat(os): A4 document + PDF endpoint` |
| S4 | `feat(os): public view/sign + notifications` |
| S5 | `feat(os): convert to customer invoice + auto_on_sign` |
| S6 | `feat(os): schedule technical visit + google flag` |
| S7 | `chore(os): hardening, tests, flag rollout` |

Evitar monólito único: cada sprint = 1–2 PRs mergeáveis com flag off.

---

## 7. Estimativa de esforço (orientação)

| Sprint | Dev-dias (1 fullstack) | Notas |
|--------|------------------------|-------|
| S0 | 2–3 | ADR + HTML estático |
| S1 | 4–6 | Schema + API |
| S2 | 5–7 | UI mais pesada |
| S3 | 4–6 | Layout PDF |
| S4 | 5–8 | Público + público |
| S5 | 4–6 | Reuso forte de propostas |
| S6 | 3–5 | Reuso forte de agenda |
| S7 | 3–5 | QA + polish |
| **Total** | **~30–46 dias** | ≈ **8 sprints** de 1 semana com buffer |

---

## 8. Dependências externas / config

| Item | Necessário para |
|------|-----------------|
| Gateway tenant (Asaas etc.) | S5 cobrança online |
| CPF/CNPJ no cliente | S5 preconditions |
| `ENABLE_GOOGLE_CALENDAR` + OAuth | S6 sync Google (opcional) |
| Templates notificação | S4 envio |
| Dados da empresa no tenant | Cabeçalho do PDF (S3) |

---

## 9. Backlog pós-v1 (não conta nos 8 sprints)

1. Endereço estruturado no cadastro `clients`  
2. Baixa de estoque ao concluir OS  
3. Várias visitas / técnicos  
4. Checklist / fotos de execução  
5. Modo `pdf_signature` (upload)  
6. Relatórios (OS por período, ticket médio, SLA entrada→saída)  
7. Automação Kanban/outbox (`service_order.signed` → workflows)  
8. Impressão térmica / variantes de layout por segmento  

---

## 10. Status e go-live

1. ✅ **S0–S7 concluídos** (módulo OS v1).  
2. **Go-live:** ligar `service_orders` no plano piloto → smoke checklist (§5) → expandir planos.  
3. **Ops:** [`service-orders/RUNBOOK_SERVICE_ORDERS.md`](./service-orders/RUNBOOK_SERVICE_ORDERS.md).  
4. Pós-v1: backlog §9 (não bloqueia go-live).  
5. ✅ **Ajustes pós-revisão S8–S9:** [`PLANO_AJUSTES_POS_S7_ORDEM_DE_SERVICO.md`](./PLANO_AJUSTES_POS_S7_ORDEM_DE_SERVICO.md).

---

*Documento vivo: notas por sprint em `docs/service-orders/SPRINT_OS_Sx_NOTES.md`.*
