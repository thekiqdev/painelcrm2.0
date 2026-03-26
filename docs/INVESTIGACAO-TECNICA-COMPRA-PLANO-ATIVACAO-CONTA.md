# Investigação Técnica — Compra de Plano e Ativação de Conta

## 1. Fluxo atual mapeado

Fluxo de compra de plano (self-service), conforme implementação atual:

1. Frontend envia `POST /api/plan-purchase` (ex.: `PlanCheckout` / `PlanPurchaseModal`) com:
   - `plan_id`, `billing_interval`, `payment_method`
   - e, se não logado, dados da empresa/responsável.
2. Rota `planPurchaseRoutes` usa `optionalAuthenticateAndTenant`:
   - com token válido: resolve `req.userId/req.tenantId`
   - sem token/expirado: segue como anônimo (não bloqueia compra).
3. `postPlanPurchase` (`planPurchaseController`):
   - valida body (`zod`)
   - resolve tenant (`resolveTenantId`):
     - tenant existente (logado/body.tenant_id) ou cria novo tenant `payment_pending`
     - tenta criar admin (`createTenantAdminUser`).
4. Ainda no controller, chama `subscribePlan(tenantId, planId, interval, options)`.
5. `subscribePlan` (`subscriptionService`):
   - valida plano e calcula valor
   - monta `CreateInvoiceInput`
   - chama `createInvoice` (`invoiceService`) para persistir `tenant_billing`
   - depois tenta criar cobrança no gateway (`getActiveGateway` + `ensureCustomer` + `createCharge`)
   - grava dados do gateway em `tenant_billing` (`updateInvoiceGatewayData`)
   - retorna `billing` + `paymentUrls`.
6. Controller retorna `201` com `billing_id`, `invoice_number`, `status`, URLs de pagamento.

Fluxo de ativação após pagamento:

1. Gateway envia webhook (Asaas) em `/webhooks/asaas`.
2. `asaasWebhookHandler` normaliza evento e delega para `handleWebhook`.
3. `webhookCore`:
   - registra idempotência em `payment_events`
   - localiza entidade por `(gateway, gateway_reference_id)` em:
     - `tenant_billing` (SaaS) ou
     - `customer_invoices` / tentativas.
4. `paymentDomainService.applyPaymentEvent`:
   - atualiza status de `tenant_billing`
   - se status interno virar `paid`, chama `activatePlanFromBilling`.
5. `activatePlanFromBilling`:
   - valida `tenant_billing` pago
   - ativa tenant (`tenants.status = active`, período do plano, vínculo com billing)
   - cria assinatura SaaS (`subscriptions`) se não existir
   - vincula `subscription_id` na fatura.

Conclusão do mapeamento: a cadeia de ativação está implementada e conectada ao webhook; o bloqueio observado acontece antes (na criação da fatura).

## 2. Causa raiz do erro 500

Causa principal: falha SQL dentro de `createInvoice` (`invoiceService`) durante `INSERT` em `tenant_billing`.

- `postPlanPurchase` depende de `subscribePlan`.
- `subscribePlan` chama `createInvoice` antes de qualquer retorno de sucesso.
- `createInvoice` lança erro SQL (`INSERT has more expressions than target columns`), que sobe até o controller.
- `postPlanPurchase` captura e retorna `500 Internal server error`.

Ou seja: o endpoint quebra na persistência da fatura (`tenant_billing`) antes da parte útil de cobrança/URLs.

## 3. Causa do erro SQL de INSERT

### Query efetiva (equivalente reconstruída)

No `invoiceService.createInvoice`:

```sql
INSERT INTO tenant_billing (
  tenant_id, plan_id, billing_interval, amount_cents, due_date, status, invoice_number,
  gateway, payment_method, idempotency_key,
  users_count, source, billing_reason, subscription_id, period_start, period_end,
  plan_name_snapshot, plan_price_snapshot
) VALUES (
  $1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
);
```

### Problema objetivo

- Lista de colunas: **18**
- Lista de expressões em `VALUES`: **19** (`$1..$5` + `'pending'` + `$6..$18`)

Resultado: `INSERT has more expressions than target columns`.

### Observação adicional importante

O array de parâmetros passado no código tem 17 valores úteis (até equivalente de `$17`), mas a SQL referencia até `$18`.
Mesmo corrigindo placeholders, o erro de cardinalidade já dispara antes.

### Origem provável

Divergência introduzida ao evoluir `tenant_billing` com colunas novas (snapshot/recorrência) e ajustar manualmente a SQL de insert sem recontagem consistente de expressões/placeholders.

## 4. Análise do alerta tenantSecurity

Alerta observado:

`SELECT id FROM user_profiles WHERE owner_id = $1 LIMIT 1`

Origem:

- `createTenantAdminUser` (`tenantAdminService`) ao verificar se já existe `user_profile` do usuário recém-criado.

Diagnóstico:

- O warning vem do guardrail de desenvolvimento (`assertTenantScopedQuery`) em `db.ts`.
- A tabela `user_profiles` é marcada como tenant-scoped e a query não inclui padrão explícito de tenant (`tenant_id`, join com users por tenant etc.), por isso o warning.

É causa do 500?

- **Não.** É alerta de segurança/escopo em dev, não o erro fatal da compra.

É risco real?

- **Sim, moderado**: embora no caso específico use `owner_id = user.id` recém-criado no fluxo, o padrão SQL está fora da política tenant-safe e pode mascarar consultas inseguras em outros contextos.

Adequação correta (futura correção mínima):

- Incluir filtro tenant-safe explícito na query de `user_profiles`, por exemplo com `owner_id IN (SELECT id FROM users WHERE id = $1 AND tenant_id = $2)` ou join equivalente.

## 5. Impacto no fluxo de ativação

Impacto direto atual:

- Compra de plano falha com 500.
- `tenant_billing` não é criado.
- Sem `gateway_reference_id`, webhook não tem entidade para consolidar.
- `activatePlanFromBilling` não é acionado (porque não há billing pago para ativar).

Impacto secundário relevante:

- O mesmo `createInvoice` é usado também em recorrência (`recurringBillingJobService`).
- Portanto, o bug não afeta só checkout novo; pode quebrar geração de faturas de renovação SaaS.

Sobre o `401 /api/me/tenant/my-permissions` em paralelo:

- É efeito paralelo de tela/estado de autenticação e **não** explica o 500 de `plan-purchase`.

## 6. O que já está correto e deve ser preservado

- Arquitetura de webhook em camadas (`parser -> webhookCore -> paymentDomainService`) com idempotência em `payment_events`.
- Lookup por colunas genéricas multi-gateway (`gateway_reference_id`, `gateway_status`) em `tenant_billing`/`customer_invoices`.
- Regras de transição de status (`canTransition`) evitando regressão.
- Ativação idempotente do tenant em `activatePlanFromBilling`.
- Separação entre fluxo SaaS (`tenant_billing`) e CRM (`customer_invoices`/attempts).

## 7. Plano mínimo de correção

Sem refatoração ampla, sequência mínima e segura:

1. **Corrigir somente a SQL de `createInvoice`**:
   - alinhar número de expressões à lista de colunas
   - alinhar placeholders aos parâmetros efetivamente enviados.
2. **Validar smoke do endpoint `POST /api/plan-purchase`**:
   - cenário anônimo e cenário logado
   - confirmar `201` + `billing_id` + URLs.
3. **Validar recorrência SaaS** (ponto de reuso de `createInvoice`):
   - executar caminho de geração de cobrança de renovação em ambiente de teste.
4. **Ajustar query tenant-safe em `tenantAdminService`** (mudança pontual):
   - remover warning e aderir padrão de escopo.
5. **Não tocar** em `webhookCore/paymentDomainService/payment_events` nesta correção:
   - cadeia está funcional e não é causa raiz do erro atual.

## 8. Riscos se corrigir do jeito errado

- Alterar além do necessário em webhook/status pode introduzir regressão de pagamentos já estáveis.
- Corrigir só superficialmente placeholders sem validar recorrência pode deixar falha latente em jobs.
- Ignorar tenant-safe warning perpetua risco de consultas fora de escopo em futuras mudanças.
- Refatorar arquitetura inteira neste momento aumenta tempo de incidente e chance de retrabalho.

## 9. Próximo passo mais seguro

Próximo passo recomendado: executar uma correção cirúrgica em `invoiceService.createInvoice` (cardinalidade do `INSERT`) + teste controlado de:

1. checkout novo (`/api/plan-purchase`),
2. retorno de URLs de pagamento,
3. confirmação de webhook para marcar `tenant_billing` como `paid`,
4. ativação do tenant via `activatePlanFromBilling`,
5. e smoke de recorrência SaaS.

Isso resolve a causa principal com baixo risco, preservando a arquitetura atual de faturamento e multi-gateway.

