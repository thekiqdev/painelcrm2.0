# Relatório de Validação Técnica — Pós-Migração de Status

**Escopo:** Validação da arquitetura multi-gateway já implantada; compatibilidade, segurança e risco operacional em produção.  
**Regra:** Nenhuma alteração de código, migrations ou correção; apenas análise e relatório.

**Observação sobre a “migration recente” de CHECK:** No repositório analisado, a lista de migrations em `migrate.ts` termina em `74_drop_asaas_payment_columns.sql` e `create-admin-user.sql`. Não foi encontrado arquivo de migration (ex.: 75) que altere os CHECK constraints de status para incluir `waiting_payment`, `processing`, `failed` e `refunded` em `tenant_billing`, nem `waiting_payment` e `processing` em `customer_invoices`. O relatório considera: (a) o estado **definido pelas migrations presentes no repositório**; (b) a **possibilidade** de uma migration de expansão de CHECK ter sido aplicada apenas em produção (fora do repo ou não commitada). Quando a conclusão depender disso, isso será explicitado.

---

## 1) DATABASE VALIDATION

### 1.1 Estrutura real atual (conforme migrations no repositório)

**Tabelas e colunas:**

| Tabela | Colunas genéricas | Fonte |
|--------|--------------------|--------|
| **customer_invoices** | gateway, gateway_reference_id, gateway_metadata, gateway_status, idempotency_key | 70 (gateway, idempotency_key); 73 (gateway_reference_id, gateway_metadata, gateway_status) |
| **tenant_billing** | gateway, gateway_reference_id, gateway_metadata, gateway_status, idempotency_key | 59 (gateway, idempotency_key); 73 (gateway_reference_id, gateway_metadata, gateway_status) |
| **payment_events** | id, gateway, event_id, reference_id, payload, processed, processed_at, processed_result, created_at | 73 |

**Remoção de legado:** A migration 74 remove `asaas_payment_id` e `asaas_status` de ambas as tabelas e remove os índices que os referenciam. Após 74, não há colunas asaas_* no schema definido pelo repositório.

**Índices e UNIQUE:**

- **customer_invoices:** UNIQUE (gateway, gateway_reference_id) WHERE gateway_reference_id IS NOT NULL (73). Índice antigo por asaas_payment_id removido em 74.
- **tenant_billing:** UNIQUE (gateway, gateway_reference_id) WHERE gateway_reference_id IS NOT NULL (73). Índices antigos asaas removidos em 74.
- **payment_events:** UNIQUE (gateway, event_id) (73); índices em (gateway, reference_id, created_at) e em (processed) WHERE processed = false.

### 1.2 CHECK constraints de status (conforme migrations no repositório)

**customer_invoices (71):**  
`CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled', 'failed', 'refunded'))`.  
**Não aceita:** `waiting_payment`, `processing`.

**tenant_billing (63):**  
`CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled'))`.  
**Não aceita:** `waiting_payment`, `processing`, `failed`, `refunded`.

Ou seja, com base **apenas nas migrations do repositório**, o banco **não** aceita todos os status esperados pelo plano (pending, waiting_payment, processing, paid, overdue, cancelled, failed, refunded).

### 1.3 Se uma migration de expansão de CHECK foi aplicada em produção

Se em produção tiver sido aplicada uma migration (não presente no repo) que:

- em **customer_invoices:** substitua o CHECK por um que inclua também `waiting_payment` e `processing`;
- em **tenant_billing:** substitua o CHECK por um que inclua também `waiting_payment`, `processing`, `failed` e `refunded`;

então o schema em produção estaria alinhado ao domínio de status do plano e os riscos abaixo referentes a CHECK deixariam de se aplicar. Recomenda-se confirmar no banco de produção os CHECKs atuais (ex.: `pg_get_constraintdef` ou inspeção no DDL).

### 1.4 O que foi confirmado

- Colunas genéricas (gateway, gateway_reference_id, gateway_metadata, gateway_status, idempotency_key) existem nas duas tabelas de fatura e em payment_events (conforme 73).
- payment_events existe com todas as colunas e UNIQUE (gateway, event_id).
- Índices UNIQUE em (gateway, gateway_reference_id) estão definidos; índices/colunas asaas_* estão removidos pela 74.
- Ordem das migrations (73 → 74) é consistente; backfill em 73; sem resquícios de asaas_payment_id/asaas_status no schema após 74.

### 1.5 O que ainda diverge (com base nas migrations do repo)

- CHECK de **customer_invoices** não inclui `waiting_payment` nem `processing`.
- CHECK de **tenant_billing** não inclui `waiting_payment`, `processing`, `failed` nem `refunded`.

### 1.6 Risco real (database)

- **Se o CHECK em produção for o mesmo do repositório:**  
  - Qualquer UPDATE que grave em `tenant_billing.status` um valor fora de (pending, paid, overdue, cancelled) — por exemplo `refunded` ou `failed` após webhook de estorno/falha — causará violação de CHECK e falha da transação. O `paymentDomainService` hoje envia `internalStatus` (que pode ser refunded/failed) para `updateInvoiceStatus` (tenant_billing); o tipo em TypeScript é restrito a quatro valores, mas em runtime o valor pode ser refunded/failed. **Risco:** bloqueante para cenários de REFUNDED/FAILED em tenant_billing até que o CHECK seja expandido ou o código restrinja o que escreve em tenant_billing.  
  - Em **customer_invoices**, failed e refunded já são aceitos; o risco é apenas se um futuro gateway normalizar para `waiting_payment` ou `processing` e o CHECK não for expandido.  
- **Se a migration de expansão de CHECK já tiver sido aplicada em produção:** o risco de violação de CHECK por esses valores deixa de existir, desde que os CHECKs em produção incluam todos os oito status.

---

## 2) SERVICE LAYER VALIDATION

### 2.1 Conformidade

- **customerInvoiceService:** `CustomerInvoiceRow` e SELECTs usam apenas colunas genéricas; não há asaas_*; `updateCustomerInvoiceGatewayData` recebe `GatewayPaymentData` e persiste apenas gateway_* e idempotency_key; `updateCustomerInvoiceStatus(invoiceId, status, paidAt?, gatewayStatus?)` atualiza `status` e `gateway_status` em colunas separadas.
- **invoiceService:** `TenantBillingRow` e `CreateInvoiceInput` sem asaas_*; `createInvoice` e `updateInvoiceGatewayData` só colunas genéricas; `updateInvoiceStatus(billingId, status, paidAt?, paymentMethod?, gatewayStatus?)` atualiza `status` e `gateway_status`; `getInvoiceByGatewayReferenceId` busca por (gateway, gateway_reference_id).
- **Chamadores (customerBillingService, recurringBillingJobService, subscriptionService, billingReconciliationService):** passam objeto genérico (gateway_reference_id, gateway_status, etc.) para os updates de gateway; não há escrita em asaas_*.
- **gateway_status:** Em `updateInvoiceStatus` e `updateCustomerInvoiceStatus`, `gateway_status` é atualizado em toda atualização de status (paid ou não), de forma explícita e separada do campo `status`. Comportamento alinhado ao plano (status = fonte da verdade; gateway_status = informativo).

Não foi identificada regressão na camada de serviço em relação ao modelo genérico.

### 2.2 Compatibilidade com o CHECK do banco

- **updateCustomerInvoiceStatus:** Recebe `status: string`. O banco (71) aceita pending, paid, overdue, cancelled, failed, refunded. O domínio hoje só escreve esses ou pending; portanto compatível com o CHECK atual de customer_invoices, mesmo sem waiting_payment/processing.
- **updateInvoiceStatus:** Assinatura usa `BillingStatus = 'pending' | 'paid' | 'overdue' | 'cancelled'`. Em **runtime**, `paymentDomainService.applyPaymentEvent` pode passar `internalStatus` igual a `refunded` ou `failed` (ex.: evento REFUNDED do Asaas), pois o cast TypeScript não altera o valor em execução. Se o CHECK de tenant_billing em produção ainda for apenas esses quatro valores, um evento REFUNDED/FAILED em tenant_billing causaria violação de constraint. **Conclusão:** compatível com o CHECK **apenas** para os fluxos que hoje só gravam pending/paid/overdue/cancelled em tenant_billing (ex.: fluxo Asaas atual sem estorno em tenant_billing). Qualquer caminho que grave refunded/failed em tenant_billing exige CHECK expandido ou mapeamento no código para um dos quatro valores permitidos.

### 2.3 Acoplamentos residuais com Asaas

- **Fallback de gateway_key:** Vários serviços usam `config?.gateway_key ?? 'asaas'`. Trata-se de valor default de configuração, não de persistência; aceitável em produção com Asaas como padrão. **Não bloqueante.**
- **getActiveAsaasConfigForTenant / getActiveAsaasConfigForSaas:** Usados em fluxos que precisam da config do Asaas (ex.: ensureCustomerForTenant no createTenantCharge). Específico do gateway Asaas; não impede multi-gateway. **Não bloqueante.**
- **Teste de conexão (postMyTenantPaymentGatewayTest):** Verifica `config.gateway_key !== 'asaas'` e chama `testConnection` do módulo Asaas. Outros gateways precisarão de implementação própria de teste. **Melhoria futura.**

### 2.4 Risco real (service layer)

- **Risco operacional:** Se em produção o CHECK de tenant_billing não incluir refunded/failed e um webhook (Asaas ou outro) tentar gravar REFUNDED/FAILED em tenant_billing, a transação falhará. A aplicação hoje não restringe em código os valores enviados a `updateInvoiceStatus` para o subset de quatro status; o tipo BillingStatus é apenas estático. **Recomendação:** Confirmar em produção se o CHECK de tenant_billing já foi expandido; se não, tratar como risco até a expansão ou até a restrição explícita no código para tenant_billing.

---

## 3) WEBHOOK VALIDATION

### 3.1 Arquitetura em 3 camadas

- **Camada 1 – Parser:** Asaas implementa `GatewayWebhookParser` em `asaasWebhookParser.ts`; `parsePayload(payload)` retorna `ParsedWebhookPayload` (eventId, referenceId, externalStatus, metadata). Apenas traduz payload; não acessa banco nem aplica regras. Registrado com `registerGatewayParser('asaas', asaasWebhookParser)`.
- **Camada 2 – Core:** `webhookCore.handleWebhook(gatewayKey, payload)` obtém o parser pelo gateway, faz parse, chama `insertPaymentEvent` (idempotência), `findBillingOrCustomerInvoice(gateway, referenceId)`, `normalizeGatewayStatus`, e delega a `applyPaymentEvent`. Não contém regras de negócio; apenas orquestra e normaliza.
- **Camada 3 – Domain:** `paymentDomainService.applyPaymentEvent` aplica `canTransition`, atualiza status e gateway_status via `updateInvoiceStatus` / `updateCustomerInvoiceStatus`, chama `activatePlanFromBilling` quando tenant_billing e status paid, e retorna `ProcessedResult`; o core chama `markPaymentEventProcessed` com esse resultado.

A separação das três camadas está íntegra e alinhada ao plano.

### 3.2 Idempotência por payment_events

- `insertPaymentEvent` faz INSERT em payment_events (gateway, event_id, reference_id, payload, processed = false). Em conflito UNIQUE (gateway, event_id) — código 23505 — retorna `{ inserted: false }` e o core responde 200 sem reprocessar.
- Após processar, o core chama `markPaymentEventProcessed(gateway, eventId, processedResult)`, que atualiza processed = true, processed_at = now() e processed_result = JSON. Nenhum outro caminho altera payment_events para esse evento. Idempotência permanece correta.

### 3.3 processed_result

- `ProcessedResult` contém previous_status, new_status, action ('status_updated' | 'no_change' | 'skipped_regression'), reason.
- É preenchido em: (1) aplicação normal em `applyPaymentEvent`; (2) regressão bloqueada (skipped_regression); (3) entidade não encontrada (no_change, reason “Entidade não encontrada”). Em todos os casos o core chama `markPaymentEventProcessed` com esse objeto. processed_result continua sendo salvo corretamente.

### 3.4 Anti-regressão

- `canTransition(currentStatus, newStatus)` em `statusNormalizer.ts` implementa a regra: estados finais (paid, overdue, cancelled, failed, refunded) não regridem, exceto overdue → paid. Quando a transição não é permitida, `applyPaymentEvent` chama `updateGatewayStatusOnly` (atualiza só gateway_status), retorna processed_result com action 'skipped_regression' e o core grava em payment_events. A lógica de anti-regressão segue funcionando.

### 3.5 Aceitação de waiting_payment / processing / failed / refunded no banco

- Se uma **migration de expansão de CHECK** tiver sido aplicada em produção, o banco passará a aceitar todos os oito status. O código já usa `InternalPaymentStatus` e `normalizeGatewayStatus` com esses valores; `updateCustomerInvoiceStatus` aceita qualquer string em `status`; `updateInvoiceStatus` em runtime pode receber qualquer InternalPaymentStatus (o tipo BillingStatus é apenas estático). Portanto, **após** a expansão do CHECK, não há comportamento inesperado por aceitar waiting_payment, processing, failed ou refunded no banco; o domínio já está preparado.
- **Se o CHECK não tiver sido expandido:** tentar gravar waiting_payment ou processing (ou refunded/failed em tenant_billing) resultará em violação de constraint, como já descrito nas seções 1 e 2.

---

## 4) REGRESSION RISK VALIDATION

### 4.1 Impacto da migration (74 e eventual expansão de CHECK)

- **74 (drop asaas_*):** O código já não referencia asaas_payment_id/asaas_status; toda leitura/escrita usa colunas genéricas. A aplicação em produção já deve estar compatível com o schema pós-74. Nenhuma alteração de código seria necessária apenas pela 74.
- **Expansão de CHECK (se aplicada):** Só relaxa restrições; não remove valores. Fluxos que hoje gravam apenas pending/paid/overdue/cancelled continuam válidos. Não há mudança de semântica nem de fluxo; risco de regressão direta é baixo.

### 4.2 Cenários inspecionados no código

| Cenário | Cobertura pela lógica atual |
|--------|-----------------------------|
| **Cobrança criada** | createInvoice / createManualCustomerInvoice + update*GatewayData gravam gateway_reference_id e gateway_status. Lookup por (gateway, gateway_reference_id). Coberto. |
| **Webhook normal** | handleWebhook → insert → find → normalize → applyPaymentEvent → update status + gateway_status; activatePlanFromBilling se tenant_billing + paid; markProcessed. Coberto. |
| **Webhook duplicado** | INSERT em payment_events com mesmo (gateway, event_id) falha com 23505; retorno { inserted: false }; core retorna 200 sem reprocessar. Coberto. |
| **Evento fora de ordem** | canTransition bloqueia regressão (ex.: paid → pending). Em regressão: só gateway_status é atualizado; processed_result = skipped_regression. Coberto. |
| **overdue → paid** | canTransition permite (FINAL overdue com exceção newStatus === 'paid'). updateInvoiceStatus/updateCustomerInvoiceStatus aplicam. Coberto. |
| **Tentativa paid → pending** | canTransition retorna false (paid em FINAL); updateGatewayStatusOnly; processed_result = skipped_regression. Coberto. |

Nenhum desses cenários depende de asaas_*; todos usam payment_events e gateway_reference_id. A migration 74 não introduz risco de quebra nesses fluxos.

### 4.3 Risco de quebra escondida

- **Possível:** Se em produção ainda existir **qualquer** script, job ou cliente legado que leia ou escreva asaas_payment_id/asaas_status (por exemplo em outro serviço ou em relatórios SQL), esses passarão a falhar após a 74. A validação foi feita apenas no backend Node do repositório; não há como garantir que não existam outros consumidores do banco. **Recomendação:** Verificar em produção se há referências a essas colunas fora deste código (scripts, BI, integrações).
- **Risco já citado:** tenant_billing com CHECK restrito e evento REFUNDED/FAILED pode falhar até que o CHECK seja expandido ou o código restrinja os valores para tenant_billing.

---

## 5) MULTI-GATEWAY READINESS

### 5.1 Critério

O plano exige que o sistema suporte, também no schema, um novo gateway que use waiting_payment, processing, failed e refunded (além dos já usados). Isso implica CHECK em customer_invoices e tenant_billing aceitando os oito status.

### 5.2 Estado com base apenas nas migrations do repositório

- **Schema:** CHECK de customer_invoices não inclui waiting_payment nem processing; CHECK de tenant_billing não inclui waiting_payment, processing, failed nem refunded. Portanto o **schema definido no repositório** não está totalmente alinhado ao modelo de status do plano.
- **Código:** Registry, resolver, parser, webhookCore e paymentDomainService são genéricos; persistência usa apenas gateway_*; normalizeGatewayStatus e canTransition já consideram os oito status. A aplicação está preparada para múltiplos gateways desde que o banco aceite os valores.

**Conclusão (repositório):** **PARCIALMENTE PRONTO** — código pronto; schema (CHECK) ainda restrito nas migrations existentes.

### 5.3 Estado se a migration de expansão de CHECK foi aplicada em produção

Se em produção os CHECKs de customer_invoices e tenant_billing aceitarem os oito status (pending, waiting_payment, processing, paid, overdue, cancelled, failed, refunded):

- Não há bloqueio estrutural para integrar um novo gateway (Mercado Pago, Cora, Stripe) que use esses estados.
- Seria suficiente: registrar factory, registrar parser, adicionar rota /webhooks/{gateway_key} e mapeamento em normalizeGatewayStatus. Nenhuma alteração estrutural adicional no schema seria necessária.

**Conclusão (com CHECK expandido em produção):** **PRONTO** para múltiplos gateways também no schema.

### 5.4 Bloqueios residuais (independentes do CHECK)

- **Rota de webhook:** Cada novo gateway exige uma rota Express (ex.: `/webhooks/mercadopago`) e um handler que chame `handleWebhook(gateway_key, body)`. Isso é esperado pelo desenho; não é bloqueante.
- **Teste de conexão:** Hoje atrelado ao Asaas; outros gateways precisarão de implementação própria. **Melhoria futura**, não bloqueante para integração básica.

---

## 6) RELATÓRIO FINAL OBRIGATÓRIO

### O que foi validado com sucesso

- Colunas genéricas (gateway, gateway_reference_id, gateway_metadata, gateway_status, idempotency_key) existem em customer_invoices e tenant_billing; payment_events existe com todas as colunas e UNIQUE (gateway, event_id).
- Colunas e índices asaas_* foram removidos pela migration 74; não há resquícios no schema definido pelo repositório.
- UNIQUE (gateway, gateway_reference_id) está definido nas duas tabelas de fatura.
- Camada de serviço usa apenas modelo genérico; update*GatewayData e update*Status atualizam gateway_status separadamente de status; não há escrita em asaas_*.
- Webhook em 3 camadas (parser → webhookCore → paymentDomainService) está íntegro; idempotência por payment_events e preenchimento de processed_result estão corretos.
- Anti-regressão (canTransition) e papel de status vs gateway_status estão implementados conforme o plano.
- Cenários de cobrança criada, webhook normal, duplicado, fora de ordem, overdue→paid e paid→pending estão cobertos pela lógica atual.
- Compatibilidade com o fluxo atual do Asaas é preservada para os caminhos que só gravam pending/paid/overdue/cancelled em tenant_billing e os seis status aceitos em customer_invoices.

### O que ainda precisa de ajuste

- **CHECK de status (se não expandido em produção):**  
  - **customer_invoices:** Incluir `waiting_payment` e `processing` no CHECK (conforme plano). **Importante, não bloqueante** para o Asaas atual, que não normaliza para esses valores.  
  - **tenant_billing:** Incluir `waiting_payment`, `processing`, `failed` e `refunded` no CHECK. **Bloqueante** se houver (ou for esperado) evento REFUNDED/FAILED em tenant_billing, pois o código hoje pode tentar gravar esses valores.
- **Código (alternativa ao CHECK):** Se não for possível aplicar a migration de expansão de CHECK em produção, restringir em código os valores enviados a `updateInvoiceStatus` para tenant_billing ao subset aceito pelo CHECK atual (ex.: mapear refunded/failed para cancelled ou outro valor permitido), documentando a decisão. Isso seria um ajuste pontual, não uma refatoração ampla.

### Riscos encontrados

| Risco | Tipo | Mitigação |
|-------|------|-----------|
| tenant_billing com CHECK restrito e evento REFUNDED/FAILED | **Bloqueante** se o cenário ocorrer | Expandir CHECK em tenant_billing ou restringir no código o que se grava em tenant_billing.status. |
| customer_invoices sem waiting_payment/processing no CHECK | **Não bloqueante** para Asaas; **importante** para novo gateway com estados intermediários | Expandir CHECK quando for integrar gateway que use esses estados. |
| Scripts/consumidores externos que usem asaas_payment_id/asaas_status | **Possível** | Auditar produção (scripts, BI, integrações) e remover ou adaptar. |

### Compatibilidade com produção

- O código atual é compatível com o schema pós-74 (sem asaas_*). O fluxo Asaas que só utiliza pending/paid/overdue/cancelled (e em customer_invoices também failed/refunded) permanece compatível.
- Se a migration de expansão de CHECK tiver sido aplicada em produção, a compatibilidade é mantida e o sistema fica preparado para todos os status do plano. Se não tiver sido aplicada, a compatibilidade mantém-se para os fluxos atuais que não gravam refunded/failed em tenant_billing; o risco fica condicionado ao aparecimento desses eventos em tenant_billing.

### Recomendação final

1. **Confirmar em produção** os CHECKs atuais de `customer_invoices` e `tenant_billing` (ex.: consulta ao catálogo do PostgreSQL). Se já incluírem os oito status, considerar a validação concluída do ponto de vista de schema e multi-gateway.
2. **Se o CHECK em produção ainda for o restrito:**  
   - Aplicar (ou criar e aplicar) uma migration que expanda os CHECKs para os oito status em ambas as tabelas, e registrá-la no repositório para manter o schema versionado.  
   - Ou, como alternativa de curto prazo, restringir no `paymentDomainService` (ou no invoiceService) os valores de status escritos em tenant_billing ao conjunto permitido pelo CHECK atual, evitando gravar refunded/failed até que o CHECK seja expandido.
3. **Não é necessária refatoração ampla.** A arquitetura multi-gateway está implantada; o único ponto em aberto é o alinhamento do CHECK ao domínio de status (ou a restrição explícita no código para tenant_billing), com prioridade para evitar falha em produção em cenários de REFUNDED/FAILED em tenant_billing.
