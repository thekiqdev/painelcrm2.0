# Sprint 1 — Feature Flags + Correlation IDs (notas de implementação)

**Status:** implementado no código · **migração:** `253_platform_feature_flags_p0.sql`  
**Data:** maio/2026

---

## 1. O que foi implementado

### Migrations

| Arquivo | Descrição |
|---------|-----------|
| `database/init/253_platform_feature_flags_p0.sql` | Tabelas + seed P0 |
| `supabase/migrations/20260519140000_platform_feature_flags_p0.sql` | Mirror Supabase |
| `packages/backend/src/migrate.ts` | Entrada `253_...` no array `order` |

### Tabelas

- `platform_feature_flags` — definições de rollout (namespace, default, kill_switch, rollout_type, %, shadow)
- `platform_feature_flag_overrides` — override por tenant (com `expires_at`)

### Serviços / platform

| Arquivo | Função |
|---------|--------|
| `platform/featureFlagKeys.ts` | Chaves tipadas P0 |
| `platform/featureFlagRepository.ts` | Leitura PostgreSQL |
| `platform/featureFlagRegistry.ts` | Cache L1, resolução, kill switch, %, internal, allowlist |
| `platform/platformFeatureFlagLogger.ts` | `[FEATURE_FLAG]`, `[CORRELATION]`, `[REQUEST_CONTEXT]` |
| `platform/index.ts` | Re-exports |

### Context + middleware

| Arquivo | Função |
|---------|--------|
| `context/requestContext.ts` | ALS, `x-correlation-id`, `runWithRequestContext` (workers) |
| `middleware/correlationId.ts` | Middleware HTTP global |
| `middleware/bindRequestContext.ts` | Enriquece ALS após auth |

### API admin (read-only)

| Rota | Descrição |
|------|-----------|
| `GET /api/superadmin/platform-feature-flags` | Lista flags + cache stats |

### Integração

| Arquivo | Alteração |
|---------|-----------|
| `index.ts` | `correlationIdMiddleware`; refresh registry no boot + interval 120s |
| `middleware/auth.ts` | `bindRequestContext` nas cadeias `authSessionContext`, `tenantAuth*`, `superadminAuth` |
| `routes/superadminRoutes.ts` | Rota platform-feature-flags |

### Testes

| Arquivo |
|---------|
| `platform/featureFlagRegistry.test.ts` |
| `context/requestContext.test.ts` |

---

## 2. Decisões arquiteturais

| Decisão | Motivo |
|---------|--------|
| **Tabelas novas** (`platform_feature_flags`) | Não misturar com `plan_features` (produto/plano) nem `system_feature_flags` (interruptores WhatsApp) |
| **Todas flags P0 `default_enabled=false`** | Produção inalterada; só `platform.correlation_middleware_v1` global ON |
| **Cache em memória 60s** | Sem Redis nesta sprint; invalidação no refresh periódico |
| **Kill switch como flag referenciada** | `kill_switch_key` aponta para outra key (ex. `outbox.master_off`) |
| **Shadow mode** | `shadow_mode=true` → `enabled=false`, `shadow=true` até override tenant |
| **Internal tenants via env** | `PLATFORM_INTERNAL_TENANT_IDS=uuid,uuid` (sem coluna `is_internal` ainda) |
| **Allowlist via env** | `PLATFORM_FLAG_ALLOWLIST_{KEY}` por flag |
| **ALS separado de `dbRequestStorage`** | RLS continua no client PG; correlation no request context |
| **Correlation middleware atrás de body parser** | Webhooks com raw body intactos; correlation após JSON global |

### Rollback

1. `platform.correlation_middleware_v1` → OFF (ou env `PLATFORM_FLAG_PLATFORM_CORRELATION_MIDDLEWARE_V1=0`)
2. Revert deploy API (middleware deixa de popular ALS; header ainda pode ser ecoado)
3. Tabelas podem permanecer (sem leitura se código revertido)

### Coexistência

- `featureFlagService` / `userHasFeature` — **inalterado** (features de plano)
- `systemFeatureFlagsService` — **inalterado**
- Billing, notify, onboarding — **sem imports** do novo registry nesta sprint

---

## 3. Exemplos de uso

```ts
import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { getCorrelationId, runWithRequestContext } from '../context/requestContext.js';

// Rollout (futuro sprint 2+)
const res = await featureFlagRegistry.resolve('outbox.write_v1', {
  tenantId: req.tenantId,
  userId: req.userId,
});
if (res.enabled) { /* write outbox */ }
else if (res.shadow) { /* log only */ }

// Worker / retry com mesma correlation
await runWithRequestContext(
  { correlationId: event.correlation_id, workerName: 'outboxPublisher' },
  async () => { /* ... */ },
);

const cid = getCorrelationId();
```

```bash
# Override emergência sem deploy
export PLATFORM_FLAG_OUTBOX_WRITE_V1=0
export PLATFORM_INTERNAL_TENANT_IDS=tenant-uuid-for-dogfood
```

---

## 4. Riscos e limitações

| Item | Impacto | Mitigação |
|------|---------|-----------|
| Tabela ausente pré-migrate | Registry vazio; correlation via fallback ON | Correr migrate antes deploy |
| Log JSON extra em dev | Volume logs | Prod suprime `[FEATURE_FLAG]` não-important |
| % rollout simplificado | Bucket 0–99 por tenant+key | Documentado; UI admin sprint futura |
| Sem UI admin write | Overrides via SQL/env | Sprint 6+ |
| `bindRequestContext` só em cadeias auth exportadas | Rotas com auth manual sem ALS user | Estender cadeias quando necessário |

---

## 5. Próximas sprints

| Sprint | Escopo |
|--------|--------|
| **S2** | `outbox_events`, `publishDomainEvent`, publisher shadow |
| **S3** | Workers heartbeat + reclaim |
| **S4** | `channelProviderGateway` bridge |
| **S5–8** | Shadow consumers, dashboards, hardening, prod rollout |

Fora de escopo Sprint 1: outbox, workers complexos, gateway, UI flags, % rollout UI, Redis cache.

---

## 6. Como validar em produção

### Pré-deploy

```bash
cd packages/backend && npm run migrate:tsx
npm test
npm run build
```

### Pós-deploy (flags OFF)

- [ ] `GET /api/auth/me` com login — response **igual** ao anterior
- [ ] Response header `x-correlation-id` presente
- [ ] Logs `[CORRELATION] request_start` / `request_finish` (se log level permitir)
- [ ] `GET /api/superadmin/platform-feature-flags` — lista 22 flags; todas `default_enabled: false` exceto correlation
- [ ] Billing webhook / chat / notify — smoke sem regressão

### Tenant override (staging)

```sql
INSERT INTO platform_feature_flag_overrides (flag_key, tenant_id, enabled)
VALUES ('outbox.write_v1', '<tenant-uuid>', true);
```

### Kill switch drill

```sql
UPDATE platform_feature_flags SET default_enabled = true WHERE key = 'outbox.master_off';
-- outbox.write_v1 deve resolver enabled=false reason=kill_switch
```

---

## 7. Rollback strategy

| Nível | Ação | Impacto |
|-------|------|---------|
| L1 | `UPDATE platform_feature_flags SET default_enabled=false WHERE key='platform.correlation_middleware_v1'` | ALS off; header permanece |
| L2 | Revert commit Sprint 1 API | Sem correlation middleware |
| L3 | Drop tables (somente se código removido) | Perda overrides |

**Tempo alvo L1:** &lt; 5 min (SQL ou env).

---

## 8. Status final

| Critério | Status |
|----------|--------|
| Registry + migrations | ✅ |
| Correlation middleware | ✅ |
| Testes unitários | ✅ |
| Zero mudança comportamento flags P0 OFF | ✅ |
| Pronto para Sprint 2 | ✅ **após** migrate + 48h staging |

**Pendências recomendadas antes de prod:**

1. Executar migração `253` em staging/prod  
2. Smoke manual superadmin flags endpoint  
3. Opcional: definir `PLATFORM_INTERNAL_TENANT_IDS` para dogfood  

---

*Ver também: [P0_IMPLEMENTATION_SPRINTS.md](../P0_IMPLEMENTATION_SPRINTS.md) · [IMPLEMENTATION_P0_FOUNDATION_EXECUTION_PLAN.md](../IMPLEMENTATION_P0_FOUNDATION_EXECUTION_PLAN.md)*
