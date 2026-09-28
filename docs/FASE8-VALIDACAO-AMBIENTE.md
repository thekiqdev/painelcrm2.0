# Fase 8 — Validação por ambiente (execução prática)

Guia **passo a passo** para validar a Fase 8 em **staging** e **produção**. Sem teoria: comando/ação, onde rodar, o que ver, como dar OK.

**Não implementa código.** Complementa `FASE8-ACEITE-OPERACIONAL.md` (critérios) com a **execução**.

---

## Variáveis que você vai usar

Substitua antes de copiar comandos:

| Placeholder | Exemplo |
|-------------|---------|
| `DATABASE_URL` | Connection string PostgreSQL (ou use `psql -h -U -d`). |
| `API_BASE` | `https://api.seudominio.com` ou `http://localhost:3001`. |
| `FRONT_BASE` | URL do painel e da rota pública `/pay/...`. |
| `TOKEN_JWT` | Token Bearer após login no painel (DevTools → Network → header Authorization). |
| `INVOICE_ID` | UUID de uma fatura do tenant de teste. |
| `PAY_TOKEN` | `payment_token` da fatura pagável (coluna em `customer_invoices` ou link da UI). |

---

## Parte A — Migrações 80 e 81

### A.1 Onde executar

| Ação | Onde |
|------|------|
| Rodar migrate | **Servidor** onde está o backend (ou CI com acesso ao DB de staging/prod). |
| Conferir colunas | **Banco** (`psql`, DBeaver, Cloud SQL console, etc.). |

### A.2 Ação exata (pipeline típico do repositório)

1. Garantir `.env` (ou secrets do ambiente) com **`DATABASE_URL`** apontando para o banco **deste** ambiente.
2. No diretório do backend compilado:

```bash
cd packages/backend
npm run build
npm run migrate
```

**O que observar:** saída sem erro; os arquivos `80_customer_invoice_items_advanced_schedule.sql` e `81_customer_invoice_parent_child_e2.sql` entram na ordem global do `migrate.ts` (após os anteriores).

**Sucesso:** migrate termina com exit code 0; nenhuma mensagem `ERROR` do PostgreSQL.

**Se o deploy não usa `npm run migrate`:** aplicar manualmente o conteúdo de `database/init/80_...sql` e depois `81_...sql`, **nessa ordem**, com a mesma ferramenta que já usam para DDL (Flyway, runner interno, etc.).

### A.3 Reinício da API

| Ação | Onde |
|------|------|
| Reiniciar processo | **Host** do backend (PM2, Docker, K8s rollout, etc.). |

**Sucesso:** health/readiness OK; nenhum crash loop por DB.

---

## Parte B — SQL no banco (S1 e S2)

### B.1 S1 — Colunas da migração 80

**Onde:** cliente SQL conectado ao banco do ambiente.

```sql
SELECT is_recurring, recurring_interval, scheduled_due_date
FROM customer_invoice_items
LIMIT 1;
```

**O que observar:** query executa **sem** erro `column ... does not exist`.

**Sucesso:** resultado com 0 ou mais linhas; o importante é **não** falhar no parser de colunas.

### B.2 S2 — Colunas da migração 81

```sql
SELECT parent_invoice_id, parent_invoice_item_id
FROM customer_invoices
LIMIT 1;
```

**Sucesso:** idem — sem erro de coluna inexistente.

### B.3 Se der erro em S1 ou S2

- Migração **não** aplicada neste banco **ou** conectou no banco errado.
- **Não** é bug da Fase 8 no código: é operação incompleta até rodar 80→81.

---

## Parte C — API autenticada (S3, S4, S5)

### C.1 S3 — Listagem de faturas

**Onde:** terminal com `curl` **ou** navegador logado no painel (aba Rede).

**Ação (curl):**

```bash
curl -s -o /tmp/inv_list.json -w "%{http_code}" \
  -H "Authorization: Bearer TOKEN_JWT" \
  "API_BASE/api/customer-invoices"
```

**O que observar:** código HTTP na última linha (ou no DevTools: status 200).

**Sucesso:** **200** e corpo JSON parseável (lista ou `{ data: ... }` conforme contrato atual). **Não** deve aparecer erro SQL no corpo ou 500.

### C.2 S4 — Detalhe de fatura

Substitua `INVOICE_ID`:

```bash
curl -s -o /tmp/inv_one.json -w "%{http_code}" \
  -H "Authorization: Bearer TOKEN_JWT" \
  "API_BASE/api/customer-invoices/INVOICE_ID"
```

**Sucesso:** **200** e dados da fatura.

**Alternativa frontend:** abrir no painel a tela de detalhe da mesma fatura — deve carregar sem tela de erro.

### C.3 S5 — Criação de fatura manual

**Onde:** **Frontend** (recomendado) — fluxo “Nova fatura” com cliente com CPF/CNPJ e gateway CRM ativo.

**Ou** `POST` com o body que o front envia (copiar do Network), com mesmo `TOKEN_JWT`.

**O que observar:** resposta **2xx**; fatura aparece na listagem.

**Sucesso:** nova linha em `customer_invoices` para o tenant (opcional conferir no SQL por `id` retornado).

**Falha comum:** 400 pré-condição (sem CPF no cliente ou sem gateway ativo) — corrigir **dados de teste**, não o código.

---

## Parte D — Persistência avançada (S6)

**Pré-requisito:** S1 OK (migração 80 aplicada).

**Onde:** **Frontend** — criar/editar fatura com item recorrente ou com data agendada **se a UI expuser** esses campos.

**O que observar:** após salvar, no **banco**:

```sql
SELECT id, is_recurring, recurring_interval, scheduled_due_date
FROM customer_invoice_items
WHERE invoice_id = 'INVOICE_ID_DO_TESTE'
ORDER BY created_at DESC;
```

**Sucesso:** valores gravados batem com o que você marcou na UI (não tudo `NULL` quando você preencheu).

**Se sempre NULL com UI preenchida:** degradação — ver **Alertas** (Parte G).

**Se a UI não tem esses campos:** marque S6 como **N/A** no template e registre: “produto não expõe item avançado na UI; validação 80 apenas via SQL S1 + confiança em jobs”.

---

## Parte E — Fluxo de pagamento público (S7, S8)

### E.1 S7 — Página pública

**Onde:** **navegador** (modo anônimo opcional).

**Ação:** abrir `FRONT_BASE/pay/PAY_TOKEN` (URL exata conforme rota do front).

**O que observar:** página carrega; formulário ou instruções de pagamento; **não** página em branco com 404 da SPA errada.

**Sucesso:** status HTTP 200 no documento; sem erro de app React fatal.

### E.2 S8 — PIX (quando o gateway devolver)

**O que observar:** bloco QR ou campo “copia e cola” visível.

**Sucesso:** presença do elemento conforme ambiente (sandbox Asaas costuma retornar metadados).

**Se não aparecer PIX:** pode ser método da fatura = boleto/cartão apenas — anotar no template. Se a fatura deveria ser PIX e não há payload, checar `gateway_metadata` no DB e logs do `createCharge` (suporte), sem mudar código neste guia.

---

## Parte F — Webhook (S9)

**Onde:** **banco** + **gateway** (painel sandbox) + opcionalmente **logs** da API.

**Ação:**

1. Em sandbox, pagar a cobrança ligada à fatura de teste (PIX ou método disponível).
2. Aguardar alguns segundos (webhook assíncrono).

**Validação no banco:**

```sql
SELECT id, status, paid_at, gateway_status, updated_at
FROM customer_invoices
WHERE id = 'INVOICE_ID';
```

**Sucesso:** `status` (e/ou `paid_at`) reflete **pago** conforme regra do produto; `updated_at` recente após o pagamento.

**O que observar nos logs:** entrada de webhook processada sem stack trace (filtro por rota de billing/gateway).

**Falha:** pagamento confirmado no gateway mas linha no DB não muda — investigar URL de webhook, assinatura, firewall, ambiente (staging vs prod); **não** é encerramento Fase 8 até resolvido **neste** ambiente ou N/A aprovado por escrito.

---

# Template de evidência (copiar para ticket / Confluence)

```markdown
## Fase 8 — Validação de ambiente

| Campo | Valor |
|-------|--------|
| **Ambiente** | (staging / produção / outro) |
| **Data** | (AAAA-MM-DD) |
| **Responsável** | (nome) |
| **Commit / versão deployada** | (hash ou tag) |
| **DATABASE_URL** | (não colar segredo completo — ex.: “projeto X, instância Y”) |

### Migrações
| Item | OK? |
|------|-----|
| 80 aplicada | [ ] sim [ ] não |
| 81 aplicada | [ ] sim [ ] não |
| API reiniciada | [ ] sim [ ] não |

### Checklist de execução
| ID | Passo | OK? | Evidência (link/anexo) |
|----|-------|-----|-------------------------|
| S1 | SQL colunas 80 | [ ] | |
| S2 | SQL colunas 81 | [ ] | |
| S3 | GET listagem faturas | [ ] | |
| S4 | GET detalhe fatura | [ ] | |
| S5 | POST/UI criar fatura | [ ] | |
| S6 | Persistência item avançado / N/A | [ ] | |
| S7 | /pay/:token carrega | [ ] | |
| S8 | PIX visível / N/A | [ ] | |
| S9 | Webhook atualiza status / N/A | [ ] | |

### Resultado final
- [ ] **GO** — Fase 8 encerrada neste ambiente
- [ ] **NO-GO** — motivo: _______________________

### Observações
(livre: horário da janela, incidentes, N/A aprovados por fulano, etc.)
```

---

# Quando posso dizer que a Fase 8 terminou?

Critérios **objetivos** e **verificáveis** (todos para **cada** ambiente que você considera “fechado”):

1. **Banco:** S1 e S2 executam sem erro (colunas existem).
2. **API:** S3, S4 e S5 com sucesso (200/2xx, sem 500 por SQL).
3. **Pagamento:** S7 com sucesso; S8 conforme método disponível ou N/A documentado.
4. **Webhook:** S9 com sucesso **neste** ambiente **ou** N/A com **assinatura** de alguém com poder de decisão (ex.: “produção: webhook igual a staging validado em DD/MM”).
5. **Evidência:** template acima preenchido e arquivado (ticket, wiki, pasta de change).

**Não** basta “código no Git”: sem 1–5 no **ambiente**, a Fase 8 **não** está operacionalmente terminada **naquele** ambiente.

**Pode dizer “Fase 8 terminou no projeto”** quando **staging** e **produção** (se aplicável) cumprirem 1–5, ou quando sua política interna definir explicitamente que só staging conta (deve estar escrita no template).

---

# Alertas importantes

## O que pode dar errado mesmo com código certo

| Situação | Causa típica |
|----------|----------------|
| 500 em listagem de fatura | Banco **sem** 81 mas deploy antigo esperava colunas — ou migração falhou no meio. |
| Fatura criada mas item “recorrente” some após reload | Migração **80** não aplicada — código não persiste colunas. |
| Webhook não chega | URL errada no gateway, firewall, TLS, ambiente sandbox apontando para URL de dev. |
| PIX não aparece | Fatura sem `createCharge` bem-sucedido; método não PIX; metadata vazia. |
| `migrate` OK em um host mas app aponta para outro DB | Dois bancos; validar **qual** DSN a API usa. |

## Como detectar problema em produção

- **Logs:** picos de `500` em rotas `customer-invoices` após deploy.
- **PostgreSQL:** erros `column "scheduled_due_date" does not exist` (ou similares) nos logs da aplicação.
- **Suporte:** “marquei recorrente e ao reabrir não está marcado”.
- **Gateway:** pagamento OK no painel Asaas mas fatura continua “aberta” no CRM.

## Sinais de degradação (schema atrás do código)

- Itens avançados **não persistem** (S6 falha).
- `parent_invoice_id` sempre nulo quando deveria haver filha E2.
- Worker de billing processa mas inserts de item ignoram flags (comportamento “silencioso” — só visto comparando UI vs DB).

**Ação:** rodar S1/S2; se falhar, tratar como **incidente de schema**, não como bug de feature nova.

---

## Referências rápidas

| Documento | Uso |
|-----------|-----|
| `FASE8-ROLLOUT-MIGRACOES-80-81.md` | Ordem 80→81, rollback. |
| `FASE8-ACEITE-OPERACIONAL.md` | Go/no-go formal, riscos §7. |
| `FASE8-AUDITORIA-FINAL.md` | Onde o código usa schema adaptativo. |
