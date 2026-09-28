# Sprint K — Trial Recovery Lifecycle

## Objetivo

Automatizar a movimentação temporal de cards no board **Reativação** após expiração de trial, utilizando o Lifecycle Router e o Promotion Engine existentes (Sprint G/I), sem enviar mensagens nem executar automações Kanban.

## Arquitetura

```
trial.expired (billing) ──► Reativação / Trial expirado
                                    │
                    trialRecoveryLifecycleJob (diário)
                                    │
              trialRecoveryLifecycleService
                 (elegibilidade via ops_lifecycle_transitions)
                                    │
                    promoteLifecycleCard() (Sprint I)
                                    │
              ops_lifecycle_transitions (auditoria)
```

Componentes novos:

| Artefato | Papel |
|----------|-------|
| `266_ops_trial_recovery_columns.sql` | Garante colunas no board Reativação (idempotente) |
| `trialRecoveryLifecycleService.ts` | Localiza cards, calcula elegibilidade, chama promoção |
| `trialRecoveryLifecycleJob.ts` | Agendamento diário no `index.ts` |
| `lifecycleDefaultRoutes.ts` | Rotas formais dos eventos `trial.recovery.*` |
| `lifecycleTypes.ts` | Tipos e lista canônica de eventos |

**Não alterados:** `lifecycleRouter.ts` (resolução), billing, promotion engine core, automações Kanban, Sprint J layout.

## Fluxo temporal

| Coluna atual | Espera | Evento | Destino |
|--------------|--------|--------|---------|
| Trial expirado | +1 dia | `trial.recovery.day1` | Dia 1 |
| Dia 1 | +2 dias | `trial.recovery.day3` | Dia 3 |
| Dia 3 | +4 dias | `trial.recovery.day7` | Dia 7 |
| Dia 7 | +7 dias | `trial.recovery.last_attempt` | Última tentativa |

Total acumulado desde Trial expirado até Última tentativa: 1 + 2 + 4 + 7 = **14 dias**.

## Eventos Lifecycle Router

| `event_type` | Board | Coluna |
|--------------|-------|--------|
| `trial.recovery.day1` | Reativação | Dia 1 |
| `trial.recovery.day3` | Reativação | Dia 3 |
| `trial.recovery.day7` | Reativação | Dia 7 |
| `trial.recovery.last_attempt` | Reativação | Última tentativa |

Eventos pré-existentes mantidos (`trial.expired`, `subscription.activated`, etc.).

### Reativação por assinatura

Quando ocorre `subscription.activated` e o card está em **Reativação**, o router existente continua:

1. `customer.reactivated` → Reativação / Reativado  
2. `subscription.activated` → Expansão / Novo Cliente  

Nenhuma alteração nessa lógica.

## Fonte de verdade

Data de entrada na coluna atual = último registro em `ops_lifecycle_transitions` com:

- `card_id` = card ops
- `destination_column_id` = coluna atual
- `result` = `moved`

Fallback apenas para **Trial expirado**: último `trial.expired` com `result = moved`.

Cálculo de elegibilidade: dias inteiros desde `created_at` da transição (`floor(ms / 86400000)`).

Sem estado em memória — reproduzível após restart.

## Migrations

### `266_ops_trial_recovery_columns.sql`

Cria colunas no tenant ops (`1f1a0f0a-0000-4000-8000-000000000001`) se ausentes:

- Dia 1, Dia 3, Dia 7, Última tentativa, Reativado

**Trial expirado** e **Cancelado** já existem via `265_ops_lifecycle_transitions.sql`.  
Lógica idempotente: `IF EXISTS` por `lower(btrim(name))` — sem duplicatas.

Registrada em `packages/backend/src/migrate.ts`.

## Promotion Engine

Toda movimentação passa por `promoteLifecycleCard()`:

- Respeita `OPS_LIFECYCLE_PROMOTION_ENABLED` (auditoria sempre gravada)
- Gera `ops_lifecycle_transitions` com `event_type` do estágio
- `correlation_id`: `trial-recovery:{cardId}:{eventType}`
- `source`: `trial_recovery_lifecycle`

Sem `UPDATE` direto em `chat_kanban_cards` fora do motor.

## Job diário

**Arquivo:** `packages/backend/src/jobs/trialRecoveryLifecycleJob.ts`  
**Registro:** `packages/backend/src/index.ts` (`setInterval`)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `TRIAL_RECOVERY_LIFECYCLE_POLL_MS` | `86400000` (24h) | Intervalo mínimo 1h |
| `TRIAL_RECOVERY_LIFECYCLE_ENABLED` | `true` | `false` desliga o job |
| `OPS_LIFECYCLE_PROMOTION_ENABLED` | `false` | Controla move real (Sprint I) |

Log: `[trial-recovery-lifecycle] status=... scanned=... promoted=...`

## Dashboard Lifecycle (Sprint J)

Apenas leitura — novos eventos adicionados aos filtros:

- Backend: `LIFECYCLE_DASHBOARD_EVENT_FILTERS`
- Frontend: `LIFECYCLE_EVENT_FILTER_OPTIONS`

Aparecem na tabela existente sem alteração de layout.

## Testes

**Arquivo:** `packages/backend/src/lifecycle/trialRecoveryLifecycleService.test.ts`

Cobertura:

- Promoção Dia 1, Dia 3, Dia 7, Última tentativa
- Idempotência (janela não cumprida)
- Card inexistente (lista vazia)
- Board inexistente
- Coluna inexistente (`column_not_found`)
- `promotion_disabled`

Executar:

```bash
cd packages/backend
npm test -- trialRecoveryLifecycleService
```

## Critérios de aceite

1. Trial expirado entra em Reativação / Trial expirado (`trial.expired` — Sprint H).
2. Job move para Dia 1 após 1 dia.
3. Job move para Dia 3 após mais 2 dias.
4. Job move para Dia 7 após mais 4 dias.
5. Job move para Última tentativa após mais 7 dias.
6. Nenhuma mensagem enviada pelo código Sprint K.
7. Nenhuma automação Kanban executada pelo backend Sprint K.
8. Comunicação permanece nas colunas do Kanban (automações nativas).
9. Dashboard Lifecycle exibe os novos eventos.
10. Compatível com Sprint G, H, I e J.
11. Produção compatível (flag de promoção + migration idempotente).
12. Sem regressão em Billing, Acquisition, Promotion Engine.

## Observações operacionais

1. **Ativar movimentação em produção:** `OPS_LIFECYCLE_PROMOTION_ENABLED=true` após validar colunas e board Reativação.
2. **Primeira execução:** cards já em Trial expirado precisam de transição `trial.expired` com `result=moved` para data de entrada; caso contrário são ignorados (`skipped`).
3. **Última tentativa** é estado terminal do funil temporal — o job não promove além desta coluna.
4. **Reativação comercial:** `subscription.activated` continua responsável por Expansão / Novo Cliente.
5. **Comunicação:** configurar automações por coluna (Dia 1, Dia 3, etc.) no Kanban ops — fora do escopo desta sprint.
