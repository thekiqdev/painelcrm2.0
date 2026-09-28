# Motor de Notificações da Plataforma (PainelCRM)

Documentação persistida da frente **Plataforma → notificações transacionais** (conta, plano, cobrança SaaS), **separada** do motor transacional do **tenant** (propostas, contratos, faturas do CRM).

## Objetivo

- Notificar **tenants / administradores da plataforma** por eventos reais do sistema (MVP: **WhatsApp** apenas).
- Manter **domínio de dados e UI** isolados do motor do tenant (`notification_*` / `docs/notifications-engine`).

## Documentos

| Ficheiro | Conteúdo |
|----------|----------|
| [STATUS.md](./STATUS.md) | Fase corrente, andamento, próximos passos |
| [PHASE-02-platform-core.md](./PHASE-02-platform-core.md) | Fase 2: núcleo técnico (catálogo, templates, entregas, flags) |
| [PHASE-03-platform-events.md](./PHASE-03-platform-events.md) | Fase 3: eventos reais de negócio (ligação aos fluxos da plataforma) |
| [PHASE-04-platform-admin-ui.md](./PHASE-04-platform-admin-ui.md) | Fase 4: UI Super Admin (catálogo, overrides, preview, histórico, toggles globais) |

## Decisões globais (referência)

- MVP operacional: transacional automático **somente**; **sem** anúncios em massa; **sem** e-mail ativo na primeira entrega.
- Prefixo de eventos: `platform.*`
- Super Admin é dono exclusivo dos templates/overrides da plataforma; tenants **não** editam este motor.
- Labels e navegação futura devem usar explicitamente **“Plataforma”**.

## Relação com o motor do tenant

| Aspeto | Motor do tenant | Motor da plataforma |
|--------|-----------------|---------------------|
| Docs | `docs/notifications-engine/` | `docs/platform-notifications/` |
| Catálogo | `notification_event_catalog` | `platform_notification_event_catalog` |
| Entregas | `notification_outbound_deliveries` | `platform_notification_deliveries` |

Reuso permitido: **código** (ex.: `strictMergeRenderer`, classificação de erro WhatsApp, padrão de attempts) — **sem** gravar entregas da plataforma nas tabelas do tenant.
