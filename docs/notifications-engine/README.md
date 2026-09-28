# Motor Central de Notificações do Tenant

Documentação persistida do épico **Motor Central de Notificações**, fase a fase.

## Objetivo do épico

Centralizar notificações **transacionais externas** (MVP), com catálogo de eventos, templates padrão imutáveis, overrides por tenant, renderização strict de merge fields, dispatch por canal e histórico de entregas.

## Documentos

| Ficheiro | Conteúdo |
|----------|----------|
| [STATUS.md](./STATUS.md) | Estado atual do épico, fase corrente, próximos passos |
| [PHASE-02-core-engine.md](./PHASE-02-core-engine.md) | Fase 2: núcleo mínimo (modelagem, serviços, flag, sem wiring de negócio) |
| [PHASE-03-first-events.md](./PHASE-03-first-events.md) | Fase 3: eventos reais (propostas, contratos, faturas) |
| [PHASE-04-production-hardening.md](./PHASE-04-production-hardening.md) | Fase 4: retry, observabilidade, piloto, digest opt-in |
| [PHASE-05-tenant-ui.md](./PHASE-05-tenant-ui.md) | Fase 5: UI do tenant (lista, toggles, override, preview, histórico) |
| [GLOBAL-MOTOR-FLAGS-SUPERADMIN.md](./GLOBAL-MOTOR-FLAGS-SUPERADMIN.md) | Toggles globais do motor em `superadmin_settings` + UI Super Admin |

## Decisões globais (referência)

- MVP: apenas notificações **transacionais externas**; módulos futuros: propostas, contratos, faturas.
- Canal inicial ativo no produto: **WhatsApp**; e-mail fora da ativação inicial até provider real.
- Template **sistema** imutável; tenant edita apenas **override**.
- Evento só publicado após persistência confirmada (Fase 3+ nos módulos).
- Merge fields em modo **strict** no MVP.
- Rollout: **Super Admin → Motor de notificações** (`superadmin_settings`); env `NOTIFICATIONS_ENGINE_*` só como **kill switch** explícito (`false`/`0`/`no`) quando necessário.

## Plano consolidado (Fase 1)

O plano de arquitetura aprovado permanece em:

- `docs/PLANO_MOTOR_CENTRAL_NOTIFICACOES_TENANT.md`
