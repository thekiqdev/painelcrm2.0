# Fase 5 — UI inicial do tenant (Motor transacional)

**Status da fase:** concluída no repositório (implementação + documentação de fecho).

## 1. Objetivo

Permitir que o **tenant** opere o Motor Central de Notificações no **MVP transacional** já existente: visualizar eventos disponíveis, ativar/desativar por evento, ver canal atual (WhatsApp), editar override de template com preview strict e dados de exemplo, consultar merge fields, restaurar padrão e ver histórico básico de entregas.

## 2. Escopo exato

- Apenas **UI do tenant** integrada ao painel existente e **API mínima** necessária onde o catálogo/estado agregado não existia ainda.
- Canal ativo: **WhatsApp**; locale padrão **pt-BR**.

## 3. O que entra

- Listagem por módulo/evento (MVP: propostas, contratos, faturas).
- Toggle de ativação por evento (`tenant_notification_preferences`).
- Indicação canal efetivo e se usa template sistema ou override.
- Editor simples de override (corpo; assunto se aplicável ao modelo).
- Merge fields por evento; preview strict **sem envio** (render apenas).
- Restaurar padrão (remover override ativo).
- Histórico/listagem de entregas com filtros mínimos (reuso de `deliveries/search` com campos adicionais).
- Respeito ao **toggle global** do motor (Super Admin / `superadmin_settings`, com kill switch opcional em env): o bootstrap informa o estado; rotas mutáveis/listagem seguem 503 quando o motor está desligado.
- Permissões módulo **settings** (`view` / `edit`) alinhadas ao painel.

## 4. O que não entra

- E-mail/SMS ativos, campanhas, jornadas, in-app, regras condicionais complexas, builder visual, novos módulos fora do MVP, redesign global do painel.

## 5. Visão funcional da UI

Em **Configurações → Notificações**, abas enxutas: **Motor transacional** (lista + edição) e **Histórico** (entregas recentes com filtros). Se o motor estiver globalmente desligado, aviso claro e sem chamadas que dependam do motor ligado.

## 6. Telas / componentes previstos

- `NotificationsSection`: orquestra tabs, permissões e bootstrap.
- Lista em tabela (módulo, evento legível, canal, ativo, override vs padrão, ação editar).
- Sheet ou dialog de edição: textarea corpo, merge fields em chips/lista, preview, salvar / cancelar / restaurar padrão.
- Histórico: tabela com data, evento, canal, destinatário, status, erro, referência de entidade.

## 7. Rotas previstas (frontend)

- Reuso de `/settings` com secção `notifications` (query `?section=notifications` já suportada pelo layout).

## 8. Endpoints / serviços reutilizados (Fases 2–4)

- `GET /api/notifications-engine/deliveries/search` — histórico filtrado (estendido com `entity_*` e `recipient_*` na resposta).
- `isNotificationsEngineEnabled`, `renderStrictTemplates`, repositório: `getEventByKey`, `getSystemTemplate`, `getTenantOverride`, `getTenantPreference`.

## 9. Novos endpoints (tenant)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| GET | `/api/notifications-engine/bootstrap` | `engine_enabled`, `default_locale` (sem exigir motor ligado). |
| GET | `/api/notifications-engine/tenant/catalog-with-state` | Catálogo + preferência + flag de override. |
| GET | `/api/notifications-engine/tenant/template-bundle/:eventKey` | Templates sistema + override + merge fields. |
| PUT | `/api/notifications-engine/tenant/preferences/:eventKey` | `{ enabled }`. |
| PUT | `/api/notifications-engine/tenant/override/:eventKey` | `{ body_template, subject_template? }` (validação strict). |
| DELETE | `/api/notifications-engine/tenant/override/:eventKey` | Restaurar padrão (`channel`, `locale` query). |
| POST | `/api/notifications-engine/tenant/preview` | Preview strict, sem dispatch. |

## 10. Estratégia de override

- Leitura: `notification_template_system` + `tenant_notification_template_overrides` (canal/locale resolvidos como no motor).
- Escrita: `UPSERT` na tabela de overrides com `system_template_id` do template sistema ativo; **nunca** atualizar `notification_template_system`.
- Validação no `PUT`: `renderStrictTemplates` com contexto de exemplo completo para todos os placeholders do template.

## 11. Estratégia de preview

- Reutilizar `renderStrictTemplates` com whitelist do evento.
- Contexto = amostras seguras por campo + opcional `merge_context` do cliente para sobrescrever chaves.
- Erros: `disallowedPlaceholders`, `missingKeys` expostos na resposta JSON para a UI.

## 12. Estratégia de histórico

- Cliente chama `deliveries/search` com `hours`, `status`, `event_key`, `limit`.
- Backend passa a devolver também `entity_type`, `entity_id`, `recipient_type`, `recipient_address`.

## 13. Estratégia de permissões

- `settings.view`: catálogo, bundle de template, preview, leitura de histórico (via rota existente sem mudança de permissão no router legado).
- `settings.edit`: preferências e overrides.
- Frontend: `useModulePermissions().canEdit('settings')` para desabilitar toggles/botões de escrita.

## 14. Checklist de implementação

- [x] Documento PHASE-05 (este ficheiro) + STATUS/README.
- [x] Repositório: catálogo com estado tenant; upsert preferência; upsert/delete override; colunas extra em deliveries.
- [x] Controller + rotas `/bootstrap` e `/tenant/*`.
- [x] Serviço de amostras merge para preview/validação.
- [x] UI em `NotificationsSection` + `notificationsEngineTenant` API client.
- [x] Build backend/frontend sem erros (`npm run build` na raiz e em `packages/backend`).

## 15. Checklist de validação

- [x] Lista MVP visível com rótulos amigáveis (descrição do catálogo + fallbacks PT na UI).
- [x] Toggle persiste (`PUT …/preferences/:eventKey`) e respeita flag global + RLS existente.
- [x] Override editável / restaurar padrão (`PUT`/`DELETE …/override/:eventKey`).
- [x] Merge fields + preview strict sem envio (`POST …/tenant/preview`).
- [x] Histórico com filtros mínimos (`GET …/deliveries/search` + colunas extra).
- [x] Tema claro/escuro (tokens `background`/`foreground`/`border`/`muted` do painel).
- [x] Permissões `settings.view` / `settings.edit` nas rotas `/tenant/*`; UI desativa escrita sem `canEdit('settings')`.
- [x] Rotas legadas do motor (`/events`, `/simulate`, etc.) mantidas sem `requirePermission` extra (sem regressão de contrato).

## 16. Secção de status (pós-implementação)

**Estado:** concluída.

### Ficheiros criados

- `docs/notifications-engine/PHASE-05-tenant-ui.md` (este documento).
- `packages/backend/src/services/notificationsEngine/notificationTenantUiSamples.ts` — contexto de exemplo para strict/preview.
- `src/services/notificationsEngineTenant.ts` — cliente API da UI.

### Ficheiros alterados

- `packages/backend/src/services/notificationsEngine/notificationEngineRepository.ts` — `listCatalogWithTenantState`, `upsertTenantNotificationPreference`, `upsertTenantNotificationOverride`, `deleteTenantNotificationOverride`; colunas `entity_*` e `recipient_*` nas listagens de entregas.
- `packages/backend/src/controllers/notificationsEngineController.ts` — bootstrap, catálogo, bundle, preferência, override, preview.
- `packages/backend/src/routes/notificationsEngineRoutes.ts` — novas rotas + `requirePermission`.
- `src/components/settings/NotificationsSection.tsx` — UI com tabs, tabela, sheet de edição, histórico.
- `docs/notifications-engine/STATUS.md`, `docs/notifications-engine/README.md`.

### Endpoints utilizados ou criados

| Método | Caminho | Notas |
|--------|---------|--------|
| GET | `/api/notifications-engine/bootstrap` | **Novo** — lê apenas env; não exige motor ligado. |
| GET | `/api/notifications-engine/tenant/catalog-with-state` | **Novo** — `settings.view`. |
| GET | `/api/notifications-engine/tenant/template-bundle/:eventKey` | **Novo** — `settings.view`. |
| PUT | `/api/notifications-engine/tenant/preferences/:eventKey` | **Novo** — `settings.edit`. |
| PUT | `/api/notifications-engine/tenant/override/:eventKey` | **Novo** — `settings.edit`; validação strict com amostras. |
| DELETE | `/api/notifications-engine/tenant/override/:eventKey` | **Novo** — `settings.edit`. |
| POST | `/api/notifications-engine/tenant/preview` | **Novo** — `settings.view`; só render. |
| GET | `/api/notifications-engine/deliveries/search` | **Existente** — resposta enriquecida com `entity_type`, `entity_id`, `recipient_type`, `recipient_address`. |

### Pendências / melhorias futuras (fora do escopo Fase 5)

- Testes E2E automatizados (Playwright) para o fluxo completo com motor ligado em staging.
- Copiar placeholder para clipboard ao clicar no merge field.
- Paginação no histórico (hoje `limit` fixo na UI).

### Validações realizadas

- Compilação TypeScript backend (`packages/backend`: `npm run build`).
- Build de produção frontend (raiz: `npm run build`).
- Revisão estática: preview não chama WhatsApp; `DELETE` override não toca `notification_template_system`.

### Riscos / pontos de atenção

- `GET /deliveries/search` continua **sem** `requirePermission` (comportamento legado); a UI depende do utilizador já autenticado no CRM. As rotas `/tenant/*` reforçam RBAC para configuração sensível.
- Utilizadores **member** com `settings` só `view` vêem a UI mas não conseguem gravar (403 esperado se tentarem API direta).

### Resumo das 12 validações pedidas no épico

1. Lista MVP — **sim** (catálogo ativo + labels).  
2. Toggle — **sim** (`tenant_notification_preferences`).  
3. Editar override — **sim**.  
4. Restaurar padrão — **sim** (`DELETE` override).  
5. Merge fields — **sim** (no bundle + chips na UI).  
6. Preview básico — **sim** (`POST /tenant/preview`, dados de exemplo).  
7. Histórico — **sim** (tab + filtros + colunas).  
8. Tema claro/escuro — **sim** (componentes do design system).  
9. Permissões — **sim** (`requirePermission` + `useModulePermissions`).  
10. Build sem erros — **sim**.  
11. Motor existente — **sim** (rotas antigas preservadas).  
12. Outras settings — **sim** (apenas `NotificationsSection` substituído; resto do `Settings` inalterado).

_Validação manual em ambiente com motor ligado, tenant com dados e WhatsApp configurado recomendada antes de produção._
