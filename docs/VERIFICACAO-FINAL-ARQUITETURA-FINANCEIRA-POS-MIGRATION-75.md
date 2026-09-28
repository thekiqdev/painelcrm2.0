# Verificação Final da Arquitetura de Faturamento

**Escopo:** Análise somente leitura após a migration `75_payment_status_check_multi_gateway.sql`. Nenhuma alteração de código ou migrations.  
**Data de referência:** conforme estado atual do repositório.

---

## 1) Validação do banco

### CHECK em `customer_invoices.status` e `tenant_billing.status`

Conforme o arquivo **`database/init/75_payment_status_check_multi_gateway.sql`**:

- Antes de recriar, um bloco `DO $$` localiza **um** constraint de tipo `CHECK` cuja definição contém a substring `status` e remove esse constraint (padrão herdado das migrations 63/71).
- Em seguida são criados:
  - **`customer_invoices_status_check`:**  
    `status IN ('pending', 'waiting_payment', 'processing', 'paid', 'overdue', 'cancelled', 'failed', 'refunded')`
  - **`tenant_billing_status_check`:**  
    mesmo conjunto de **8 valores**.

**Conclusão:** Após aplicar a 75 com sucesso, o banco **deve** aceitar exatamente esses 8 status nas duas tabelas.

### CHECK antigo duplicado

- Não há, no SQL da 75, criação de um segundo CHECK sobre `status` nas mesmas tabelas.
- **Ressalva teórica:** se em algum ambiente existisse **mais de um** CHECK envolvendo a palavra `status` na mesma tabela (ex.: constraint customizada), o bloco usa `LIMIT 1` e só remove **um** por execução. No schema padrão do projeto (71 + 75), o único CHECK de coluna `status` em `customer_invoices` é o de status; demais CHECKs (origin, invoice_type) não batem em `LIKE '%status%'` da mesma forma que o de `status` — na prática o alvo é o CHECK de `status`. **Recomendação operacional:** em produção, validar com:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.customer_invoices'::regclass, 'public.tenant_billing'::regclass)
  AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%status%';
```

Deve haver **apenas** `customer_invoices_status_check` e `tenant_billing_status_check`, cada um listando os 8 valores.

### Registro em `migrate.ts`

- **`75_payment_status_check_multi_gateway.sql`** está listada em **`packages/backend/src/migrate.ts`**, após `74_drop_asaas_payment_columns.sql` e antes de `create-admin-user.sql`.

---

## 2) Validação da camada de serviço

### `updateInvoiceStatus` (`invoiceService.ts`)

- Persiste `status` em `tenant_billing` via parâmetro `$1` (valor em runtime).
- Tipo TypeScript: `BillingStatus = 'pending' | 'paid' | 'overdue' | 'cancelled'`, mas **`paymentDomainService.applyPaymentEvent`** chama com `internalStatus as BillingStatus`, passando em runtime qualquer um dos **8** valores de `InternalPaymentStatus`.
- **Após a 75:** todos esses 8 valores são aceitos pelo CHECK do banco. **Compatível.**

### `updateCustomerInvoiceStatus` (`customerInvoiceService.ts`)

- Assinatura `status: string`; o webhook passa `internalStatus` (8 valores possíveis).
- **Após a 75:** os 8 status estão no CHECK. **Compatível.**

### Cast TypeScript e valores inválidos

- O cast em `applyPaymentEvent` **não restringe** o valor em runtime; apenas satisfaz o compilador. O risco de violação de CHECK por `refunded`/`failed`/`waiting_payment`/`processing` em **tenant_billing** era real **antes** da 75; **depois da 75, esse risco específico some** para os valores produzidos pelo domínio (`InternalPaymentStatus`).
- **Risco residual:** qualquer outro código que chame `updateInvoiceStatus` ou `updateCustomerInvoiceStatus` com string **fora** dos 8 (ex.: typo) ainda pode falhar no CHECK — isso é comportamento desejável do banco.

### `InternalPaymentStatus` vs banco

- Os 8 membros de **`InternalPaymentStatus`** (`paymentGatewayTypes.ts`) coincidem **1:1** com o CHECK pós-75.

---

## 3) Validação do fluxo de webhook

Fluxo: **webhook → parser → webhookCore → paymentDomainService → update status**

| Etapa | Consistência com os 8 status |
|-------|-------------------------------|
| **normalizeGatewayStatus** | Retorna sempre um `InternalPaymentStatus`. Para Asaas, mapeia para subset (pending, paid, overdue, refunded, cancelled). Para **outro** `gatewayKey` não tratado, retorna `'pending'`. |
| **canTransition** | Opera sobre os 8 status (`ORDER`, `TRANSIENT`, `FINAL`). Independente do CHECK ampliado; lógica inalterada. |
| **applyPaymentEvent** | Se `canTransition` ok, chama `updateInvoiceStatus` / `updateCustomerInvoiceStatus` com `internalStatus`. Com a 75, esses valores são todos aceitos pelo banco. |

**Conclusão:** O fluxo permanece **coerente**; a 75 remove o desalinhamento banco↔domínio que poderia quebrar o UPDATE em `tenant_billing` para `refunded`/`failed`.

---

## 4) Segurança dos CHECK constraints

| Cenário | Antes da 75 | Depois da 75 |
|---------|-------------|--------------|
| **tenant_billing** com `refunded` / `failed` (webhook) | Risco de violação de CHECK | **Sem** violação para esses valores |
| **customer_invoices** com `waiting_payment` / `processing` | Risco de violação | **Sem** violação para esses valores |

Não há mais, para o **conjunto de status do domínio**, risco de erro de banco por CHECK nessas duas colunas — desde que a migration 75 tenha sido aplicada com sucesso no ambiente em questão.

---

## 5) Prontidão multi-gateway

| Aspecto | Estado |
|---------|--------|
| Schema (`gateway_*`, `payment_events`, CHECK alinhado aos 8 status) | **Alinhado** |
| Core webhook (parser registrável, idempotência, domain) | **Correto** |
| Asaas | **Funcional** no fluxo atual |
| **Segundo gateway** | Exige **parser** próprio + extensão de **`normalizeGatewayStatus`** (ou equivalente) para mapear estados externos → `InternalPaymentStatus` (`waiting_payment`, `processing`, `failed`, etc.). Hoje, gateway desconhecido cai em `'pending'`. |
| Teste de conexão / criação de cobrança genérica | Podem ainda depender de implementação específica por gateway (fora do escopo desta verificação). |

**Classificação:** **PARCIALMENTE PRONTA**

- **Pronta** em: modelo de dados, fluxo webhook genérico, alinhamento status banco↔domínio, continuidade Asaas.
- **Parcial** em: segundo gateway exige trabalho de integração (parser + normalização + eventual gateway service), não apenas o CHECK.

---

## Conclusão final

**A arquitetura financeira do sistema está segura e pronta para evolução?**

**SIM** — no que diz respeito a **segurança de persistência de status** e **ausência de violação de CHECK** para o domínio de 8 status após a migration 75, e à **consistência** do fluxo webhook → persistência.

**Com ressalva:** “pronta para evolução” no sentido de **plugar um segundo gateway sem mais código** continua **não** sendo o caso; a evolução exige implementação do gateway (parser/normalização/serviços). O alinhamento CHECK + domínio **remove um bloqueio estrutural** que existia para `tenant_billing` e para futuros estados em `customer_invoices`.

---

*Documento gerado apenas para auditoria; sem alterações em código ou migrations.*
