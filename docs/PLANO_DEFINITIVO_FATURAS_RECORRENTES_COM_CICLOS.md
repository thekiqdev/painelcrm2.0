# Plano definitivo — Faturas recorrentes com ciclos rastreáveis (PainelCRM)

**Objetivo:** fechar a arquitetura de recorrência de forma robusta (padrão SaaS), **sem ambiguidade** entre assinatura, ciclo, job e fatura.  
**Escopo deste documento:** desenho e migração; **não** é implementação de código.  
**Restrições:** compatibilidade com produção; preservar `subscriptions`, `customer_invoices`, `billing_recurring_jobs`, gateway Asaas, `payment_token`, timezone e horário de geração por tenant.

---

## 1. Diagnóstico do modelo atual

### 1.1 Entidades existentes (resumo)

| Entidade | Papel hoje |
|----------|------------|
| `subscriptions` | Fonte de verdade da recorrência: `next_billing_date`, `billing_interval`, `current_period_*`, `status`, valores. |
| `customer_invoices` | Fatura gerada por ciclo; **unicidade** `(subscription_id, period_start)`; `due_date` pode divergir do “dia do ciclo” após edição manual. |
| `customer_invoice_items` | Itens da fatura; elegibilidade de itens recorrentes influencia se há fatura nova. |
| `billing_recurring_jobs` | Unidade operacional do worker: `cycle_key`, `status`, `result_invoice_id`, `completion_outcome`, `completion_detail`, retries. |

### 1.2 `cycle_key` (jobs)

- Formato canónico **YYYY-MM-DD** (normalização em migração `140_billing_recurring_jobs_normalize_cycle_key.sql`).
- **Unique** `(subscription_id, cycle_key)` — idempotência de **enfileiramento** por assinatura + data lógica do ciclo.
- O worker e o insight da UI alinham “ciclo atual” com `normalizeBillingCycleKeyYmd(subscription.next_billing_date)` (ver `customerInvoiceRecurrenceInsightService`).

### 1.3 `result_invoice_id` e outcomes

- Quando o job completa com sucesso e gera fatura CRM, preenche `result_invoice_id` + `result_invoice_type`.
- `completion_outcome` / `completion_detail` documentam ramos: idempotência (`completed_idempotent_existing_customer_invoice`), ciclo já coberto (`skipped_completed_cycle`), avanço de data (`next_billing_after_db_today`), sem itens elegíveis, mismatch pós-reagendamento, etc.
- **Problema:** esses campos descrevem o **efeito do job**, não uma entidade de negócio “ciclo da assinatura” que a UI possa listar de forma estável.

### 1.4 Avanço de `next_billing_date`

- Implementação atual avança a data após processamento bem-sucedido (worker / serviços de billing), com regras explícitas para não depender só de `due_date` editado na fatura (documentado em `CORRECAO_AVANCO_RECORRENCIA_E_ACCORDION_LISTAGEM.md`).
- **Risco residual:** sem tabela de ciclos, qualquer heurística que misture “último job”, “última fatura” e `next_billing_date` continua frágil para edge cases e para UX (“ciclo concluído” vs “fatura vencida hoje”).

### 1.5 Idempotência na fatura

- **DB:** `UNIQUE (subscription_id, period_start)` em `customer_invoices`.
- **Jobs:** `UNIQUE (subscription_id, cycle_key)`.
- Reprocessamento detecta invoice existente e marca job como concluído com outcome idempotente — correto operacionalmente, mas a **semântica de “ciclo”** fica espalhada entre job + invoice.

### 1.6 UI (lista e detalhe)

- Lista: agrupamento recorrente + accordion (faturas por assinatura).
- Bloco de recorrência (`InvoiceRecurrenceInsight`): deriva estado de **último job** + `next_billing_date` + textos traduzidos; ainda expõe códigos técnicos em alguns fluxos ou mensagens longas para operação.

---

## 2. Problemas atuais (por que ainda “confunde”)

1. **Não existe entidade “ciclo da assinatura”.** O conceito aparece como `cycle_key` no job e como `period_start` na fatura, mas não há linha única que una: pendente → fila → fatura → encerrado.
2. **“Ciclo concluído” é inferido** a partir de job `completed` + invoice existente ou outcomes, não de um status de ciclo explícito — ao mudar `due_date` da fatura para “hoje”, a UI pode parecer “concluída” sem o utilizador entender que o **ciclo** e o **vencimento** são eixos diferentes.
3. **UI mistura eixos:** vencimento da fatura atual, próxima cobrança da assinatura, estado do último job, e “ciclo processado” sem uma lista de ciclos.
4. **Mensagens técnicas** (`completed_idempotent_*`, `next_billing_after_db_today`) são úteis para debug mas não substituem um modelo de domínio claro para utilizador final.
5. **Ledger incompleto:** histórico de “o que era o ciclo X” fica em jobs completos/cancelados e invoices; relatórios e suporte precisam de joins e interpretação.

---

## 3. Arquitetura proposta — entidade `subscription_cycles`

### 3.1 Vale a pena criar `subscription_cycles`?

**Sim, recomenda-se** para este produto, pelos motivos:

- Separa **intenção de cobrança** (ciclo) de **execução** (job) e de **documento financeiro** (invoice).
- Permite regra de negócio explícita: *ciclo só “fechado” com fatura válida ou skip/cancel documentado*.
- Melhora UX (timeline de ciclos) e suporte, sem sobrecarregar `billing_recurring_jobs` com semântica de produto.
- Mantém jobs como fila técnica (retry, lock, worker) e invoices como documento; o ciclo é a **ponte** estável.

**Alternativa (não preferida):** enriquecer apenas jobs + invoices com mais colunas e views. Funciona a curto prazo, mas jobs são apagados/retenção, status misturam “fila” e “negócio”, e `period_start` na invoice nem sempre nasce antes da fatura (ciclo “pendente” sem invoice fica estranho só com invoice).

### 3.2 Modelo de dados sugerido

**Tabela `subscription_cycles`**

| Coluna | Tipo | Notas |
|--------|------|--------|
| `id` | UUID PK | |
| `tenant_id` | UUID FK | Alinhado a RLS existente. |
| `subscription_id` | UUID FK | |
| `cycle_date` | DATE | Dia âncora do ciclo no calendário do tenant (equivalente semântico ao `cycle_key`). |
| `period_start` | DATE | Igual ou derivado da regra de período (pode espelhar invoice). |
| `period_end` | DATE | |
| `status` | TEXT | Ver §4. |
| `invoice_id` | UUID NULL FK → `customer_invoices` | Preenchido quando fatura criada ou vinculada. |
| `job_id` | UUID NULL FK → `billing_recurring_jobs` | Job “principal” do processamento (último ou ativo). |
| `processed_at` | TIMESTAMPTZ NULL | |
| `skipped_reason` | TEXT NULL | Código estável para skip/cancel (não só texto livre). |
| `error_message` | TEXT NULL | Último erro relevante (ou link a tentativas no job). |
| `metadata` | JSONB NULL | Detalhes extensíveis. |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Unicidade:** `UNIQUE (subscription_id, cycle_date)` — base da idempotência de negócio.

**Índices:** `(tenant_id, subscription_id, cycle_date DESC)`, `(status, cycle_date)` para scheduler, `(invoice_id)` onde não nulo.

### 3.3 Relação com tabelas existentes

- **`billing_recurring_jobs`:** continua a existir; idealmente `subscription_cycles.job_id` aponta para o job que **disparou** a geração ou retry. Jobs sem ciclo (legado) podem permanecer só com `cycle_key` até backfill.
- **`customer_invoices`:** opcional futuro `cycle_id` FK para join direto; na Fase 1 pode bastar `invoice_id` no ciclo (single source: ciclo → fatura).
- **`subscriptions.next_billing_date`:** continua como **próximo ciclo esperado**; avanço calculado a partir do **ciclo fechado** (§6), não a partir de `now()` nem só `due_date`.

---

## 4. Regras de status do ciclo

Estados sugeridos: `pending`, `queued`, `processing`, `invoiced`, `skipped`, `failed`, `cancelled`.

| Status | Significado |
|--------|-------------|
| `pending` | Ciclo reconhecido pelo sistema (calendário), ainda sem job ou antes da janela de enfileiramento. |
| `queued` | Existe intenção na fila (job `pending` ligado ou política explícita). |
| `processing` | Worker em curso (job `processing`). |
| `invoiced` | **Sucesso de negócio:** `invoice_id` NOT NULL e válido. |
| `skipped` | Ciclo encerrado **sem** fatura, com `skipped_reason` obrigatório (ex.: sem itens elegíveis, assinatura pausada na data, política explícita). |
| `failed` | Esgotadas tentativas ou erro persistente; permite retry controlado. |
| `cancelled` | Ciclo anulado (ex.: assinatura cancelada antes de cobrar, mismatch corrigido). |

### 4.1 Regra fundamental de “concluído”

Um ciclo só é **concluído** para fins de produto/UX quando:

- **`invoiced`** com `invoice_id` válido, **ou**
- **`skipped`** ou **`cancelled`** com **`skipped_reason` / motivo** preenchido de catálogo (não apenas texto solto).

Estados `failed` não são “concluídos”; `pending`/`queued`/`processing` são abertos.

### 4.2 Transições (resumo)

- **Nasce:** ao calcular calendário da assinatura (pré-enfileiramento) ou no primeiro touch do scheduler — cria linha `pending` com `cycle_date` se ainda não existir.
- **queued:** quando scheduler cria job e associa ao ciclo (`job_id`).
- **processing:** worker assume o job.
- **invoiced:** após criar ou vincular `customer_invoice` e commit.
- **skipped:** worker/scheduler decide não gerar fatura por regra de negócio documentada.
- **failed:** após `max_attempts` ou erro não recuperável; **retry** só a partir de `failed` ou `pending` conforme política (nunca reabrir `invoiced`).

---

## 5. Regra de geração (scheduler + worker)

1. Para cada assinatura ativa elegível, determinar **próximo `cycle_date`** alinhado ao timezone/horário do tenant (já existente na Fase 2).
2. **Upsert** idempotente em `subscription_cycles` para esse `(subscription_id, cycle_date)`.
3. Se ciclo está `pending`/`failed` e na janela, criar ou reutilizar `billing_recurring_jobs` com o mesmo `cycle_key` = `cycle_date` ISO.
4. Worker processa **sempre** no contexto de um **ciclo** (linha existente ou criada no início do processamento): atualiza status `processing` → `invoiced` / `skipped` / `failed`.
5. Idempotência: se já existe invoice para o período/ciclo, **vincular** ao ciclo e marcar `invoiced` sem duplicar invoice.

---

## 6. Regra de avanço de `subscriptions.next_billing_date`

- **Disparo:** após o ciclo transitar para **`invoiced`**, **`skipped`** (quando a política disser que a assinatura avança mesmo sem fatura), ou **`cancelled`** conforme regra de produto.
- **Cálculo:** próximo `cycle_date` = função **`addInterval(cycle_date, billing_interval)`** usando calendário do tenant, **não** `CURRENT_DATE` como âncora primária **nem** `due_date` da fatura.
- **Exemplo:** ciclo atual 24/04/2026, mensal → próximo 24/05/2026.

Documentar exceções (ex.: `billing_anchor_day` 29–31 em meses curtos) na mesma função central usada hoje para evitar drift.

---

## 7. Idempotência robusta

| Camada | Regra |
|--------|--------|
| Ciclo | `UNIQUE (subscription_id, cycle_date)` — uma linha por ciclo lógico. |
| Job | Manter `UNIQUE (subscription_id, cycle_key)`; `cycle_key` == `cycle_date` canónico. |
| Invoice | Manter `UNIQUE (subscription_id, period_start)`; ao detectar existente, **atualizar ciclo** com `invoice_id` e `invoiced`. |
| Retry | Apenas ciclos `failed` (ou política explícita para `pending` antigo); **nunca** alterar ciclo `invoiced` para reprocessar geração. |

---

## 8. Impacto na UI

### 8.1 Lista de faturas

- Manter **assinatura como agrupador** (accordion): faturas geradas listadas sob a assinatura; faturas avulsas sem agrupamento recorrente.
- Opcional: badge por ciclo (“Ciclo 24/04/2026”) via join `invoice_id` ↔ `subscription_cycles`.

### 8.2 Tela da assinatura / fatura

- **Secção “Ciclos”:** tabela ou timeline com `cycle_date`, status (amigável), fatura vinculada (link), próxima cobrança destacada a partir de `subscriptions.next_billing_date`.
- **Copy:** substituir códigos internos por mensagens curtas; detalhe técnico (outcome, ids) só em modo avançado / suporte.

### 8.3 Estados amigáveis (exemplo)

- `invoiced` → “Fatura gerada”
- `queued` / `processing` → “Cobrança em processamento”
- `skipped` → mensagem derivada de `skipped_reason` (catálogo PT)
- `failed` → “Falhou — será tentado novamente” / ação manual

---

## 9. Plano de migração em fases (produção segura)

### Fase 0 — Preparação

- Congelar semântica de `cycle_key` e função de avanço de data (já alinhada).
- Feature flags: `subscription_cycles_read`, `subscription_cycles_write` — **controlo no painel Super Admin** (Configurações → Ciclos de assinatura); defaults ativos após migrações 141/143; SQL manual não é o caminho operacional.

### Fase 1 — DDL + backfill somente leitura

- Criar `subscription_cycles` + índices + RLS (`tenant_id`).
- **Backfill** a partir de:
  - `subscriptions` (gerar ciclos históricos aproximados por `next_billing_date` e intervalo **ou**, de forma mais precisa, derivar de `customer_invoices.period_start` + jobs `cycle_key`).
  - `customer_invoices`: cada par `(subscription_id, period_start)` → ciclo `invoiced` + `invoice_id`.
  - `billing_recurring_jobs`: para cada `(subscription_id, cycle_key)` completado, preencher `job_id` e outcomes em `metadata` / status mapeado.
- Jobs/faturas órfãos: regra documentada (marcar `cancelled` ou `invoiced` conforme evidência).

### Fase 2 — Dual-write

- Scheduler ao enfileirar: cria/atualiza ciclo `pending` → `queued`.
- Worker ao processar: atualiza ciclo em lock com o mesmo padrão do job.
- API de insight passa a **preferir** dados do ciclo se existir; fallback legado se linha ausente.

### Fase 3 — Fonte operacional

- Scheduler seleciona trabalho a partir de **ciclos abertos** (opcional otimização) ou continua jobs mas **valida** contra ciclo.
- Remover heurísticas duplicadas na UI que inferem “concluído” só pelo último job.

### Fase 4 — Limpeza

- Colunas redundantes apenas se comprovadamente não usadas; manter `completion_outcome` nos jobs para auditoria técnica.
- Opcional: `customer_invoices.cycle_id` FK para simplificar queries.

---

## 10. Riscos

| Risco | Mitigação |
|-------|-----------|
| Backfill incorreto | Rodar em staging; comparar contagens invoices vs ciclos `invoiced`; relatório de gaps. |
| Duplicidade ciclo/job | Transações: upsert ciclo antes do insert job; unique constraints. |
| RLS | Políticas espelhando `tenant_id` como nas outras tabelas billing. |
| Performance | Índices por `subscription_id`, `status`; batch no backfill. |
| Divergência `period_start` vs `cycle_date` | Documentar mapping único; testes com anchor day e timezone. |

---

## 11. Checklist de implementação

- [ ] DDL `subscription_cycles` + RLS + índices
- [ ] Script de backfill idempotente + validação
- [ ] Feature flags leitura/escrita
- [ ] Scheduler: upsert ciclo ao enfileirar
- [ ] Worker: transições de status do ciclo alinhadas ao job
- [ ] Avanço `next_billing_date` apenas após fechamento de ciclo (regra §6)
- [ ] Idempotência invoice ↔ ciclo (§7)
- [ ] API insight + UI: timeline de ciclos e copy PT sem códigos crus
- [ ] Testes: mensal/trimestral, timezone, edição de due_date, retry, cancelamento
- [ ] Runbook suporte: como interpretar `skipped_reason` e jobs falhos

---

## 12. Conclusão

O modelo atual é **operacionalmente sólido** (jobs + unicidade na invoice), mas **semanticamente insuficiente** para UX e regras claras de “ciclo”. A tabela **`subscription_cycles`** é a peça que falta para alinhar produto, suporte e worker sem substituir Asaas nem as tabelas atuais. A migração deve ser **incremental**: DDL e backfill → leitura na API/UI → dual-write → ciclo como fonte de verdade do estado de cobrança por data.

---

*Documento gerado para alinhar engenharia e produto. Implementação futura deve referenciar este plano e as migrações numeradas em `database/init/`.*
