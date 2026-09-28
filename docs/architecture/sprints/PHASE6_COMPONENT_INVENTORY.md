# PHASE6_COMPONENT_INVENTORY

| Campo | Valor |
|---|---|
| **Phase** | 6 |
| **Data** | 2026-07-14 |

---

## Extraídos / novos (MB-021)

| Unidade | Tipo | Path | Notas |
|---|---|---|---|
| `chatPageHelpers` | pure helpers | `src/pages/chat/chatPageHelpers.ts` | formatters, merge patch, attendance labels |
| `ChatHeaderKanbanThreadExtras` | presentation | `src/pages/chat/ChatHeaderKanbanThreadExtras.tsx` | props públicas preservadas |
| `useChatPageAccess` | hook | `src/pages/chat/useChatPageAccess.ts` | gates tenant/platform |
| `Chat` page | page container | `src/pages/Chat.tsx` | props `scope?` inalteradas |

## Shell (MB-022)

| Unidade | Antes | Depois |
|---|---|---|
| `AppShellHeader` | `React.memo` | sem mudança |
| `AppShellHeaderActions` | `React.memo` | + `useMemo` flags create-menu |
| `AppShellChromeSidebar` / `AppShellSidebar` | `React.memo` | + `SidebarNavLinkItem` memo module-level |
| `AppShellMainColumn` | function | `React.memo` |
| `MobileAppNavigation` | function | `React.memo` |

## Lazy fragments no Chat (MB-023)

| Unidade | Loading |
|---|---|
| `ProposalCreateForm` | `React.lazy` + `Suspense` em `viewMode === 'proposal-create'` |
| `ContractCreateForm` | idem `contract-create` |
| `CustomerInvoiceNew` | idem `invoice-create` |
| `ChatAppointmentSchedulePanel` | idem `appointment-create` |
| `ScheduleChatMessageDialog` | lazy só quando `scheduleChatDlgOpen` |

## Contagem

| Escopo | Before | After |
|---|---|---|
| Arquivos dedicados sob `src/pages/chat/` | 0 | **3** (+ helpers/hook/extras) |
| Componentes shell memoizados (Header/Actions/Sidebar/Main/MobileNav) | 3 | **5** (+ MainColumn, MobileNav) |
| Lazy commerce/dialog no Chat | 0 (sync) | **5** |
