# Auditoria de Dados — Multi-tenant (Etapa 4A)

## 1. Objetivo

Verificar, com base **apenas em consultas de leitura** ao banco, se existem sinais de **contaminação entre tenants**, **vínculos inválidos** entre entidades ou **inconsistências** entre `tenant_id` em tabelas relacionadas e o tenant inferido via `users`, após as Etapas 1–3 (incluindo RLS na Etapa 2 e endurecimento de aplicação na Etapa 3).

Esta etapa **não** altera dados, **não** executa scripts de correção e **não** modifica código.

## 2. Escopo analisado

| Domínio | Tabelas / relações |
|--------|---------------------|
| CRM — clientes | `clients` ↔ `users` (`user_id`, `tenant_id`) |
| Chat | `chat_conversations` ↔ `clients` (tenant do dono da conversa vs tenant do dono do cliente) |
| CRM — grupos | `clients.group_id` ↔ `client_groups` ↔ `users` (tenant) |
| Timeline | `client_timeline_events.tenant_id` vs tenant do cliente via `users` |
| Instâncias WhatsApp | `chat_instances` (`external_instance_name` vazio ou duplicado) |
| Faturas | `customer_invoice_items` ↔ `customer_invoices` (órfãos) |
| Identidade | `users` — e-mail duplicado (normalizado) |

**Fora do escopo desta rodada:** leads, assinaturas, mensagens linha a linha, webhooks, tabelas não listadas acima (podem entrar na Etapa 4B).

## 3. Metodologia

1. Conectar ao PostgreSQL com usuário somente leitura ou equivalente (aqui: `psql` no container Docker do projeto).
2. Executar exatamente as queries listadas na seção 4 (e desdobramentos para contagem quando necessário).
3. Registrar **totais de linhas** no universo analisado (para contextualizar volumes).
4. Registrar **contagem de inconsistências** por tipo e **exemplos de IDs** quando houver linhas.
5. Classificar cada tipo de achado (seção 6) e documentar **limitação de ambiente**: resultado reflete o **snapshot do banco onde as queries rodaram**.

**Execução registrada neste documento**

| Campo | Valor |
|-------|--------|
| Ambiente | Docker, container `painelcrm_postgres` |
| Banco | `painelcrm` |
| Usuário DB | `postgres` |
| Data da execução | 2026-03-31 |

**Atenção:** estes números refletem o **banco local de desenvolvimento** do repositório, não necessariamente produção ou staging. Para conclusão sobre produção, é obrigatório **reexecutar as mesmas queries** no ambiente com dados reais e anexar o resultado.

## 4. Queries executadas

### Universo (contagens de referência)

```sql
SELECT 'clients_total' AS metric, count(*)::text FROM clients
UNION ALL SELECT 'users_total', count(*)::text FROM users
UNION ALL SELECT 'chat_conversations_total', count(*)::text FROM chat_conversations
UNION ALL SELECT 'client_timeline_events_total', count(*)::text FROM client_timeline_events
UNION ALL SELECT 'chat_instances_total', count(*)::text FROM chat_instances
UNION ALL SELECT 'customer_invoice_items_total', count(*)::text FROM customer_invoice_items
UNION ALL SELECT 'customer_invoices_total', count(*)::text FROM customer_invoices;
```

**Resultado (ambiente local):** clients 9, users 5, chat_conversations 200, client_timeline_events 10, chat_instances 1, customer_invoice_items 7, customer_invoices 7.

---

### 1) Clientes × users × tenant (query base do plano)

```sql
SELECT c.id, c.user_id, u.tenant_id
FROM clients c
LEFT JOIN users u ON u.id = c.user_id
WHERE u.id IS NULL OR u.tenant_id IS NULL;
```

**Desdobramento (contagem):**

```sql
SELECT count(*) FROM clients c
LEFT JOIN users u ON u.id = c.user_id
WHERE u.id IS NULL;

SELECT count(*) FROM clients c
JOIN users u ON u.id = c.user_id
WHERE u.tenant_id IS NULL;

SELECT count(*) FROM users WHERE tenant_id IS NULL;
```

---

### 2) Conversas × clientes (crítico — tenant cruzado)

```sql
SELECT cc.id AS conversation_id,
       cc.user_id AS conv_user,
       uc.tenant_id AS conv_tenant,
       c.id AS client_id,
       c.user_id AS client_user,
       ucl.tenant_id AS client_tenant
FROM chat_conversations cc
JOIN users uc ON uc.id = cc.user_id
LEFT JOIN clients c ON c.id = cc.client_id
LEFT JOIN users ucl ON ucl.id = c.user_id
WHERE c.id IS NOT NULL
  AND uc.tenant_id IS DISTINCT FROM ucl.tenant_id;
```

---

### 3) Clientes × grupos (tenant do grupo vs tenant do cliente)

```sql
SELECT c.id, c.group_id, c.user_id,
       g.user_id AS group_user,
       uc.tenant_id AS client_tenant,
       ug.tenant_id AS group_tenant
FROM clients c
JOIN client_groups g ON g.id = c.group_id
JOIN users uc ON uc.id = c.user_id
JOIN users ug ON ug.id = g.user_id
WHERE uc.tenant_id IS DISTINCT FROM ug.tenant_id;
```

---

### 4) Timeline × clientes

```sql
SELECT e.id,
       e.tenant_id,
       uc.tenant_id AS client_tenant
FROM client_timeline_events e
JOIN clients c ON c.id = e.client_id
JOIN users uc ON uc.id = c.user_id
WHERE e.tenant_id IS DISTINCT FROM uc.tenant_id;
```

---

### 5) Instâncias de chat — nome externo vazio

```sql
SELECT id, name, external_instance_name
FROM chat_instances
WHERE external_instance_name IS NULL
   OR btrim(external_instance_name) = '';
```

### 5b) Instâncias — `external_instance_name` duplicado

```sql
SELECT external_instance_name, count(*)
FROM chat_instances
GROUP BY external_instance_name
HAVING count(*) > 1;
```

---

### 6) Faturas × itens (itens órfãos)

```sql
SELECT i.id
FROM customer_invoice_items i
LEFT JOIN customer_invoices ci ON ci.id = i.invoice_id
WHERE ci.id IS NULL;
```

---

### 7) Users — e-mail duplicado (global, normalizado)

```sql
SELECT lower(btrim(email)), count(*)
FROM users
WHERE email IS NOT NULL AND btrim(email) <> ''
GROUP BY lower(btrim(email))
HAVING count(*) > 1;
```

*(A query original do plano não filtrava e-mail vazio; aqui excluímos string vazia para evitar agrupar muitos “em branco” como duplicata sem significado.)*

## 5. Resultados encontrados

### Resumo quantitativo (ambiente local executado)

| # | Verificação | Inconsistências | Exemplos (IDs) |
|---|-------------|-----------------|----------------|
| 1a | `clients.user_id` sem `users` correspondente | **0** | — |
| 1b | Cliente cujo dono (`users`) tem `tenant_id` NULL | **4** | Clientes: `c55c9cec-07cf-4467-a7c9-bb648b333b1b`, `6b3754a1-41a8-4d7e-bb40-c74238f1dd00`, `8a75aaf2-c89a-4668-be1d-1d6160872e9a`, `54fb2632-323f-4a5a-80b1-e331bb72ae54`; todos com `user_id` = `3886bf78-77c8-4c3a-b9c9-d6441b275888` |
| 1c | `users` com `tenant_id` NULL | **1** | Mesmo `user_id` acima |
| 2 | Conversa com `client_id` apontando para cliente de **outro** tenant (vs dono da conversa) | **0** | — |
| 3 | Cliente com `group_id` cujo dono do grupo está em tenant diferente do dono do cliente | **0** | — |
| 4 | `client_timeline_events.tenant_id` ≠ tenant do cliente (via `users`) | **0** | — |
| 5a | `chat_instances` com `external_instance_name` vazio/NULL | **0** | — |
| 5b | `external_instance_name` repetido em mais de uma linha | **0** | — |
| 6 | Itens de fatura sem fatura pai | **0** | — |
| 7 | E-mail duplicado (normalizado, não vazio) | **0** | — |

### Interpretação objetiva

- **Vazamento explícito tenant A ↔ tenant B** nas relações **conversa–cliente**, **cliente–grupo** e **timeline–cliente**: **não detectado** neste snapshot (0 linhas nas queries 2, 3 e 4).
- **Inconsistência estrutural:** existe **1 usuário** sem `tenant_id` e **4 clientes** ligados a esse usuário — isso é **dado inconsistente com o modelo multi-tenant** (não prova, por si só, mistura entre dois tenants; indica **conta/dados sem tenant atribuído**).

## 6. Classificação dos problemas

| Classificação | Achados nesta execução | Justificativa |
|---------------|------------------------|---------------|
| **CRÍTICO** (vazamento entre tenants) | Nenhum nas queries 2, 3, 4 | Nenhuma linha com `conv_tenant` ≠ `client_tenant`, grupo em tenant diferente, ou evento de timeline com tenant divergente do cliente. |
| **ALTO** (inconsistência estrutural) | 1 user sem tenant; 4 clients dependentes | Impede afirmar escopo de tenant para esses registros; risco operacional para RLS/políticas que assumem `users.tenant_id` sempre preenchido. |
| **MÉDIO** | — | Não aplicável neste snapshot. |
| **BAIXO** (dado incompleto) | — | Não aplicável neste snapshot para os itens 5a/5b (0 ocorrências). |

## 7. Impacto potencial

- **Queries 2–4 em 0 linhas:** no banco auditado, **não há evidência** de cliente vinculado a conversa de outro tenant, grupo de outro tenant ou timeline com tenant “errado” em relação ao cliente. Impacto de **vazamento cruzado** por esses vínculos: **não observado** aqui.
- **User sem `tenant_id` + clientes associados:** em ambientes com RLS por `tenant_id`, esses registros podem ficar **inacessíveis** ou em **comportamento limite**, dependendo da política; também podem ser legado de antes da adoção de tenant. **Impacto:** operacional e de modelo de dados, não necessariamente “vazamento” para outro tenant.

## 8. Recomendações

1. **Reexecutar** todas as queries da seção 4 em **staging** e **produção** e atualizar este documento ou um anexo com data/ambiente.
2. Para o **usuário sem `tenant_id`** e os **4 clientes** (se reproduzidos em produção): abrir item na Etapa 4B — **decisão de negócio** (atribuir tenant, desativar conta, ou migrar ownership) sem `UPDATE` automático sem aprovação.
3. Opcional (4B): estender auditoria a **leads**, **subscriptions**, **chat_messages** × conversa, e **customer_invoices.tenant_id** vs `clients`/subscription.
4. Manter **trilha**: quem rodou, quando, e export CSV das linhas retornadas (não feito neste arquivo para não vazar PII).

## 9. Próximos passos (Etapa 4B)

1. Rodar o pacote de queries em **produção/staging** e comparar contagens com este baseline local.
2. Se houver linhas nas queries críticas (2–4): **priorizar análise de causa** (bug histórico, importação, uso de API sem validação) antes de qualquer `UPDATE`.
3. Elaborar **script de correção** (ou job controlado) apenas após critérios aprovados: dry-run, backup, janela de manutenção.
4. Opcional: queries adicionais para **órfãos** em outras FKs e para **invoice.tenant_id** vs itens (já coberto parcialmente pela Etapa 3 no código; 4B pode validar histórico no BD).

---

*Documento gerado na Etapa 4A — somente leitura. Nenhuma alteração de dados ou de código foi realizada para produzir estes resultados.*
