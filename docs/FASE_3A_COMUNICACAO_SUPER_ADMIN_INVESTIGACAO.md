# Fase 3A — Investigação técnica: `SuperAdminPlatformNotifications.tsx`

Investigação apenas (sem alterações de código, backend, base de dados ou rotas).

**Ficheiro analisado:** `src/pages/superadmin/SuperAdminPlatformNotifications.tsx` (~831 linhas)  
**Dependência direta:** `src/pages/superadmin/SuperAdminPlatformWhatsAppPanel.tsx` (~321 linhas)

---

## 1. Componentes envolvidos

### UI (shadcn / React)

| Origem | Componentes |
|--------|-------------|
| `@/components/ui/*` | `Alert`, `Badge`, `Button`, `Card` (+ Header/Content/Description/Title), `Dialog` (+ Content, Footer, Header, Title, Description), `Label`, `Separator`, `Switch`, `Select` (+ Trigger, Content, Item, Value), `Table` (+ Header, Body, Row, Cell, Head), `Tabs` (+ List, Trigger, Content), `Textarea` |
| `@/components/ui/sonner` | `toast` |
| `lucide-react` | `Building2`, `History`, `MessageCircle`, `Pencil`, `RefreshCw`, `Save`, `Sparkles` |

### Página local

| Componente | Papel |
|------------|--------|
| **`<SuperAdminPlatformWhatsAppPanel />`** | Importado na tab `whatsapp`; gere instância WhatsApp UazAPI, designação `platform_notifications_whatsapp_chat_instance_id`, QR, etc. |

### Estrutura da página principal

- Cabeçalho (breadcrumb, título, descrição).
- `Alert` explicativo (“Domínio exclusivo da plataforma”).
- **`<Tabs>`** com quatro valores: `whatsapp` | `catalog` | `global` | `history`.
- **`<Dialog>`** modal de edição de override de template (fora das tabs, ao nível raiz do componente).

---

## 2. APIs consumidas

Constantes de pedido: `LOCALE = 'pt-BR'`, `CHANNEL = 'whatsapp'` (canal fixo para catálogo/preview/override neste MVP).

### Endpoints chamados em `SuperAdminPlatformNotifications.tsx`

| Método | Caminho | Uso |
|--------|---------|-----|
| `GET` | `/api/superadmin/platform-notifications/catalog/events` | Lista eventos do catálogo (`loadCatalog`). |
| `GET` | `/api/superadmin/platform-notifications/global-settings` | Carrega toggles globais (`loadGlobal`). |
| `PUT` | `/api/superadmin/platform-notifications/global-settings` | Guarda toggles: `platform_notifications_enabled`, `_business_events_enabled`, `_whatsapp_send_enabled`, `_verbose_log` (`saveGlobal`). **Não inclui** `platform_notifications_whatsapp_chat_instance_id` neste payload. |
| `PATCH` | `/api/superadmin/platform-notifications/catalog/events/:eventKey/active` | Ativar/desativar evento (`setEventActive`). |
| `GET` | `/api/superadmin/platform-notifications/catalog/events/:eventKey?locale=&channel=` | Detalhe para editor (`openEditor`). |
| `PUT` | `/api/superadmin/platform-notifications/template-overrides` | Guardar override de corpo/assunto (+ flag PIX para um evento específico) (`saveOverride`). |
| `DELETE` | `/api/superadmin/platform-notifications/template-overrides?event_key=&channel=&locale=` | Remover override (`restoreDefault`). |
| `POST` | `/api/superadmin/platform-notifications/preview` | Preview com `merge_context` de exemplo (`runPreview`). |
| `GET` | `/api/superadmin/platform-notifications/deliveries?limit=&hours=&status=&event_key=` | Histórico (`loadHistory`). |

### Endpoints adicionais via `SuperAdminPlatformWhatsAppPanel`

| Método | Caminho | Uso |
|--------|---------|-----|
| `GET` | `/api/superadmin/platform-notifications/global-settings` | Ler `platform_notifications_whatsapp_chat_instance_id` (`loadGlobal` no painel). |
| `PUT` | `/api/superadmin/platform-notifications/global-settings` | Body **parcial**: `{ platform_notifications_whatsapp_chat_instance_id }` (designar / limpar remetente). |

### Serviço `superadminPlatformWhatsAppService` (`src/services/superadminPlatformWhatsApp.ts`)

Base: `/api/superadmin/platform-whatsapp`

| Método | Caminho | Uso |
|--------|---------|-----|
| `GET` | `/instances` | Listar instâncias de chat. |
| `POST` | `/instances` | Criar instância com nome fixo `PLATFORM_WHATSAPP_INSTANCE_NAME`. |
| `POST` | `/instances/:id/connect` | Obter QR / pareamento. |
| `GET` | `/instances/:id/status` | Estado da ligação. |
| `DELETE` | `/instances/:id` | Remover instância. |

---

## 3. Estados e hooks usados

### Estado React (`useState`)

| Estado | Tipo / uso |
|--------|------------|
| `tab` | Tab ativa: `whatsapp` \| `catalog` \| `global` \| `history` (default `whatsapp`). |
| `catalogLoading`, `events`, `togglingKey` | Catálogo e toggle por linha. |
| `globalLoading`, `globalSaving`, `gMotor`, `gBusiness`, `gWhatsapp`, `gVerbose` | Configuração global. |
| `historyLoading`, `deliveries`, `histStatus`, `histEvent`, `histHours` | Histórico e filtros. |
| `editorOpen`, `editorKey`, `detailLoading`, `detail` | Modal de override. |
| `draftBody`, `draftSubject`, `draftSendPix` | Rascunho no editor (PIX só para `platform.billing.charge.created`). |
| `overrideSaving`, `previewLoading`, `previewBody`, `previewSubject`, `previewError`, `previewInvalid` | Gravar override e preview. |

### Hooks

- `useCallback`: `loadCatalog`, `loadGlobal`, `loadHistory` (dependências adequadas).
- `useMemo`: `eventOptions` — chaves de evento ordenadas para o filtro do histórico.
- `useEffect`: montagem → `loadCatalog`, `loadGlobal`; quando `tab === 'history'` → `loadHistory`.

### Hooks no filho `SuperAdminPlatformWhatsAppPanel`

Estado próprio (`loading`, `instances`, `designatedId`, QR, polling, etc.) + `useEffect` para refresh e polling de instâncias.

---

## 4. Funções principais da tela

| Função | Responsabilidade |
|--------|------------------|
| `moduleLabel` / `eventTitle` / `channelLabel` | Labels para UI (mapas `MODULE_LABELS`, `EVENT_TITLES`). |
| `buildSampleMergeContext` | Constrói objeto de merge para preview com valores fictícios. |
| `loadCatalog` | GET catálogo → `setEvents`. |
| `loadGlobal` | GET settings → preenche toggles `g*`. |
| `loadHistory` | GET deliveries com query params. |
| `setEventActive` | PATCH ativar/desativar evento; atualização optimista local em `events`. |
| `saveGlobal` | PUT toggles globais (quatro campos). |
| `openEditor` | GET detalhe do evento, preenche drafts e flag PIX condicional. |
| `closeEditor` | Fecha modal e limpa estado do editor. |
| `saveOverride` | PUT template-overrides. |
| `restoreDefault` | DELETE template-overrides. |
| `runPreview` | POST preview com merge de exemplo. |

---

## 5. Onde está o WhatsApp da plataforma

1. **Tab “WhatsApp”** (`TabsContent value="whatsapp"`): renderiza apenas `<SuperAdminPlatformWhatsAppPanel />` — ligação da instância UazAPI, QR, “remetente oficial”, persistência de `platform_notifications_whatsapp_chat_instance_id` via `global-settings`, e chamadas a `/api/superadmin/platform-whatsapp/*`.

2. **Tab “Configuração global”**: inclui o interruptor **“Envio WhatsApp da plataforma”** (`gWhatsapp` ↔ `platform_notifications_whatsapp_send_enabled`), ou seja, autorização de **envio** pelo motor vs instância física na tab anterior.

3. **Catálogo / editor**: canal fixo `CHANNEL = 'whatsapp'`; textos e preview assumem mensagens WhatsApp.

4. **Histórico**: coluna “Canal” pode mostrar `whatsapp` (via `channelLabel`).

---

## 6. SMTP / Amazon SES nesta área

- **Não existem** referências a SMTP, SES, nodemailer ou envio por e-mail neste ficheiro.
- O fluxo de templates/preview está parametrizado com **`CHANNEL = 'whatsapp'`** apenas.
- **Conclusão:** nesta tela não há configuração nem mistura com correio SMTP/SES; qualquer canal e-mail seria outro produto/canal no backend.

---

## 7. O que pode virar componente separado sem alterar lógica

Extrações puramente de apresentação / organização (props bem definidas), mantendo os mesmos handlers e chamadas API no pai ou injectados:

| Bloco sugerido | Conteúdo |
|----------------|----------|
| **Tipos e helpers** | `CatalogEvent`, `EventDetail`, `DeliveryRow`, `MODULE_LABELS`, `EVENT_TITLES`, `moduleLabel`, `eventTitle`, `channelLabel`, `buildSampleMergeContext` → módulo `platformNotificationsTypes.ts` ou `constants.ts`. |
| **Tab Catálogo** | Card + tabela + switches + botão Editar — recebe `events`, `catalogLoading`, `togglingKey`, `onToggle`, `onEdit`. |
| **Tab Configuração global** | Card com os quatro switches + botão Guardar — recebe estado e `onSave`. |
| **Tab Histórico** | Filtros + tabela — recebe `deliveries`, filtros, `onRefresh`, `eventOptions`. |
| **Dialog de override** | Todo o `Dialog` do editor — recebe estado do editor, `detail`, drafts, preview, e callbacks `save`, `restore`, `preview`, `close`. |
| **Cabeçalho + Alert** | Breadcrumb, título e alerta informativo (opcional unificar com resto do Super Admin). |

O painel WhatsApp já está isolado em `SuperAdminPlatformWhatsAppPanel.tsx`.

---

## 8. Proposta de divisão em tabs ou páginas

### Situação atual

Quatro tabs num único URL (`/superadmin/platform-notifications`): WhatsApp | Catálogo | Configuração global | Histórico + modal global de edição.

### Opções incrementais (sem mudar rotas nesta fase de documento)

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **Manter tabs, extrair subcomponentes** | Zero impacto em URLs e bookmarks; refactor seguro. | Ficheiro pai ainda orquestra muito estado. |
| **Tabs + estado na URL (`?tab=`)** | Deep link para suporte; não exige novas rotas se só query string. | É preciso sincronizar `tab` com `useSearchParams` e testar montagem. |
| **Futuras sub-rotas** (ex.: `/platform-notifications/catalog`) | Separação mental forte. | Exige alteração de `App.tsx` e layout — **fora do escopo atual** das regras desta investigação. |

Recomendação técnica para uma primeira implementação: **extrair componentes** mantendo as tabs; só depois avaliar `?tab=` ou rotas filhas.

---

## 9. Riscos de quebrar salvamento / configurações

| Risco | Detalhe | Mitigação na futura implementação |
|-------|---------|-----------------------------------|
| **PUT `global-settings` concorrente** | O painel WhatsApp envia só `platform_notifications_whatsapp_chat_instance_id`; `saveGlobal` envia só os quatro toggles. Depende do backend **fundir** PATCH/PUT parciais e não apagar campos omitidos. | Antes de extrair, confirmar comportamento da API (testes manuais ou leitura do controller). |
| **Duplicar chamadas no mount** | `SuperAdminPlatformNotifications` e `SuperAdminPlatformWhatsAppPanel` ambos fazem GET `global-settings` quando a página carrega (tab WhatsApp default). | Performance/redundância, não necessariamente corrupção de dados. |
| **Editor modal vs catálogo** | `saveOverride` / `restoreDefault` alteram overrides; estado local `events` só atualiza `has_override` via `loadCatalog()` após sucesso. | Manter ordem: fechar → `loadCatalog()` como já está. |
| **Preview não persiste** | `runPreview` só lê; não altera dados. | Baixo risco. |
| **Histórico** | Só leitura. | Baixo risco. |

---

## 10. Plano de implementação incremental (apenas para fases futuras)

1. **Extrair constantes e helpers** para um ficheiro partilhado (sem mudar comportamento).
2. **Extrair `PlatformNotificationsCatalogTab`** com props explícitas.
3. **Extrair `PlatformNotificationsGlobalTab`** e **`PlatformNotificationsHistoryTab`**.
4. **Extrair `PlatformNotificationTemplateOverrideDialog`** (modal grande).
5. **Manter** `SuperAdminPlatformWhatsAppPanel` como está ou mover para pasta `components/superadmin/platform-notifications/` por convenção.
6. **Opcional:** sincronizar tab com `?tab=` na mesma rota.
7. **Só com produto acordado:** novas rotas filhas — documentar impacto em `SuperAdminLayout` e testes.

Nenhum destes passos está implementado nesta Fase 3A; servem como guia após aprovação.

---

*Documento gerado por investigação estática ao código em `painelcrm`.*
