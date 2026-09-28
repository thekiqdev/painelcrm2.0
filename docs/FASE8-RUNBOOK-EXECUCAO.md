# Fase 8 — Runbook de Execução
## 1. Ordem de execução
1. Preparar ambiente (staging ou produção)
   - Confirmar que o deploy contém o fechamento da Fase 8 (schema adaptativo + fluxos do V2).
   - Definir variáveis para execução: `API_BASE`, `FRONT_BASE`, `TOKEN_JWT`, e IDs `INVOICE_ID` / `PAY_TOKEN` (conforme disponível).

2. Migrations (gate de schema)
   - Rodar no host/CI com acesso ao DB do ambiente:
     - `cd packages/backend`
     - `npm run build`
     - `npm run migrate`
   - Objetivo: garantir que **80** rode antes de **81**.
   - Reiniciar API (rollout/restart do backend) após migrations.

3. Banco (S1 e S2 — schema)
   - S1: colunas da migração 80 em `customer_invoice_items`
   - S2: colunas da migração 81 em `customer_invoices`

4. API autenticada (S3, S4, S5 — fatura)
   - S3: listagem de faturas retorna **200** sem erro SQL
   - S4: detalhe de fatura retorna **200**
   - S5: criação de fatura retorna **2xx** e a fatura aparece na listagem

5. Persistência avançada (S6 — validar migração 80 em comportamento)
   - Se a UI/API expuser campos avançados: criar/editar fatura com item avançado e confirmar no DB.
   - Se a UI não expuser: marcar **N/A** e registrar justificativa.

6. Pagamento público + PIX (S7 e S8 — fluxo)
   - S7: abrir `/pay/:token` e confirmar carregamento de fatura pagável (**200**).
   - S8: PIX visível **se** o método do teste for PIX/metadados disponíveis; caso contrário, N/A com justificativa.

7. Webhook (S9 — atualizar status)
   - Executar pagamento de teste no gateway sandbox.
   - Validar no DB que `customer_invoices.status` e/ou `paid_at` atualizaram após o webhook.

> Referência de execução detalhada (com comandos/SQL prontos e template): `docs/FASE8-VALIDACAO-AMBIENTE.md`.

## 2. Checklist rápido
Marcar por ambiente (staging/produção). Use `OK/FAIL/N/A`.

### Gate de schema
- [ ] Migração **80** aplicada (S1 OK)
- [ ] Migração **81** aplicada (S2 OK)
- [ ] API reiniciada após migrations

### Smokes obrigatórios (S1–S9)
- [ ] S1 (SQL): colunas 80 existem em `customer_invoice_items`
- [ ] S2 (SQL): colunas 81 existem em `customer_invoices`
- [ ] S3 (API): listagem de faturas **200**
- [ ] S4 (API): detalhe de fatura **200**
- [ ] S5 (Fatura): criação **2xx** e aparece na listagem
- [ ] S6 (Persistência): persistiu item avançado **ou** N/A justificado/aprovado
- [ ] S7 (/pay): página carrega fatura pagável (**200**)
- [ ] S8 (PIX): PIX visível **ou** N/A justificado/aprovado
- [ ] S9 (Webhook): status/paid_at atualizado no DB **ou** N/A aprovado

### Checklist de evidências
- [ ] Logs/saída do `npm run migrate` (ou equivalente)
- [ ] Evidência S1/S2 (SQL sem erro de coluna)
- [ ] Evidência S3/S4/S5 (200/2xx e sem erro SQL)
- [ ] Evidência S7 (+ S8 se aplicável)
- [ ] Evidência S9 (DB antes/depois e/ou log do handler)

### Versão resumida (para colar em ticket interno)
```text
Fase 8 — Aceite operacional (ambiente: <staging|produção>)
Migração 80: <OK/FAIL>
Migração 81: <OK/FAIL>
API reiniciada após migrations: <OK/FAIL>
S1: <OK/FAIL/N/A>
S2: <OK/FAIL/N/A>
S3: <OK/FAIL>
S4: <OK/FAIL>
S5: <OK/FAIL>
S6: <OK/FAIL/N/A (justificativa: ...)>
S7: <OK/FAIL>
S8: <OK/FAIL/N/A (justificativa: ...)>
S9: <OK/FAIL/N/A (aprovação: ...)>
Evidências anexadas: <sim/não>
Decisão: <GO / NO-GO>
Observações: <...>
```

## 3. Bloqueios de go-live
Tratar como **NO-GO** (bloqueante) se qualquer item abaixo falhar:
1. Migração 80 não aplicada/sem colunas (S1 falha)
2. Migração 81 não aplicada/sem colunas (S2 falha)
3. S3 falha (listagem de faturas com 500/erro SQL)
4. S4 falha (detalhe de fatura com 500/erro SQL)
5. S5 falha em cenário válido (fatura não cria quando dados/payload são válidos)
6. S7 falha (página pública não carrega fatura pagável)
7. S9 falha sem aprovação formal para N/A

Aceitar como **N/A** apenas quando o ambiente não permite execução (ex.: sem sandbox de gateway) e houver aprovação do responsável.

## 4. Evidências obrigatórias
Anexar/registrar por ambiente:
1. `migrate` executado: log/saída do comando
2. SQL S1 e S2 sem erros de coluna
3. API:
   - S3: resposta HTTP 200 (sem erro SQL)
   - S4: resposta HTTP 200
   - S5: resposta 2xx + fatura aparece na listagem
4. Pagamento público:
   - S7: print da página `/pay/:token` (HTTP 200)
   - S8: print da seção PIX ou justificativa N/A
5. Webhook:
   - evidência no DB de mudança em `customer_invoices.status/paid_at`
   - ou log anonimizado do handler de webhook
6. Justificativa e aprovação para qualquer N/A

## 5. Falhas comuns e ação esperada
| Falha | Ação esperada | Bloqueante? |
|-------|----------------|-------------|
| Erro `column ... does not exist` em listagem/detalhe | Confirmar que conectou no DB correto; reexecutar migrações 80→81; reiniciar API; refazer S1/S2 | Sim |
| S5 retorna 400 | Verificar dados do cliente (CPF/CNPJ) e gateway ativo; corrigir dados de teste e repetir S5 | Sim |
| S7 não carrega fatura pagável | Confirmar token (`PAY_TOKEN`) correto e que a fatura está em estado pagável | Sim |
| S8 PIX não aparece | Conferir tipo/método do teste e payload/metadados no DB; se teste não era PIX, marcar N/A | Depende |
| Webhook não atualiza DB | Verificar ambiente do gateway sandbox, URL/rota de webhook, firewall/TLS; repetir pagamento após correção; validar logs | Sim |
| S6 não bate com UI | Validar schema (S1) e comparar UI vs DB; se o caso de uso depende do campo avançado, tratar como incidente de schema | Depende |

## 6. Critério final de encerramento
Declarar que a Fase 8 está encerrada operacionalmente em um ambiente quando:
1. Migração **80** e **81** estão aplicadas e a API foi reiniciada
2. S1, S2, S3, S4, S5 e S7 estão OK
3. S9 está OK **ou** N/A aprovado formalmente
4. Evidências obrigatórias foram anexadas

Após cumprir (1–4), liberar GO-live para aquele ambiente.

