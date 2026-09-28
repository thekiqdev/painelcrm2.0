# Status — Motor Central de Notificações

**Última atualização:** 2026-04-22

## Fase atual

**Fase 5 — UI inicial do tenant** — concluída. **Toggles globais do motor** — migrados para Super Admin + `superadmin_settings`; ver [GLOBAL-MOTOR-FLAGS-SUPERADMIN.md](./GLOBAL-MOTOR-FLAGS-SUPERADMIN.md).

## Resumo do andamento

UI tenant em **Configurações → Notificações**; toggles **globais** (motor / eventos de negócio / envio WhatsApp) em **Super Admin → Configurações → Motor de notificações** com persistência em BD e cache no processo Node. Env opcional apenas como kill switch.

## Concluído até agora

- [x] Fase 1 — Organização, arquitetura e decisões (`docs/PLANO_MOTOR_CENTRAL_NOTIFICACOES_TENANT.md`)
- [x] Estrutura de documentação do épico (`docs/notifications-engine/`)
- [x] Fase 2 — Núcleo mínimo: [PHASE-02-core-engine.md](./PHASE-02-core-engine.md) (secção 13)
- [x] Fase 3 — Eventos reais: [PHASE-03-first-events.md](./PHASE-03-first-events.md) (secção 14)
- [x] Fase 4 — Hardening: [PHASE-04-production-hardening.md](./PHASE-04-production-hardening.md)
- [x] Fase 5 — UI tenant: [PHASE-05-tenant-ui.md](./PHASE-05-tenant-ui.md)
- [x] Toggles globais em BD + Super Admin: [GLOBAL-MOTOR-FLAGS-SUPERADMIN.md](./GLOBAL-MOTOR-FLAGS-SUPERADMIN.md) (migração `132_...`)

## Próxima fase prevista

**Fase 6 — Evolução operacional / canais** (proposta)

- E-mail ou SMS quando houver provider; fila dedicada / multi-réplica para retry se necessário.
- Melhorias de UX (editor rico, variantes A/B) fora do MVP mínimo.

## Estado da Fase 2

**Concluída** (implementação no repo).

## Estado da Fase 3

**Concluída** (implementação no repo). Digest `due_soon` / `overdue` tratado na Fase 4 (opt-in).

## Estado da Fase 4

**Concluída** no código e na documentação. **Pendente operacional:** validação manual checklist em [PHASE-04-production-hardening.md](./PHASE-04-production-hardening.md) (secção 11) após `npm run migrate` e configuração de flags em staging/produção.

## Estado da Fase 5

**Concluída** — ver [PHASE-05-tenant-ui.md](./PHASE-05-tenant-ui.md) secção 16 (ficheiros, endpoints, validações e riscos).
