# Plano — Plano grátis, tela única de planos e acesso pelo menu Minha Conta

Este documento descreve a implementação em etapas de:

1. **Plano grátis** com limite de dias de acesso; ao expirar, redirecionar para contratação.
2. **Tela única de planos** para o usuário logado: contratar plano e personalizar o atual (contratar mais usuários).
3. **Acesso** pela área "Minha Conta" no menu (somente para admins da conta).

---

## Definições

| Termo | Descrição |
|------|-----------|
| **Plano grátis** | Plano com `is_free = true` e `free_access_days` (dias de uso). Ao fim do período, o acesso expira. |
| **Admin da conta** | Usuário que pode gerenciar plano e faturamento do tenant. Consideramos o **usuário principal (primary user)** do tenant como admin da conta para essa funcionalidade. |
| **Tela de planos** | Página acessível pelo menu "Minha Conta" → "Planos", onde o admin vê o plano atual, pode trocar de plano e (em plano custom) contratar mais usuários. |

---

## Etapa 1 — Plano grátis no modelo e no Super Admin

### 1.1 Modelo de dados

- **Tabela `plans`:**
  - `is_free` BOOLEAN NOT NULL DEFAULT false.
  - `free_access_days` INTEGER NULL (só relevante quando `is_free = true`; número de dias que o plano fica disponível).

- **Tenant:** já existe `trial_ends_at`. Para plano grátis, usar o mesmo conceito: ao associar um tenant a um plano grátis na criação (ou ao “contratar” o plano grátis), definir `plan_expires_at` (ou reutilizar `trial_ends_at`) = data de início + `free_access_days`.

- **Opção A (reutilizar):** usar `tenants.trial_ends_at` como “data de expiração do plano grátis” quando o plano do tenant for `is_free = true`.  
- **Opção B (nova coluna):** adicionar `plan_expires_at TIMESTAMPTZ` em `tenants` para deixar explícito (e permitir trial e plano grátis no futuro com semânticas diferentes).  

Recomendação: **Opção A** por simplicidade — quando o plano for grátis, ao criar/atribuir o tenant, preencher `trial_ends_at = now() + free_access_days`. Ao trocar para plano pago, limpar `trial_ends_at` (ou ignorar para planos não grátis).

### 1.2 Migration

- Adicionar em `plans`: `is_free`, `free_access_days`.
- Comentários nas colunas para documentação.

### 1.3 Backend

- **plansController:** criar/atualizar/listar planos incluindo `is_free` e `free_access_days`. Validação: se `is_free = true`, exige `free_access_days` >= 1.
- **listPublicPlans:** retornar `is_free` e `free_access_days` para a landing (opcional, para exibir “X dias grátis”).

### 1.4 Super Admin (formulário de plano)

- Checkbox “Plano grátis”.
- Se marcado: campo numérico “Dias de acesso” (`free_access_days`), mínimo 1.
- Listagem: badge “Grátis” para planos com `is_free = true`.

---

## Etapa 2 — Expiração do plano grátis e redirecionamento

### 2.1 Cálculo da expiração

- Ao **criar tenant** com plano grátis (registro ou Super Admin):  
  `trial_ends_at = now() + (plan.free_access_days dias)`.
- Ao **trocar tenant para plano grátis** (futura tela de planos ou Super Admin): idem.
- Ao trocar para **plano pago**: `trial_ends_at = null` (ou não considerar para expiração).

### 2.2 Verificação no acesso

- **Middleware ou rotina no backend** (em cada request autenticado do app, ou em um middleware de “tenant context”):  
  - Se o tenant do usuário tem plano com `is_free = true` **e** `trial_ends_at` está definido **e** `trial_ends_at < now()`, retornar um código específico (ex.: 403 com `code: 'PLAN_EXPIRED'`) ou um payload `{ plan_expired: true, redirect: '/meu-plano' }`.
- **Frontend:** ao receber esse código/payload, redirecionar para a tela de planos (ex.: `/meu-plano` ou `/minha-conta/planos`) para que o usuário contrate um plano.

### 2.3 Ajustes no registro

- Ao registrar com plano grátis (se houver escolha de plano na landing): ao criar o tenant, setar `trial_ends_at` conforme `free_access_days` do plano escolhido.

---

## Etapa 3 — Tela única de planos (contratar e personalizar)

### 3.1 Objetivo

- Uma única tela onde o usuário (admin da conta):
  - Vê o **plano atual** (nome, descrição, preço, benefícios, data de expiração se grátis).
  - Pode **contratar outro plano** (lista de planos disponíveis, com botão “Contratar” que inicia o fluxo de mudança de plano).
  - No caso de **plano custom**, pode **personalizar**: aumentar (e eventualmente diminuir, respeitando mínimo) o número de **usuários** contratados; o preço é recalculado (preço por usuário × quantidade).

### 3.2 API (backend)

- **GET /api/tenant/plan** (ou `/api/me/plan`): retorna o plano atual do tenant do usuário, com benefícios, interval_prices (se custom), e se é grátis e `plan_expires_at` (trial_ends_at quando plano grátis). Exige autenticação e que o usuário seja do tenant.
- **GET /api/plans** (já existe, público): usado para listar planos na tela (ou criar **GET /api/tenant/plans/available** com autenticação, retornando mesma lista).
- **POST /api/tenant/plan/change** (ou PUT): body `{ plan_id, billing_interval?, users_count? }`. Apenas para **admin da conta** (primary user).  
  - Troca o plano do tenant.  
  - Se plano grátis: seta `trial_ends_at`.  
  - Se plano custom: pode receber `users_count` e `billing_interval`, atualizando overrides do tenant e gerando cobrança conforme regras existentes.
- **POST /api/tenant/plan/add-users** (ou PATCH): para plano custom, aumentar número de usuários (e opcionalmente gerar cobrança proporcional ou na próxima fatura). Apenas admin da conta.

Alternativa mais simples: um único endpoint **PUT /api/tenant/plan** com body `{ plan_id?, billing_interval?, users_count? }` para “mudar plano” ou “apenas alterar usuários (custom)”.

### 3.3 Frontend — Página “Meu plano” / “Planos”

- Rota sugerida: `/meu-plano` ou `/minha-conta/planos`.
- Conteúdo:
  - **Bloco “Seu plano atual”:** nome, descrição, preço (ou “Grátis” + dias restantes), benefícios, data de expiração (se grátis). Botão “Alterar plano” que expande ou navega para a lista.
  - **Bloco “Outros planos”:** cards dos planos (dados de GET /api/plans), com botão “Contratar”. Ao clicar, chamar API de mudança de plano (e, se necessário, fluxo de pagamento/confirmação).
  - **Bloco “Personalizar” (apenas se plano atual for custom):** controles (-) [N] (+) para “Usuários contratados”, seletor de intervalo de cobrança; ao confirmar, chamar API de atualização de usuários/intervalo.
- Somente **admins da conta** podem acessar essa página (e ver o menu “Planos”). Outros usuários não veem o link nem a rota (ou recebem 403).

### 3.4 Quem é “admin da conta”

- Considerar **primary user** do tenant como admin: o primeiro usuário criado no tenant (ou o definido em `tenant.primary_user_id` se existir campo explícito).  
- Backend: em rotas de “tenant plan”, verificar se `req.user.id` é o primary user do tenant.  
- Frontend: **GET /api/auth/me** deve retornar um campo `is_tenant_primary` (ou `can_manage_plan`) para o frontend mostrar ou ocultar o link “Planos” no menu “Minha Conta”.

---

## Etapa 4 — Menu “Minha Conta” e link “Planos”

### 4.1 Backend: indicar se usuário pode gerenciar plano

- Em **GET /api/auth/me**, incluir:
  - `is_tenant_primary`: boolean (true se o usuário for o primary user do tenant).
  - Ou `can_manage_plan`: boolean (por enquanto igual a `is_tenant_primary`; no futuro pode incluir outra lógica).

- Cálculo: para o usuário logado, obter `tenant_id`; obter `primary_user_id` do tenant (query existente em tenantsController); `is_tenant_primary = (primary_user_id === user.id)`. Se usuário não tem tenant, false.

### 4.2 Frontend: menu “Minha Conta”

- No dropdown que mostra o nome do usuário logado (Minha Conta):
  - Adicionar item **“Planos”** (ou “Meu plano”) com link para `/meu-plano` (ou rota escolhida).
  - Exibir esse item **somente quando** `user.can_manage_plan` (ou `user.is_tenant_primary`) for true.
  - Se o usuário acessar a URL diretamente sem ser admin da conta, o backend das rotas de tenant/plan deve retornar 403.

### 4.3 Proteção de rota no frontend

- Na rota `/meu-plano`, verificar `can_manage_plan`; se false, redirecionar para dashboard ou exibir mensagem “Apenas o administrador da conta pode gerenciar o plano”.

---

## Ordem sugerida de implementação

| Ordem | Etapa | Itens principais |
|-------|--------|-------------------|
| 1 | Etapa 1 | Migration plans (is_free, free_access_days); backend CRUD planos; Super Admin formulário + badge Grátis |
| 2 | Etapa 2 | Registrar trial_ends_at ao criar tenant com plano grátis; middleware/check de expiração; resposta 403 + code; frontend redirect para /meu-plano |
| 3 | Etapa 4 (parcial) | GET /api/auth/me com is_tenant_primary/can_manage_plan; menu Minha Conta com link Planos (só para admin) |
| 4 | Etapa 3 | GET /api/tenant/plan; PUT ou POST para mudar plano e (custom) usuários; página /meu-plano com plano atual, lista de planos, personalizar usuários (custom) |
| 5 | Etapa 2 (refino) | Ajuste no registro (escolha de plano grátis na landing) e em “trocar para plano grátis” na tela de planos |

---

## Resumo de artefatos

- **Migrations:** `plans.is_free`, `plans.free_access_days`; uso de `tenants.trial_ends_at` para expiração do plano grátis.
- **Backend:** plansController (is_free, free_access_days); authController getMe (is_tenant_primary/can_manage_plan); tenantPlanController ou tenantsController (GET tenant plan, PUT change plan / add users); middleware ou check de expiração (plan grátis + trial_ends_at).
- **Frontend:** formulário de plano no Super Admin (grátis + dias); página /meu-plano (plano atual, listar planos, contratar, personalizar usuários para custom); menu Minha Conta com “Planos” condicionado a can_manage_plan; redirect quando plano expirado.
- **Documentação:** este arquivo (PLANO-PLANO-GRATIS-E-TELA-PLANOS.md).

---

## Extra — Fluxo de “Contratar” na tela de planos

- **Contratar plano pago:** PUT /api/tenant/plan com plan_id; backend atualiza tenant.plan_id, limpa trial_ends_at, e pode criar cobrança em tenant_billing (conforme regras do Super Admin).
- **Contratar mais usuários (plano custom):** PUT /api/tenant/plan com plan_id (igual ao atual) e users_count maior; backend atualiza max_users_override e pode gerar cobrança adicional ou na próxima fatura.
- Integração com gateway de pagamento pode ser feita em etapa posterior; inicialmente a “contratação” pode apenas atualizar plano e limites e gerar cobrança “pendente” no sistema.
