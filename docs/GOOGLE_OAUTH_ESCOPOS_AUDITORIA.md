# Auditoria — Escopos Google OAuth (PainelCRM)

Documento de trabalho: mapeamento **no código** dos escopos pedidos ao Google, comparação com a Consola Google Cloud e plano de alinhamento. **Não substitui** a revisão manual na Google Cloud Console nem as políticas da organização.

---

## 1. Onde os escopos são definidos (única fonte em runtime)

| Integração | Ficheiro | Constante | Valor exacto do parâmetro `scope` na URL de autorização |
|------------|----------|-----------|---------------------------------------------------------|
| **Google Agenda** | `packages/backend/src/services/googleCalendarService.ts` | `GOOGLE_CALENDAR_SCOPE_PARTS` → `GOOGLE_CALENDAR_SCOPES` | `openid email profile https://www.googleapis.com/auth/calendar.events` (separados por espaço) |
| **Google Drive (tenant)** | `packages/backend/src/services/googleDriveService.ts` | `GOOGLE_DRIVE_SCOPE_PARTS` → `GOOGLE_DRIVE_SCOPES` | `openid email profile https://www.googleapis.com/auth/drive` |

**Frontend:** não monta query OAuth nem lista escopos para o Google. Apenas chama:

- `GET /api/integrations/google/connect` → recebe `{ url }` e redirecciona (`src/services/googleCalendarIntegration.ts`).
- `POST /api/integrations/google-drive/connect` → idem (`src/services/googleDriveIntegration.ts`).

Ou seja: os escopos **não vêm de variáveis de ambiente** nem são dinâmicos por UI; são **fixos no código** nos dois serviços acima.

---

## 2. Fluxo OAuth — onde começa e qual URL de autorização

### Google Agenda (Calendar)

| Item | Detalhe |
|------|---------|
| **Entrada API** | `GET /api/integrations/google/connect` (requer JWT + tenant) |
| **Controlador** | `packages/backend/src/controllers/googleCalendarIntegrationController.ts` → `googleCalendarConnect` |
| **Construção da URL** | `buildGoogleAuthorizeUrl(state)` em `googleCalendarService.ts` |
| **Endpoint Google** | `https://accounts.google.com/o/oauth2/v2/auth` com query params `client_id`, `redirect_uri`, `response_type=code`, **`scope`**, `access_type=offline`, `prompt=consent`, `state`, `include_granted_scopes=true` |
| **Callback** | `GET /api/integrations/google/callback` → `googleCalendarOAuthCallback` |

**Redirect URI (Calendar):** variável `GOOGLE_REDIRECT_URI` — deve coincidir byte-a-byte com um URI autorizado na OAuth client da Google Cloud.

### Google Drive (tenant)

| Item | Detalhe |
|------|---------|
| **Entrada API** | `POST /api/integrations/google-drive/connect` |
| **Controlador** | `packages/backend/src/controllers/googleDriveIntegrationController.ts` → `googleDriveConnect` |
| **Construção da URL** | `buildGoogleDriveAuthorizeUrl(state)` em `googleDriveService.ts` |
| **Endpoint Google** | Idem `accounts.google.com/o/oauth2/v2/auth` |
| **Callback** | `GET /api/integrations/google-drive/callback` → `googleDriveOAuthCallback` |

**Redirect URI (Drive):** `GOOGLE_DRIVE_REDIRECT_URI` ou, se vazio, derivado de `GOOGLE_REDIRECT_URI` substituindo `/api/integrations/google/callback` por `/api/integrations/google-drive/callback` (`googleDriveEnv.ts`).

### OAuth token / userinfo (partilhado)

- Troca de código: `https://oauth2.googleapis.com/token`
- Perfil: `https://www.googleapis.com/oauth2/v3/userinfo` (Calendar e Drive usam `fetchGoogleUserProfile` do Calendar service)

---

## 3. Consola Google Cloud vs pedido real (`scope`)

**Regra:** cada identificador na Ecran de consentimento OAuth deve incluir **exactamente** os escopos que a app pede (ou um conjunto que os cubra, segundo a documentação Google).

**Pedido real no código (Calendar):**

1. `openid`
2. `email` (equivale ao scope OAuth **Userinfo email** na linha de consentimento)
3. `profile` (**Userinfo profile**)
4. `https://www.googleapis.com/auth/calendar.events`

**Pedido real no código (Drive):**

1. `openid`
2. `email`
3. `profile`
4. `https://www.googleapis.com/auth/drive` — escopo **amplo** (Drive completo), não `drive.file`.

Se na Central de Verificação aparecer “verificação não necessária” mas o utilizador vê **“O Google não verificou esta app”**, causas frequentes:

- Escopos **sensíveis/restritos** declarados na app mas pedidos em excesso ou inconsistentes com o ecran de consentimento.
- `drive` é tipicamente **restrito/sensível** e pode exigir verificação para utilizadores externos ao domínio de teste.

**Acção manual:** na Google Cloud → APIs & Services → OAuth consent screen → verificar lista de escopos **alinha** com as linhas acima (incluindo nome canónico vs alias `email`/`profile` conforme a consola mostra).

---

## 4. Logs de auditoria no backend

Além do já existente `GOOGLE_OAUTH_LOG_PARAMS=true` (regista parâmetros parseados da URL em `googleCalendarService` / `googleDriveService`, sem segredos):

- **`GOOGLE_OAUTH_AUDIT_LOG=true`** — força logs de auditoria mesmo com `NODE_ENV=production` (ex.: staging).
- **Fora de produção** (`NODE_ENV !== 'production'`) — auditoria ao ligar Calendar/Drive sem flag extra.

Implementação: `packages/backend/src/services/googleOAuthAuditLog.ts`, chamada ao iniciar connect em ambos os controladores.

Cada linha `[google-oauth:audit:connect]` inclui: `provider`, `tenant_id`, `user_id`, `scopes_requested`, `redirect_uri`, `client_id_masked`.

**Não são registados:** `client_secret`, `refresh_token`, `access_token`, código de autorização completo.

---

## 5. Escopos que **não** são pedidos pelo PainelCRM

As seguintes APIs/escopos **não** aparecem em `GOOGLE_CALENDAR_SCOPES` nem `GOOGLE_DRIVE_SCOPES`:

- `calendar.acl`, `calendar.calendarlist.readonly`, `calendar.events.freebusy`, `calendar.events.public.readonly`, `calendar.settings.readonly`, `calendar.freebusy`
- `drive.appdata`, `drive.install`

Ou seja: não há pedido directo a esses identificadores no fluxo OAuth actual.

---

## 6. Uso real das APIs (impacto de reduzir escopos)

### Agenda (`calendar.events` apenas)

| Funcionalidade | API usada | Escopo necessário |
|----------------|-----------|-------------------|
| Listar eventos no intervalo | `GET .../calendar/v3/calendars/primary/events` | `calendar.events` |
| Criar / actualizar / apagar eventos | `POST/PATCH/DELETE .../calendars/primary/events` | `calendar.events` |
| Google Meet no evento | `conferenceData` + `conferenceDataVersion=1` no mesmo recurso de evento | `calendar.events` (não exige escopos ACL ou Calendar List à parte) |

**Conclusão:** o conjunto Calendar actual está **alinhado** com o uso: só `primary` + eventos; não há chamadas a Calendar List, ACL, FreeBusy ou Settings.

### Drive (`auth/drive` vs `drive.file`)

| Funcionalidade | Necessidade típica |
|----------------|-------------------|
| Pastas na raiz «Meu Drive», árvore empresa/clientes | `drive.file` **não** cobre criar livremente hierarquia na raiz; o produto documentou uso de **`drive`** por limitação de `drive.file` — ver `docs/GOOGLE_DRIVE_OAUTH_SCOPE.md`. |
| Upload/listagem de ficheiros de cliente criados pela app | Em muitos produtos bastaria `drive.file`; **este código** assume escopo completo para a estrutura de pastas. |

**Conclusão:** reduzir para `drive.file` **sem refactor** da criação de pastas na raiz está **arriscado** (provável quebra). É uma decisão de produto + alteração de código, não só de Consola.

---

## 7. Configuração mínima sugerida (referência)

Alinhamento com o pedido de “mínimo seguro” **para produto genérico**:

| Área | Escopos típicos mínimos |
|------|-------------------------|
| Identidade OpenID | `openid`, `email`, `profile` (ou equivalentes `userinfo.*` na consola) |
| Agenda (eventos no calendário principal) | `https://www.googleapis.com/auth/calendar.events` |
| Drive (só ficheiros criados/abertos pela app) | `https://www.googleapis.com/auth/drive.file` |

**Calendar:** o PainelCRM já está próximo deste mínimo (usa `calendar.events`, não pede ACL/list/freebusy).

**Drive:** o PainelCRM pede **`auth/drive`**, não `drive.file`. Para equivaler ao “mínimo seguro” da tabela acima seria preciso **mudar escopo + arquitectura de pastas** (ou aceitar limitações).

---

## 8. Impacto de remover escopos ou mudar App verificada

| Mudança | Agenda | Drive |
|---------|--------|-------|
| Remover `openid`/`email`/`profile` | Quebra obtenção de e-mail para gravar ligação | Idem |
| Trocar `calendar.events` por escopo mais estreito sem eventos | Quebra CRUD de eventos / Meet | — |
| Trocar `drive` por `drive.file` | — | Pode quebrar pastas raiz / hierarquia actual até o código ser adaptado |
| Contas já ligadas | Novo consentimento só ao reconectar; tokens antigos reflectem escopos da autorização anterior até revogação | Idem |

---

## 9. Plano de ajuste seguro (sem mudar produção “às cegas”)

1. **Google Cloud:** Exportar lista de escopos na OAuth consent screen e comparar com §1 e §3 deste documento.
2. **Staging:** Subir backend com `GOOGLE_OAUTH_AUDIT_LOG=true`, clicar “Ligar” Agenda e Drive, confirmar nos logs `scopes_requested` e `redirect_uri`.
3. **Calendar:** Se a consola já lista apenas os quatro escopos equivalentes, o aviso de verificação tende a vir do **Drive `auth/drive`** ou de branding/publishing status — não de escopos fantasma no código.
4. **Drive:** Decidir se se mantém `auth/drive` (com verificação Google) ou se se investe em refactor para `drive.file` + novo modelo de pastas.
5. **Produção:** Alterar escopos só após testes e actualização da consent screen; pedir aos utilizadores **reconectar** se reduzir escopos.

---

## Referências no repositório

- `packages/backend/src/services/googleCalendarService.ts` — escopos Agenda + URL auth
- `packages/backend/src/services/googleDriveService.ts` — escopos Drive + URL auth
- `packages/backend/src/config/googleCalendarEnv.ts` — `GOOGLE_REDIRECT_URI`
- `packages/backend/src/config/googleDriveEnv.ts` — redirect Drive
- `docs/GOOGLE_DRIVE_OAUTH_SCOPE.md` — justificativa `drive` vs `drive.file`
- `packages/backend/src/services/googleOAuthAuditLog.ts` — auditoria connect
