# Fase 8 — Aceite operacional

Documento de **fechamento real** da Fase 8 no **ambiente** (staging / produção). Complementa o que já está **CONCLUÍDO no repositório** (`PLANO-CORRECAO-FASE-8-V2.md`, `FASE8-AUDITORIA-FINAL.md`, `FASE8-STATUS-FINAL.md`).

**Não substitui** o runbook técnico: `docs/FASE8-ROLLOUT-MIGRACOES-80-81.md`.

**Execução passo a passo (comandos, SQL, curl, template):** `docs/FASE8-VALIDACAO-AMBIENTE.md`.

---

## 1. Objetivo

Registrar critérios objetivos para declarar a Fase 8 **encerrada em operação** em um ambiente específico:

- Schema alinhado ao código (migrações **80** e **81**).
- Comportamento mínimo validado (API, faturas, pagamento público, webhook).
- Evidências arquivadas para auditoria e continuidade (abertura segura da Fase 9).

---

## 2. Pré-requisitos

| # | Pré-requisito |
|---|----------------|
| P1 | Versão do **backend/front** implantada é a que contém o fechamento V2 da Fase 8 (schema adaptativo + entregas A1/B3/H/etc.). |
| P2 | Equipe leu `docs/FASE8-ROLLOUT-MIGRACOES-80-81.md` e `docs/FASE8-AUDITORIA-FINAL.md` §5–§6. |
| P3 | **Backup** do banco antes de aplicar migrações em produção (ou política equivalente de snapshot/PITR). |
| P4 | Acesso a: banco (read-only mínimo para validações SQL), logs da API, painel do gateway (sandbox ou produção conforme smoke), ticket/issue para anexar evidências. |

---

## 3. Checklist por ambiente

Repetir **por ambiente** (ex.: `staging`, `production`). Copiar a tabela abaixo para o ticket de aceite.

| Campo | Preenchimento |
|-------|----------------|
| **Ambiente** | |
| **Data** | |
| **Executor** | |
| **Versão app / commit** | |
| **Migração 80 aplicada? (sim/não)** | |
| **Migração 81 aplicada? (sim/não)** | |
| **API reiniciada pós-migração?** | |
| **Smoke obrigatório — resultado (pass/fail)** | Ver §4 |
| **Evidências anexadas?** | Ver §5 |
| **Decisão go/no-go** | Ver §6 |

---

## 4. Smoke tests obrigatórios

Estes testes são **obrigatórios** para **aceite operacional** da Fase 8 no ambiente. Não exigem alteração de código; usam fluxos reais ou sandbox.

### 4.1 Schema e API (após 80 + 81)

| ID | Teste | Critério de sucesso |
|----|--------|---------------------|
| **S1** | SQL: colunas da **80** existem em `customer_invoice_items` | `is_recurring`, `recurring_interval`, `scheduled_due_date` consultáveis (ex.: `SELECT … LIMIT 1` sem erro). |
| **S2** | SQL: colunas da **81** existem em `customer_invoices` | `parent_invoice_id`, `parent_invoice_item_id` consultáveis. |
| **S3** | Listagem de faturas autenticada | `GET` de listagem usada pelo painel retorna **200** sem erro SQL. |
| **S4** | Detalhe de fatura | `GET /api/customer-invoices/:id` (ou equivalente) **200** para fatura existente do tenant de teste. |

### 4.2 Fatura manual e pré-condições

| ID | Teste | Critério de sucesso |
|----|--------|---------------------|
| **S5** | Criação de fatura manual | `POST /api/customer-invoices` (ou fluxo UI) **2xx** com payload mínimo válido (cliente com CPF/CNPJ, gateway ativo conforme regra A1). |
| **S6** | Item com campos avançados (se a UI/API expuser) | Após **S5**, persistência coerente: `GET` do detalhe reflete flags/datas quando migração **80** aplicada. Se **80** não aplicada, aceite só com registro explícito de **degradação aceita** (não recomendado para produção com recorrência por item). |

### 4.3 Pagamento público e webhook

| ID | Teste | Critério de sucesso |
|----|--------|---------------------|
| **S7** | Página pública | `/pay/:token` carrega para fatura **pagável** (homolog/sandbox ou produção com valor simbólico, conforme política). |
| **S8** | PIX (se ambiente retornar payload) | QR ou copia-e-cola visível quando o gateway fornecer metadados. |
| **S9** | Webhook | Após pagamento de teste, `customer_invoices.status` (e/ou `paid_at`) atualizado conforme regra do produto; conferência via DB ou UI. |

> **Nota:** Se o ambiente não permitir pagamento real, **S8/S9** podem ser executados apenas em **staging** conectado ao sandbox do gateway; produção exige política explícita (ex.: “aceite PIX/webhook validado só em staging” assinado pelo responsável).

---

## 5. Evidências esperadas

| Tipo | Conteúdo mínimo |
|------|------------------|
| **Ticket / change record** | Link ou ID; ambiente; data; executor; go/no-go. |
| **Migrações** | Confirmação de execução (log do migrate, ou output SQL, ou registro interno de versão de schema). |
| **SQL de verificação** | Trecho ou screenshot de `S1`/`S2` bem-sucedidos (sem dados sensíveis). |
| **API** | Trecho de log ou print de resposta **200** para `S3`/`S4`/`S5` (redigir tokens/PII). |
| **Pagamento** | Evidência de **S7–S9** (print da UI pública, linha no banco antes/depois, ou log de webhook anonimizado). |
| **Exceções** | Se algum smoke for **N/A** (ex.: sem sandbox), **justificativa por escrito** + aprovação do responsável técnico/produto. |

---

## 6. Critério de go / no-go

### Go (Fase 8 operacionalmente encerrada neste ambiente)

- Migrações **80** e **81** **aplicadas** na ordem correta.
- **S1–S5** com sucesso.
- **S7** com sucesso.
- **S8** e **S9** com sucesso **ou** N/A documentado e aprovado conforme §4.3.
- Evidências de §5 arquivadas.

### No-go

- Migrações não aplicadas e ambiente **precisa** de recorrência por item / E2 / persistência de colunas 80–81.
- Erros SQL em listagem/detalhe de fatura.
- Falha em criação de fatura manual em cenário válido (pré-condições atendidas).
- Webhook não atualiza status em staging quando o teste deveria ser executável.

### Caso especial: código novo + schema antigo

O backend **tolerante** permite deploy **sem** 80/81 sem 500. Isso **não** equivale a aceite Fase 8 completo: deve ser registrado como **“aceite com degradação”** (`FASE8-AUDITORIA-FINAL.md` §5.3) e **não** é estado alvo para produção se o produto usa recorrência por item / filhas E2.

---

## 7. Riscos residuais

| Risco | Mitigação |
|-------|-----------|
| Produção em **degradação** (sem 80/81) sem decisão explícita | Exigir go/no-go por escrito; monitorar erros e reclamações de “recorrência não salva”. |
| Smoke apenas em staging; produção não validada | Política clara: repetir aceite em produção após migração ou aceitar risco documentado. |
| Webhook / credenciais diferentes por ambiente | Validar **S9** no mesmo ambiente que receberá tráfego real. |
| Worker de billing (E2) não exercitado no aceite | Para ambientes que usam E2, incluir smoke adicional alinhado a `PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md` §9 e `FASE9-RECORRENCIA-POR-ITEM.md` **após** go da Fase 8 — ver `FASE9-PREPARACAO.md` (não misturar com encerramento Fase 8). |

---

## 8. Encerramento da fase

A Fase 8 está **formalmente encerrada em operação** para um ambiente quando:

1. Este documento foi utilizado como base do aceite.  
2. O checklist da **§3** está preenchido com **go**.  
3. As evidências da **§5** estão retidas (ticket, repositório de runbooks interno, etc.).

**Único gate de schema restante no fechamento V2:** aplicação **80** e **81** + validação **S1–S2** (o repositório já está completo). **Gates adicionais de confiança:** **S3–S9** garantem que o ambiente não só tem colunas, mas **funciona** para faturas e pagamento.

Após encerramento operacional, a **abertura da Fase 9** segue apenas **preparação** em `docs/FASE9-PREPARACAO.md` — **sem** implementação antecipada.

---

## Referências

- `docs/FASE8-VALIDACAO-AMBIENTE.md` — **guia prático** (S1–S9, migrações, alertas)
- `docs/FASE8-ROLLOUT-MIGRACOES-80-81.md`
- `docs/FASE8-AUDITORIA-FINAL.md`
- `docs/FASE8-STATUS-FINAL.md`
- `docs/PLANO-CORRECAO-FASE-8-V2.md`
