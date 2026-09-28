# Feature Flags Admin (Super Admin → Avançado)

## Objetivo

Transformar o rollout registry P0 (`platform_feature_flags`) numa ferramenta operacional **enterprise**, sem dependência de SQL manual, sem restart do backend, e sem alterar a arquitetura existente do registry/caching/kill switches.

## Onde fica no painel

- **Rota UI**: `/superadmin/avancado/feature-flags`
- **Menu**: Super Admin → **Avançado** → **Feature Flags**

## Endpoints (backend)

- **Listagem**: `GET /api/superadmin/advanced/feature-flags`
- **Atualização**: `PATCH /api/superadmin/advanced/feature-flags/:key`

Campos suportados no PATCH (foundation-ready):

- `default_enabled` (boolean)
- `shadow_mode` (boolean)
- `rollout_percent` (0..100)

## Cache / refresh (sem restart)

Após qualquer PATCH, o backend executa:

- `featureFlagRegistry.invalidateCache()`
- `await featureFlagRegistry.refresh()`

Isso garante que o registry em memória reflita imediatamente as mudanças persistidas no banco.

## Kill switches (visual + operação)

Cada flag pode ter `kill_switch_key` (ex.: `workflow.master_off`).

- No UI, exibimos o **kill switch** associado e seu estado **ativo/inativo**.
- Em P0, os kill switches são flags comuns e normalmente controladas por `default_enabled`.

## Shadow mode

O `shadow_mode` serve para rodar lógica nova de forma passiva/observável, sem impacto real (quando a implementação respeita o `shadow` retornado pelo registry).

No registry P0, `shadow_mode=true` implica `enabled=false` em `featureFlagRegistry.resolve()` (execução legada continua “doninha”).

### Acquisition (`/cadastro`, `/teste-gratis`)

As flags `acquisition.*` vêm seedadas com **shadow ON** por padrão. No painel:

- **Enabled ON** = liberar superfície pública (UI + API `/api/public/acquisition/config`)
- **Shadow ON** = workflows/mensagens ainda em modo passivo no backend

Ou seja: para ver o novo cadastro, basta **Enabled ON** + **`acquisition.master_off` OFF** — não é obrigatório desligar Shadow só para abrir a UI.

Se quiser execução “real” (não só shadow) nos workers/workflows, aí sim desligue Shadow quando o rollout estiver maduro.

## Rollout percentual

Mesmo que o rollout percentual ainda seja “foundation-only” em parte do sistema, o UI já suporta editar `rollout_percent` para preparar rollout operacional.

## Auditoria

Cada alteração via UI registra no log:

- **Tabela**: `super_admin_audit_log`
- **action**: `feature_flag.updated`
- **entity_type**: `platform_feature_flag`
- **entity_id**: `:key`
- **payload**: old/new + namespace + correlation_id (quando disponível)

## Observabilidade (logs)

Mudanças via UI são logadas com o prefixo:

- `[FEATURE_FLAG_ADMIN]`

Inclui: `actor`, `key`, `namespace`, `old/new` e `correlation_id` (ALS).

## Rollback operacional (procedimento)

1. Identificar a flag alterada (UI ou auditoria).
2. Reverter `default_enabled` (OFF) e/ou zerar `rollout_percent`.
3. Se necessário, **ativar kill switch** (`*.master_off`) para desligar rapidamente um domínio inteiro.
4. Confirmar no UI que o `updated_at` mudou e que o estado refletiu (cache refresh é imediato).

## Não escopo (nesta entrega)

- UI de overrides por tenant
- canary visual/scheduling
- experiment engine / A/B analytics

