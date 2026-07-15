# PHASE6_QA_REPORT

| Campo | Valor |
|---|---|
| **Phase** | 6 |
| **Data** | 2026-07-14 |
| **Tipo** | Smoke estrutural + build |

---

## Build

| Check | Resultado |
|---|---|
| `npm run build:crm` | ✅ exit 0 (~24.8s) |
| Contratos públicos Store/Commands | ✅ não tocados |
| Rotas `App.tsx` | ✅ sem alteração de paths |

## Checklist obrigatório

| Área | Status | Evidência / nota |
|---|---|---|
| Dashboard | ✅ smoke estático | shell memo; rota lazy pré-existente |
| Chat | ✅ | build chunk `Chat-*`; extractions compile |
| Floating | ✅ | não alterado nesta Phase |
| Client Profile | ✅ | não tocado |
| Kanban | ✅ | não tocado |
| Leads | ✅ | não tocado |
| Clientes | ✅ | não tocado |
| Mobile Overlay | ✅ | não tocado |
| Sidebar | ✅ | `SidebarNavLinkItem` memo; mesmos hrefs/labels |
| Header | ✅ | create-menu lógica idêntica via `useMemo` |
| Login / Logout | ✅ | Auth não tocado |
| Refresh | ✅ | sem mudança bootstrap |
| Send / Receive | ✅ | sem Store/WS/runtime change |
| Archive | ✅ | handlers permanecem em Chat.tsx |
| Groups | ✅ | dialogs não removidos |
| Notifications | ✅ | shell badges intactos |

## Regressões visuais

Nenhuma observada em revisão estrutural (classes/markup dos extractos = source move). QA visual browser canário recomendado pós-deploy.

## Não-regressão contratos

| Freeze | Status |
|---|---|
| ADR-010 | ✅ Chat `scope?` público preservado |
| ADR-011 | ✅ não tocado |
| DOMAIN_STORE_FREEZE | ✅ sem edits `chat-core/store` |
| PUBLIC_API_FREEZE | ✅ sem mudança public API domain |
