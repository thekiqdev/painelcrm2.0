# Relatório — Implementação da migration 75 (CHECK de status)

**Objetivo:** Alinhar os CHECK constraints de `status` nas tabelas `customer_invoices` e `tenant_billing` aos 8 status do domínio, sem alterar arquitetura, webhook, parser, domain ou persistência.

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `database/init/75_payment_status_check_multi_gateway.sql` | **Criado.** Migration que remove o CHECK atual de status (por busca dinâmica) e adiciona novo CHECK com os 8 valores em cada tabela. |
| `packages/backend/src/migrate.ts` | **Alterado.** Inclusão de `'75_payment_status_check_multi_gateway.sql'` na lista de migrations, após `74_drop_asaas_payment_columns.sql` e antes de `create-admin-user.sql`. |

Nenhum outro arquivo foi modificado (webhook, parser, webhookCore, paymentDomainService, serviços de persistência, colunas de gateway ou lógica de negócio permanecem intactos).

---

## SQL aplicado

A migration executa, em ordem:

1. **customer_invoices**
   - Bloco `DO $$` que localiza o constraint de CHECK cuja definição contém `status` na tabela `customer_invoices`, obtém o nome e executa `ALTER TABLE public.customer_invoices DROP CONSTRAINT IF EXISTS <conname>`.
   - `ALTER TABLE public.customer_invoices ADD CONSTRAINT customer_invoices_status_check CHECK (status IN ('pending', 'waiting_payment', 'processing', 'paid', 'overdue', 'cancelled', 'failed', 'refunded'))`.

2. **tenant_billing**
   - Bloco `DO $$` que localiza o constraint de CHECK cuja definição contém `status` na tabela `tenant_billing`, obtém o nome e executa `ALTER TABLE public.tenant_billing DROP CONSTRAINT IF EXISTS <conname>`.
   - `ALTER TABLE public.tenant_billing ADD CONSTRAINT tenant_billing_status_check CHECK (status IN ('pending', 'waiting_payment', 'processing', 'paid', 'overdue', 'cancelled', 'failed', 'refunded'))`.

A remoção usa busca dinâmica (por `pg_constraint` + `pg_class` + `pg_get_constraintdef(...) LIKE '%status%'`), não dependendo de nome fixo da constraint.

---

## Risco da mudança

- **Baixo.** A alteração apenas **amplia** o conjunto de valores permitidos em `status`. Os valores já aceitos antes (pending, paid, overdue, cancelled e, em customer_invoices, failed e refunded) continuam válidos.
- **Dados existentes:** Nenhum registro precisa ser alterado; a migration não escreve em colunas. Se em algum ambiente existir valor de `status` fora dos 8 (ex.: typo ou dado legado), o novo CHECK falharia ao ser criado; nesse caso, corrigir dados antes de aplicar a migration.
- **Recomendação:** Antes de aplicar em produção, executar `SELECT DISTINCT status FROM customer_invoices;` e `SELECT DISTINCT status FROM tenant_billing;` e confirmar que todos os valores estão no conjunto: pending, waiting_payment, processing, paid, overdue, cancelled, failed, refunded.

---

## Como testar manualmente

1. **Aplicar a migration:**  
   Na raiz do projeto (ou conforme seu fluxo): `npm run migrate` (ou o comando que executa as migrations do `database/init`).

2. **Conferir os CHECKs no banco:**  
   ```sql
   SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
   FROM pg_constraint
   WHERE conrelid IN ('public.customer_invoices'::regclass, 'public.tenant_billing'::regclass)
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%';
   ```  
   Deve retornar duas linhas com a definição contendo os 8 status.

3. **Teste de escrita (opcional, em ambiente de teste):**  
   - Para uma linha de teste em `tenant_billing`:  
     `UPDATE tenant_billing SET status = 'refunded' WHERE id = '<id_teste>';`  
     deve ser aceito.  
   - Reverter se necessário:  
     `UPDATE tenant_billing SET status = 'pending' WHERE id = '<id_teste>';`  
   - Valor inválido deve falhar:  
     `UPDATE tenant_billing SET status = 'invalid' WHERE id = '<id_teste>';`  
     → erro de violação de constraint.

4. **Regressão funcional:**  
   Fluxo normal de cobrança (criar cobrança → status pending) e, se possível, webhook de pagamento (paid) e de estorno (refunded) para confirmar que o processamento completa sem erro.

---

## Confirmação

- **Criação de cobrança:** Inalterada; continua usando `status = 'pending'`, que segue permitido.
- **Webhook / Asaas:** Nenhuma alteração em parser, webhookCore, paymentDomainService ou rotas; apenas o banco passa a aceitar os 8 status, eliminando o risco de violação de CHECK quando o domínio gravar `refunded` ou `failed` em `tenant_billing`, ou `waiting_payment`/`processing` no futuro.
- **Nenhuma outra parte do sistema foi alterada:** somente a migration 75 e o registro em `migrate.ts` foram tocados; compatibilidade com o que já está em produção é mantida.
