# Plano técnico — Integração Google Drive e módulo Arquivos (PainelCRM)

Documento de **investigação e plano de implantação**. Não descreve código implementado; define diagnóstico do repositório atual, decisões recomendadas, modelo de dados, APIs, UI, fases e riscos.

---

## 1. Diagnóstico do código atual

### 1.1 Integração Google existente (Google Agenda / Calendar)

| Aspeto | Situação no código |
|--------|---------------------|
| **Rotas** | `app.use('/api/integrations/google', googleCalendarIntegrationRoutes)` em `packages/backend/src/index.ts` |
| **Ficheiros** | `packages/backend/src/routes/googleCalendarIntegrationRoutes.ts`, `controllers/googleCalendarIntegrationController.ts`, `services/googleCalendarService.ts`, `services/googleCalendarConnectionService.ts`, `services/googleCalendarOAuthState.ts`, `config/googleCalendarEnv.ts` |
| **Callback OAuth** | `GET /api/integrations/google/callback` — registado **antes** do `router.use(authenticateToken, …)`, pelo que o callback é **público** e valida `state` + troca `code` por tokens |
| **Estado OAuth (`state`)** | JWT assinado com `JWT_SECRET`, payload `{ purpose: 'google_calendar_oauth', tenantId, userId }`, expiração ~10 min (`googleCalendarOAuthState.ts`) |
| **Pós-callback** | Redireciono HTTP para `FRONTEND_URL` + `/settings/integrations?google_calendar=connected` ou `=error&reason=…` |
| **Armazenamento** | Tabela `google_calendar_connections` (`database/init/159_google_calendar_connections.sql`): **um registo por par (tenant_id, user_id)** — integração **por utilizador**, não por tenant isolado |
| **Tokens** | `access_token_ciphertext`, `refresh_token_ciphertext` (texto cifrado), `token_expires_at`, `scope` |
| **Cifra** | `packages/backend/src/services/googleOAuthTokenCrypto.ts` — **AES-256-GCM** com `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY` (mín. 16 caracteres) |
| **Escopos Calendar** | `openid email profile` + `https://www.googleapis.com/auth/calendar.events` (`buildGoogleAuthorizeUrl` em `googleCalendarService.ts`) |
| **Parâmetros OAuth** | `access_type=offline`, `prompt=consent`, `include_granted_scopes=true` |
| **UI** | `src/components/settings/GoogleCalendarSection.tsx` — card em Configurações, lê query `google_calendar` após redirect, chama `getGoogleCalendarStatus`, `getGoogleCalendarConnectUrl`, `disconnectGoogleCalendar` (`src/services/googleCalendarIntegration.ts`) |

**Conclusão:** existe **infraestrutura OAuth Google reaproveitável** ao nível de: troca de código, refresh token, userinfo, cifra de tokens, padrão de callback + redirect frontend e secção de settings. **Não** reutilizar a mesma tabela nem o mesmo conjunto de escopos para Drive sem decisão explícita (ver §3 e §6).

### 1.2 Armazenamento de ficheiros / mídia no PainelCRM

| Aspeto | Situação |
|--------|-----------|
| **Módulo `media`** | `packages/backend/src/services/media/*` — upload para **disco local** (`MEDIA_STORAGE_ROOT`), chaves `tenants/{tenantId}/{scope}/...` (`mediaStorageKey.ts`) |
| **Scopes** | Inclui `chat_attachment`, `contract_document`, `invoice_document`, `product_image`, etc. |
| **API** | `app.use('/api/media', mediaRoutes)` — leitura assinada, registo opcional em `media_assets` (Fase 1 media) |
| **Outros** | Anexos de tickets (JSON), catálogo em `/media/catalog`, templates WhatsApp em pastas dedicadas — **não** é Google Drive |

**Conclusão:** o “sistema de ficheiros” atual é **primariamente local / URLs internas**. Google Drive será uma **segunda camada** opcional por tenant, com metadados próprios e IDs do Drive.

### 1.3 “Arquivos” / cliente — estado atual

- Não foi encontrada uma página dedicada `/arquivos` nem módulo homónimo.
- Documentos de contratos/faturas/propostas ligam-se a fluxos existentes (ex.: `contract_document`, propostas) muitas vezes via **media local** ou PDFs gerados.
- **Não existe** tabela `client_drive_folders` nem integração Drive no repositório.

---

## 2. Respostas às perguntas da investigação

| Pergunta | Resposta proposta |
|----------|-------------------|
| **Já existe infra OAuth Google reaproveitável?** | **Sim:** cliente OAuth (`exchangeAuthorizationCode`, `refreshAccessToken`), userinfo, `encryptGoogleOAuthToken` / `decryptGoogleOAuthToken`, padrão callback + state JWT, env `GOOGLE_CLIENT_*` e redirect. **Drive deve usar fluxo OAuth próprio** (escopos e redirect/callback distintos do Calendar — ver §6). |
| **Integração por tenant ou por utilizador?** | **Requisito do produto: por tenant (empresa).** O Calendar atual é **por utilizador**. Drive exige **nova tabela** tenant-scoped + registo de quem conectou (`connected_by_user_id`). |
| **Onde guardar tokens?** | Base de dados, colunas **cifradas** (mesmo padrão AES-GCM), **nunca** em claro; opcionalmente KMS futuro. |
| **Já existe cifra para refresh_token?** | **Sim:** `googleOAuthTokenCrypto.ts` (reutilizar para strings de access/refresh do Drive). |
| **Qual tabela para conexão Drive?** | **Nova:** ex. `tenant_google_drive_integrations` (ver §4). Não misturar com `google_calendar_connections`. |
| **Rota para iniciar OAuth?** | Ex.: `GET /api/integrations/google-drive/connect` (autenticado + tenant), resposta `{ url }` como Calendar. |
| **Rota callback?** | Ex.: `GET /api/integrations/google-drive/callback` — **path distinto** do Calendar para evitar ambiguidade e facilitar consola Google OAuth. |
| **Pasta raiz criada uma vez?** | Guardar `root_folder_id` na linha de integração; antes de criar, **SELECT** por `tenant_id` + `is_connected`; criar só se null; operações idempotentes com **fileId** persistido. |
| **drive_folder_id da empresa?** | Colunas `root_folder_id`, `clients_folder_id` na tabela de integração tenant. |
| **drive_folder_id por cliente?** | Tabela de mapeamento `client_drive_folders` indexada por **`client_id`** (UUID), não por nome. |
| **Cliente renomeado?** | **Não** criar pasta nova; opcional job “renomear pasta no Drive” controlado. Snapshot `client_display_name_snapshot` só para auditoria/UI. |
| **Cliente sem nome / duplicado?** | Pasta física pode usar nome sanitizado + sufixo curto (ex. últimos 8 chars do `client_id`) para desambiguar **na criação**; persistência continua por `client_id`. |
| **Listar ficheiros no sistema?** | API que lista metadados em BD (`client_drive_files`) e/ou children via Drive API na pasta conhecida. |
| **Upload na pasta correta?** | Backend resolve `client_id` → `files_folder_id` (ou categoria) → `files.create` multipart/resumable. |
| **Subpastas?** | `files` API Drive `parents: [folderId]`; opcional tabela `client_drive_subfolders` na Fase 6. |
| **Desligar Drive?** | `is_connected=false`, `disconnected_at`, opcional `revoke` Google; **não apagar** ficheiros no Drive. |
| **Token expirado/revogado?** | Refresh automático; se refresh falhar → estado `error` + mensagem na UI; pedir “Reconectar”. |
| **Permissões tenant** | Todas as queries com `tenant_id`; RBAC interno (apenas perfis que possam “Integrações” / “Arquivos”). |

---

## 3. Escopo OAuth recomendado

**Fase 2 (implementação atual):** foi adoptado o escopo completo `https://www.googleapis.com/auth/drive` (em vez de `drive.file`) para criar pastas na raiz do «Meu Drive» e a hierarquia empresa → Clientes; ver justificativa em [GOOGLE_DRIVE_OAUTH_SCOPE.md](./GOOGLE_DRIVE_OAUTH_SCOPE.md).

### 3.1 Preferência original do plano: `https://www.googleapis.com/auth/drive.file`

- **Permite** criar ficheiros e pastas com a app e aceder a esses recursos criados pela app.
- **Reduz** superfície de dados vs `https://www.googleapis.com/auth/drive` (acesso amplo).
- **Alinha** com verificação Google (menos sensível).

### 3.2 Implicações técnicas

- Toda a hierarquia **Nome da empresa → Clientes → …** deve ser criada **pela aplicação** após OAuth (API Drive), para ficar no “universo” permitido por `drive.file`.
- Não é garantido listar “todo o Drive do utilizador”; apenas ficheiros/pastas com os quais a app interage — adequado ao modelo “workspace da empresa no Drive”.

### 3.3 Se no futuro for necessário `drive` completo

- Documentar **justificativa**, revisão de segurança e **verificação avançada** Google.

### 3.4 Separação face ao Google Agenda

- **Outro conjunto de escopos** → consentimento separado na Google Cloud Console.
- Recomenda-se **OAuth client** partilhado (mesmo `GOOGLE_CLIENT_ID`) com **redirect URI adicional** para `/api/integrations/google-drive/callback`, ou client dedicado “Drive only” — decisão de deploy.

---

## 4. Modelo de dados proposto

### 4.1 `tenant_google_drive_integrations` (1 linha ativa por tenant)

Campos sugeridos (alinhados ao pedido):

- `id`, `tenant_id` (FK, unique onde `is_connected`)
- `connected_by_user_id`
- `google_account_email`
- `access_token_ciphertext`, `refresh_token_ciphertext`
- `scope`, `token_expires_at`
- `root_folder_id`, `clients_folder_id`
- `is_connected`, `last_sync_at`, `connection_error` (texto opcional)
- `created_at`, `updated_at`, `disconnected_at`

### 4.2 `client_drive_folders`

- `id`, `tenant_id`, `client_id` (FK `clients`)
- `drive_folder_id` (pasta “raiz do cliente”)
- `files_folder_id`, `contracts_folder_id`, `proposals_folder_id`, `invoices_folder_id`
- `client_display_name_snapshot` (opcional)
- `created_at`, `updated_at`

**Regra:** upsert por `(tenant_id, client_id)` — **nunca** segundo nome sozinho.

### 4.3 `client_drive_files` (metadatos)

- `id`, `tenant_id`, `client_id`
- `drive_file_id`, `drive_parent_folder_id`
- `name`, `mime_type`, `size_bytes`
- `web_view_link` (e opcional `web_content_link` se política permitir)
- `category`: enum `files | contracts | proposals | invoices`
- `created_by_user_id`, timestamps, `trashed_at` (soft delete metadados; opcional sync lixo Drive)

### 4.4 (Fase 6) Subpastas em “Arquivos”

- Opção A: tabela `client_drive_nested_folders` (`parent_id`, `drive_folder_id`, `name`).
- Opção B: apenas Drive API + listagem recursiva sem BD até necessidade de permissões finas.

---

## 5. Rotas API sugeridas

### 5.1 Integração

| Método | Rota | Notas |
|--------|------|--------|
| GET | `/api/integrations/google-drive/status` | Auth + tenant; sem tokens |
| POST | `/api/integrations/google-drive/connect` ou GET como Calendar | Devolve `{ url }` |
| GET | `/api/integrations/google-drive/callback` | Público; valida `state` com **tenant** (e opcionalmente `userId` do admin) |
| POST ou DELETE | `/api/integrations/google-drive/disconnect` | Revogação opcional |

**Estado OAuth:** novo JWT `purpose: 'google_drive_oauth'`, payload `{ tenantId, initiatedByUserId }` — no callback, garantir que o utilizador pertence ao tenant e tem permissão para conectar.

### 5.2 Ficheiros (geral / módulo Arquivos)

| Método | Rota | Notas |
|--------|------|--------|
| GET | `/api/files/drive` | Lista agregada ou “recentes” (parcial Fase 5) |
| POST | `/api/files/drive/folders` | Se aplicável a nível tenant |
| POST | `/api/files/drive/upload` | Upload geral (se existir pasta tenant sem cliente) |

*(Ajustar nomes a convenções REST do projeto.)*

### 5.3 Cliente

| Método | Rota | Notas |
|--------|------|--------|
| GET | `/api/clients/:clientId/files` | Metadados + opcionalmente lista Drive |
| POST | `/api/clients/:clientId/files/folders` | Garantir estrutura; idempotente |
| POST | `/api/clients/:clientId/files/upload` | Multipart → Drive |
| DELETE | `/api/clients/:clientId/files/:fileId` | Metadados + opcional `files.update` trash |

Todas com **tenant** implícito do contexto de sessão.

---

## 6. Relação com Google Agenda — o que reaproveitar vs não misturar

| Reaproveitar | Não misturar sem documentação |
|--------------|-------------------------------|
| `encryptGoogleOAuthToken` / `decryptGoogleOAuthToken` | Escopos Calendar vs Drive no **mesmo** URL de authorize |
| `GOOGLE_CLIENT_ID` / `SECRET` / infra env | Callback único **sem** distinguir purpose |
| Padrão: connect → JSON `{ url }`, redirect frontend | Guardar tokens Drive na tabela Calendar |
| Novo `googleDriveOAuthState.ts` (purpose distinto) | Assumir que refresh Calendar serve para Drive |
| Feature flag `ENABLE_GOOGLE_DRIVE` | — |

**Redirect URIs na consola Google:** adicionar explicitamente o callback Drive.

---

## 7. Fluxos principais (resumo)

1. **Conectar:** utilizador autorizado → `connect` → OAuth `drive.file` + offline → callback → cifrar tokens → criar pastas raiz “Nome empresa” e “Clientes” → guardar IDs → redirect settings com query dedicada (`google_drive=connected`).
2. **Primeiro acesso Cliente > Arquivos:** lazy create pasta cliente + Arquivos / Contratos / Propostas / Faturas se não existirem IDs.
3. **Upload:** upload para pasta da categoria → gravar linha em `client_drive_files`.
4. **Subpasta (Fase 6):** criar child folder sob `files_folder_id`.
5. **Desligar:** flags + revoke opcional; **não** apagar Drive.

---

## 8. UI proposta

| Área | Conteúdo |
|------|------------|
| **Configurações → Integrações → Google Drive** | Card estilo `GoogleCalendarSection`: estado, email, IDs pastas raiz (opcional “copiar”), conectar/desligar, texto sobre escopo `drive.file` e estrutura automática |
| **`/arquivos` (novo)** | Entrada no menu com permissão de módulo; dashboard leve: status Drive, atalhos para clientes, lista recente (Fase 5) |
| **Cliente → separador Arquivos** | Árvore ou tabs: Arquivos / Contratos / Propostas / Faturas; lista + upload + link “Abrir no Drive”; indicador se Drive desligado |

Query params sugeridos após OAuth: `google_drive=connected|error` + `reason`, espelhando `google_calendar`.

---

## 9. Riscos de verificação OAuth (Google Cloud)

| Risco | Mitigação |
|-------|-----------|
| Escopo sensível | Usar `drive.file` na v1 |
| Dados sensíveis na política de privacidade | Texto claro no ecrã de conexão |
| Vídeo / demonstração para revisão | Preparar quando Google solicitar |
| Uso de mesma marca OAuth para vários produtos | Nome da app e URIs corretos na consola |

---

## 10. Riscos técnicos e mitigação

| Risco | Mitigação |
|-------|-----------|
| `drive.file` não cobre algum cenário futuro | Documentar limitações; evolução documentada para escopo maior |
| Utilizador revoga fora do CRM | Deteção em chamadas API + UI “Reconectar” |
| Corrida ao criar pastas | Transação BD + unique `(tenant_id, client_id)`; idempotência “get or create” |
| Nomes de pasta ilegais no Drive | Sanitizar caracteres; fallback `Cliente-{shortId}` |

---

## 11. Plano incremental (fases)

| Fase | Conteúdo |
|------|-----------|
| **1** | Este documento + alinhamento produto (✓ entregável investigação) |
| **2** | OAuth Drive tenant: tabela integração, connect/callback/disconnect, flags env |
| **3** | Criar `root_folder_id` + `clients_folder_id` (nome empresa a partir de `tenants` ou perfil negócio) |
| **4** | Cliente > Arquivos: lazy folders + listagem metadados + upload mínimo |
| **5** | Página `/arquivos` geral |
| **6** | Subpastas dentro de “Arquivos” |
| **7** | Ligação automática contratos/propostas/faturas (fora do MVP) |

---

## Fase 4 — Upload em Cliente > Arquivos

Implementação oficial da Fase 4 concluída com foco em upload simples no perfil do cliente.

### Escopo implementado

- Upload **sem categoria** no frontend.
- Upload sempre para `folder_arquivos_id` da tabela `client_google_drive_folders`.
- Fluxo obrigatório: frontend -> backend PainelCRM -> Google Drive.
- Estrutura do cliente continua com `Arquivos`, `Contratos`, `Propostas` e `Faturas`, mas nesta fase só `Arquivos` recebe uploads.

### Endpoints (Fase 4)

- `GET /api/clients/:id/google-drive/files`
- `POST /api/clients/:id/google-drive/files` (multipart, campo `file`)

### Banco de dados (Fase 4)

- Tabela: `client_google_drive_files`
- Campo de origem: `source_module`
- Valor usado nesta fase: `source_module = client_files`

### Upload e segurança

- Limite por arquivo: **20MB**
- Tipos permitidos:
  - PDF
  - imagens (JPEG, PNG, WebP, GIF)
  - DOC, DOCX
  - XLS, XLSX
  - TXT
  - CSV
  - ZIP
- Extensões bloqueadas:
  - `.exe`
  - `.bat`
  - `.sh`
  - `.js`
  - `.php`
  - `.html`

### Permissões

- Visualizar arquivos: `clients.view`
- Enviar arquivo: `clients.edit`

### Confirmações de escopo

- Não há seletor de categoria.
- Não envia para `Contratos`, `Propostas` ou `Faturas`.
- Não cria módulo geral `/arquivos`.
- Não altera OAuth do Google Drive.
- Não altera integração Google Agenda.
- Não expõe tokens no frontend.
- Upload passa pelo backend (sem upload direto frontend -> Google).

### Checklist de validação (Fase 4)

- [ ] Drive conectado.
- [ ] Pasta do cliente criada.
- [ ] Upload enviado para Arquivos.
- [ ] Arquivo aparece no Google Drive.
- [ ] Arquivo aparece na lista do cliente.
- [ ] Botão abrir no Drive funciona.
- [ ] Tenant sem Drive conectado mostra aviso.
- [ ] Build backend OK.
- [ ] Build frontend OK.

---

## 12. O que **não** implementar na primeira versão

- Escopo `drive` completo sem parecer escrito.
- Sincronização bidirecional massiva ou mirror completo do Drive.
- Eliminação de ficheiros no Drive ao desconectar.
- Automatismo contratos/propostas/faturas para pastas (apenas criar pastas vazias).
- Substituição do armazenamento local `media` — coexistência.

---

## 13. Checklist de validação (MVP Drive)

- [ ] Tenant consegue conectar uma conta Google.
- [ ] Tokens **não** aparecem no frontend (apenas estado/email/success).
- [ ] Pastas raiz empresa + “Clientes” criadas e IDs persistidos.
- [ ] Ao abrir Cliente > Arquivos, estrutura cliente criada uma vez.
- [ ] Upload grava ficheiro na pasta certa e metadados na BD.
- [ ] Link “abrir no Drive” funciona (`webViewLink`).
- [ ] Desligar **não** apaga ficheiros no Drive.
- [ ] Build backend + frontend sem erros.

---

## 14. Referências de código (mapa rápido)

- OAuth Calendar: `packages/backend/src/services/googleCalendarService.ts`, `googleCalendarIntegrationController.ts`
- Cifra: `packages/backend/src/services/googleOAuthTokenCrypto.ts`
- Tabela Calendar: `database/init/159_google_calendar_connections.sql`
- UI Calendar: `src/components/settings/GoogleCalendarSection.tsx`
- Media local: `packages/backend/src/services/media/*`
- Montagem rotas: `packages/backend/src/index.ts` (`/api/integrations/google`, `/api/media`)

---

## 15. Relação com Media Library / chatbot (ponteiro)

Google Drive permanece **espelho/opcional**. Picker de mídia no chat/produtos/`send_message` e inbound de PDF em chatbot flows usam storage interno (`media_assets` / URLs assinadas) como caminho principal — ver [`chatbot-flows/PLAN_SPRINTS_CHATBOT_FLOWS_S32.md`](./chatbot-flows/PLAN_SPRINTS_CHATBOT_FLOWS_S32.md) (**S32–S33.2** feitos; sync Drive Media Library **não** implementado nesta fase — permanece opt-in/espelho se/quando for feito).

---

*Última atualização: documento de planificação (Fase 1). Implementação nas fases seguintes; ponteiro S32+.*
