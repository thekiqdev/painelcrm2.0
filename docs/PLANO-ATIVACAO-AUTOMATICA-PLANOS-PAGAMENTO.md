# Plano Técnico: Ativação Automática de Planos Após Pagamento

## 1. Contexto Atual

O projeto já possui:

- **Integração Asaas** via `gatewayProvider` / `gatewayResolver`
- **tenant_billing**: cobranças com `gateway`, `asaas_payment_id`, `asaas_status`, `idempotency_key`, `period_start`, `period_end`
- **handlePaymentEvent** no webhook Asaas: atualiza `tenant_billing` e chama `activatePlanForTenant`
- **activatePlanForTenant**: `UPDATE tenants SET plan_id, status = 'active'`
- **createTenantCharge** (Super Admin): calcula valor (standard vs custom), chama `gateway.createCharge`, insere em `tenant_billing`
- **plan_type**: `standard` (fixo) e `custom` (por usuário)
- **plan_interval_prices**: preço por usuário por intervalo (monthly, quarterly, semi_annual, yearly)
- **tenants.max_users_override**: quantidade contratada em planos custom

---

## 2. Objetivo da Evolução

| Funcionalidade | Estado atual | Objetivo |
|----------------|--------------|----------|
| Gerar fatura ao contratar | Super Admin manual | Cliente self-service ao escolher plano |
| Cobrança via gateway | ✅ | Manter, evoluir para self-service |
| Webhook confirmação | ✅ | Manter |
| Ativação automática | ✅ | Manter e estender |
| Planos fixos | ✅ | Manter |
| Planos por usuário | ✅ | Manter |

---

## 3. Modelo de Dados

### 3.1 Tabelas Existentes (a manter)

- **plans**: `plan_type`, `price_cents`, `billing_interval`, `max_users`, etc.
- **plan_interval_prices**: `plan_id`, `billing_interval`, `price_per_user_cents`
- **tenant_billing**: `tenant_id`, `plan_id`, `billing_interval`, `amount_cents`, `due_date`, `status`, `gateway`, `asaas_payment_id`, `asaas_status`, `idempotency_key`, `period_start`, `period_end`, `invoice_number`
- **tenants**: `plan_id`, `status`, `max_users_override`, `asaas_customer_id`

### 3.2 Ajustes Propostos no Schema

| Alteração | Motivo |
|-----------|--------|
| `tenant_billing`: adicionar `gateway_payment_id` (genérico) | Evitar coluna específica Asaas; permitir multi-gateway |
| `tenant_billing`: adicionar `users_count` (opcional) | Planos custom: quantidade de usuários na fatura |
| `tenant_billing`: adicionar `source` (`superadmin`, `self_service`, `api`) | Rastrear origem da cobrança |
| `tenant_billing`: adicionar `billing_reason` | Ver Melhoria 1 abaixo |
| `tenant_billing`: garantir `payment_method` | Ver Melhoria 2 abaixo |
| `tenants`: adicionar `plan_period_start`, `plan_period_end` | Ver Ponto 1 abaixo |
| `tenants`: adicionar `activated_billing_id` (FK para tenant_billing) | Ver Ajuste 2 abaixo |
| `tenants.status`: incluir `payment_pending` | Ver Ponto 2 abaixo |

**Nota:** `asaas_payment_id` pode permanecer por compatibilidade; `gateway_payment_id` seria um alias ou coluna unificada usada na busca do webhook.

---

### 3.2.1 Pontos que podem gerar problema no futuro

Não são erros — são situações comuns em SaaS que convém tratar desde o início.

#### ⚠️ 1. Controle de período ativo no tenant

**Hoje:** `tenant_billing` tem `period_start` e `period_end`, mas o tenant não guarda isso. A validação de acesso exigiria consultar billing.

**Sugestão:**
```
tenants
  plan_id
  plan_period_start   DATE    -- início do período ativo atual
  plan_period_end     DATE    -- fim do período ativo atual
  activated_billing_id  UUID  -- qual fatura ativou o plano atual (auditoria, suporte, disputas)
```

**Motivo:** Validar acesso com `IF plan_period_end < now() THEN bloquear` sem depender de consultar billing.

---

#### ⚠️ 2. Estado intermediário do tenant

**Hoje:** `tenant.status` aceita `active`, `suspended`, `trial`. Falta estado para checkout em andamento.

**Fluxo problemático:** tenant criado → fatura gerada → aguardando pagamento → poderia ser ativado acidentalmente.

**Sugestão:** Estender `tenant.status`:
```
trial
payment_pending   -- aguardando pagamento (fatura gerada, não paga)
active
suspended
```

Isso evita ativação acidental e permite diferenciar tenant que já pagou do que está no checkout.

---

#### ⚠️ 3. Controle de upgrade/downgrade

**Hoje:** O fluxo assume 1 fatura → ativa plano.

**Futuro:** Quando o cliente trocar de plano pode ser necessário:
- cancelar cobrança anterior (se pendente)
- criar nova billing

Pode ser resolvido depois, mas vale deixar preparado na modelagem (ex.: `billing_reason = 'plan_upgrade'`).

---

### 3.2.2 Melhorias recomendadas

#### 🔧 Melhoria 1 — billing_reason

Coluna em `tenant_billing`:

| Valor | Uso |
|-------|-----|
| `plan_purchase` | Primeira compra de plano |
| `plan_upgrade` | Upgrade de plano |
| `plan_renewal` | Renovação (futuro) |
| `manual_charge` | Cobrança manual pelo Super Admin |

Facilita relatórios e métricas.

---

#### 🔧 Melhoria 2 — payment_method

**Estado:** `tenant_billing` já possui `payment_method` (PIX, BOLETO, CREDIT_CARD).

**Ação:** Garantir que o valor enviado na criação da cobrança seja persistido e, no webhook, atualizar a partir do payload do Asaas (`payment.billingType` ou equivalente). Importante para métricas.

---

#### 🔧 Melhoria 3 — Índice para lookup no webhook

**Webhook faz:**
```sql
SELECT ... FROM tenant_billing WHERE gateway = 'asaas' AND asaas_payment_id = $1
```

**Estado:** Já existe índice composto em `(gateway, asaas_payment_id)`.

**Ação:** Se não existir índice dedicado em `asaas_payment_id`, criar:
```sql
CREATE INDEX idx_tenant_billing_payment ON tenant_billing(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;
```
Evita lentidão com milhares de cobranças.

---

#### 🔧 Melhoria 4 — Índice para listar faturas por tenant

Para consultas como “listar faturas do tenant”:

```sql
CREATE INDEX idx_tenant_billing_tenant_id ON tenant_billing(tenant_id);
```

Melhora performance em dashboards e relatórios por tenant.

---

#### 🔧 Melhoria 5 — Idempotência forte no webhook

Gateways costumam reenviar eventos. Ao receber `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED`:

**Antes de ativar:**
```sql
-- Verificar que ainda não foi processado
IF tenant_billing.status = 'paid' THEN
  RETURN; -- já processado, ignorar
END IF;
```

Fluxo recomendado:
1. Buscar billing por `asaas_payment_id`
2. Se `status = 'paid'` → retornar 200 sem processar (idempotente)
3. Atualizar `status = 'paid'`, `paid_at = now()`
4. Chamar `activatePlanForTenant`

---

#### 🔧 Melhoria 6 — Timeout de pagamento (opcional)

**Problema:** Se `tenant.status = payment_pending` e o cliente nunca paga, o registro fica órfão no banco.

**Regra sugerida:** Se `billing.created_at > 48h` e `tenant_billing.status = 'pending'` → cancelar (marcar como `cancelled`, reverter tenant para `trial` ou `suspended` conforme regra de negócio).

**Implementação:** Job/cron periódico que identifica cobranças pendentes antigas e aplica a regra. Opcional, mas evita acúmulo de lixo no banco.

---

### 3.3 Nova Tabela (opcional)

**tenant_subscriptions** (para assinaturas recorrentes futuras; fora do escopo inicial)

- No v1, **não criar**; usar apenas `tenant_billing` como fatura avulsa.
- Cada cobrança = 1 registro em `tenant_billing`; ativação = update em `tenants`.

### 3.4 Diagrama de Relacionamentos

```
tenants (1) ──< tenant_billing (N)
    │                    │
    ├── plan_id ─────────┼── plan_id ───> plans
    ├── plan_period_start│   users_count
    ├── plan_period_end  │   billing_reason
    ├── activated_billing_id ──> tenant_billing.id  (qual fatura ativou)
    ├── status           │   payment_method
    │   (trial |         │   period_start, period_end
    │    payment_pending│
    │    active |
    │    suspended)
    └── max_users_override
```

---

## 4. Fluxo de Criação da Assinatura / Fatura

### 4.1 Cenários

| Cenário | Quem | Quando |
|---------|------|--------|
| A | Super Admin | Cria cobrança manual para tenant existente |
| B | Cliente (self-service) | Escolhe plano no site, antes de ter conta |
| C | Cliente (self-service) | Escolhe plano no site, já tem conta (upgrade) |

### 4.2 Fluxo Detalhado (Cenário B e C)

```
1. Frontend: cliente escolhe plano + (se custom) quantidade de usuários
2. Frontend: envia POST /api/plan-purchase ou /api/me/tenant/subscribe
   Body: { plan_id, billing_interval?, users_count? }
3. Backend:
   a) Resolver tenant (já logado → req.tenantId; não logado → criar tenant em status `payment_pending`)
   b) Validar plano (existe, ativo, não is_free sem fluxo especial)
   c) Calcular valor:
      - standard: plans.price_cents
      - custom: plan_interval_prices.price_per_user_cents × users_count
   d) Resolver gateway: resolvePaymentGateway({ tenantId, billingType: 'saas' })
   e) ensureCustomer(tenantId)
   f) gateway.createCharge({ customerId, amountCents, dueDate, externalReference: tenantId, ... })
   g) INSERT tenant_billing (tenant_id, plan_id, amount_cents, gateway_payment_id, status='pending', users_count?, billing_reason='plan_purchase', payment_method?)
   h) Se tenant novo: definir plan_id, status='payment_pending', max_users_override (custom)
4. Resposta: { billing_id, invoice_url, bank_slip_url, pix_qr_code?, status }
```

### 4.3 Endpoints Propostos

| Método | Rota | Quem | Descrição |
|--------|------|------|-----------|
| POST | `/api/plan-purchase` | Público ou auth | Compra de plano (cria/usa tenant, gera fatura) |
| POST | `/api/me/tenant/subscribe` | Tenant auth | Assinar/atualizar plano (tenant já existe) |

**Decisão:** Unificar em `POST /api/plan-purchase` com body opcional `tenant_id` (se omitido, usar sessão ou criar tenant temporário).

### 4.4 Preparação para upgrade/downgrade (futuro)

Quando o cliente trocar de plano:
- Cancelar cobrança anterior pendente (se houver) no gateway
- Criar nova billing com `billing_reason = 'plan_upgrade'`
- Na ativação, atualizar `plan_id`, `plan_period_*` e `max_users_override`

O uso de `billing_reason` permite identificar o tipo de cobrança em relatórios e na lógica de upgrade.

---

## 5. Fluxo de Webhook

### 5.1 Identificação da Invoice

O webhook Asaas envia `payment.id`. Hoje:

```sql
SELECT id, tenant_id, plan_id FROM tenant_billing
WHERE gateway = 'asaas' AND asaas_payment_id = $paymentId
```

**Manter.** O `externalReference` enviado na cobrança = `tenant_id` (para validação e multi-tenant).

### 5.2 Atualização de Status

Fluxo em `handlePaymentEvent` (com idempotência forte — Melhoria 5):

1. Buscar `tenant_billing` por `asaas_payment_id`
2. **Idempotência:** Se `tenant_billing.status = 'paid'` → retornar 200 sem processar (evita ativação duplicada)
3. Se payload tiver `payment.billingType`, atualizar `payment_method` (pix, boleto, credit_card)
4. Se `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED`: `UPDATE tenant_billing SET status='paid', paid_at=now(), payment_method=?`
5. Chamar `activatePlanForTenant({ tenantId, planId, billingId })`

### 5.3 Ativação Automática

Em `activatePlanForTenant`:

1. Validar que `tenant_billing.status = 'paid'` (dupla checagem)
2. **Sempre calcular** `plan_period_start` e `plan_period_end` no backend:
   - `periodStart = new Date()`
   - `periodEnd = addInterval(periodStart, billingInterval)` (usar `tenant_billing.billing_interval` ou `plans.billing_interval`)
   - **Não copiar** de `tenant_billing.period_start/period_end` — gateways podem retornar datas inconsistentes
3. `UPDATE tenants SET plan_id = $1, status = 'active', plan_period_start = $2, plan_period_end = $3, activated_billing_id = $4, max_users_override = $5?, updated_at = now() WHERE id = $6`
4. Para planos custom: usar `tenant_billing.users_count` em `max_users_override` se presente

**Validação de acesso (middleware/frontend):** `IF tenants.plan_period_end < now() THEN bloquear sistema`

---

## 6. Lógica de Ativação do Plano

### 6.1 Regras

| Campo tenant | Ação na ativação |
|--------------|------------------|
| plan_id | Definir com `tenant_billing.plan_id` |
| status | Definir `'active'` (saída de `payment_pending`) |
| plan_period_start | **Sempre calcular:** `new Date()` (momento da ativação) |
| plan_period_end | **Sempre calcular:** `addInterval(periodStart, billingInterval)` — nunca copiar do gateway |
| activated_billing_id | Definir com `tenant_billing.id` (auditoria, suporte, disputas) |
| max_users_override | Se plano custom e `tenant_billing.users_count` presente, definir |

**Motivo:** Gateways podem retornar datas inconsistentes; o backend é a fonte de verdade.

### 6.2 Controle de Limite de Usuários

- `tenant_limitService` já usa `max_users_override` e `plans.max_users`.
- Na ativação, persistir a quantidade contratada em `max_users_override` quando o plano for custom.

### 6.3 Validação de Período Ativo

```typescript
// Middleware ou check antes de acessar app
if (tenant.plan_period_end && new Date(tenant.plan_period_end) < new Date()) {
  // Bloquear: período expirado
  redirect('/renovar-plano');
}
```

---

## 7. Estrutura de Serviços Backend

### 7.1 Serviços Novos / Ajustados

| Serviço | Responsabilidade |
|---------|------------------|
| **BillingService** | Cálculo de valor (standard vs custom), regras de negócio de cobrança |
| **SubscriptionService** | Orquestração: criar cobrança + ativar plano, validar elegibilidade |
| **InvoiceService** | CRUD de `tenant_billing`, lookup por gateway_payment_id, geração de invoice_number |

### 7.2 Separação Sugerida

```
billingService.ts
  - calculateInvoiceAmount(planId, billingInterval, usersCount?): number
  - validatePlanForPurchase(planId, usersCount?): void

invoiceService.ts
  - createInvoice(data): TenantBilling
  - getInvoiceByGatewayPaymentId(gateway, paymentId): TenantBilling | null
  - updateInvoiceStatus(billingId, status, paidAt?): void

subscriptionService.ts
  - subscribePlan(tenantId, planId, billingInterval, usersCount?): { billing, paymentUrls }
  - activatePlanFromBilling(billingId): void
```

O `subscriptionService` utiliza `billingService`, `invoiceService` e `gatewayProvider` / `gatewayResolver`.

---

## 8. Alterações no Frontend

### 8.1 Páginas / Componentes

| Local | Alteração |
|-------|-----------|
| **Landing / Pricing** | Já exibe planos; adicionar botão “Contratar” que chama fluxo de compra |
| **Checkout / Pagamento** | Nova tela ou modal: seleção de plano, quantidade de usuários (custom), método de pagamento, confirmação |
| **Post-pagamento** | Redirecionar para sucesso e, se novo tenant, fluxo de conclusão de cadastro |
| **MeuPlano** | Já existe; exibir “Assinar” ou “Próxima cobrança” conforme estado |

### 8.2 Fluxo de Compra

1. Escolha do plano (card de preço).
2. Se custom: input de quantidade de usuários + cálculo em tempo real.
3. Escolha de intervalo (mensal, trimestral, etc.).
4. Botão “Contratar” → POST `/api/plan-purchase`.
5. Resposta com `invoice_url` ou `bank_slip_url` ou `pix_qr_code` → redirecionar ou abrir modal.
6. Após pagamento: webhook ativa; usuário pode ser notificado (email/push) ou ver status em “Meu Plano”.

---

## 9. Fases de Implementação

### Fase 1 – Modelagem do banco

- **tenant_billing:** `users_count` (INTEGER), `source` (TEXT), `billing_reason` (TEXT: `plan_purchase`|`plan_upgrade`|`plan_renewal`|`manual_charge`). Garantir `payment_method` preenchido na criação e no webhook.
- **tenant_billing:** Índice `idx_tenant_billing_payment (asaas_payment_id) WHERE asaas_payment_id IS NOT NULL` (se ainda não existir equivalente).
- **tenant_billing:** Índice `idx_tenant_billing_tenant_id (tenant_id)` para listar faturas por tenant.
- **tenants:** `plan_period_start` (DATE), `plan_period_end` (DATE), `activated_billing_id` (UUID FK para tenant_billing.id, opcional).
- **tenants.status:** Estender CHECK para incluir `payment_pending` (trial | payment_pending | active | suspended).
- Migration incremental, sem quebrar dados existentes. Backfill: tenants existentes com `plan_period_end = NULL` = sem bloqueio por período.

**Critério de sucesso:** Migração aplica sem erro; consultas atuais continuam funcionando.

---

### Fase 2 – Serviços de billing

- Criar `billingService.ts`: `calculateInvoiceAmount`, `validatePlanForPurchase`.
- Criar `invoiceService.ts`: `createInvoice`, `getInvoiceByGatewayPaymentId`, `updateInvoiceStatus`.
- Criar `subscriptionService.ts`: `subscribePlan`, `activatePlanFromBilling`.
- Refatorar `activatePlanForTenant` para delegar a `subscriptionService.activatePlanFromBilling` (ou manter e chamar de dentro).

**Critério de sucesso:** Testes unitários ou de integração cobrindo cálculo e criação de invoice.

---

### Fase 3 – Criação de invoices

- Endpoint `POST /api/plan-purchase` (ou `/api/me/tenant/subscribe` para fluxo logado).
- Body: `{ plan_id, billing_interval?, users_count? }`.
- Validar plano, calcular valor, criar registro em `tenant_billing` (sem chamar gateway ainda).
- Retornar invoice criada (sem URLs de pagamento).

**Critério de sucesso:** Invoice criada no banco com valores corretos para standard e custom.

---

### Fase 4 – Integração com gateway

- No fluxo de `subscribePlan`, chamar `resolvePaymentGateway` e `ensureCustomer`.
- Chamar `gateway.createCharge` com `externalReference: tenantId`.
- Persistir `asaas_payment_id` (ou `gateway_payment_id`) no `tenant_billing`.
- Retornar `invoice_url`, `bank_slip_url`, `pix_qr_code` etc. na resposta.

**Critério de sucesso:** Cobrança criada no Asaas e vinculada ao `tenant_billing`.

---

### Fase 5 – Webhook e ativação automática

- Manter handler atual do webhook Asaas.
- **Idempotência forte:** Antes de processar, verificar `tenant_billing.status != 'paid'`; se já pago, retornar 200 sem ativar.
- Atualizar `payment_method` a partir do payload do gateway quando disponível.
- Garantir que `handlePaymentEvent` chama `activatePlanFromBilling` (ou equivalente).
- Em `activatePlanFromBilling`:
  - **Sempre calcular** `plan_period_start` e `plan_period_end` no backend (nunca copiar do gateway).
  - Definir `plan_id`, `status = 'active'`, `plan_period_start`, `plan_period_end`, `activated_billing_id`, `max_users_override` (para custom).

**Critério de sucesso:** Pagamento no Asaas resulta em plano ativo; webhook duplicado não causa ativação duplicada.

---

### Fase 6 – Interface de compra de plano

- Na página de preços/landing: botão “Contratar” por plano.
- Modal ou página de checkout: seleção de intervalo e quantidade (custom), confirmação.
- Chamada a `POST /api/plan-purchase`, exibição de link do boleto/PIX/invoice.
- Tela ou mensagem de “Aguardando pagamento” com instruções.
- Página de sucesso ou redirecionamento pós-pagamento (quando aplicável).

**Critério de sucesso:** Cliente consegue escolher plano, gerar fatura e visualizar opções de pagamento.

---

## 10. Compatibilidade e Rollback

| Área | Risco | Mitigação |
|------|-------|-----------|
| Webhook | Nenhum | Lógica de ativação já existe |
| tenant_billing | Baixo | Novas colunas opcionais |
| Super Admin | Nenhum | createTenantCharge permanece |
| Gateway | Nenhum | Mesma interface e fluxo |

**Rollback:** Reverter migrations (remover colunas novas); desativar rotas e UI de self-service; webhook segue funcionando como hoje.

---

## 11. Resumo das Entregas por Fase

| Fase | Entrega |
|------|---------|
| 1 | Migrations: `users_count`, `source`, `billing_reason` em `tenant_billing`; índices `asaas_payment_id` e `tenant_id`; `plan_period_start`, `plan_period_end`, `activated_billing_id`, `status = payment_pending` em `tenants` |
| 2 | `billingService`, `invoiceService`, `subscriptionService` |
| 3 | Endpoint `POST /api/plan-purchase` (sem gateway) |
| 4 | Integração com `gatewayProvider` no fluxo de subscribe |
| 5 | Webhook com idempotência forte; ativação com `plan_period_*` (sempre calculados), `activated_billing_id`, `max_users_override` |
| 6 | UI: escolha de plano, checkout, exibição de link de pagamento |

---

## 12. Fluxo Final do Sistema (Arquitetura)

```
plans → checkout → tenant_billing → gateway → webhook → activatePlan → tenant.active
```

### Fluxo detalhado

```
Cliente escolhe plano
↓
POST /plan-purchase
↓
createCharge (gateway)
↓
tenant.status = payment_pending
tenant_billing created (billing_reason, source, status=pending)
↓
cliente paga
↓
webhook (idempotente: se status='paid' → skip)
↓
tenant_billing.status = paid
↓
activatePlanForTenant
↓
tenant.status = active
plan_period_start, plan_period_end (sempre calculados no backend)
activated_billing_id definido
max_users_override (se custom)
↓
Validação de acesso: plan_period_end >= now()
```

**Motor completo de monetização SaaS.**

---

## 13. Anexos

### A. Exemplo de Body – POST /api/plan-purchase

```json
{
  "plan_id": "uuid-do-plano",
  "billing_interval": "monthly",
  "users_count": 12
}
```

`users_count` obrigatório para `plan_type = 'custom'`; opcional para `standard`.

### B. Exemplo de Resposta

```json
{
  "billing_id": "uuid",
  "invoice_number": "INV-xxx-xxx",
  "amount_cents": 24000,
  "status": "pending",
  "invoice_url": "https://...",
  "bank_slip_url": "https://...",
  "pix_qr_code": "...",
  "pix_copy_paste": "..."
}
```

### C. Autenticação do Endpoint

- `POST /api/plan-purchase`: pode ser chamado por usuário não logado (criação de conta + cobrança) ou logado (upgrade).
- Se não logado: exigir email/nome para criar tenant em status `payment_pending` e enviar link de ativação após pagamento.
