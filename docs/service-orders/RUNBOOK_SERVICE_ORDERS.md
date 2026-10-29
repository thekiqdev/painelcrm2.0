# Runbook — Ordens de Serviço

Guia curto de operação e incidentes (go-live S7).

## Feature flag

| Item | Detalhe |
|------|---------|
| Key | `service_orders` |
| Onde | Super Admin → planos (`plan_features`) + `system_features` |
| Código | Deve existir em `FEATURE_KEYS` (`packages/backend/src/constants/features.ts`) |
| Sintoma 403 | Key ausente do catálogo ou plano sem a feature |
| Menu | Sidebar/mobile + perfil do cliente só com flag **e** `can_view` |

**Rollout sugerido:** ligar num plano piloto → validar create/PDF/assinatura/fatura/visita → expandir.

## Permissões

Módulo `service_orders` + extras em `module_extras`:

| Extra | Efeito |
|-------|--------|
| `service_orders_view_own_only` | Lista só autor/responsável |
| `service_orders_send` | Enviar / reemitir links |
| `service_orders_request_signature` | Fluxo de assinatura |
| `service_orders_generate_invoice` | Gerar fatura (+ `billing.create_invoice`) |
| `service_orders_cancel` | PATCH status `cancelled` |

UI: Configurações → Perfis → permissões detalhadas do módulo.

## Rate limit público

Env (defaults entre parênteses):

- `RATE_LIMIT_PUBLIC_SERVICE_ORDER_VIEW_MAX` (120 / 15 min)
- `RATE_LIMIT_PUBLIC_SERVICE_ORDER_SIGN_POST_MAX` (30 / 15 min)

Rotas: `/api/public/service-orders/view|sign/:token`. Em `development` o limit é skipped.

## Incidentes comuns

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Menu OS não aparece | Flag off / `FEATURE_KEYS` / permissão view | Conferir plano + catálogo + perfil |
| 403 ao enviar assinatura | Sem `send` / `request_signature` | Ajustar extras do perfil |
| 409 fatura | Já convertida / unique `service_order_id` | Abrir fatura existente |
| Fatura auto falhou | Gateway / CPF / cliente | Notificação ao dono; gerar manual |
| Google visita com erro | OAuth do **usuário logado** | Conectar Google Agenda; retry sync |
| Link público 404 | Token revogado / expirado | Reenviar assinatura |

## Checklist go-live

1. Flag `service_orders` no plano alvo  
2. Perfis com view/create/edit + extras necessários  
3. Gateway CRM ativo (se for faturar)  
4. Smoke: criar OS → PDF → assinar → fatura → visita  
5. Confirmar rate limit em staging/prod  

## Docs relacionadas

- Plano: `docs/PLANO_SPRINTS_ORDEM_DE_SERVICO.md`
- ADR: `docs/service-orders/ADR_OS_S0_DECISOES.md`
- Notas S1–S7: `docs/service-orders/SPRINT_OS_Sx_NOTES.md`
