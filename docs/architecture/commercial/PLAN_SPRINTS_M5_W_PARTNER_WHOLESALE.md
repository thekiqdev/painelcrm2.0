# Plano de sprints — M5-W Partner Wholesale (Platform → Partner)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-08 |
| **Tipo** | Plano de implementação (produto + arquitetura + sprints) |
| **Base** | [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) (S0–S7 feitos) · Billing SaaS Platform · `partner_license_pool` |
| **Nome** | **M5-W — Partner Wholesale** (planos atacado + licenças avulsas + renovação) |
| **Escopo** | Relação comercial **Platform → Partner**: catálogo de planos que o Partner **contrata**; Super Admin **atrelar** Partner a plano; Partner **comprar licenças avulsas**; cobrança/renovação via Asaas **Platform** creditando o pool |
| **Fora de escopo** | Alterar checkout WL do cliente final · `revenue_share` · NF (D19) · L2 · mudar modelo 1 licença = 1 usuário |
| **Status** | **Sprint 4 feita** (2026-09-08) · MVP wholesale fechado |
| **MVP** | **Sprint 4** (renovação + política de inadimplência mínima) |
| **Kickoff** | Em chat: sprints M5-W concluídas |

| Sprint | Doc / foco | Status |
|--------|------------|--------|
| **Sprint 1** | Catálogo atacado + schema + desacoplar criação do Partner | **Feito** |
| **Sprint 2** | Admin atrela + Partner contrata plano (checkout Platform) | **Feito** |
| **Sprint 3** | Licenças avulsas (self-serve) + ledger | **Feito** |
| **Sprint 4** | Renovação, inadimplência MVP, relatório, migração legado | **Feito** |

---

## 1. Meta

Fechar o fluxo de dinheiro **Platform ← Partner** que o M5 §8.2 descreveu e o código ainda não cobra:

1. **Super Admin cria planos atacado** (ex.: “50 seats / mês”) para o Partner **contratar** — em vez de nascer “já com seats” sem pagamento.
2. **Super Admin pode atrelar** um Partner a um plano (cortesia, trial interno, ou já pago fora).
3. **Partner pode comprar licenças avulsas** (top-up) pelo painel.
4. **Renovação** do plano atacado reutiliza o motor SaaS (`subscriptions` + `recurringBillingJob` + Asaas Platform).
5. Seats creditados em `partner_license_pool` continuam alimentando o canal já pronto (sell plans → cliente final).

**Princípio:** Gateway **Platform** cobra o Partner. Gateway **Partner** continua cobrando só o cliente final (S3/S7 — sem mudança).

---

## 2. Diagnóstico — como está hoje

| Peça | Comportamento atual | Gap vs M5-W |
|------|---------------------|-------------|
| Criação Partner | Super Admin define `plan_id` (envelope) + `purchased_seats` + `unit_cost_cents` **sem cobrança** | Seats não são “contratados”; são alocados na mão |
| Planos Super Admin | Catálogo `plans` = SaaS direto + envelope técnico | Não há catálogo **atacado Partner** |
| Atrelar Partner ↔ plano comercial | Só envelope + patch manual de seats | Sem subscription Platform→Partner |
| Licenças no painel Partner | `GET /api/partner/licenses` read-only (“solicite ao Super Admin”) | Sem self-serve |
| Top-up | `PATCH ... add_seats` (admin) | Sem invoice / Asaas |
| Renovação pool | Inexistente | `unit_cost_cents` só projeção/comissão |
| Cliente final (canal) | Checkout + renovação no Asaas **do Partner** | **Já ok** — não mexer |

**Conclusão:** reaproveitar billing V2 Platform + pool existente. Construir **SKU atacado**, **checkout Platform→Partner** e **crédito de seats**.

---

## 3. Visão do fluxo (fechado)

```
┌─ Super Admin ─────────────────────────────────────────────┐
│ · CRUD planos atacado (seats, preço, intervalo, envelope) │
│ · Cria Partner (pool 0 ou grant explícito)                │
│ · Opcional: atrela Partner → plano (cortesia / cobrança)  │
└────────────────────────────┬──────────────────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────┐
│ Partner                                                   │
│ A) Contrata plano atacado (Asaas Platform)                │
│ B) Compra licenças avulsas (one-shot)                     │
│    pagamento OK → partner_license_pool.purchased_seats++  │
│    + partner_license_ledger                               │
└────────────────────────────┬──────────────────────────────┘
                             │ renovação (job existente)
┌────────────────────────────▼──────────────────────────────┐
│ plan_renewal no tenant Partner (gateway Platform)         │
│ pago → mantém seats do pacote                             │
│ inadimplente → grace → freeze novas vendas/users (MVP)    │
└────────────────────────────┬──────────────────────────────┘
                             │ (já pronto — M5 S3–S7)
┌────────────────────────────▼──────────────────────────────┐
│ Partner revende (partner_sell_plans) + Asaas próprio      │
│ Cliente final · pool consome 1 seat = 1 user              │
└───────────────────────────────────────────────────────────┘
```

### Três significados de “plano” (não misturar)

| Nome | Tabela / conceito | Quem compra | Quem cobra |
|------|-------------------|-------------|------------|
| **Plano Platform (direto)** | `plans` SaaS | Tenant venda direta | Platform |
| **Plano atacado (wholesale)** | novo catálogo M5-W | **Partner** | **Platform** |
| **Plano de venda (sell plan)** | `partner_sell_plans` | Cliente final | **Partner** |
| **Envelope** | `plans` / `tenant_plan` no Partner | — | Limites técnicos do painel Partner / customers |

---

## 4. Decisões de produto — **fechadas neste plano**

| ID | Decisão | Fechado |
|----|---------|---------|
| **W1** | Gateway que cobra o Partner | **Sempre Platform** (Asaas global). Partner Asaas = só cliente final |
| **W2** | Modelo MVP | **Plano base (recorrente) + top-up avulso (one-shot)** |
| **W3** | Top-up na renovação | Avulsas **permanecem** no pool; renovação do plano **mantém** seats do pacote (não duplica included) |
| **W4** | Partner sem plano ativo | **Permitido** (setup marca/gateway); pool pode ser 0 |
| **W5** | Criação Partner | **Não exige** mais `purchased_seats ≥ 1` pago; grant/cortesia explícito ou 0 |
| **W6** | Unidade | Continua **1 licença = 1 usuário** (D20) |
| **W7** | Preço avulso | Do wholesale plan (`unit_overage_cents` / pack) ou fallback `partner_license_pool.unit_cost_cents` |
| **W8** | Inadimplência MVP | Grace → bloqueia **novas** vendas / novos users; **não** derruba customer_tenants de imediato |
| **W9** | Admin atrelar | Pode **grant** (sem Asaas) ou **gerar cobrança** (mesmo activate path) |
| **W10** | Ledger | Todo crédito/débito de seats passa por `partner_license_ledger` |

### Aberto (decidir na Sprint 1 se aparecer bloqueio)

| ID | Tema | Default sugerido |
|----|------|------------------|
| **WA1** | Packs fixos (`+10/+50`) vs qty livre | Packs + qty livre limitada |
| **WA2** | Nome da tabela | `partner_wholesale_plans` (preferido) vs flag em `plans` |
| **WA3** | Trial atacado (N dias) | Fora do MVP; só grant admin |

---

## 5. Modelo de dados (draft)

### 5.1 `partner_wholesale_plans` (novo)

| Campo | Uso |
|-------|-----|
| `id`, `name`, `slug`, `status` | Catálogo Super Admin |
| `seats_included` | Seats do ciclo ao ativar/renovar o pacote |
| `price_cents`, `interval` | Ex.: monthly |
| `envelope_plan_id` | FK `plans` — limites técnicos ao ativar |
| `unit_overage_cents` | Preço seat avulso (nullable) |
| `metadata` | Extensível |

### 5.2 Vínculo Partner

Em `partner_profiles` (ou tabela `partner_wholesale_subscriptions`):

| Campo | Uso |
|-------|-----|
| `wholesale_plan_id` | Plano atacado atual |
| `wholesale_subscription_id` / uso de `subscriptions` do tenant Partner | Renovação |
| `wholesale_status` | `none \| active \| past_due \| canceled` |

### 5.3 `partner_license_ledger` (novo)

| Campo | Uso |
|-------|-----|
| `partner_tenant_id`, `delta_seats`, `reason` | `grant`, `plan_activate`, `plan_renewal`, `topup_purchase`, `clawback`, `admin_adjust` |
| `billing_id` / `external_ref` | Rastreio Asaas |
| `actor_user_id`, `created_at` | Auditoria |

### 5.4 Reuso

- `partner_license_pool.purchased_seats` — saldo efetivo (fonte para enforcement)
- `tenant_billing` + `subscriptions` — cobrança/renovação Platform
- `payment_gateway_configs` **scope Platform** — cobrança do Partner

---

## 6. Fluxos de dinheiro

### 6.1 Partner contrata plano atacado

```
Partner escolhe wholesale plan
  → createInvoice (tenant = Partner, gateway = Platform)
  → paga (PIX/boleto/cartão Asaas Platform)
  → activatePlanFromBilling (+ hook wholesale)
       · ledger: plan_activate +seats_included
       · pool.purchased_seats := política do plano (set included + topups já comprados)
       · envelope tenant_plan := envelope_plan_id
       · subscriptions.amount_cents snapshot
```

### 6.2 Admin atrela

```
Super Admin → assign wholesale plan
  · mode=grant  → mesmo activate sem cobrança (ledger grant)
  · mode=charge → cria billing e segue 6.1
```

### 6.3 Licenças avulsas

```
Partner → purchase N seats / pack
  → invoice one-shot (billing_reason topup)
  → pago → ledger topup_purchase → purchased_seats += N
```

### 6.4 Renovação

```
recurringBillingJob (já existe)
  → plan_renewal no Partner
  → pago → ledger plan_renewal (confirma seats do pacote; não soma included de novo se já creditados)
  → falha → wholesale_status=past_due → após grace: freeze canal (W8)
```

### 6.5 Cliente final (inalterado)

```
Cliente → Asaas Partner → sell plan → consome pool (assertPartnerPoolAllowsNewUser)
```

---

## 7. Sprints

> Em chat, iniciar cada uma com: **`ok sprint 1`**, **`ok sprint 2`**, …

---

### Sprint 1 — Catálogo atacado + schema + criação Partner

| Campo | Valor |
|-------|-------|
| **Objetivo** | Admin cria planos para Partners contratarem; Partner deixa de nascer “já licenciado” por obrigação |
| **Deps** | M5 S1–S3 (pool + profiles) |

**Entregas**

- Migration: `partner_wholesale_plans` (+ índices / status)
- Migration: campos de vínculo em `partner_profiles` (ou tabela satélite) + `partner_license_ledger`
- APIs Super Admin: CRUD wholesale plans
- UI Super Admin: lista/form planos atacado
- Ajuste `createPartner`:
  - `purchased_seats` pago **não obrigatório**
  - grant inicial opcional (`initial_seats` + reason `grant`) via ledger
  - envelope técnico continua selecionável
- Docs: decisões WA1–WA3 se surgirem

**DoD Sprint 1**

- [x] Super Admin cria/edita/desativa plano atacado
- [x] Partner novo pode nascer com pool 0
- [x] Grant manual de seats gera linha no ledger e atualiza pool
- [x] Testes schema + service mínimos

**Entregue (2026-09-08)**

- Migration `329_partner_wholesale_s1.sql`
- APIs `/api/superadmin/partner-wholesale-plans` + ledger em `/api/superadmin/partners/:id/license-ledger`
- UI `/superadmin/partner-wholesale-plans`
- `createPartner` / `add_seats` via `partner_license_ledger`

---

### Sprint 2 — Atrelar + contratar plano (checkout Platform)

| Campo | Valor |
|-------|-------|
| **Objetivo** | (B) Admin atrela; Partner contrata plano atacado e recebe seats |
| **Deps** | Sprint 1 |

**Entregas**

- `POST /api/superadmin/partners/:id/wholesale/assign` (`mode=grant|charge`)
- UI Super Admin no detalhe do Partner: selecionar plano + atrelar
- Partner: tela “Plano Platform” / contratar
- `POST /api/partner/wholesale/subscribe` → billing Platform
- Hook pós-pagamento: activate wholesale (ledger + pool + envelope + subscription)
- Reuso máximo de `subscribePlan` / `createInvoice` / `activatePlanFromBilling`

**DoD Sprint 2**

- [x] Admin grant ativa seats sem Asaas
- [x] Partner paga plano e pool sobe para `seats_included`
- [x] Network/billing usa gateway Platform (não o Asaas do Partner)
- [x] Testes do activate path (unit / integração leve)

**Entregue (2026-09-08)**

- Migration `330_partner_wholesale_s2.sql` (`partner_wholesale` billing_reason + `wholesale_subscription_id`)
- `POST /api/superadmin/partners/:id/wholesale/assign` (`grant` | `charge`)
- `POST /api/partner/wholesale/subscribe` + catálogo/status/billing (checkout Asaas **Platform**)
- Hook `activatePlanFromBilling` → `activatePartnerWholesaleFromBilling` (ledger `plan_activate`)
- UI Super Admin (detalhe Partner) + Partner `/partner/platform-plan`

**Fora:** top-up avulso self-serve; job de renovação (só snapshot subscription ok).

---

### Sprint 3 — Licenças avulsas (self-serve)

| Campo | Valor |
|-------|-------|
| **Objetivo** | (C) Partner compra seats avulsos |
| **Deps** | Sprint 2 |

**Entregas**

- `POST /api/partner/licenses/purchase` (qty ou `pack_id`)
- Invoice one-shot + webhook → ledger `topup_purchase` → `add_seats`
- UI Partner Licenças: comprar + histórico (ledger)
- Super Admin `add_seats` passa a escrever ledger (`admin_adjust` / `grant`)
- Validação: não comprar se Partner `past_due` (opcional nesta sprint; obrigatório na 4)

**DoD Sprint 3**

- [x] Partner compra pack/qty e seats sobem após pagamento
- [x] Histórico visível no painel Partner
- [x] Admin adjust também audita no ledger
- [x] Tela deixa de ser só “solicite ao Super Admin”

**Entregue (2026-09-08)**

- Migration `331_partner_license_topup_s3.sql` (`billing_reason=partner_license_topup`)
- `POST /api/partner/licenses/purchase` + quote/ledger/billing (Asaas **Platform**)
- Hook `activatePartnerLicenseTopupFromBilling` → ledger `topup_purchase`
- UI Partner Licenças: packs + qty + PIX + histórico
- `patchPartner` `add_seats`/`purchased_seats` → ledger (`grant` / `admin_adjust`)

**Fora:** renovação automática de top-up (top-up = permanente / one-shot).

---

### Sprint 4 — Renovação + inadimplência + relatório + legado

| Campo | Valor |
|-------|-------|
| **Objetivo** | Ciclo completo até renovar; política mínima de atraso; Partners antigos |
| **Deps** | Sprint 2–3 |

**Entregas**

- Renovação wholesale via `recurringBillingJob` + ledger `plan_renewal` (política W3)
- `wholesale_status` + grace + freeze: bloqueia novas vendas / novos users se `past_due` pós-grace
- Relatório Super Admin: Partner, plano, seats used/purchased, próximo vencimento, status
- Migração: Partners com seats manuais → `grant_source=legacy_manual` + opcional amarrar a plano “legado”
- Testes de renovação / past_due

**DoD Sprint 4**

- [x] Ciclo pago mantém direito aos seats do pacote
- [x] Falha de pagamento → grace → freeze canal (sem apagar customers)
- [x] Relatório operacional Super Admin
- [x] Partners legados não quebram (pool continua válido)

**Entregue (2026-09-08)**

- Migration `332_partner_wholesale_s4.sql` (legado-manual + `wholesale_past_due_at`)
- Renovação: `plan_renewal` → ledger `plan_renewal` delta **0** (W3) + `wholesale_status=active`
- Past due: dunning `grace.elapsed` + `markSubscriptionPastDue` → freeze; clear no pagamento
- Freeze: `assertPartnerChannelGrowthAllowed` em novos users / publish sell plans
- `GET /api/superadmin/partners/wholesale-report` + UI `/superadmin/partner-wholesale-report`

**Fora:** clawback agressivo, dunning avançado, NF, `revenue_share`.

---

## 7b. Extensão — Bloqueio configurável + paywall (pós-MVP)

| Sprint | Foco | Status |
|--------|------|--------|
| **Block S1** | Setting `partner_wholesale_block_after_days` + dunning/past_due usa N (não due_date) | **Feito** (2026-09-10) |
| **Block S2** | Paywall painel Partner → pagar faturas Platform abertas | **Feito** (2026-09-10) |
| **Block S3** | Auditoria, e-mail aviso, override por Partner, relatório | **Feito** (2026-09-10) |

### Block Sprint 1 — DoD

- [x] Setting Super Admin (default 3, clamp 0–90) em `superadmin_settings`
- [x] Elegibilidade: `CURRENT_DATE - due_date >= N` (não bloqueia no vencimento)
- [x] Dunning marca `past_due` quando `days >= N` (independente do grace SaaS genérico)
- [x] API GET/PUT `/api/superadmin/partner-wholesale-plans/settings/block` + sync
- [x] UI card em `/superadmin/partner-wholesale-plans`
- [x] Freeze de crescimento existente continua; paywall = Block S2

**Kickoff chat:** `ok sprint 1` (contexto bloqueio Partner)

### Block Sprint 2 — DoD

- [x] `GET /api/partner/me` expõe `wholesale_status`
- [x] `GET /api/partner/wholesale/status` → `open_invoices` + `paywall_active`
- [x] Middleware `requirePartnerWholesaleNotFrozen` em mutações de crescimento
- [x] Layout Partner: badge + banner; admin redirect para `/partner/platform-plan`
- [x] Tela Regularizar: lista faturas Platform + PIX/boleto; libera só pagamento / identidade
- [x] Testes paywall helpers

**Kickoff chat:** `ok sprint 2` (paywall Partner)

### Block Sprint 3 — DoD

- [x] Auditoria `partner_wholesale.past_due` / `past_due_cleared` em `billing_audit_events`
- [x] E-mail best-effort ao admin do Partner ao marcar past_due (SMTP; fail-open)
- [x] Override `partner_profiles.wholesale_block_after_days` (NULL = global) + PATCH Super Admin
- [x] Relatório wholesale: coluna bloqueio efetivo (override|global)
- [x] Dunning tenta mark em qualquer overdue; elegibilidade usa N efetivo por Partner
- [x] Migration `334_partner_wholesale_block_s3.sql`

**Kickoff chat:** `ok sprint 3` (polish bloqueio)

---

## 8. APIs (alvo)

### Super Admin

| Método | Rota | Sprint |
|--------|------|--------|
| CRUD | `/api/superadmin/partner-wholesale-plans` | 1 |
| GET/PUT | `/api/superadmin/partner-wholesale-plans/settings/block` | Block S1 |
| POST | `/api/superadmin/partner-wholesale-plans/settings/block/sync` | Block S1 |
| POST | `/api/superadmin/partners/:id/wholesale/assign` | 2 |
| GET | `/api/superadmin/partners/wholesale-report` | 4 |
| PATCH | `/api/superadmin/partners/:id` (`add_seats` → ledger) | 3 (ajuste) |

### Partner

| Método | Rota | Sprint |
|--------|------|--------|
| GET | `/api/partner/wholesale/plans` (catálogo ativo) | 2 |
| GET | `/api/partner/wholesale/me` | 2 |
| POST | `/api/partner/wholesale/subscribe` | 2 |
| POST | `/api/partner/licenses/purchase` | 3 |
| GET | `/api/partner/licenses/ledger` | 3 |

### Público / billing

- Reuso webhooks Asaas Platform e activate — **sem** rota pública nova de canal WL.

---

## 9. Arquivos âncora (reuso)

| Área | Path |
|------|------|
| Criação Partner | `packages/backend/src/partner/partnerAdminService.ts` |
| Pool | `packages/backend/src/partner/partnerLicenseService.ts` |
| Sell plans / piso | `packages/backend/src/partner/partnerSellPlanService.ts` |
| Checkout cliente | `packages/backend/src/partner/partnerChannelSignupService.ts` |
| Gateway resolve | `packages/backend/src/services/paymentGatewayConfigService.ts` |
| Billing / renew | `invoiceService` · `subscriptionService` · `recurringBillingJobService` |
| UI Admin Partner | `src/pages/superadmin/SuperAdminPartner*.tsx` |
| UI Partner | `src/pages/partner/*` (Licenses, Plans, …) |
| Plano-mãe | [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) |

---

## 10. Ordem de execução em chat

1. **`ok sprint 1`** — catálogo + schema + createPartner  
2. **`ok sprint 2`** — atrelar + contratar  
3. **`ok sprint 3`** — licenças avulsas  
4. **`ok sprint 4`** — renovação + freeze + relatório  

Ao concluir cada sprint: marcar DoD neste doc (checkboxes) e, se útil, abrir `SPRINT_M5_W_S{n}_….md` no mesmo estilo das S0–S7.

---

## 11. Riscos

1. Confundir envelope `plan_id` com wholesale plan → UI e nomes devem ser explícitos (“Plano técnico” vs “Plano atacado”).
2. Cobrar Partner no gateway **dele** por engano → sempre resolver gateway Platform no activate wholesale.
3. Renovação somar `seats_included` de novo a cada ciclo → política W3 + testes.
4. Partners legados com seats “de graça” → migração Sprint 4 obrigatória antes de exigir assinatura.
5. Freeze mal calibrado derrubar operação do cliente final → só bloquear **crescimento** no MVP (W8).
