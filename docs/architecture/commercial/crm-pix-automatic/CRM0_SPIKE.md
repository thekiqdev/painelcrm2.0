# CRM0 — Spike: investigação pré-implementação Pix Automático CRM

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Modo** | Só investigação / achados de código + docs Asaas — **sem** implementação nesta entrega |
| **Base** | [`AUDIT_CRM_PIX_AUTOMATIC_PIPELINE.md`](./AUDIT_CRM_PIX_AUTOMATIC_PIPELINE.md) · [`DECISIONS_CRM_PIX_AUTOMATIC.md`](./DECISIONS_CRM_PIX_AUTOMATIC.md) · [`SPRINTS_CRM_PIX_AUTOMATIC.md`](./SPRINTS_CRM_PIX_AUTOMATIC.md) |
| **Refs Asaas** | [FAQ Pix Automático](https://docs.asaas.com/docs/automatic-pix-faq) · [Eventos](https://docs.asaas.com/docs/eventos-para-pix-automatico) · [Implementação](https://docs.asaas.com/docs/pix-automatico-implementacao) |

---

## Verdict

**GO para iniciar CRM1** (código inerte, flag OFF).  
**NO-GO para piloto com pagamento real de clientes** até CRM5 incorporar a liquidação do 1º pagamento (lição SaaS) + G1/G2 (webhooks tenant).

Bloqueadores de runtime conhecidos (não bloqueiam começar CRM1):

1. **Webhooks tenant sem `PIX_AUTOMATIC_*`** na lista de provisionamento → auth nunca atualiza via webhook.
2. **Store SaaS hard-coded `type = 'saas'`** no upsert/opt-out → CRM não persiste auth sem ajuste (CRM1).
3. **Janela 2–10 dias úteis vs worker CRM com `generate_days` default 0** → instrução na renovação falha se cobrarmos no dia do vencimento.
4. **G10 — 1º pagamento órfão (incidente SaaS 2026-07-29):** `PAYMENT_RECEIVED` auto-gerado sem `externalReference`; liquidar também em `AUTHORIZATION_ACTIVATED` + lookup por `pixQrCodeId`. Detalhe obrigatório: [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md).

Elegibilidade Asaas (PJ, CNPJ ≥ 6 meses, etc.) **não se prova no código** — é checklist ops por conta tenant (sandbox/prod).

**Investigação adicional?** Não é necessária para arquitetura. Só smoke staging (conta Asaas tenant) durante CRM1/CRM5 — não um spike novo.
---

## 1. Webhook Asaas multi-tenant

### Como funciona hoje

| Peça | Achado |
|------|--------|
| Endpoint único | `POST /api/webhooks/asaas` (`asaasWebhookHandler`) |
| Autenticação | Header `asaas-access-token` comparado a **qualquer** `webhook_auth_token` ativo em `payment_gateway_configs` (`gateway_key = asaas`) — **sem filtro de scope** (platform + tenant entram na mesma lista) |
| Identificação da conta | Update de `last_webhook_received_at` / erro **por token** (ou fallback `externalReference` → `tenant_id` em erros) |
| Branch Pix Auto | Se `isAsaasPixAutomaticEvent(eventType)` → `handlePixAutomaticWebhookEvent` **antes** do path `PAYMENT_*`; responde 200 e marca `asaas_webhook_events` processed |
| Idempotência | `asaas_webhook_events` por `event_id` + `payload_hash` |

```text
N contas Asaas (1 por tenant + 1 plataforma)
  → cada uma com webhook URL = {PUBLIC_API}/api/webhooks/asaas
  → cada uma com authToken próprio
  → PainelCRM valida token ∈ conjunto de tokens ativos
  → PIX_AUTOMATIC_*: resolve auth por authorization_id em subscriptions
  → PAYMENT_*: resolve fatura via parser/externalReference / conciliation
```

### Gap crítico — eventos provisionados

`asaasIntegrationService.ASAAS_WEBHOOK_EVENTS` (connect + recreate webhook do **tenant**) contém **somente** `PAYMENT_*`:

```text
PAYMENT_CREATED, UPDATED, CONFIRMED, RECEIVED, OVERDUE, DELETED,
REFUNDED, RESTORED, REFUND_IN_PROGRESS, CHARGEBACK_* …
```

**Não inclui** nenhum `PIX_AUTOMATIC_RECURRING_*`.

Consequência: mesmo com handler pronto no código, **contas tenant conectadas pelo fluxo atual do painel não recebem** eventos de autorização/instrução, a menos que alguém cadastre os eventos manualmente no painel Asaas ou o código passe a incluí-los no `createWebhook` / recreate.

Lista necessária (código já conhece em `asaasEvents.ts`, exceto elegibilidade):

| Evento | No enum local? | No provisionamento tenant? |
|--------|----------------|----------------------------|
| `…_AUTHORIZATION_CREATED/ACTIVATED/CANCELLED/EXPIRED/REFUSED` | Sim | **Não** |
| `…_PAYMENT_INSTRUCTION_*` | Sim | **Não** |
| `PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED` | **Não** | **Não** |

### Handler vs entidades CRM

| Lookup atual | Tabela | Impacto CRM |
|--------------|--------|-------------|
| `getSubscriptionByPixAuthorizationId` | `subscriptions` **sem** filtro `type` | Webhook de status **pode** atualizar customer se a linha existir e o upsert tiver gravado |
| `upsertPixAutomaticAuthorization` / `markPixAutomaticUserOptedOut` | `WHERE … AND type = 'saas'` | **Bloqueia** persistência CRM até CRM1 |
| `findTenantBillingByPixAutomaticConciliation` / AuthId | **`tenant_billing` only** | 1º pagamento / conciliation **não** amarra `customer_invoices` hoje → CRM5 obrigatório |
| Liquidação paid | Path `PAYMENT_*` + attempts CRM | Continua válido se charge avulso/instrução criar payment com refs CRM |

### Auth token colisão / isolamento

- Tokens são por config; risco baixo se gerados aleatórios no connect.
- Evento PIX Auto **não** usa `externalReference` do payment para escolher tenant: usa **authorization_id** → subscription. IDs Asaas são globais por conta; colisão entre contas distintas é improvável.
- Se webhook PIX chegar **sem** auth id reconhecido → `handled: false` / no-op (não liquida CRM).

### Ação CRM0 / CRM5 (obrigatória)

1. Estender `ASAAS_WEBHOOK_EVENTS` (ou lista dedicada mergeada) com todos os `PIX_AUTOMATIC_RECURRING_*` (+ `ELIGIBILITY_UPDATED`).
2. Ops: **recreate webhook** nos tenants piloto (API já existe: `POST …/asaas/recreate-webhook`).
3. Handler: ao `ELIGIBILITY_UPDATED` / `INELIGIBLE` → marcar auths do tenant afetado (resolver tenant pelo token do header) e degradar para PIX avulso; **ainda não implementado**.
4. Lookup conciliation/auth/`pixQrCodeId` → `customer_invoices.gateway_metadata` **e** liquidação em `AUTHORIZATION_ACTIVATED` (ver [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md)).

---

## 1b. Incidente SaaS — não repetir no CRM (G10)

Em 2026-07-29 o 1º pagamento Pix Automático SaaS liquidou no Asaas mas **não** no PainelCRM:

- Cobrança automática nova, `externalReference` null, `paymentId` diferente do charge antigo.
- Conciliation veio como `pixQrCodeId`, não como `conciliationIdentifier`.
- `AUTHORIZATION_ACTIVATED` não marcava a fatura `paid`.
- Reenvio do webhook não recupera (idempotência).

Fix SaaS: branch `deploy-v1.1.4.23-automaticpix-fix1`.  
**No CRM:** regras R1–R6 em [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md) são critério de CRM5 / smoke piloto.
## 2. Elegibilidade Asaas (conta tenant)

### O que a Asaas exige (FAQ oficial)

- Conta **PJ** (PF inelegível)
- Conta aprovada, sem pendência cadastral
- CNPJ ativo na Receita
- CNPJ ativo há **≥ 6 meses**
- Sem flags de fraude relacionadas a Pix

Se a conta passar a `INELIGIBLE`: Asaas **cancela** autorizações e instruções ativas e emite `PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED`.

### O que o código prova hoje

| Item | Status |
|------|--------|
| Capability registry `pixAutomatic: true` (Asaas) | Existe; **não** usada no CRM |
| Probe automático “conta elegível?” | **Não** há GET/health de elegibilidade no backend |
| Sandbox vs produção | Mesmo client; elegibilidade é da **conta** Asaas do tenant |
| Spike SaaS (S0) | Checklist ops manual — mesmo padrão para CRM |

### Checklist ops por tenant piloto (preencher)

| Item | Sandbox | Produção | Status |
|------|---------|----------|--------|
| Gateway Asaas `scope=tenant` active | | | |
| Conta PJ + CNPJ ≥ 6 meses | | | |
| Pix Automático liberado (gerente Asaas se necessário) | | | |
| Webhook URL pública alcançável | | | |
| Eventos `PIX_AUTOMATIC_*` inscritos no webhook | | | |
| Teste: `POST /pix/automatic/authorizations` com api key do tenant | | | |
| Flag plataforma CRM OFF até GO | | | |

**NO-GO piloto** se autorização retornar 404/produto não habilitado ou conta PF.

---

## 3. Fatura avulsa vs `subscription_id`

### Comportamento atual

| Fluxo | Cria `subscriptions.type=customer`? | `customer_invoices.subscription_id` |
|-------|-------------------------------------|-------------------------------------|
| `createManualInvoice` | **Não** | null (salvo se caller ligar depois) |
| `createRecurringManualInvoice` | **Sim** (antes da 1ª fatura) | preenchido |
| Worker renovação | Usa sub existente | preenchido |
| Loja / alguns paths | Variável | pode ser null |

### Implicação Pix Auto (confirma D2)

SSOT auth = colunas `pix_automatic_*` em `subscriptions`.  
Fatura **avulsa** com toggle ON **precisa** de assinatura mínima (draft/one-shot/`trialing` ou equivalente CRM) **antes** do start auth — espelho Sprint A SaaS.

Sem isso: não há onde guardar `cleared` / opt-out persistente nem auth id reutilizável entre ciclos (e avulsa “pura” fica órfã no webhook).

**Decisão mantida:** na criação com Pix Auto ON → ensure `subscription_id` (criar sub customer se ausente) + metadata `pix_automatic_requested`.

Índice atual `idx_subscriptions_saas_pix_auto_auth` filtra `type = 'saas'` — CRM1 deve acrescentar índice/`WHERE type = 'customer'` (ou índice sem filtro de type só por auth id, que já existe parcialmente).

---

## 4. Janela 2–10 dias úteis × worker CRM

### Regra Asaas

Instrução (`createCharge` com `pixAutomaticAuthorizationId`) **somente** entre **2 e 10 dias úteis** antes do vencimento; fora disso a API rejeita.

### O que já existe (SaaS)

- `countBusinessDaysUntil` / `isWithinPixAutomaticInstructionWindow` em `billingPixAutomaticStore.ts` (seg–sex UTC; **sem** feriados nacionais).
- `createPixAutomaticInstructionForSubscription` só cobra se janela OK.
- Mapper Asaas já envia `pixAutomaticAuthorizationId` se o input trouxer.

### O que o CRM faz hoje

| Peça | Achado |
|------|--------|
| Antecipação de geração | `tenants.recurring_invoice_generate_days_before_due` — clamp **0–60** dias **civis**; **default 0** (gera no dia do vencimento) |
| Cap por intervalo | `effectiveRecurringGenerateDaysBeforeDue` limita ao tamanho do ciclo |
| `executeGatewayChargeForInvoice` | `createCharge` **sem** `pixAutomaticAuthorizationId` — sempre avulso |
| Due date do ciclo | `draft.due_date` / `next_billing_date` |

### Conflito prático

```text
Default CRM: generate_days = 0
  → fatura + charge no dia do vencimento
  → businessDaysUntil(due) ≈ 0
  → FORA da janela 2–10
  → instrução Pix Auto impossível nesse dia
```

Se o tenant configurar `generate_days = 5` (civis), em geral cai na janela em semanas “normais”, mas:

- dias civis ≠ dias úteis (feriados / pontes);
- `generate_days` muito alto (>10 úteis) também **sai** da janela.

### Recomendação de desenho (CRM4 — sem mudar arquitetura)

1. Reusar `isWithinPixAutomaticInstructionWindow` no path CRM.
2. Se auth `active` **e** na janela **e** flag ON → charge com `pixAutomaticAuthorizationId`.
3. Senão → charge PIX avulso (comportamento atual).
4. Ops / produto: para assinaturas com Pix Auto, sugerir (ou forçar no ensure) `generate_days_before_due` efetivo **≥ 2 e ≤ 10** em dias úteis — ou adiar o charge até entrar na janela (job já roda periodicamente; draft pode existir antes do charge).
5. Não inventar motor novo: branch no `gatewayExecutionService` / ponto já previsto em D5.

---

## 5. Valor fixo na autorização

### Código SaaS atual

`createPixAutomaticAuthorization` **sempre** envia `value` (+ `immediateQrCode.originalValue` / `value`).

### FAQ Asaas

- Com `value` na auth → valor **travado**; instruções seguintes não podem mudar o montante.
- Sem `value` → valor livre por instrução (consumo variável).

### Implicação CRM

| Caso | Abordagem v1 |
|------|----------------|
| Assinatura valor fixo (maioria) | OK — enviar `value` = amount da sub |
| Reajuste de preço | Cancelar auth + nova auth (já previsto no FAQ) |
| Valor variável por ciclo | **Fora da v1** ou auth sem `value` (mudança explícita no client) |

Manter paridade SaaS na v1 (valor fixo). Documentar no toggle: “valor da assinatura fica autorizado”.

---

## 6. Boleto / cartão × Pix Automático ON

| Achado | Detalhe |
|--------|---------|
| Pix Auto é produto **PIX** | Instrução e QR composto não substituem boleto |
| Worker | `resolveAutomaticInvoicePaymentMethod(default_payment_method, config)` pode devolver `BOLETO` / `CREDIT_CARD` |
| UI criação | `allowed_payment_methods` pode excluir PIX |

### Regras recomendadas (produto)

1. Toggle Pix Auto **só habilitado** se PIX ∈ métodos permitidos / gateway capability.
2. Se ON na criação → journey auth usa PIX (QR composto); outros métodos no `/pay` podem coexistir como no SaaS (switch), mas renovação automática via instrução **exige** path PIX + auth active.
3. Se `default_payment_method = BOLETO` e auth active → **não** forçar instrução Pix Auto; avulso boleto **ou** preferir PIX quando Pix Auto ON (decidir em CRM2/4: sugerido **preferir PIX** se auth active).

---

## 7. Copy / consentimento (médio — breve)

- SaaS já tem `PixAutomaticConsentSwitch` + helpers UX — **reuso** no `CustomerInvoicePay` (D4).
- Rótulo amigável PT-BR (evitar “authorizationId”, “conciliation”).
- Opt-out → `cleared` (não reaplicar default ON) — mesma regra SaaS Sprint C.
- Texto deve deixar claro: débito futuro na conta Pix do pagador na janela Asaas; primeiro pagamento autoriza.

Nada bloqueia CRM1; fechar copy em CRM3/CRM6.

---

## 8. Mapa de gaps → sprints

| # | Achado | Sprint |
|---|--------|--------|
| G1 | Provisionar eventos `PIX_AUTOMATIC_*` (+ eligibility) no webhook tenant | CRM0 / início CRM5 |
| G2 | Recreate webhook tenants piloto | Ops CRM0 |
| G3 | Store/upsert/opt-out sem `type='saas'` only; índice customer | CRM1 |
| G4 | Ensure subscription em fatura avulsa com Pix Auto | CRM2 (D2) |
| G5 | `/pay` start/cancel + restore PIX | CRM3 |
| G6 | Branch instrução + alinhamento `generate_days` × janela 2–10 | CRM4 |
| G7 | Lookup `customer_invoices` + **liquidar 1º pagamento** (PAYMENT *e* ACTIVATED) + paid cleanup ciclo; eligibility | CRM5 (**crítico** — ver G10) |
| G8 | Flag `crm.pix_automatic` (nome D6) default OFF | CRM0 |
| G9 | Valor fixo / boleto rules | CRM2–4 (produto) |
| G10 | Lição órfão SaaS: `pixQrCodeId`, ACTIVATED→paid, script órfão CRM | CRM5 + CRM6 ([`LESSONS_…`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md)) |

---

## 9. GO / NO-GO

| Critério | Resultado |
|----------|-----------|
| Arquitetura atual aguenta extensão (sem motor novo)? | **GO** — confirma audit |
| Código SaaS reutilizável (client, janela, UX, webhook branch)? | **GO** com adaptação store + CRM lookups + **fix1 liquidação** |
| Webhooks tenant prontos para Pix Auto hoje? | **NO-GO até G1/G2** |
| Elegibilidade Asaas genérica? | **Condicional** — checklist por tenant |
| Worker pronto para instrução? | **NO-GO até CRM4** (hoje só avulso; default days=0) |
| Liquidação 1º pagamento segura (lição G10)? | **NO-GO piloto até CRM5** com R1–R5 |
| Começar CRM1 (persistência + serviço com flag OFF)? | **GO** — inerte em produção |
| Precisa de nova investigação antes de CRM1? | **Não** — plano suficiente; smoke Asaas tenant durante implementação |

**Decisão:** liberar **CRM1 agora**. Tratar **G1/G2 + G10/CRM5** como pré-requisito do primeiro smoke staging com pagamento real. **CRM4** inclui política janela vs `generate_days`.

---

## 10. Próximo passo

1. Seed flag plataforma CRM (default OFF) — CRM0 resto.
2. **CRM1:** store customer + start auth contra `customer_invoices` (mock Asaas nos testes); persistir `conciliation_id` na sub e na fatura.
3. Em paralelo ops: piloto Asaas tenant + recreate webhook com eventos Pix Auto (G1/G2).
4. Ao chegar CRM5: aplicar integralmente [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md) (não “só espelhar store”).
