# Implantação — Fluxo de cadastro de tenant + administrador

## 1. Objetivo

Oferecer um **cadastro guiado em 4 etapas** na rota **Cadastrar** (`/register`): plano → dados da empresa → administrador → revisão de faturamento/suporte, com **unicidade global** do e-mail e do WhatsApp do **administrador** antes de criar tenant e usuário, sem quebrar o cadastro rápido por WhatsApp na tela de login nem o onboarding pós-registro (`/register/steps`).

## 2. Regra de negócio

- **E-mail do administrador:** único na plataforma (`users`); se já existir → bloqueio com código `EMAIL_ALREADY_REGISTERED_USE_LOGIN`.
- **WhatsApp do administrador:** único na plataforma (comparação por dígitos em `users.whatsapp_number`); se já existir → `WHATSAPP_ALREADY_REGISTERED_USE_LOGIN`.
- **Empresa (tenant):** criada na mesma transação do usuário admin; `tenants` recebe `billing_email`, `billing_phone`, `cpf_cnpj`, `responsible_name` conforme etapas.
- **CPF/CNPJ da empresa:** validado com `isValidCpfOrCnpj` (apenas dígitos).
- **Login:** o administrador pode entrar com **e-mail** ou **telefone** (mesma regra do `authController.login`), pois `users.email` e `users.whatsapp_number` são preenchidos de forma consistente com `normalizeWhatsappDigits`.

## 3. Fluxo antigo vs novo

| Aspecto | Antes | Depois |
|--------|--------|--------|
| `/register` | Formulário único (empresa + nome + WhatsApp + senha) → `POST /api/auth/register` | Wizard em **4 passos** → `POST /api/auth/register/organization` |
| Plano | Plano padrão (ou primeiro ativo) escolhido no backend | **Etapa 1:** usuário escolhe entre planos ativos (`GET /api/plans`) |
| Empresa vs admin | Um único fluxo com e-mail sintético se só WhatsApp | **Empresa** (nome, CPF/CNPJ, e-mail, telefone) e **admin** (nome, e-mail, WhatsApp, senha) separados |
| Revisão faturamento | Só dados implícitos no registro | **Etapa 4:** nome e e-mail da empresa **somente leitura**; telefone de faturamento editável; nome do responsável opcional |
| Cadastro por WhatsApp em `/login` | `signUp` → `/api/auth/register` | **Inalterado** (aba Cadastro em `AuthWhatsApp`) |
| Após criar conta | `/register/steps` (RegistrationSteps) | **Igual:** token + `refreshUser` → `/register/steps` |

## 4. Validações de unicidade

- **`POST /api/auth/register/check-admin`** — corpo: `{ admin_email, admin_whatsapp }` (telefone pode vir mascarado; o backend normaliza). Resposta `200 { ok: true }` ou `400` com `code` e mensagem amigável.
- **`POST /api/auth/register/organization`** — valida de novo e-mail e WhatsApp do admin antes do `BEGIN` (defesa em profundidade); em caso de corrida, erro `23505` mapeado para `DUPLICATE_KEY` com mensagem genérica.

## 5. Alterações no backend

- Novo arquivo `packages/backend/src/controllers/registerOrganizationController.ts`:
  - `checkAdminAvailability`
  - `registerOrganization` (transação: `tenants` → `users` com `tenant_id` → `profiles` → `user_profiles` + membros/roles/permissões → `tenant_plan` → notificação).
- Rotas em `packages/backend/src/routes/authRoutes.ts`:
  - `POST /api/auth/register/check-admin`
  - `POST /api/auth/register/organization`
- **`POST /api/auth/register`** (legado): mantido para landing/login e fluxos existentes.

## 6. Alterações no frontend

- Novo `src/pages/RegisterOrganizationWizard.tsx`: stepper visual (4 passos), máscaras `formatPhoneBrDigits` / `formatCpfCnpjDigits`, chamadas aos novos endpoints, `setTokenAndUser` + `refreshUser` e redirecionamento para `/register/steps`.
- `src/pages/Register.tsx`: passa a apenas renderizar o wizard.
- `src/integrations/api/client.ts`: em erros HTTP, repassa `code` do JSON para o chamador (toasts e mensagens estáveis).

## 7. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `packages/backend/src/controllers/registerOrganizationController.ts` | **Novo** — check + registro transacional |
| `packages/backend/src/routes/authRoutes.ts` | Novas rotas |
| `packages/backend/src/routes/projectListsRoutes.ts` (e outros) | Correção `tenantAuth` → `tenantAuthCrm` (regressão de build) |
| `src/pages/RegisterOrganizationWizard.tsx` | **Novo** |
| `src/pages/Register.tsx` | Substituição pelo wizard |
| `src/integrations/api/client.ts` | Propriedade `code` em erro |

## 8. Como validar manualmente

1. **Novo e-mail + novo telefone:** concluir as 4 etapas → conta criada → `/register/steps` → login com e-mail e com telefone.
2. **E-mail já usado:** na etapa 3 (Próximo) ou no submit final → mensagem e código `EMAIL_ALREADY_REGISTERED_USE_LOGIN`.
3. **Telefone já usado:** idem com `WHATSAPP_ALREADY_REGISTERED_USE_LOGIN`.
4. **Etapa 2:** nome obrigatório, CPF/CNPJ inválido rejeitado no front e no back; telefone com máscara.
5. **Etapa 4:** campos bloqueados e telefone de faturamento editável; submit envia `billing_finalize`.

## 9. Riscos remanescentes

- **E-mail da empresa** não tem unicidade global obrigatória (dois tenants podem teoricamente usar o mesmo `billing_email`); a regra pedida foi focada no **administrador**.
- **Checkout pago** (`PlanCheckout`) continua fluxo próprio; não foi fundido ao wizard (evita escopo paralelo).
- **Dupla submissão** no último passo: mitigada por `submitting`; em rede lenta o usuário pode clicar duas vezes — aceitável; idempotência não foi adicionada ao endpoint.
