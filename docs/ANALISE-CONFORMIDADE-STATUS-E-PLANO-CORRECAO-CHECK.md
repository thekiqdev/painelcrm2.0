# Análise final de conformidade — Status do domínio vs CHECK do banco

**Escopo:** Alinhamento entre o domínio de status de pagamento (código) e os CHECK constraints reais nas tabelas `customer_invoices` e `tenant_billing`.  
**Regra:** Apenas análise e plano de correção; sem refatorar arquitetura, webhook, parser, webhookCore, paymentDomainService ou persistência genérica. Sem implementação.

---

## 1. Status que o domínio usa hoje no código

O domínio de pagamento está definido em **`InternalPaymentStatus`** (`packages/backend/src/modules/payments/paymentGatewayTypes.ts`):

| # | Status            | Uso no código |
|---|-------------------|----------------|
| 1 | `pending`         | Estado inicial; transiente; ordem 0 em statusNormalizer |
| 2 | `waiting_payment`  | Transiente (ex.: aguardando pagamento); ordem 1 |
| 3 | `processing`      | Transiente (ex.: processando); ordem 2 |
| 4 | `paid`            | Final; ativa plano em tenant_billing |
| 5 | `overdue`         | Final; vencido |
| 6 | `cancelled`       | Final; cancelado |
| 7 | `failed`          | Final; falhou |
| 8 | `refunded`        | Final; estornado |

**Onde são usados:**

- **statusNormalizer.ts:** `ORDER`, `TRANSIENT`, `FINAL`; `canTransition(current, new)`; `normalizeGatewayStatus(gatewayKey, externalStatus)` — Asaas mapeia para pending, paid, overdue, refunded, cancelled (hoje não devolve waiting_payment nem processing).
- **paymentDomainService.applyPaymentEvent:** Recebe `internalStatus: InternalPaymentStatus` e chama:
  - **tenant_billing:** `updateInvoiceStatus(entityId, internalStatus as BillingStatus, ...)` — em runtime o valor pode ser qualquer um dos 8 (o cast é apenas TypeScript).
  - **customer_invoices:** `updateCustomerInvoiceStatus(entityId, internalStatus, ...)` — status é `string`, aceita qualquer um dos 8.

**Conclusão 1:** O domínio utiliza exatamente **8 status**: `pending`, `waiting_payment`, `processing`, `paid`, `overdue`, `cancelled`, `failed`, `refunded`.

---

## 2. Status realmente aceitos hoje no banco (conforme migrations do repositório)

### 2.1 customer_invoices

- **Fonte:** `database/init/71_customer_invoices_manual_support.sql`
- **Constraint:** `customer_invoices_status_check`
- **Valores aceitos:** `pending`, `paid`, `overdue`, `cancelled`, `failed`, `refunded` (**6 valores**).
- **Não aceitos:** `waiting_payment`, `processing`.

### 2.2 tenant_billing

- **Fonte:** `database/init/63_activation_plan_phase1.sql` (substitui o CHECK original da 33).
- **Constraint:** `tenant_billing_status_check`
- **Valores aceitos:** `pending`, `paid`, `overdue`, `cancelled` (**4 valores**).
- **Não aceitos:** `waiting_payment`, `processing`, `failed`, `refunded`.

---

## 3. Risco real de violação de CHECK no fluxo atual

### 3.1 tenant_billing — eventos `failed` e `refunded`

- **Fluxo:** Webhook (ex.: Asaas REFUNDED) → parser → core → `normalizeGatewayStatus('asaas', 'REFUNDED')` → `'refunded'` → `applyPaymentEvent` → `updateInvoiceStatus(billingId, 'refunded', ...)`.
- **Banco:** CHECK aceita apenas `pending`, `paid`, `overdue`, `cancelled`.
- **Resultado:** UPDATE em `tenant_billing` com `status = 'refunded'` **viola o CHECK** → erro de constraint e falha da transação.
- **Conclusão:** Risco **real e imediato** para qualquer evento que normalize para `refunded` ou `failed` em `tenant_billing` (ex.: webhook de estorno ou falha em cobrança SaaS).

### 3.2 customer_invoices — eventos `failed` e `refunded`

- O CHECK atual (71) **já aceita** `failed` e `refunded`. Nenhum risco para esses dois em customer_invoices.

### 3.3 Futuros gateways — `waiting_payment` e `processing`

- **customer_invoices:** Se um gateway futuro (ex.: Stripe) normalizar para `waiting_payment` ou `processing`, o `updateCustomerInvoiceStatus` gravaria esse valor e o CHECK atual **rejeitaria** (só tem 6 valores).
- **tenant_billing:** Idem: CHECK atual só tem 4 valores; `waiting_payment` e `processing` seriam rejeitados.
- **Conclusão:** Risco **futuro** assim que um gateway passar a usar esses status no normalizer.

### 3.4 Resumo de risco

| Tabela            | Cenário                          | Risco                          |
|-------------------|-----------------------------------|--------------------------------|
| tenant_billing    | Webhook REFUNDED/FAILED hoje      | **Alto** — violação imediata   |
| tenant_billing    | Gateway com waiting_payment/processing | **Médio** — ao integrar novo gateway |
| customer_invoices | Webhook REFUNDED/FAILED hoje      | Nenhum (já aceitos)            |
| customer_invoices | Gateway com waiting_payment/processing | **Médio** — ao integrar novo gateway |

---

## 4. Confirmação: arquitetura multi-gateway e único ajuste restante

Com base no relatório de validação pós-migração e nesta análise:

- **Arquitetura multi-gateway:** Correta (colunas genéricas, payment_events, lookup por gateway + gateway_reference_id).
- **Webhook (3 camadas):** Parser → Core → Domain está íntegro; idempotência e anti-regressão corretas.
- **Persistência genérica:** `updateInvoiceStatus` e `updateCustomerInvoiceStatus` atualizam `status` e `gateway_status` de forma alinhada ao plano; não há escrita em colunas asaas_*.
- **Único ajuste restante:** Os CHECK constraints de `status` em `customer_invoices` e `tenant_billing` não cobrem os 8 status do domínio. Nenhuma alteração em webhook, parser, webhookCore, paymentDomainService ou serviços de persistência é necessária para conformidade de domínio; apenas o **CHECK do banco** precisa ser expandido.

**Conclusão 4:** Sim — o único ponto pendente para conformidade entre domínio e banco é o **CHECK de status** nas duas tabelas.

---

## 5. Plano de correção pontual (apenas CHECKs)

### 5.1 Objetivo

Alinhar os CHECKs de `status` ao domínio **InternalPaymentStatus**: aceitar exatamente os 8 valores em ambas as tabelas, sem alterar código de aplicação.

### 5.2 Migration necessária

- **Arquivo sugerido:** `database/init/75_payment_status_check_multi_gateway.sql`
- **Ordem:** Após `74_drop_asaas_payment_columns.sql` e antes de `create-admin-user.sql` (incluir `75_payment_status_check_multi_gateway.sql` na lista em `migrate.ts`).

### 5.3 Constraints atuais a remover

| Tabela            | Nome da constraint (após 63/71)   | Ação   |
|-------------------|------------------------------------|--------|
| customer_invoices | `customer_invoices_status_check`   | Remover |
| tenant_billing    | `tenant_billing_status_check`      | Remover |

**Forma segura de remoção:** Usar o mesmo padrão das migrations 63 e 71: bloco anônimo `DO $$` que localiza o CHECK pelo nome da tabela e pela definição contendo `status`, obtém `conname` e executa `ALTER TABLE ... DROP CONSTRAINT ...`. Assim não se depende do nome exato da constraint (caso em algum ambiente tenha sido criada com nome diferente).

### 5.4 Novas constraints a criar

**Conjunto único para ambas as tabelas (8 valores):**

```text
pending, waiting_payment, processing, paid, overdue, cancelled, failed, refunded
```

- **customer_invoices:**  
  `ADD CONSTRAINT customer_invoices_status_check CHECK (status IN ('pending', 'waiting_payment', 'processing', 'paid', 'overdue', 'cancelled', 'failed', 'refunded'));`

- **tenant_billing:**  
  `ADD CONSTRAINT tenant_billing_status_check CHECK (status IN ('pending', 'waiting_payment', 'processing', 'paid', 'overdue', 'cancelled', 'failed', 'refunded'));`

### 5.5 Ordem segura de execução dentro da migration

1. **customer_invoices**
   - 1.1. Localizar e remover o CHECK de status existente (DO $$ ... DROP CONSTRAINT).
   - 1.2. Adicionar `customer_invoices_status_check` com os 8 valores.
2. **tenant_billing**
   - 2.1. Localizar e remover o CHECK de status existente (DO $$ ... DROP CONSTRAINT).
   - 2.2. Adicionar `tenant_billing_status_check` com os 8 valores.

Ordem evita dependências entre tabelas; cada uma é ajustada de forma atômica (drop + add).

### 5.6 Riscos da correção

| Risco | Mitigação |
|-------|-----------|
| DROP falhar se o nome da constraint for diferente | Usar busca dinâmica por tabela + `pg_get_constraintdef(...) LIKE '%status%'` como em 63/71. |
| Dados existentes com valor fora do novo CHECK | Hoje o código só grava os 8 valores ou os subconjuntos já permitidos; não há coluna com valores “estranhos” conhecidos. Mesmo assim, antes de aplicar em produção: `SELECT DISTINCT status FROM customer_invoices; SELECT DISTINCT status FROM tenant_billing;` e conferir que todos estão no conjunto dos 8. |
| Rollback | Migration não reverte sozinha; se necessário, fazer migration reversa (recriar CHECK antigo com 6/4 valores). Documentar no mesmo arquivo ou em comentário. |

### 5.7 Como testar após aplicar

1. **Verificar constraints no banco:**
   - Listar CHECKs: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.customer_invoices'::regclass, 'public.tenant_billing'::regclass) AND contype = 'c';`
   - Confirmar que ambas as tabelas têm CHECK de status com exatamente os 8 valores.

2. **Teste de escrita (opcional, em ambiente de teste):**
   - Para cada uma das 8 valores, um UPDATE em uma linha de teste em `customer_invoices` e em `tenant_billing` (ex.: `UPDATE ... SET status = 'refunded' WHERE id = ...`) deve ser aceito.
   - Um UPDATE com valor fora do conjunto (ex.: `status = 'invalid'`) deve falhar com violação de constraint.

3. **Regressão funcional:**
   - Webhook Asaas: enviar evento de pagamento confirmado (paid) e de estorno (refunded) para um tenant_billing e para um customer_invoice (se aplicável) e confirmar que o processamento completa sem erro e que `status` e `gateway_status` ficam corretos.

---

## 6. Resumo

- **Domínio:** 8 status — pending, waiting_payment, processing, paid, overdue, cancelled, failed, refunded.
- **Banco hoje:** customer_invoices aceita 6 (faltam waiting_payment, processing); tenant_billing aceita 4 (faltam waiting_payment, processing, failed, refunded).
- **Risco imediato:** tenant_billing com evento refunded/failed viola CHECK.
- **Arquitetura:** Multi-gateway, webhook e persistência estão corretos; o único ajuste necessário é o CHECK de status.
- **Plano:** Uma migration (75) que remova o CHECK de status atual de cada tabela (por busca dinâmica) e adicione novo CHECK com os 8 valores em ambas; depois incluir 75 em `migrate.ts`, validar dados existentes, aplicar e testar conforme seção 5.7.

**Não implementado neste documento:** Nenhum código ou SQL foi gerado; apenas análise e plano mínimo de correção conforme solicitado.
