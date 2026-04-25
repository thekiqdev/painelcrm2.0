# Recuperação de senha por WhatsApp

## Resumo

Fluxo em três passos na rota `/recuperar-senha`: pedir código → validar código de 6 dígitos → definir nova senha. O código é enviado pelo **Motor de Notificações da Plataforma** (evento `platform.auth.password_reset_code_issued`).

## Backend

- **Tabela** `password_reset_codes`: `user_id`, `whatsapp_digits`, `code_hash` (bcrypt), `expires_at` (60 min), `consumed_at`, `attempts_count`.
- **APIs** (públicas, rate limit dedicado `RATE_LIMIT_PASSWORD_RESET_MAX`, default 20 / 15 min por IP):
  - `POST /api/auth/password-reset/request` — body `{ "whatsapp": "<dígitos>" }`
  - `POST /api/auth/password-reset/verify-code` — `{ "whatsapp", "code" }` → `{ reset_token }` (JWT 15 min)
  - `POST /api/auth/password-reset/complete` — `{ "reset_token", "new_password", "confirm_password" }`
- **Notificação**: `runPlatformTransactionalNotification` com `target_tenant_id` = `users.tenant_id` ou, se ausente (ex.: superadmin sem tenant), `platform_notifications_dispatch_tenant_id` nas definições globais — sem isso o envio WhatsApp não ocorre (resposta ao utilizador mantém-se genérica).
- **Segurança**: resposta genérica no pedido; código em hash; máximo 5 tentativas erradas por código; até 3 códigos criados por hora por utilizador; códigos anteriores invalidados ao pedir novo; sessões JWT em `sessions` apagadas após troca de senha.

## Frontend

- Página `ForgotPasswordWhatsapp.tsx`: máscara **(DD) NNNNN-NNNN** só com DDD + número (sem exigir 55); se o utilizador colar número com 55, o DDI é removido para alinhar ao cadastro habitual.

## Normalização (backend)

- `buildWhatsappLookupDigitVariants` em `userIdentity.ts`: compara com o que está em `users.whatsapp_number` **com ou sem** prefixo `55`.
- Na criação do pedido, `password_reset_codes.whatsapp_digits` guarda o valor **canónico** já normalizado na BD (igual ao `regexp_replace` do utilizador).
- Envio WhatsApp: `toBrazilWhatsappDialDigits` garante DDI **55** para o gateway quando o cadastro só tem parte nacional.

## Migração

- Ficheiro `database/init/147_password_reset_whatsapp.sql` (catálogo + template sistema).
