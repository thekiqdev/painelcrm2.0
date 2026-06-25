# S0.3.2-A — Settings Section Lazy — Relatório

**Data:** 2026-06-23  
**Base:** `AUDIT_SETTINGS_ROUTE_SPLIT.md`, padrão `S0_3_1A_PROJECTS_CRITICAL_PATH.md`  
**Escopo:** Lazy por seção em `src/pages/Settings.tsx` — sem alteração de APIs, UX, permissões ou layout

---

## Objetivo

Reduzir o chunk crítico `Settings-*.js` carregando **apenas `CompanyDataSection`** no path default e demais seções sob demanda.

| Meta | Resultado |
|------|-----------|
| `Settings-*.js` **< 20 KB gzip** | **6,36 KB gzip** ✅ |

---

## Implementação

### Arquivo alterado

`src/pages/Settings.tsx`

1. **Mantido síncrono:** `CompanyDataSection` (secção default `companyData`)
2. **19 secções** convertidas para `React.lazy()` + `.then(m => ({ default: m.NamedExport }))`
3. **`SectionSuspense`** — wrapper com `<Suspense fallback={<PageContentSkeleton />}>`
4. **`PublicSupportPortalSettingsSection`** — lazy (caso `publicSupportPortal` legado; não estava na lista explícita mas já era import estático)

### Padrão

```tsx
const UsersSection = lazy(() =>
  import("@/components/settings/UsersSection").then((m) => ({ default: m.UsersSection })),
);

// switch:
case "users":
  return (
    <SectionSuspense>
      <UsersSection />
    </SectionSuspense>
  );
```

**Inalterado:** `SettingsLayout`, sidebar, URLs, contextos, services, React Query, rotas `/settings/payments`.

---

## Antes × Depois

Build: `npm run build:crm`

| Chunk | Antes (gzip / min) | Depois (gzip / min) | Δ gzip |
|-------|-------------------|---------------------|--------|
| **`Settings-*.js`** | **91,72 KB** / 667,49 KB | **6,36 KB** / 31,85 KB | **−85,36 KB (−93%)** |
| `SettingsIndex-*.js` | 4,22 KB / 16,32 KB | 3,32 KB / 14,23 KB | −0,90 KB |
| `SettingsLayout-*.js` | 3,66 KB / 13,86 KB | 3,66 KB / 13,86 KB | — |
| `socket.io-*.js` no path default | Carregado com monólito | **Não carrega** até WhatsApp | −12,92 KB rede |

### Critical path desktop `/settings` (default)

| Antes | Depois |
|-------|--------|
| ~100 KB gzip (Settings + layout + index) | **~13 KB gzip** (6,36 + 3,66 + 3,32) |
| Parse/exec de 20 secções | Apenas shell + `CompanyDataSection` |

---

## Novos chunks lazy (secções)

| Chunk | Gzip | Min |
|-------|------|-----|
| `PreferencesSection-*.js` | 1,04 KB | 6,72 KB |
| `DomainSection-*.js` | 1,11 KB | 5,14 KB |
| `SecuritySection-*.js` | 1,13 KB | 7,96 KB |
| `SupportSettingsSection-*.js` | 1,92 KB | 7,26 KB |
| `LeadsSection-*.js` | 1,86 KB | 9,43 KB |
| `GoogleCalendarSection-*.js` | 2,15 KB | 8,89 KB |
| `GoogleDriveSection-*.js` | 2,65 KB | 11,73 KB |
| `ClientGroupsSection-*.js` | 2,24 KB | 12,64 KB |
| `TeamsSection-*.js` | 3,24 KB | 18,30 KB |
| `BillingSection-*.js` | 3,41 KB | 15,35 KB |
| `PublicSupportPortalSettingsSection-*.js` | 3,17 KB | 15,68 KB |
| `ChatAutomationSettings-*.js` | 4,16 KB | 21,71 KB |
| `UsersSection-*.js` | 6,33 KB | 33,16 KB |
| `MessageTemplatesSection-*.js` | 6,51 KB | 41,74 KB |
| `NotificationsSection-*.js` | 8,37 KB | 57,57 KB |
| `ChatTemplatesSettingsSection-*.js` | 9,85 KB | 71,63 KB |
| `UserManagementSection-*.js` | 10,95 KB | 92,35 KB |
| `AgendaAvailabilitySection-*.js` | 11,90 KB | 83,54 KB |
| `ChatAttendanceSettingsSection-*.js` | 7,70 KB | 58,18 KB |
| **`WhatsAppSection-*.js`** | **17,70 KB** | 100,07 KB |

`CompanyDataSection` permanece **inlined** no chunk `Settings-*.js` (sem chunk separado).

---

## Ganho total

| Métrica | Valor |
|---------|-------|
| Redução chunk `Settings` | **−85,36 KB gzip** |
| Meta < 20 KB | **6,36 KB** (68% abaixo da meta) |
| Secções lazy criadas | **19 chunks** nomeados |
| Código removido do critical path | ~20 secções + WhatsApp/socket/agenda/notificações |

---

## Requests evitados no mount `/settings`

| Request / comportamento | Antes (parse bundle) | Depois (default) |
|-------------------------|----------------------|------------------|
| `getMyTenantCompany` | ✅ (secção ativa) | ✅ (inalterado) |
| `fetchNeBootstrap` / motor notificações | Código no bundle | ❌ Só ao abrir Notificações |
| `chatService` list instances | Código no bundle | ❌ Só ao abrir WhatsApp |
| `getTenantAvailabilitySettings` | Código no bundle | ❌ Só ao abrir Agenda |
| Categorias tickets / portal suporte | Código no bundle | ❌ Só ao abrir Suporte |
| `getMyTenantUsers` (users/teams) | Código no bundle | ❌ Só ao abrir secção |
| Socket.IO / realtime WhatsApp | Chunk no grafo | ❌ Só com `WhatsAppSection` |

---

## Tempo de carregamento percebido

| Cenário | Comportamento |
|---------|---------------|
| **Abrir `/settings` (desktop)** | Conteúdo default (`CompanyDataSection`) sem skeleton de secção; **sem** download de ~85 KB de JS extra |
| **Trocar secção na sidebar** | Breve `PageContentSkeleton` (~100–300 ms) na primeira visita à secção; depois cache do chunk |
| **Mobile hub** | Inalterado — `Settings` só carrega ao abrir slug |

Skeleton usa `PageContentSkeleton` (in-layout, não fullscreen) — alinhado ao shell-first.

---

## Validação

| Check | Status |
|-------|--------|
| `npm run build:crm` | ✅ Exit 0 |
| ESLint `Settings.tsx` | ✅ Sem erros |
| Meta `Settings` < 20 KB gzip | ✅ 6,36 KB |
| 19 chunks de secção gerados | ✅ |
| `CompanyDataSection` síncrono | ✅ |

### Testes manuais recomendados

- [ ] `/settings` — dados da empresa carregam
- [ ] Cada item da sidebar — secção abre após skeleton
- [ ] WhatsApp — instâncias, QR, socket
- [ ] Notificações — motor NE e histórico
- [ ] Agenda disponibilidade — tabs
- [ ] Suporte — categorias + portal
- [ ] Mobile `/settings/:slug` — sem regressão

---

## Regressões / riscos

| Risco | Severidade | Notas |
|-------|------------|-------|
| Skeleton ao trocar secção | Baixa | Esperado; UX preservada após primeiro load |
| `chatAutomation` com flag off | Nenhuma | Branch estático; chunk lazy pode ser tree-shaken no build |
| Prefetch inexistente | Baixa | S0.3.2-B pode adicionar prefetch on hover na sidebar |

---

## Próximo passo sugerido

**S0.3.2-B** — lazy interno (tabs WhatsApp, dialogs `RolePermissionsDialog`, adiar socket) conforme `AUDIT_SETTINGS_ROUTE_SPLIT.md`.

---

## Relacionados

- `docs/performance/AUDIT_SETTINGS_ROUTE_SPLIT.md`
- `docs/performance/S0_3_1A_PROJECTS_CRITICAL_PATH.md`
