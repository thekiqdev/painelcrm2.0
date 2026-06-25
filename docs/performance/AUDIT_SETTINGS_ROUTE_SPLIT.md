# AUDIT_SETTINGS_ROUTE_SPLIT

**Modo:** READ ONLY  
**Data:** 2026-06-23  
**Build:** `npm run build:crm` (pós S0.3.1-A Projects)  
**Entrada:** rota `/settings` e sub-rotas

---

## Executive summary

A rota Configurações sofre do mesmo anti-padrão que Projects **antes** de S0.3.1-A: `src/pages/Settings.tsx` importa **sincronamente 20 seções** (~50 ficheiros, ~12k LOC em `components/settings/` + dependências externas), mas renderiza **apenas uma** via `switch (activeSection)`.

| Métrica | Valor |
|---------|-------|
| Chunk `Settings-*.js` | **91,72 KB gzip** (667,49 KB min) |
| Rota desktop típica (`/settings`) | **~100 KB gzip** (+ `SettingsLayout` 3,66 KB + `SettingsIndex` 4,22 KB) |
| Meta realista pós-P0 | **~12–20 KB gzip** (shell + secção ativa) |
| Ganho recuperável do critical path | **~70–80 KB gzip** (~75–85% do chunk atual) |

**Sem TipTap, Recharts, Monaco, XLSX ou CodeMirror** no chunk Settings. Os maiores pesos são **árvores WhatsApp**, **motor de notificações**, **suporte/tickets**, **agenda** e **permissões** — tudo embutido por imports estáticos.

---

## 1. Estrutura da rota

### 1.1 Entrypoints e lazy boundaries

```tsx
// src/App.tsx
const Settings = lazyWithReload(() => import("./pages/Settings"));
const SettingsIndex = lazyWithReload(() => import("./pages/settings/SettingsIndex"));
const SettingsSectionPage = lazyWithReload(() => import("./pages/settings/SettingsSectionPage"));
const PaymentsPanelPage = lazyWithReload(() => import("./pages/settings/PaymentsPanelPage"));
const GatewayConfigPage = lazyWithReload(() => import("./pages/settings/GatewayConfigPage"));
// SettingsLayout via SettingsLayout.lazy.tsx
```

| Rota | Componente | Chunk gzip | Lazy? |
|------|------------|------------|-------|
| `/settings` | `SettingsIndex` | 4,22 KB | ✅ |
| `/settings` (desktop) | → `Settings` | 91,72 KB | ✅ (mas monólito interno) |
| `/settings/:slug` | `SettingsSectionPage` → `Settings` | 2,32 KB + 91,72 KB | ✅ |
| `/settings/payments` | `PaymentsPanelPage` | 5,43 KB | ✅ Fora do monólito |
| `/settings/payments/:gatewayKey` | `GatewayConfigPage` | 9,80 KB | ✅ Fora do monólito |
| `/settings/integrations` | `Settings` (alias legado) | 91,72 KB | ✅ |
| Layout | `SettingsLayout` | 3,66 KB | ✅ |

**Mobile:** hub `/settings` renderiza `MobileSettingsHome` **sem** carregar `Settings.tsx` até o utilizador abrir uma secção (`/settings/:slug`). **Desktop:** abrir `/settings` carrega imediatamente o chunk de 91 KB mesmo mostrando só `CompanyDataSection`.

### 1.2 Orquestração

```
AppLayout
  └── SettingsLayout (context: activeSection)
        ├── SettingsMenu (sidebar desktop)
        └── Outlet
              ├── SettingsIndex → Settings | MobileSettingsHome
              ├── SettingsSectionPage → Settings
              ├── PaymentsPanelPage
              └── GatewayConfigPage
```

`Settings.tsx` — router interno por `activeSection` (não React Router por secção):

```38:99:src/pages/Settings.tsx
  switch (activeSection) {
    case "companyData": return <CompanyDataSection ... />;
    case "users": return <UsersSection />;
    // … 18 secções adicionais, todas importadas no topo
    case "paymentGateway": return null; // → /settings/payments
    default: return <CompanyDataSection ... />;
  }
```

### 1.3 Tabela — Área × componente × mount × lazy

| Área (activeSection) | Componente principal | Carrega no mount? | Lazy hoje? |
|----------------------|---------------------|-------------------|------------|
| `companyData` (default) | `CompanyDataSection` | ✅ Só esta renderiza | ❌ Código de todas no bundle |
| `users` | `UsersSection` | ❌ Até navegar | ❌ No bundle |
| `teams` | `TeamsSection` | ❌ | ❌ |
| `userManagement` | `UserManagementSection` | ❌ | ❌ |
| `billing` | `BillingSection` | ❌ | ❌ |
| `notifications` | `NotificationsSection` | ❌ | ❌ |
| `security` | `SecuritySection` | ❌ | ❌ |
| `preferences` | `PreferencesSection` | ❌ | ❌ |
| `leadsConfig` | `LeadsSection` | ❌ | ❌ |
| `clientGroups` | `ClientGroupsSection` | ❌ | ❌ |
| `whatsapp` | `WhatsAppSection` | ❌ | ❌ |
| `chatTemplates` | `ChatTemplatesSettingsSection` | ❌ | ❌ |
| `domain` | `DomainSection` | ❌ | ❌ |
| `messageTemplates` | `MessageTemplatesSection` | ❌ | ❌ |
| `paymentGateway` | `null` (redirect) | — | ✅ Rota `PaymentsPanelPage` |
| `googleCalendar` | `GoogleCalendarSection` | ❌ | ❌ |
| `googleDrive` | `GoogleDriveSection` | ❌ | ❌ |
| `agendaAvailability` | `AgendaAvailabilitySection` | ❌ | ❌ |
| `chatAttendance` | `ChatAttendanceSettingsSection` | ❌ | ❌ |
| `support` | `SupportSettingsSection` | ❌ | ❌ |
| `publicSupportPortal` | *(só em query legado)* | — | Nested em `support` |
| `chatAutomation` | `ChatAutomationSettingsSection` | ❌ | ❌ (flag env) |

**Nota:** `PaymentGatewaySection` (825 LOC) e `MercadoPagoGatewaySection` (283 LOC) **não** entram em `Settings.tsx` — apenas em `GatewayConfigPage` / painel de pagamentos.

**Órfão:** `ProposalWebhookSettingsSection.tsx` (173 LOC) — **não referenciado** em `Settings.tsx` nem rotas auditadas (código morto no grafo Settings).

---

## 2. Bundle breakdown

Build `npm run build:crm`:

| Chunk | Gzip | Min | Origem |
|-------|------|-----|--------|
| **`Settings-*.js`** | **91,72 KB** | 667,49 KB | `Settings.tsx` + 20 imports síncronos + deps transitivas |
| `SettingsLayout-*.js` | 3,66 KB | 13,86 KB | Layout + `SettingsMenu` |
| `SettingsIndex-*.js` | 4,22 KB | 16,32 KB | Hub mobile + re-export desktop |
| `SettingsSectionPage-*.js` | 2,32 KB | 6,44 KB | Wrapper mobile/desktop |
| `PaymentsPanelPage-*.js` | 5,43 KB | 29,99 KB | Gateways resumo |
| `GatewayConfigPage-*.js` | 9,80 KB | 60,14 KB | `PaymentGatewaySection` + Mercado Pago |
| `socket.io-*.js` | 12,92 KB | 41,28 KB | Puxado via WhatsApp → `realtimeClient` |
| `appointmentAvailability-*.js` | 1,30 KB | 5,43 KB | Serviço agenda (re-export no Settings) |
| `catalogMediaUpload-*.js` | 1,56 KB | 3,63 KB | Upload logos empresa |
| `TenantBrandContext-*.js` | 0,70 KB | 1,21 KB | Branding |
| `whatsappMessageTemplates-*.js` | 0,50 KB | 1,39 KB | API templates Meta |
| `realtimeClient-*.js` | 0,63 KB | 1,66 KB | Eventos janela WhatsApp |

**Imports confirmados no header de `Settings-*.js`:** `appointmentAvailability`, `whatsappInstanceProfile`, `whatsappMessageTemplates`, `realtimeClient`, `socket.io`, `catalogMediaUpload`, `TenantBrandContext`, `tenantLimits`, `agendaConstants`, `tickets`, QR code (ícone), accordion/tabs massivos.

### Estimativa **dentro** do chunk `Settings-*.js` (91,72 KB)

| Responsável | Gzip est. | Evidência |
|-------------|-----------|-----------|
| **WhatsApp** (`InstancesList` ~4,5k LOC + `AddConnectionDialog` ~3,4k LOC + cards/sheets) | **~22–28 KB** | Maior sub-árvore; socket + QR |
| **WhatsappMessageTemplatesPanel** (~1,3k LOC) | **~10–14 KB** | Tab templates Meta |
| **NotificationsSection** (~960 LOC + NE tenant API) | **~9–12 KB** | 5 tabs + histórico entregas |
| **Support** → `TicketCategoriesManager` (~3,3k LOC) | **~10–14 KB** | Via `SupportSettingsSection` |
| **ChatAttendanceSettingsSection** (~917 LOC) | **~7–10 KB** | 5 tabs filas/SLA/regras |
| **RolePermissionsDialog** (~2,8k LOC) | **~8–11 KB** | Via `UserManagementSection` |
| **Agenda cluster** (Section + 3 tabs) | **~8–11 KB** | `appointmentAvailability` service |
| **MessageTemplatesSection** (~840 LOC) | **~5–7 KB** | Dialogs inline |
| **ChatAutomation** (~405 LOC) | **~4–6 KB** | Flag `VITE_CHAT_AUTOMATION_ENABLED` |
| **Users/Teams/Dialogs** | **~6–9 KB** | New/Edit user, teams |
| **CompanyDataSection** + upload | **~4–6 KB** | Default desktop |
| **Demais** (Google, billing, leads, etc.) | **~8–12 KB** | Seções menores |

---

## 3. Dependências pesadas (> ~10 KB gzip)

| Dependência | Peso (gzip) | Onde entra |
|-------------|-------------|------------|
| **Chunk Settings (app code)** | 91,72 KB | Monólito de secções |
| **socket.io-client** | 12,92 KB | `InstancesList` → `REALTIME_WINDOW_EVENTS` / sync WhatsApp |
| TipTap / Recharts / Monaco / XLSX / dnd-kit / CodeMirror | **❌ Ausentes** | — |
| **QR Code** (ícone lucide + popup base64) | < 1 KB ícone; lógica QR inline | `InstancesList`, `QRCodePopup` |
| **appointmentAvailability** (serviço + tabs) | ~1,3 KB chunk + corpo em Settings | `AgendaAvailabilitySection` |
| **catalogMediaUpload** | 1,56 KB | `CompanyDataSection` logos |
| **notificationsEngineTenant** | Inlined em Settings | `NotificationsSection` |
| **chat service** | Inlined | WhatsApp, ChatAttendance, Automation |
| **tenantLimits** | Partilhado | Users, Teams, Agenda, Chat |

---

## 4. Tabs

Comportamento Radix: quando uma **secção** monta, **todas as `TabsContent` dessa secção** tendem a montar (não há guard `activeTab !==` na maioria).

### 4.1 Secções com tabs internas

| Secção | Tabs | Import | Monta no load da secção? | Lazy? | Ganho est. |
|--------|------|--------|--------------------------|-------|-------------|
| `whatsapp` | Conexões / Avançadas | Estático | ✅ Ambas ao abrir WhatsApp | ✅ P0 | ~8–12 KB (lazy tab avançadas) |
| `chatTemplates` | *(panel interno)* | Estático | ✅ | ✅ P0 | ~10–14 KB |
| `agendaAvailability` | Empresa / Utilizador / Bloqueios / Tipos / Feriados | Estático | ✅ Todas as 5 | ✅ P1 | ~5–8 KB |
| `chatAttendance` | Filas / Equipes / SLA / Automação / Regras | Estático | ✅ Todas as 5 | ✅ P1 | ~5–8 KB |
| `notifications` | Visão geral / Eventos / Templates / Histórico / Config | Estático | ✅ + fetches em `useEffect` | ✅ P1 | ~4–6 KB + menos API |
| `messageTemplates` | Lista + dialogs | Estático | ✅ | P1 dialogs on open | ~2–3 KB |

### 4.2 Tabela resumo por secção (nível Settings)

| Tab / Secção | Import atual | Pode ser lazy? | Ganho (do chunk 91 KB) |
|--------------|--------------|----------------|------------------------|
| `companyData` | Estático L3 | ✅ (default shell) | Mantém ~4–6 KB no path default |
| `whatsapp` | Estático L11 | **✅ P0** | **~22–28 KB** |
| `chatTemplates` | Estático L12 | **✅ P0** | **~10–14 KB** |
| `notifications` | Estático L6 | **✅ P0** | **~9–12 KB** |
| `support` | Estático L21 | **✅ P0** | **~10–14 KB** |
| `chatAttendance` | Estático L20 | **✅ P0** | **~7–10 KB** |
| `userManagement` | Estático L14 | **✅ P0** | **~8–11 KB** |
| `agendaAvailability` | Estático L19 | **✅ P0** | **~8–11 KB** |
| `messageTemplates` | Estático L16 | ✅ P1 | ~5–7 KB |
| `users` / `teams` | Estático | ✅ P1 | ~6–9 KB |
| `googleCalendar` / `googleDrive` | Estático | ✅ P1 | ~3–5 KB cada |
| `chatAutomation` | Estático L23 | ✅ P1 | ~4–6 KB |
| Secções leves (security, preferences, domain, leads, billing) | Estático | ✅ P1 | ~1–3 KB cada |

---

## 5. Modais e dialogs

| Modal / Drawer | Secção | Import estático? | Peso est. | Lazy candidato |
|----------------|--------|------------------|-----------|----------------|
| `AddConnectionDialog` | WhatsApp | ✅ (via `WhatsAppSection`) | Alto (~3k LOC) | **P0** |
| `QRCodePopup` | WhatsApp | ✅ | Médio | **P0** |
| `InstanceDetailsDialog` / `WhatsAppInstanceDetailsSheet` | WhatsApp | ✅ | Médio | **P0** |
| `NewUserDialog` / `EditUserDialog` / `UserTeamsDialog` | Users | ✅ | Médio | **P1** (on `open`) |
| `RolePermissionsDialog` | UserManagement | ✅ | **Alto** (~2,8k LOC) | **P0** |
| Add profile `Dialog` | UserManagement | ✅ inline | Baixo | P1 |
| Message template Add/Edit/Test | MessageTemplates | ✅ inline | Médio | P1 |
| Chat attendance dialogs | ChatAttendance | ✅ | Médio | P1 |
| Agenda block/holiday dialogs | Agenda tabs | ✅ | Médio | P1 |
| `WhatsappMessageTemplatesPanel` modais | ChatTemplates | ✅ | Alto | **P0** |

**Sheets:** `NotificationsSection` usa `Sheet` para detalhe de entrega — montagem condicional por estado, mas módulo já no bundle.

---

## 6. Providers

| Provider | Custo | Necessário no mount? |
|----------|-------|----------------------|
| `SettingsLayoutContext` | Negligível | ✅ Sim (secção ativa) |
| `TenantBrandContext` | Global app | ✅ Em `CompanyDataSection` (refresh após save) |
| `ModulePermissionsContext` | Global app | ✅ Checagens `canEdit` |
| `AuthContext` | Global app | ✅ |
| **Sem providers exclusivos pesados** | — | — |

**Listeners (não providers):**

| Listener | Onde | No mount Settings? |
|----------|------|-------------------|
| `REALTIME_WINDOW_EVENTS` (window) | `InstancesList` | ❌ Só secção WhatsApp |
| Socket.IO | Via realtime WhatsApp | ❌ Só secção WhatsApp |

---

## 7. Queries e fetches na abertura

### Desktop `/settings` (default `companyData`)

| Request | Quando | Pode adiar? |
|---------|--------|-------------|
| `GET` tenant company (`getMyTenantCompany`) | Mount `CompanyDataSection` | ❌ Necessário |
| `TenantBrandContext` refresh | Após save logo | ❌ |

### Ao carregar chunk `Settings` (parse JS)

**Todas as secções** — sem fetch até `activeSection` mudar, exceto código já avaliado no import.

### Por secção (primeiro mount da secção)

| Secção | Requests no mount |
|--------|-------------------|
| `users` | `getMyTenantUsers`, limites plano |
| `teams` | `teamsService` + users |
| `notifications` | `fetchNeBootstrap`, depois `fetchNeTenantPreferences`, `fetchNeTenantSummary` |
| `whatsapp` | `chatService` list instances + listeners realtime |
| `googleCalendar` / `googleDrive` | React Query status OAuth |
| `agendaAvailability` | `getTenantAvailabilitySettings`, `getMyTenantUsers` |
| `chatAttendance` | Config chat + teams + users |
| `support` | `TicketCategoriesManager` fetch categorias + portal settings |
| `billing` | `getMyTenantBillingPreferences` |
| `leadsConfig` | `settingsService.getLeadStatuses` |

**Oportunidade:** com lazy por secção, **zero fetch** de WhatsApp/Notificações/Agenda até o utilizador navegar.

---

## 8. Lazy candidates

### P0 — ROI alto, risco baixo

| Alvo | Ganho est. | Risco |
|------|------------|-------|
| **`React.lazy` por secção em `Settings.tsx`** (espelhar S0.3.1-A Projects) | **~65–75 KB** no chunk shell | Baixo |
| **`WhatsAppSection` + subtree** (`InstancesList`, `AddConnectionDialog`) | **~22–28 KB** | Baixo |
| **`ChatTemplatesSettingsSection`** → `WhatsappMessageTemplatesPanel` | **~10–14 KB** | Baixo |
| **`NotificationsSection`** | **~9–12 KB** | Baixo |
| **`SupportSettingsSection`** → `TicketCategoriesManager` | **~10–14 KB** | Baixo |
| **`RolePermissionsDialog`** lazy on open | **~8–11 KB** | Baixo |
| **`socket.io` chunk** — adiar até secção WhatsApp | **~13 KB** rede | Baixo |

### P1 — ROI médio

| Alvo | Ganho est. | Risco |
|------|------------|-------|
| Tabs internas (Agenda, ChatAttendance, Notifications) | **~4–8 KB** cada secção | Baixo |
| Dialogs Users (`NewUserDialog`, `EditUserDialog`) | **~3–5 KB** | Baixo |
| `ChatAutomationSettingsSection` | **~4–6 KB** | Baixo |
| `MessageTemplatesSection` | **~5–7 KB** | Baixo |
| Desktop: não importar `Settings` em `SettingsIndex` até necessário | Evita 91 KB no index | Médio (routing) |

### P2 — Refactor estrutural

| Alvo | Ganho | Risco |
|------|-------|-------|
| Uma rota = um ficheiro lazy (`/settings/:slug` import dinâmico sem `Settings.tsx` switch) | Chunk por secção permanente | Médio |
| Extrair `components/whatsapp` para chunk partilhado só com `/chat` | Deduplicação | Alto |
| Remover / ligar `ProposalWebhookSettingsSection` órfão | Limpeza | Baixo |

---

## 9. Meta de otimização

| Cenário | Settings gzip (critical path desktop) | Notas |
|---------|--------------------------------------|-------|
| **Atual** | **~92 KB** (+ layout/index ~8 KB) | Monólito 20 secções |
| **Após P0** (lazy secções + dialogs WhatsApp/Suporte) | **~15–22 KB** shell + **~5–15 KB** secção ativa | **~70–80 KB** poupança |
| **Após P1** (tabs + dialogs restantes) | **~12–18 KB** típico | Secções leves < 8 KB |
| **Stretch** (rotas por ficheiro, P2) | **< 12 KB** default `companyData` | Alinhado a Projects pós-S0.3.1-A |

**Mobile** já está parcialmente otimizado: hub 4 KB sem `Settings` até navegação.

---

## 10. Ordem recomendada (roadmap)

### S0.3.2-A — Settings Section Lazy (crítico)

- Converter cada `case` em `Settings.tsx` para `lazy(() => import(...))` + `Suspense`
- Manter `CompanyDataSection` como default ou lazy com prefetch idle na sidebar hover
- **Impacto:** **−65~75 KB gzip** no chunk principal
- **Risco:** Baixo (padrão validado em Projects S0.3.1-A)

### S0.3.2-B — Integrações pesadas

- Lazy subtree WhatsApp (tab avançadas + `AddConnectionDialog` on open)
- Lazy `SupportSettingsSection` / `TicketCategoriesManager`
- Lazy `NotificationsSection` + adiar fetches NE até tab ativa
- Lazy `RolePermissionsDialog`
- **Impacto adicional:** **−15~25 KB** + socket.io fora do path default
- **Risco:** Baixo–médio

### S0.3.2-C — Polish e estrutura

- Tabs internas lazy (Agenda, ChatAttendance, Notifications)
- Dialogs Users/MessageTemplates on open
- Avaliar eliminar `Settings.tsx` switch em favor de imports por rota (`SettingsSectionPage` carrega secção diretamente)
- Remover ou integrar `ProposalWebhookSettingsSection`
- **Impacto:** **−5~15 KB** + manutenção
- **Risco:** Médio

---

## Critério final — respostas

### 1. Dez maiores responsáveis pelo peso (Settings ~92 KB gzip)

| # | Responsável | Gzip est. |
|---|-------------|-----------|
| 1 | Imports síncronos de **20 secções** em `Settings.tsx` | ~92 KB (total) |
| 2 | **WhatsApp** (`InstancesList` + `AddConnectionDialog` + realtime) | ~22–28 KB |
| 3 | **WhatsappMessageTemplatesPanel** | ~10–14 KB |
| 4 | **TicketCategoriesManager** (via Suporte) | ~10–14 KB |
| 5 | **NotificationsSection** (motor NE) | ~9–12 KB |
| 6 | **RolePermissionsDialog** | ~8–11 KB |
| 7 | **AgendaAvailability** cluster | ~8–11 KB |
| 8 | **ChatAttendanceSettingsSection** | ~7–10 KB |
| 9 | **MessageTemplatesSection** | ~5–7 KB |
| 10 | **Users/Teams** + dialogs | ~6–9 KB |

### 2. Quanto pode sair do critical path?

**~70–80 KB gzip (~75–85%)** do chunk atual, sem alterar APIs — apenas `import()` dinâmico por secção e modais, como em Projects S0.3.1-A.

Adicionalmente **socket.io (~13 KB)** deixa de carregar no path default.

### 3. Meta realista

| Alvo | Valor |
|------|-------|
| Chunk `Settings` shell | **< 20 KB gzip** |
| Secção ativa (mediana) | **5–15 KB gzip** |
| Default desktop (`companyData`) | **< 15 KB gzip** total |

### 4. Sprint de maior ROI imediato

**S0.3.2-A — Settings Section Lazy** — um único diff em `Settings.tsx` (padrão já provado), maior redução por hora de engenharia.

---

## Referências de código

Imports síncronos (causa raiz):

```3:23:src/pages/Settings.tsx
import { CompanyDataSection } from "@/components/settings/CompanyDataSection";
import { UsersSection } from "@/components/settings/UsersSection";
// … 18 imports adicionais de secções
import { ChatAutomationSettingsSection } from "@/components/settings/ChatAutomationSettings";
```

WhatsApp puxa árvore pesada:

```4:6:src/components/settings/WhatsAppSection.tsx
import AddConnectionDialog from "@/components/whatsapp/AddConnectionDialog";
import { InstancesList } from "@/components/whatsapp/InstancesList";
import AdvancedSettings from "@/components/whatsapp/AdvancedSettings";
```

Suporte puxa tickets:

```4:5:src/components/settings/SupportSettingsSection.tsx
import { TicketCategoriesManager } from '@/components/tickets/TicketCategoriesManager';
import { PublicSupportPortalSettingsSection } from '@/components/settings/PublicSupportPortalSettingsSection';
```

Pagamentos já separados:

```908:916:src/App.tsx
<Route path="payments" element={...PaymentsPanelPage...} />
<Route path="payments/:gatewayKey" element={...GatewayConfigPage...} />
```

---

## Relacionados

- `docs/performance/PERFORMANCE_REMEDIATION_PLAN_V2.md` — Settings P0 (~92 KB)
- `docs/performance/S0_3_1A_PROJECTS_CRITICAL_PATH.md` — padrão de implementação
- `docs/performance/PROJECTS_SPLIT_PLAN.md` — auditoria irmã

---

## Test plan (pós-implementação futura)

- [ ] Desktop `/settings` — Network: chunk Settings ≤ 20 KB gzip
- [ ] Navegar cada secção sidebar — chunk da secção carrega sob demanda
- [ ] WhatsApp — QR, nova instância, socket após entrar na secção
- [ ] Notificações — motor NE e histórico funcionam
- [ ] Mobile hub — continua sem carregar Settings até slug
- [ ] `/settings/payments` — inalterado (rotas separadas)
