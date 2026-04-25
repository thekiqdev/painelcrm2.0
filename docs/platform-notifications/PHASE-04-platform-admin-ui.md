# Fase 4 — UI Super Admin: Notificações da Plataforma

**Documento:** operação do motor `platform_notification_*` via painel Super Admin.  
**Última atualização:** 2026-04-24 (implementação + fecho de fase).

## 1. Objetivo

Criar a **UI inicial do Super Admin** para operar o Motor de Notificações da Plataforma já existente (Fases 2–3), com separação explícita do motor transacional do **tenant** e sem confundir com modelos legados.

## 2. Escopo exato da fase

- Apenas **plataforma** (`platform.*`, tabelas `platform_notification_*`).
- Canal MVP: **WhatsApp**.
- Super Admin como único editor de **overrides**; template sistema **imutável** via UI.

## 3. O que entra

- Navegação e rota no Super Admin.
- Listagem de notificações transacionais da plataforma com labels amigáveis.
- Toggle ativo/inativo **por evento** (catálogo).
- Visualização do canal atual e indicação **padrão vs override**.
- Editor de **override** (corpo; assunto se aplicável), **restaurar padrão**, cancelar.
- **Merge fields** por evento e **preview** strict (dados de exemplo, sem envio real).
- **Histórico** básico de entregas (`platform_notification_deliveries`) com filtros mínimos.
- **Toggles globais** do motor da plataforma (`platform_notifications_*` em `superadmin_settings`).
- Microcopy e breadcrumbs deixando claro **“Plataforma”**.

## 4. O que não entra

- E-mail, SMS, campanhas, anúncios, jornadas, builder avançado, segmentação.
- UI do tenant; expansão de eventos fora do MVP acordado.
- Mistura com o motor do tenant ou edição de `message_templates` / `whatsapp_message_templates` legados.

## 5. Visão funcional da UI do Super Admin

O operador Super Admin pode:

1. Ver todos os eventos do catálogo da plataforma com módulo, nome legível, canal, estado ativo e se há override.
2. Ligar/desligar cada evento sem alterar templates sistema.
3. Abrir um editor, ver merge fields, editar texto do override, pré-visualizar com contexto simulado, guardar ou reverter ao padrão.
4. Ajustar kill switches globais (motor, eventos de negócio, WhatsApp, log verboso).
5. Consultar entregas recentes com filtros por estado, evento e janela temporal.

## 6. Telas / componentes previstos

| Área | Conteúdo |
|------|----------|
| **Catálogo** | Tabela: módulo, evento (título + chave), canal, badge override/padrão, switch ativo, ação Editar |
| **Configuração global** | Switches alinhados às chaves `platform_notifications_*` |
| **Histórico** | Filtros + tabela de entregas |
| **Dialog** | Edição de override, merge fields, preview, ações Guardar / Restaurar / Cancelar |

**Implementado em:** `src/pages/superadmin/SuperAdminPlatformNotifications.tsx`.

## 7. Rotas previstas (frontend)

| Rota | Descrição |
|------|-----------|
| `/superadmin/platform-notifications` | Página principal (tabs: Catálogo, Configuração global, Histórico) |

**Layout:** item de menu **“Notificações da plataforma”** (ícone `Building2`), em Configurações. O item **“Motor CRM (tenants)”** mantém o motor `notifications_engine` dos tenants.

## 8. Endpoints / serviços reutilizados (Fase 2/3)

| Método | Caminho | Uso na UI |
|--------|---------|-----------|
| GET | `/api/superadmin/platform-notifications/catalog/events` | Lista catálogo + `has_override` |
| GET | `/api/superadmin/platform-notifications/catalog/events/:eventKey` | Detalhe (system + override + `effective_source`) |
| PATCH | `/api/superadmin/platform-notifications/catalog/events/:eventKey/active` | Toggle `is_active` por evento |
| GET/PUT | `/api/superadmin/platform-notifications/global-settings` | Toggles globais |
| PUT | `/api/superadmin/platform-notifications/template-overrides` | Gravar override |
| DELETE | `/api/superadmin/platform-notifications/template-overrides?event_key=&channel=&locale=` | Restaurar padrão |
| POST | `/api/superadmin/platform-notifications/preview` | Preview strict |
| GET | `/api/superadmin/platform-notifications/deliveries?limit=&hours=&status=&event_key=` | Histórico |

**Backend:** rotas registadas em `packages/backend/src/routes/superadminRoutes.ts`. Repositório: `setPlatformCatalogEventActive`, `listPlatformCatalog`, etc.

## 9. Estratégia de edição de override

- Leitura do **template sistema** e **override** via GET detalhe; o utilizador edita apenas texto que será gravado na tabela `platform_notification_template_overrides`.
- **PUT** valida existência do template sistema e associa `system_template_id` — não sobrescreve `platform_notification_template_system`.
- **DELETE** remove a linha de override para `(event_key, channel, locale)`.
- **Cancelar** fecha o dialog sem PUT/DELETE.

## 10. Estratégia de preview

- **POST** `/preview` com `merge_context` construído no cliente a partir de `merge_field_list` (valores de exemplo seguros).
- Renderização **strict** no servidor (`strictMergeRenderer`); respostas 400 expõem `disallowed_placeholders` e `missing_keys` na UI.
- **Não** dispara envio real (distinto de `POST .../simulate`).

## 11. Estratégia de histórico / log

- **GET** `deliveries` com `hours` (24/72/168), `status` opcional, `event_key` opcional.
- Colunas: data/hora, evento (título amigável), canal, destinatário, estado, entidade (tipo/id), erro resumido.

## 12. Estratégia de permissões

- Todas as rotas sob `/api/superadmin/*` com `superadminAuth` (existente).
- Rota React sob `SuperAdminGuard` + `SuperAdminLayout` — **sem** exposição a tenants.

## 13. Checklist de implementação

- [x] Documento PHASE-04 (este ficheiro)
- [x] Rotas backend GET detalhe + PATCH `active`
- [x] Página React com tabs e dialog
- [x] Navegação + rota `App.tsx`
- [x] Distinção visual/microcopy “Plataforma” vs tenant
- [x] Labels amigáveis para eventos MVP (`platform.account.created`, `platform.plan.activated`, `platform.billing.charge.created`, `platform.billing.payment_confirmed`)

## 14. Checklist de validação

- [x] Lista de notificações da plataforma visível
- [x] Toggle ativo/inativo por evento com persistência
- [x] Edição e gravação de override; restaurar padrão
- [x] Merge fields visíveis; preview com dados de exemplo
- [x] Histórico com filtros básicos
- [x] Toggles globais
- [x] Tema claro/escuro (componentes `bg-card`, `border-border`, `text-foreground`)
- [x] Build sem erros (`npm run build` na raiz do projeto)
- [ ] Testes manuais em ambiente com dados reais (recomendado ao operador)

## 15. Status da fase

**Concluída** (MVP UI Fase 4 conforme escopo).

### Pós-implementação — ficheiros alterados / criados

| Ficheiro | Alteração |
|----------|-----------|
| `packages/backend/src/routes/superadminRoutes.ts` | Registo `PATCH .../catalog/events/:eventKey/active` e `GET .../catalog/events/:eventKey` |
| `src/pages/superadmin/SuperAdminPlatformNotifications.tsx` | **Novo** — UI completa |
| `src/App.tsx` | Lazy + rota `platform-notifications` |
| `src/layouts/SuperAdminLayout.tsx` | Link “Notificações da plataforma”; renomeação “Motor CRM (tenants)” |
| `src/pages/superadmin/SuperAdminNotificationsEngineSettings.tsx` | Microcopy cruzada para motor tenant vs plataforma |
| `src/integrations/api/client.ts` | Respostas de erro incluem corpo JSON completo em `details` (preview strict com placeholders inválidos) |
| `docs/platform-notifications/PHASE-04-platform-admin-ui.md` | Este documento |
| `docs/platform-notifications/STATUS.md` | Atualizado |
| `docs/platform-notifications/README.md` | Entrada Fase 4 |

### Pendências / riscos

- **Piloto / dispatch tenant** (`pilot_target_tenant_ids`, `dispatch_tenant_id`, `dispatch_sender_user_id`): expostos na API global mas **não** na UI enxuta desta fase; configurar via API ou evolução futura se necessário.
- **Simulate** (`POST .../simulate`) permanece apenas para cenários operacionais controlados, não integrado na UI de preview.
- Validar em produção **kill switch** de ambiente (`PLATFORM_NOTIFICATIONS_ENABLED`) vs toggles em BD (comportamento já documentado nas fases anteriores).

### Validações realizadas (automatizado)

- `npm run build` na raiz do repositório — **sucesso** (2026-04-24).
