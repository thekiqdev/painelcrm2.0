# Investigação Técnica — Cleanup de Cobranças no Asaas após Pagamento

## 1. O que foi implementado

- **`applyPaymentEvent`** (`paymentDomainService.ts`): após `customer_invoice` → `paid`, bloco que busca tentativa paga alinhada a `customer_invoices.gateway_reference_id`, lista “outras” tentativas, chama `deleteGatewayChargeIfSafe` e `markAttemptCancelledSuperseded`, e emite logs `payment_cleanup_*`.
- **`applyPaymentAttemptEvent`** (mesmo arquivo): após consolidar a fatura como `paid`, chama **`supersedeOtherPendingAttemptsAfterPaid`** (`billingGatewayChargeService.ts`), que para cada “outra” tentativa chama `deleteGatewayChargeIfSafe` e depois `markAttemptCancelledSuperseded`.
- **`deleteGatewayChargeIfSafe`**: carrega config do tenant, opcionalmente `getPayment` para não apagar estado terminal, depois `gateway.cancelPayment` (no Asaas: `DELETE /v3/payments/:id` via `asaasClient.deletePayment`). Logs: `gateway_charge_delete_*`.

## 2. Fluxo real executado

No **`webhookCore.handleWebhook`**:

1. Se **`findInvoiceAttemptByGatewayReference(gateway, referenceId)`** encontra linha em `customer_invoice_payment_attempts` → só roda **`applyPaymentAttemptEvent`** (não entra em `applyPaymentEvent`).
2. Só cai em **`applyPaymentEvent`** quando **não** há tentativa com aquele `gateway_reference_id` (ex.: fatura antiga só com agregado em `customer_invoices`).

Consequência: em fluxos com tabela de tentativas preenchida (troca de método / múltiplas cobranças), o caminho dominante é **`applyPaymentAttemptEvent` + `supersedeOtherPendingAttemptsAfterPaid`**. Os logs **`payment_cleanup_*`** tendem a **não aparecer** nesses casos; o que importa é **`gateway_charge_deleted`** / **`gateway_charge_delete_skipped`** / **`gateway_charge_delete_failed`**.

A rotina **`listPendingAttemptsForInvoiceExcept`** define *quem* são as “outras cobranças” a limpar.

## 3. Onde a limpeza falhou

- **`supersedeOtherPendingAttemptsAfterPaid`** e o bloco em **`applyPaymentEvent`** usam a **mesma** lista: **`listPendingAttemptsForInvoiceExcept`**.
- Essa função, **antes da correção**, filtrava apenas:

  `status IN ('pending', 'waiting_payment', 'processing', 'overdue')`.

- Na **troca de método de pagamento**, tentativas não ativas são marcadas como **`cancelled`** / superseded no banco (`markAttemptCancelledSuperseded`), enquanto a cobrança correspondente **pode permanecer PENDING no Asaas** (ou não ter sido removida no gateway).
- Ao **pagar** por uma tentativa (ex.: PIX), as **outras** (BOLETO, cartão) já podem estar com **`status = 'cancelled'`** no CRM, **fora** do filtro “pending…overdue”. A lista ficava **vazia** → **nenhuma** chamada a `deleteGatewayChargeIfSafe` → cobranças **continuam no Asaas**.

Ou seja: a falha não era necessariamente “Asaas recusou o DELETE”, e sim **a aplicação nem tentava** cancelar essas cobranças.

## 4. Se a falha está no domínio, no service ou no gateway

| Camada | Papel |
|--------|--------|
| **Domínio** (`applyPaymentEvent` / `applyPaymentAttemptEvent`) | Orquestra atualização de status e chama supersede/cleanup. |
| **Lista de tentativas** (`listPendingAttemptsForInvoiceExcept`) | **Aqui estava o bug**: critério muito restrito, ignorando `cancelled` (e outros não pagos) com `gateway_reference_id`. |
| **Gateway** (`deleteGatewayChargeIfSafe` + Asaas) | Só é acionado para linhas retornadas pela lista; `getPayment`/`cancelPayment` podem ainda pular casos terminal (ex.: já pago no gateway), com logs explícitos. |

## 5. Impacto no banco e no Asaas

- **Banco**: tentativas antigas já podiam estar `cancelled` localmente; a fatura e a tentativa paga seguem corretos.
- **Asaas**: cobranças “substituídas” na troca de método continuavam **ativas** ou ao menos **listáveis**, porque o cleanup pós-pagamento **não as incluía** na iteração.

## 6. Causa raiz principal

**Critério de seleção das tentativas a limpar** incompatível com o modelo real: após trocas de método, cobranças alternativas frequentemente estão **`cancelled` no banco** mas ainda **não removidas no gateway**. Filtrar só “abertas” no CRM excluía exatamente os registros que ainda precisavam de `DELETE` no Asaas.

## 7. Correção mínima recomendada

Ampliar **`listPendingAttemptsForInvoiceExcept`** para retornar todas as tentativas da fatura (exceto a excluída por `id`) que tenham **`gateway_reference_id`** e **`status` não seja `paid` nem `refunded`**. Assim entram tentativas `cancelled`, `failed`, etc., sobre as quais ainda faz sentido tentar remoção segura no gateway (`deleteGatewayChargeIfSafe` continua decidindo se apaga ou ignora conforme status ao vivo).

## 8. Arquivos que precisam ser alterados

- `packages/backend/src/services/customerInvoicePaymentAttemptsService.ts` — query de `listPendingAttemptsForInvoiceExcept` e comentário de contrato.

## 9. O que NÃO deve ser alterado

- Formato de webhooks, `payment_events`, parsers multi-gateway.
- Esquema de `customer_invoices` / `customer_invoice_payment_attempts`.
- Lógica de `deleteGatewayChargeIfSafe` e integração Asaas além do necessário (ela já trata terminal/404).
- Refatoração ampla de `webhookCore` ou duplicação de cleanup entre `applyPaymentEvent` e `applyPaymentAttemptEvent` (a correção na lista unifica o comportamento dos dois chamadores).

---

## Validação sugerida (manual)

1. Criar fatura e gerar PIX + BOLETO + CARTÃO (trocando métodos para criar as tentativas).
2. Pagar por PIX.
3. Conferir: fatura `paid`; tentativa PIX preservada; no Asaas, cobranças BOLETO/cartão removidas ou canceladas conforme API.
4. Repetir pagando por boleto e por cartão.

Observação: no painel Asaas, cobranças **deletadas** podem ainda aparecer em histórico; o critério de sucesso é ausência de cobrança **pendente** equivalente ou resposta 404 ao consultar o ID.
