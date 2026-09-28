# Perfil pessoal e do negócio

## Pré-requisito (base de dados)

Antes de usar cargo, locale/timezone e alteração de senha por código, **aplique a migração completa** no PostgreSQL:

- Ficheiro: `database/init/157_profile_personal_and_password_change.sql`
- Ou: `supabase/migrations/20260426220000_profile_personal_and_password_change.sql`

**Avatar:** se ainda não puder aplicar o 157, aplique no mínimo `database/init/158_users_avatar_url.sql` (coluna `users.avatar_url`). O backend grava o avatar em `profiles.avatar_url` quando existir; caso contrário usa `users.avatar_url`. `GET /api/me/profile` e `GET /api/auth/me` fazem fallback de leitura coerente.

**Runner `npx tsx src/migrate.ts`:** só executa ficheiros listados em `packages/backend/src/migrate.ts` (array `order`). Os scripts **157** e **158** estão incluídos após **156**; ao adicionar novos `.sql` em `database/init/`, registe-os nessa lista.

Sem 157/158, **upload de avatar** continua indisponível (503). **Guardar** outros campos de perfil e **códigos de senha** exigem o script 157.

## Objetivo

Centralizar na rota `/profile` a gestão de:

1. **Perfil pessoal** — identidade do utilizador (hero, avatar, dados em modo leitura/edição), preferências e segurança (alteração de senha com código por WhatsApp).
2. **Perfil do negócio** — dados da empresa (tenant) e logos claro/escuro, apenas para quem tem permissão, com o mesmo padrão visual/edição quando aplicável.

## Estrutura da página (frontend)

- **Rota:** `/profile` (`src/pages/Profile.tsx`) — layout **mobile-first**, container `max-w-7xl`, abas em **chips** horizontais com scroll. Em **`lg:`** (desktop), grelha `lg:grid-cols-[420px_minmax(0,1fr)]` com `gap-6` (24px): coluna esquerda identidade + segurança (pessoal) ou identidade + logos (negócio); coluna direita formulários/dados.
- **Dados:** `useProfile` (`src/hooks/useProfile.ts`) → `GET /api/me/profile`; helpers em `src/lib/profileForm.ts` (`getPersonalProfileCompletion`, payloads de negócio, etc.).
- **API cliente:** `src/services/profile.ts` (reexport de `meProfile.ts`).

### Comportamento premium (layout)

- **Aba pessoal**
  - **Hero:** gradiente suave, avatar grande com atalho de câmera, nome, e-mail, cargo, badges de papel (**Super Admin** / **Administrador** / **Usuário** via `AuthContext`), estado do perfil (**Perfil completo** / **Complete seu perfil**), **Conta segura** quando o WhatsApp é válido para o fluxo de senha, barra de **progresso** (0–100%) quando o perfil ainda não está completo, ações **Trocar foto** e **Alterar senha**.
  - **Modo visual vs edição:** por defeito os dados mostram-se em cartões só de leitura (labels discretos, valores fortes, ícones). **Editar perfil** ativa inputs; **Salvar alterações** / **Cancelar** no desktop aparecem no cabeçalho do cartão «Informações pessoais»; no **mobile** a mesma ação fica numa **barra fixa inferior** (safe area).
  - **Preferências:** cartão dedicado (idioma / fuso), leitura com «Padrão do sistema» quando vazio; em edição, inputs como antes (sem accordion genérico).
  - **Segurança da conta:** copy explicando o código por WhatsApp, indicadores (WhatsApp cadastrado, código disponível), nota honesta de que histórico de senha/último acesso **não** são expostos nesta API; alerta se faltar WhatsApp; botão **Alterar senha** desativado sem número válido.
- **Aba negócio** (quem tem permissão)
  - **Hero:** logo (upload rápido «claro» como atalho), nome fantasia, razão social, CNPJ, badge de estado do tenant (**Empresa ativa** / trial / outro), **Trocar logo**, **Editar dados** / **Cancelar edição**.
  - **Cartões:** dados da empresa e endereço em **visualização** ou **edição**; logos mantêm upload próprio; **salvamento unificado** de dados + endereço num único `PUT` ao confirmar (desktop: ações no fim da aba; mobile: barra fixa inferior durante edição).

### Componentes (`src/components/profile/`)

- `PersonalProfileHeroCard`, `PersonalProfileInfoCard`, `PersonalProfilePreferencesCard` — blocos do perfil pessoal (hero, dados, preferências), compostos na página com ordem responsiva (`order-*` + posição na grelha em `lg:`).
- `ProfileSecurityCard` — bloco de segurança reforçado; recebe dígitos de WhatsApp para alertas/indicadores.
- `PasswordChangeDialog` — mobile: **Sheet** inferior; desktop: **Dialog**; ícone de escudo no título, mensagens claras nas etapas.
- `BusinessProfileHero` — cabeçalho do tenant.
- `BusinessDataCard` — `mode: 'view' | 'edit'` (sem rodapé próprio de salvar; persistência na página).
- `BusinessLogoCard` — logos claro/escuro (inalterado em fluxo, só refinamento visual).
- `BusinessAddressCard` — `mode: 'view' | 'edit'`.
- **Utilitário:** `src/hooks/useMediaQuery.ts` — deteção mobile no fluxo de senha.

### Completude do perfil (`getPersonalProfileCompletion`)

- **Completo** quando: nome (≥2 caracteres), e-mail não vazio, WhatsApp com 10–13 dígitos.
- **Percentual** (opcional na UI): 25% nome + 25% e-mail + 25% WhatsApp + 12,5% avatar + 12,5% cargo (arredondado).

## Campos

### Perfil pessoal

| Campo | Origem | Notas |
|--------|--------|--------|
| Foto (avatar) | `profiles.avatar_url` | Upload via `POST /api/me/profile/avatar` (ficheiro em `catalog-media`, scope `user_avatar`). |
| Nome | `profiles.first_name`, `profiles.last_name` | Na UI, um único campo «Nome completo»; ao guardar, o primeiro token vira `first_name` e o resto `last_name`. |
| E-mail | `users.email` | Só leitura na UI atual. |
| WhatsApp | `users.whatsapp_number` + `profiles.whatsapp_number` | Sincronizados no guardar. |
| Cargo | `profiles.job_title` | |
| Locale / timezone | `profiles.locale`, `profiles.timezone` | Opcionais. |

### Perfil do negócio (tenant)

| Campo | Coluna (tabela `tenants`) |
|--------|---------------------------|
| Nome fantasia | `name` |
| Razão social | `company_legal_name` |
| CNPJ | `cpf_cnpj` |
| E-mail da empresa | `company_email` |
| WhatsApp / telefone | `company_whatsapp` |
| Site | `company_website` |
| Morada | `company_postal_code`, `company_street`, `company_number`, `company_district`, `company_city`, `company_state`, `company_address_line` |
| Logo claro / escuro | `logo_light_url`, `logo_dark_url` | Upload via `POST /api/catalog-media/upload` com scope `tenant_logo_light` / `tenant_logo_dark`; URLs guardadas com `PUT /api/me/business-profile`. |

Tipos de ficheiro aceites para imagens seguem o catálogo (JPEG, PNG, WebP, GIF) e o limite configurado (`CATALOG_MEDIA_UPLOAD_MAX_BYTES` / default 5 MB). SVG não está incluído no pipeline atual de catálogo.

## Permissões

- **Perfil pessoal**: qualquer utilizador autenticado.
- **Perfil do negócio** (ver aba e usar GET/PUT):
  - Utilizador **primário do tenant** (primeiro `users.created_at` por `tenant_id`), ou
  - Permissão de módulo **`settings` → `edit`** (equivalente a editar dados da empresa nas Configurações).

Quem não tem acesso não vê a aba «Perfil do negócio».

Badges **Super Admin** / **Administrador** na aba pessoal derivam de `user.is_super_admin`, `user.is_tenant_admin` e `user.can_manage_plan` (`AuthContext`).

## Fluxo de alteração de senha

1. `POST /api/me/profile/password/request-code` — gera código de 6 dígitos, guarda **hash** (bcrypt), expiração (~10 minutos), limite de pedidos por hora.
2. Envio do código por **WhatsApp** (instância do tenant com remetente = utilizador, ou instância da plataforma, conforme `loggedInPasswordChangeService`).
3. Se não houver WhatsApp válido cadastrado, devolve erro claro (`NO_WHATSAPP`).
4. `POST /api/me/profile/password/confirm` com `code`, `new_password`, `confirm_password` — valida código, limite de tentativas, atualiza `password_hash`, invalida sessões (`DELETE FROM sessions`).

Regras: código não é devolvido na API em produção; não é armazenado em claro; tentativas limitadas; mensagens de erro genéricas para código inválido/expirado quando aplicável.

## Upload de logos

- Upload para disco + URL assinada: `POST /api/catalog-media/upload` com permissão `settings.edit`.
- Em seguida persistir URLs com `PUT /api/me/business-profile`.
- Remoção: `POST /api/catalog-media/delete` com a chave relativa, depois `PUT` com `logo_*_url` a `null`.

## Endpoints

| Método | Rota | Descrição |
|--------|------|------|
| GET | `/api/me/profile` | Dados pessoais + `can_edit_business_profile`. |
| PUT | `/api/me/profile` | Atualiza perfil pessoal. |
| POST | `/api/me/profile/avatar` | Multipart `file` — atualiza avatar e remove ficheiro anterior do mesmo scope quando aplicável. |
| POST | `/api/me/profile/password/request-code` | Pedir código. |
| POST | `/api/me/profile/password/confirm` | Confirmar código e nova senha. |
| GET | `/api/me/business-profile` | Lê tenant (requer permissão de negócio). |
| PUT | `/api/me/business-profile` | Atualiza tenant (mesma regra). |

Middleware: `authenticateToken`, `setCurrentTenant`, `setRequestDb` (router `/api/me`).

**Montagem no servidor:** as rotas acima vivem em `packages/backend/src/routes/meProfileRoutes.ts` e devem estar registadas em `packages/backend/src/index.ts` com `app.use('/api/me', meProfileRoutes)` **depois** de `app.use('/api/me/tenant', …)` para não interceptar `/api/me/tenant/*`.

## Base de dados

- `profiles`: colunas extra `avatar_url`, `job_title`, `locale`, `timezone` (script `database/init/157_profile_personal_and_password_change.sql` e migração Supabase espelhada).
- `tenants`: `company_legal_name`, `company_email`, `company_website`, morada em colunas existentes / alinhadas ao modelo.
- `user_password_change_codes`: códigos de alteração de senha com sessão ativa.

## Critérios de aceite

- [x] Utilizador acede a «Perfil pessoal», altera nome/dados e guarda (modo edição explícito).
- [x] Upload de foto pessoal funciona e reflete no header quando `GET /api/auth/me` inclui `avatar_url`.
- [x] Primário da conta ou quem tem `settings.edit` vê «Perfil do negócio» e edita empresa/logos.
- [x] Utilizador sem permissão não vê a aba do negócio.
- [x] Alteração de senha exige código por WhatsApp; expiração e tentativas tratadas no serviço.
- [x] Layout responsivo: chips de abas, hero centrado no mobile, barras de ação fixas no mobile durante edição.
- [x] `npm run build` (frontend) e `npm run build` (backend) passam após integração.
