# AUDIT_TRIAL_ENGAGEMENT_BOARD

**Modo:** READ ONLY  
**Data:** 2026-06-09  
**Objetivo:** Explicar por que o board **Engajamento Trial** não aparece no Ops Kanban apesar da Sprint N1.

---

## Resumo executivo

| Hipótese | Aplica? | Evidência |
|----------|---------|-----------|
| **A** Migration 269 nunca executou | Possível em **produção** (deploy sem `migrate`) | Sem `schema_migrations`; depende de rodar `npm run migrate` |
| **B** Board em outro tenant | **Não** (local) | Board no tenant Ops `1f1a0f0a-...` |
| **C** Board existe mas UI esconde | **Sim (causa raiz na UI)** | API filtra por `OPS_KANBAN_CANONICAL_BOARD_NAMES` (5 boards) |
| **D** Board sem colunas | **Não** (local) | 5 colunas presentes |
| **E** Não registrado em migrate.ts | **Não** | Linha 420 — registrado |
| **F** Ordem migrate + sem super admin | Risco em **1ª execução** | 269 roda **antes** de `create-admin-user.sql` |

**Causa raiz (ambiente com migration já aplicada):** **C** — o endpoint `GET /api/superadmin/ops/kanban/boards` só retorna IDs dos **5 boards canônicos** hardcoded; **Engajamento Trial** não está em `OPS_KANBAN_CANONICAL_BOARD_NAMES`.

**Causa raiz (ambiente sem board no DB):** **A** ou **F** — migration não rodou, ou rodou uma vez antes de existir `is_super_admin = true`.

---

## 1. Migration 269

### 1.1 O arquivo existe?

**Sim:** `database/init/269_ops_trial_engagement_columns.sql`

### 1.2 Conteúdo relevante

A migration:

1. Localiza ou **cria** o board `Engajamento Trial` no tenant Ops.
2. Cria as 5 colunas se ausentes.
3. Exige um usuário `is_super_admin = true` para **criar** o board (INSERT).

```sql
-- Tenant fixo
v_tenant uuid := '1f1a0f0a-0000-4000-8000-000000000001'::uuid;

-- Board: idempotente por nome
lower(btrim(name)) = lower(btrim('Engajamento Trial'))

-- Colunas (VALUES)
('Trial iniciado', '#34d399'),
('Dia 2', '#38bdf8'),
('Dia 4', '#a78bfa'),
('Dia 6', '#fbbf24'),
('Trial finalizando', '#fb7185')

-- Colunas: idempotente
lower(btrim(c.name)) = lower(btrim(rec.column_name))
```

### 1.3 Checklist Sprint N1

| Item | Na migration? |
|------|----------------|
| Board "Engajamento Trial" | Sim (INSERT se ausente + super admin) |
| Coluna "Trial iniciado" | Sim |
| Coluna "Dia 2" | Sim |
| Coluna "Dia 4" | Sim |
| Coluna "Dia 6" | Sim |
| Coluna "Trial finalizando" | Sim |
| Idempotente `lower(btrim(name))` | Sim (board e colunas) |

### 1.4 Armadilha: dependência de super admin

Se `v_actor_user_id` for NULL na execução, o bloco INSERT do board é **pulado** e o script faz `RETURN` sem criar colunas:

```sql
IF v_actor_user_id IS NOT NULL THEN
  INSERT INTO chat_kanban_boards ...
END IF;

IF v_board_id IS NULL THEN
  RETURN;  -- sai sem criar colunas
END IF;
```

---

## 2. Registro em migrate.ts

### 2.1 Registrada?

**Sim**, em `packages/backend/src/migrate.ts`:

```text
...
'268_tenant_commercial_override_audit.sql',
'269_ops_trial_engagement_columns.sql',   ← posição 420
'create-admin-user.sql',
```

### 2.2 Condições que impedem execução?

- Arquivo ausente → `Pulando ... (arquivo não encontrado)` (não é o caso).
- Erro SQL não-idempotente → aborta migrate (269 é idempotente).
- **Não há** flag de feature para pular 269.
- Migrate **reexecuta todos** os SQLs a cada `npm run migrate` (sem tracking por arquivo).

### 2.3 Ordem crítica

`269` executa **antes** de `create-admin-user.sql`. Em banco **novo**, na **primeira** passagem completa de migrate:

1. 269 pode rodar **sem** super admin → board **não** criado.
2. `create-admin-user.sql` cria/atualiza super admin.
3. **Segunda** execução de migrate → 269 cria o board.

Deploy com migrate **único** em DB virgem → risco **F**.

---

## 3. schema_migrations

O projeto **não utiliza** tabela `schema_migrations` (grep sem resultados).

| migration | executada (tracking) |
|-----------|----------------------|
| 269_ops_trial_engagement_columns.sql | **Não rastreável** — só inferível por dados em `chat_kanban_boards` |

---

## 4. Boards existentes (consulta local — dev)

Ambiente: `.env` local (`POSTGRES_PORT=5433`, DB `painelcrm`), **2026-06-09**.

### Boards ativos no tenant Ops

| board_id | nome | tenant_id |
|----------|------|-----------|
| df374e4e-... | teste | 1f1a0f0a-0000-4000-8000-000000000001 |
| c3f1b74b-... | Aquisição | 1f1a0f0a-0000-4000-8000-000000000001 |
| c2b46926-... | Recovery | 1f1a0f0a-0000-4000-8000-000000000001 |
| bc5d9b2f-... | Onboarding | 1f1a0f0a-0000-4000-8000-000000000001 |
| d9db9a20-... | Expansão | 1f1a0f0a-0000-4000-8000-000000000001 |
| fe86767f-... | Reativação | 1f1a0f0a-0000-4000-8000-000000000001 |
| **837356f4-...** | **Engajamento Trial** | 1f1a0f0a-0000-4000-8000-000000000001 |

### `lower(btrim(name)) = 'engajamento trial'`

| Pergunta | Resposta (local) |
|----------|------------------|
| Existe? | **Sim** |
| Quantos? | **1** |
| Tenant | `1f1a0f0a-0000-4000-8000-000000000001` |

> **Produção:** repetir a mesma query no ambiente de deploy para confirmar A vs C.

---

## 5. Tenant Ops

| Campo | Valor esperado | Valor local |
|-------|----------------|-------------|
| tenant_id | `1f1a0f0a-0000-4000-8000-000000000001` | Igual |
| nome | Super Admin Ops | Super Admin Ops |
| slug | superadmin-ops | superadmin-ops |

A migration 269 **depende** desse UUID fixo (`v_tenant`).

Super admin local (para criação do board): `admin@painelcrm.com` (`is_super_admin = true`).

---

## 6. Colunas do board (local)

Board `837356f4-557f-4f79-87b2-968874b4c4b4`:

| column_id | nome |
|-----------|------|
| 5236a9e8-... | Trial iniciado |
| 037c3eb2-... | Dia 2 |
| 525062c0-... | Dia 4 |
| b853989c-... | Dia 6 |
| c5a79cdd-... | Trial finalizando |

**Nenhuma coluna ausente** no ambiente local.

---

## 7. UI / API — por que não aparece no seletor

### Endpoint

`GET /api/superadmin/ops/kanban/boards`  
Controller: `superadminOpsKanbanBootstrapController.listSuperadminOpsBoards`

### Fluxo

```text
ensureSuperadminOpsKanbanSeed()     → só 5 boards do seed
listCanonicalOpsBoardIds()          → só OPS_KANBAN_CANONICAL_BOARD_NAMES
SQL: WHERE b.id = ANY(canonicalIds) → exclui Engajamento Trial
```

### `OPS_KANBAN_CANONICAL_BOARD_NAMES` (hardcoded — 5 itens)

```9:15:packages/backend/src/services/superadminOpsKanbanFoundation.ts
export const OPS_KANBAN_CANONICAL_BOARD_NAMES = [
  'Aquisição',
  'Recovery',
  'Onboarding',
  'Expansão',
  'Reativação',
] as const;
```

**Engajamento Trial não está na lista.**

### `SUPERADMIN_OPS_KANBAN_BOARD_SEEDS`

Também tem **5 boards** — seed nunca cria Engajamento Trial (`superadminOpsKanbanSeedService.ts`).

### Respostas

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | API retorna Engajamento Trial? | **Não** — filtrado por `canonicalIds` |
| 2 | É filtrado? | **Sim** — `AND b.id = ANY($4::uuid[])` |
| 3 | Limite fixo? | **5** nomes canônicos (não COUNT SQL) |
| 4 | Lista hardcoded? | **Sim** — `OPS_KANBAN_CANONICAL_BOARD_NAMES` |

### Nota: `visibility_mode = restricted`

A migration cria o board com `visibility_mode = 'restricted'`. Mesmo corrigindo o filtro canônico, super admins já passam `isAdmin = true` na query e veriam o board. O bloqueio atual é **anterior**: ID nem entra no `ANY(...)`.

### Onde N1 registrou o board

`lifecycleBoardCatalog.ts` inclui **Engajamento Trial** para o **Lifecycle Router** — isso **não** alimenta a UI do Ops Kanban.

---

## 8. Dependências Sprint N2

### `trialEngagementLifecycleService.ts`

- Depende de `findCanonicalOpsBoardIdByNameFromPool('Engajamento Trial')`.
- Se board ausente → `{ status: 'board_not_found', scanned: 0, ... }` — **não lança erro**.
- `promoteLifecycleCard` pode retornar `column_not_found` — registrado em `attempts`, sem throw.

### `trialEngagementLifecycleJob.ts`

- Log `[trial-engagement-lifecycle]` só quando `promoted > 0` **ou** `status !== 'ok'`.
- `board_not_found` **gera log** (status ≠ ok).
- Execução normal sem cards → **silencioso**.

---

## 9. Conclusão

### Causa raiz primária (board no DB, UI vazia)

**C — Board existe mas a UI/API o esconde**

Sprint N1 criou board + colunas (migration + lifecycle catalog), mas **não** integrou o board ao mecanismo de listagem do Ops Kanban (`OPS_KANBAN_CANONICAL_BOARD_NAMES` / `listCanonicalOpsBoardIds`).

### Causas secundárias (board ausente no DB)

| Código | Cenário |
|--------|---------|
| **A** | Deploy sem `npm run migrate` após merge N1 |
| **F** | Migrate único em DB novo: 269 antes de super admin → board não criado na 1ª passagem |

### Correção sugerida (fora deste audit — não implementar aqui)

1. Incluir `Engajamento Trial` em `OPS_KANBAN_CANONICAL_BOARD_NAMES` **e/ou** estender `listCanonicalOpsBoardIds` / seed.
2. Opcional: mover 269 após `create-admin-user.sql` ou remover dependência de super admin no INSERT do board.
3. Em produção: validar com SQL se o board existe antes de assumir só C.

---

## Referências

- Sprint N1 — `269_ops_trial_engagement_columns.sql`, `lifecycleBoardCatalog.ts`
- Sprint N2 — `trialEngagementLifecycleService.ts`, `trialEngagementLifecycleJob.ts`
- `superadminOpsKanbanBootstrapController.ts` — filtro canônico
- `docs/architecture/automation/SPRINT_P0A_OPS_KANBAN_STABILIZATION.md`
