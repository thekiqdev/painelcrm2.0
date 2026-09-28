# Investigação Técnica — Reuso de Cobrança na Fatura Pública

## 1. Fluxo atual real

### 1.1 GET `/api/public/customer-invoices/pay/:token` (`getPayByToken`)

- Opcionalmente chama `syncPublicInvoiceStatusFromGateway` (consulta `customer_invoices.gateway_reference_id` no gateway e atualiza status da fatura).
- Carrega a fatura por token (`getByPaymentToken`).
- Monta `payment_urls` a partir do **metadata da tentativa ativa** (`getActiveInvoicePaymentAttempt` → `gateway_metadata`), com fallback para `invoice.gateway_metadata` quando necessário.
- Expõe `active_attempt`, `attempts_summary`, `payment_method` da linha `customer_invoices`, `allowed_payment_methods` derivadas do metadata.
- Acrescenta `buildPublicPayPayloadMeta(payment_urls)` → `has_payment_payload` e `payment_options_summary` (critério: presença de PIX visual/copia-e-cola **ou** URLs de boleto/hosted).

### 1.2 POST `/complete` (`completePaymentByToken`)

- Só quando **não há `client_id`** na fatura (fluxo “preencher cliente”).
- Cria cliente, vincula à fatura, chama **`gateway.createCharge`** uma vez com idempotência `customer_link_...`, grava `customer_invoices` + **`createInvoicePaymentAttempt`** (tentativa ativa com metadata de URLs).

### 1.3 POST `/switch-method` (`switchPaymentMethodByToken`)

Ordem lógica no código:

1. **Idempotência por chave** (`getInvoicePaymentAttemptByIdempotency(invoice_id, payment_method, idempotency_key)`): se encontrar linha, **ativa** essa tentativa e atualiza `customer_invoices` com os dados dela → **retorno imediato** (sem `createCharge`).
2. **Atalho “já ativo no mesmo método”**: `getActiveInvoicePaymentAttempt` = método pedido + `gateway_reference_id` + `isAttemptChargeStillUsable(getPayment)` → retorno sem `createCharge`.
3. **`findReusableInvoicePaymentAttempt`**: última tentativa **não cancelada** daquele método com status em `pending | waiting_payment | processing | overdue` e `gateway_reference_id` preenchido. Se `isAttemptChargeStillUsable` → ativa + atualiza fatura → retorno sem `createCharge`.
4. Se existe `reusable` mas **não** está utilizável no gateway: **`markAttemptCancelledSuperseded`** (status `cancelled`, `is_active = false`) e segue.
5. **`gateway.createCharge`** + **`createInvoicePaymentAttempt`** + `updateCustomerInvoiceGatewayData`.

### 1.4 Frontend (`CustomerInvoicePay.tsx`)

- Polling a cada 5s chama GET e substitui o estado (`mergePayData` = payload completo).
- Troca de método: POST `switch-method` com `idempotency_key = ui_switch_${token}_${method}`, merge parcial de `payment_urls`, `active_attempt`, `payment_method`, etc.
- **`awaitingGatewayPayload`** (ver seção 4) controla o alerta “Preparando opções de pagamento”.

---

## 2. Onde a cobrança/tentativa está sendo perdida ou ignorada

| Ponto | O que acontece |
|--------|----------------|
| **`findReusableInvoicePaymentAttempt`** | Só considera status **pendentes** (`pending`, `waiting_payment`, `processing`, `overdue`). Tentativas **canceladas** (após `markAttemptCancelledSuperseded`) **não** voltam como reusáveis. |
| **`isAttemptChargeStillUsable`** | Se `getPayment(ref)` retornar `null` **ou** status Asaas normalizar para algo **fora** de `pending/waiting_payment/processing/overdue`, a tentativa é tratada como **não reutilizável** → passo 4 marca **cancelada** e pode gerar **nova** cobrança. O `catch` em erro de rede hoje assume reutilizável (`true`) para não duplicar por timeout. |
| **Idempotência `getInvoicePaymentAttemptByIdempotency`** | A query **não** filtra por `status`. Uma linha **cancelada** que ainda guarda o mesmo `idempotency_key` continua sendo encontrada. |
| **`markAttemptCancelledSuperseded`** | **Não** limpa `idempotency_key`. O índice único `(invoice_id, payment_method, idempotency_key) WHERE idempotency_key IS NOT NULL` permanece **ocupado** pela linha cancelada. |
| **`createInvoicePaymentAttempt` (conflito 23505)** | Em duplicidade de idempotência, devolve a linha existente via `getInvoicePaymentAttemptByIdempotency` — pode devolver tentativa **cancelada** ou desalinhada do último `createCharge`. |

---

## 3. Por que novas cobranças continuam sendo geradas

Causas **combinadas** observadas no código:

1. **Reuso falha no gateway**: `getPayment` indica cobrança ausente ou status final (ex.: mapeamento Asaas → interno que não cai em “pendente”). A tentativa é **invalidada** e um **novo** `createCharge` é executado.

2. **Idempotência “presa” em tentativa cancelada**: após invalidar uma tentativa, a chave **`ui_switch_*` continua na linha cancelada**. O primeiro bloco do switch pode **reativar** uma tentativa **cancelada** (se a query de idempotência não excluir status), **ou** o próximo `createCharge` com a **mesma** chave colide com o índice único e o fluxo de inserção se comporta de forma ambígua (dependendo da ordem: nova cobrança no Asaas já criada vs. linha antiga).

3. **`generatedIdem` aleatório** quando não há idempotência no body: gera nova cobrança a cada troca (menos relevante se o front sempre envia `ui_switch_*`).

4. **Troca de método ativa outra tentativa**: ao mudar PIX → BOLETO, a tentativa PIX permanece no banco (normalmente inativa); ao **voltar** ao PIX, o fluxo deve achar **`findReusable`** ou **idempotência** — se a linha PIX foi **cancelada** no passo 4, **não** entra em `findReusable` e tende a **`createCharge`** de novo.

---

## 4. Por que a mensagem “Preparando opções de pagamento” aparece

No frontend, `awaitingGatewayPayload` é `true` quando:

- `canPay && !needs_customer` e há pelo menos um método permitido, **e**
- **não** há conteúdo suficiente para o método **selecionado**:
  - **PIX**: `hasPix` = ausência de `pixCopyPaste` e de imagem derivada de `pixQrCode`;
  - **Boleto**: `showBoletoSection` falso (sem linha, PDF, nem link hosted);
  - **Cartão**: `showCardChargeReady` falso (tentativa/coluna não refletem `CREDIT_CARD` alinhado ao que a UI espera), **e** não está no estado `switchingMethod === CREDIT_CARD`.

Ou seja: o alerta aparece quando a UI considera que **ainda não há payload renderizável** para o método escolhido — seja por **URLs vazias** no estado (metadata incompleto, GET após sync, merge parcial), seja por **descompasso** entre método selecionado e `active_attempt`/`payment_method`.

O texto atual explica **processo interno** (“cobrança sendo gerada pelo provedor”), o que **não** é adequado para o cliente final.

---

## 5. Causa raiz principal

**Condição de reuso + idempotência após invalidação**: ao marcar uma tentativa como **cancelada** por “cobrança não utilizável no gateway”, o sistema **mantém** o `idempotency_key` na linha cancelada. Isso **impede** reutilizar a mesma chave estável do front (`ui_switch_*`) de forma limpa e pode fazer o primeiro bloco de idempotência **reativar** uma tentativa **inválida** ou forçar **novo** `createCharge` + conflitos na tabela de tentativas — **duplicando cobranças no provedor** e **deixando a UI sem URLs** em cenários limite.

---

## 6. Causas secundárias

- **`isAttemptChargeStillUsable` com `getPayment` retornando `null`**: tentativa invalidada → nova cobrança (comportamento esperado se a cobrança sumiu no gateway; evita reuso fantasma).
- **Cartão**: cobrança criada pode **não** trazer `invoiceUrl`/PIX/boleto; `buildPublicPayPayloadMeta` pode marcar `has_payment_payload` como falso — o alerta depende sobretudo das flags **`showCardChargeReady`** / PIX / boleto, não só desse campo.
- **Polling**: GET substitui o estado inteiro; qualquer atraso de consistência entre `customer_invoices` e `customer_invoice_payment_attempts` pode gerar **janela** com PIX vazio e alerta visível.

---

## 7. Correção mínima recomendada

1. **Ao superseded/cancelar** tentativa no switch: **liberar** o slot de idempotência, p.ex. `idempotency_key = NULL` na linha cancelada (compatível com índice único parcial `WHERE idempotency_key IS NOT NULL`).
2. **No `switchPaymentMethodByToken`**, no bloco de idempotência: **só** reutilizar `byIdem` se o status da tentativa for **reutilizável** (`pending`, `waiting_payment`, `processing`, `overdue`) — **nunca** reativar tentativa **cancelada** pela mesma chave.
3. **UI**: remover o texto técnico exposto ao cliente (“Preparando opções…” / “não é um erro” / “provedor gerando cobrança”). Opcional: indicador visual **discreto** (spinner pequeno) sem explicar backend.

---

## 8. Arquivos que precisam ser alterados

- `packages/backend/src/services/customerInvoicePaymentAttemptsService.ts` — `markAttemptCancelledSuperseded` (limpar `idempotency_key`).
- `packages/backend/src/services/customerBillingService.ts` — `switchPaymentMethodByToken` (guard de status no bloco idempotência).
- `src/pages/CustomerInvoicePay.tsx` — retirar/substituir o alerta “Preparando opções de pagamento”.

---

## 9. O que NÃO deve ser alterado

- Webhooks, `payment_events`, normalização multi-gateway além do necessário para este fluxo.
- Arquitetura geral de faturas/tentativas (sem nova entidade nem reescrita do fluxo público).
- Contratos de API públicos além de **campos já retornados** pelo switch (não remover `payment_method`/`active_attempt`).

---

## 10. Correções aplicadas (pós-investigação)

- **`markAttemptCancelledSuperseded`**: passa a definir `idempotency_key = NULL` ao cancelar, liberando o índice único para uma nova tentativa com a mesma chave estável `ui_switch_*` sem colidir com a linha histórica.
- **`switchPaymentMethodByToken`**: o bloco de idempotência só reativa/retorna quando `byIdem.status` está em `pending | waiting_payment | processing | overdue` — evita reativar tentativa **cancelada** com a mesma chave.
- **`CustomerInvoicePay.tsx`**: removidos o alerta âmbar e os textos técnicos (“Preparando opções…”, “Isto não é um erro…”, “provedor”); substituídos por linha discreta com spinner e “Um momento.” quando `awaitingGatewayPayload` for verdadeiro.

---

*Documento gerado a partir da leitura do código em `customerBillingService.ts`, `customerInvoicePaymentAttemptsService.ts`, `publicCustomerInvoicesController.ts`, `publicPayPayloadMeta.ts` e `CustomerInvoicePay.tsx`.*
