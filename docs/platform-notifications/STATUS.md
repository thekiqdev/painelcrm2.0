# Status — Motor de Notificações da Plataforma

**Última atualização:** 2026-04-24 — Fase 4 concluída (UI Super Admin); ver [PHASE-04-platform-admin-ui.md](./PHASE-04-platform-admin-ui.md).

## Fase atual

**Fase 5 — próxima prevista:** extensões operacionais (ex.: login link `platform.auth.login_link.issued`, observabilidade avançada, testes automatizados, campos avançados de configuração global na UI se necessário). Ainda **não** iniciada neste repositório.

## Resumo do andamento

- **Fase 1:** arquitetura / escopo (`docs/PLANO_MOTOR_NOTIFICACOES_PLATAFORMA.md`).
- **Fase 2:** núcleo técnico + APIs Super Admin mínimas ([PHASE-02-platform-core.md](./PHASE-02-platform-core.md)).
- **Fase 3:** **concluída** — eventos reais ligados ([PHASE-03-platform-events.md](./PHASE-03-platform-events.md)): conta, cobrança SaaS, pagamento confirmado, plano ativado; `platform.auth.login_link.issued` documentado como pendente.
- **Fase 4:** **concluída** — UI Super Admin para catálogo, toggles, overrides, preview, histórico e configuração global ([PHASE-04-platform-admin-ui.md](./PHASE-04-platform-admin-ui.md)).

## Concluído até agora

- Domínio `platform_notification_*` + flags + worker (Fase 2).
- Serviço `platformBusinessNotifications` + flag `platform_notifications_business_events_enabled`.
- Integrações em cadastro, checkout, billing (webhook, polling, cartão), renovação, cobrança Super Admin.
- Página **Notificações da plataforma** em `/superadmin/platform-notifications` (Fase 4).
- Documentação em `docs/platform-notifications/`.

## Próxima fase prevista

**Fase 5** — eventos adicionais maduros (ex.: login link), observabilidade, testes E2E/API, eventual edição na UI de pilot/dispatch se a operação exigir.

## Status da Fase 3

**Concluída.**

## Status da Fase 4

**Concluída** (MVP UI conforme escopo em PHASE-04).
