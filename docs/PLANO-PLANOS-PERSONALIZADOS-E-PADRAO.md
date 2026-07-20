# Plano — Planos personalizados e plano padrão

Este documento descreve a implementação do **plano personalizado** (preço por usuário, quantidade escolhida pelo cliente) e da opção **plano padrão** (plano atribuído em novos cadastros no site).

---

## Visão geral

| Recurso | Descrição |
|--------|-----------|
| **Plano personalizado** | Tipo de plano em que o valor é definido **por usuário**; o cliente (ou Super Admin) escolhe a quantidade de usuários e de instâncias WhatsApp. Permite preços diferentes por periodicidade (mensal, trimestral, semestral, anual). |
| **Plano padrão** | Um plano pode ser marcado como "padrão"; será o plano atribuído automaticamente quando um novo usuário se cadastrar no site (`created_via = 'registration'`). |

---

## Estado atual

- **Plans:** `name`, `slug`, `description`, `price_cents`, `billing_interval` (monthly/yearly), `max_users`, `max_profiles`, `max_whatsapp_instances`, `is_active`, `sort_order`.
- **Registro:** ao criar conta no site, o tenant recebe o primeiro plano ativo por `sort_order` (query `ORDER BY sort_order ASC, name ASC LIMIT 1`).
- **Cobrança:** `tenant_billing` guarda `amount_cents` fixo por cobrança; não há hoje preço por usuário nem múltiplos intervalos no mesmo plano.

---

## Fase 1 — Modelo de dados

### 1.1 Planos: tipo e plano padrão

- **Tabela `plans`:**
  - `plan_type` TEXT NOT NULL DEFAULT `'standard'` CHECK (plan_type IN ('standard', 'custom')).
    - **standard:** comportamento atual (preço fixo, limites fixos max_users/max_profiles/max_whatsapp_instances).
    - **custom:** plano personalizado; preço por usuário por intervalo; quantidade de usuários e instâncias definida por tenant (via limites/overrides).
  - `is_default` BOOLEAN NOT NULL DEFAULT false.
    - Apenas um plano pode ter `is_default = true`. Na aplicação, ao marcar um plano como padrão, desmarcar os demais.

- **Constraint:** garantir no aplicativo (ou trigger) que só existe um plano com `is_default = true`.

### 1.2 Preços por intervalo (planos personalizados)

- **Nova tabela `plan_interval_prices`:**
  - `id` UUID PK.
  - `plan_id` UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE.
  - `billing_interval` TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'quarterly', 'semi_annual', 'yearly')).
  - `price_per_user_cents` INTEGER NOT NULL (valor por usuário, em centavos, para esse intervalo).
  - `created_at`, `updated_at`.
  - UNIQUE(plan_id, billing_interval).

- Para plano **custom**, não se usa mais `plans.price_cents` e `plans.billing_interval` como únicos; o valor da cobrança será:  
  `amount_cents = price_per_user_cents * contracted_users` (+ extras de conexões WhatsApp na renovação, ver abaixo).

- **Intervalos:** mensal, trimestral, semestral, anual (quarterly, semi_annual, yearly além do monthly já existente).

- **Preço por conexão WhatsApp (WI2–WI4):** `plan_interval_prices.price_per_instance_cents` (nullable = extras não vendáveis). Snapshot em `subscriptions.contracted_price_per_instance_cents`. Add-on self-service: `billing_reason = instance_addon`. Na **renovação SaaS**:
  `extras = max(0, contracted_instances − plans.max_whatsapp_instances) × preço unitário`
  (contratadas = override ou schedule `max_whatsapp_instances_scheduled_next_cycle`).

### 1.3 Tenant e cobrança em planos personalizados

- **Tenant:** já existem `max_users_override`, `max_profiles_override`, `max_whatsapp_instances_override`, `max_users_scheduled_next_cycle`, `max_whatsapp_instances_scheduled_next_cycle`. Para plano custom, esses overrides (ou valores definidos na contratação) representam a “quantidade contratada” que entra no cálculo da cobrança.
- **tenant_billing:** já tem `amount_cents`, `billing_interval`, `plan_id`. Para plano custom, ao gerar cobrança:
  - Obter `contracted_users` (ex.: `max_users_override` do tenant ou limite efetivo) e `billing_interval` escolhido.
  - Buscar `price_per_user_cents` em `plan_interval_prices` para esse plano e intervalo.
  - `amount_cents = price_per_user_cents * contracted_users` (arredondar/validar como inteiro); na renovação somar extras WhatsApp se houver.

### 1.4 Migrations sugeridas

- **Migration A:** `plans`: adicionar `plan_type` (default 'standard'), `is_default` (default false). Índice em `is_default` WHERE is_default = true para buscar o plano padrão rápido.
- **Migration B:** criar tabela `plan_interval_prices` (plan_id, billing_interval, price_per_user_cents, timestamps).
- **Migration C (opcional):** estender `tenant_billing.billing_interval` para aceitar 'quarterly' e 'semi_annual' (hoje só monthly/yearly). Ou manter tenant_billing só com monthly/yearly e mapear trimestral/semestral no plano para o valor correto na geração da cobrança.

---

## Fase 2 — Backend

### 2.1 Planos (CRUD)

- **Listar / obter plano:** incluir `plan_type`, `is_default`; para plan_type = 'custom', incluir (ou endpoint separado) os preços por intervalo (`plan_interval_prices`).
- **Criar plano:** body pode incluir `plan_type` ('standard' | 'custom'), `is_default` (boolean). Se `plan_type = 'custom'`, aceitar `interval_prices`: array de `{ billing_interval, price_per_user_cents }` (monthly, quarterly, semi_annual, yearly). Validar que pelo menos um intervalo tenha preço definido.
- **Atualizar plano:** idem; ao salvar `is_default = true`, executar UPDATE em todos os outros planos SET is_default = false.
- **Excluir plano:** comportamento atual; se o plano for o padrão, decidir se impede exclusão ou se transfere “padrão” para outro (ex.: primeiro ativo por sort_order).

### 2.2 Plano padrão (registro)

- **Fluxo de registro (authController ou equivalente):** em vez de `SELECT id FROM plans WHERE is_active = true ORDER BY sort_order ASC, name ASC LIMIT 1`, usar:
  - `SELECT id FROM plans WHERE is_active = true AND is_default = true LIMIT 1`;
  - se não houver plano padrão, fallback para o primeiro ativo por sort_order (comportamento atual).
- **API (opcional):** `GET /api/superadmin/plans/default` retornando o plano marcado como padrão (para exibir no painel ou em configurações).

### 2.3 Cobrança para plano custom

- **Gerar cobrança (ex.: POST tenants/:id/billing/charge):**
  - Se o tenant estiver em plano **custom**, calcular `amount_cents` a partir de:
    - `contracted_users` = tenant.max_users_override ou, se null, plan.max_users (ou mínimo 1).
    - `billing_interval` do tenant/contrato (ou parâmetro na geração).
    - `plan_interval_prices.price_per_user_cents` para esse plano e intervalo.
  - Gravar em `tenant_billing` o `amount_cents` calculado e o `billing_interval` usado.

### 2.4 Limites em plano custom

- Ao associar um tenant a um plano **custom**, os limites efetivos (usuários, instâncias) vêm dos overrides do tenant (ou de um fluxo “contratação” onde o Super Admin define max_users_override e max_whatsapp_instances_override). O `tenantLimitService` já usa overrides; basta que, na UI de criação/edição do tenant ou na “contratação”, esses valores sejam definidos quando o plano for custom.

---

## Fase 3 — Frontend (Super Admin)

### 3.1 Formulário de plano (criar/editar)

- **Tipo de plano:** select ou toggle “Plano padrão” vs “Plano personalizado”.
- **Se plano padrão (standard):**
  - Manter campos atuais: preço fixo (price_cents), billing_interval (monthly/yearly), max_users, max_profiles, max_whatsapp_instances.
- **Se plano personalizado (custom):**
  - Ocultar (ou deixar opcional) preço fixo e billing_interval único.
  - Exibir bloco “Preço por usuário por periodicidade”:
    - Mensal: input (centavos ou R$).
    - Trimestral: input.
    - Semestral: input.
    - Anual: input.
  - Pelo menos um intervalo preenchido. Salvar em `plan_interval_prices`.
- **Plano padrão (novo cadastro):**
  - Checkbox “Plano padrão (atribuído em novos cadastros no site)”.
  - Ao marcar, desmarcar o outro plano que estiver como padrão (via API que já faz o UPDATE em lote).

### 3.2 Listagem de planos

- Exibir coluna ou badge “Personalizado” para plan_type = 'custom'.
- Exibir badge “Padrão” ou “Plano padrão” para is_default = true.
- Na listagem, para planos custom, mostrar resumo dos intervalos (ex.: “R$ X/usuário (mensal)”, “R$ Y/usuário (anual)”).

### 3.3 Criação/edição de tenant com plano custom

- Ao selecionar um plano **custom** para o tenant:
  - Exibir campos para “Quantidade de usuários” e “Quantidade de instâncias WhatsApp” (que serão salvos como max_users_override e max_whatsapp_instances_override).
  - Opcional: escolha do “Intervalo de cobrança” (mensal, trimestral, semestral, anual) para esse tenant, se quiser que o sistema use isso na geração da cobrança.

### 3.4 Faturamento (aba do cliente)

- Para tenant em plano custom, na geração de cobrança:
  - Mostrar cálculo: “X usuários × R$ Y/usuário (intervalo Z) = R$ total.”
  - Permitir ajuste manual do valor se necessário (já existe amount_cents na cobrança).

---

## Fase 4 — Ajustes e validações

- **Validação:** não permitir plano custom sem pelo menos um preço por intervalo em `plan_interval_prices`. (Create/update validam; no update, se o plano for custom e não houver preços no body nem na base, retorna 400.)
- **Seed/migração:** planos existentes permanecem com `plan_type = 'standard'`, `is_default = false`. A migration `41_seed_default_plan.sql` marca um plano como padrão quando nenhum estiver (primeiro ativo por sort_order).
- **Documentação:** guia operacional em [docs/PLANOS-OPERACIONAL.md](PLANOS-OPERACIONAL.md); README atualizado com link para a documentação de planos.

---

## Ordem sugerida de implementação

| Ordem | Item | Observação |
|-------|------|------------|
| 1 | Migration A (plan_type, is_default) | Sem quebrar dados atuais |
| 2 | Migration B (plan_interval_prices) | Tabela nova |
| 3 | Backend: CRUD planos com plan_type, is_default, interval_prices | Criar/atualizar plan_interval_prices |
| 4 | Backend: registro usar plano com is_default = true | Trocar query do plano no registro |
| 5 | Frontend: formulário de plano (tipo + preços por intervalo + checkbox padrão) | Aba Planos Super Admin |
| 6 | Frontend: listagem com badges Personalizado / Padrão | Aba Planos |
| 7 | Backend: cálculo de cobrança para plano custom | POST billing/charge |
| 8 | Frontend: ao escolher plano custom no tenant, campos de quantidade usuários/instâncias | Aba Configurações ou ao criar tenant |
| 9 | Frontend: faturamento do tenant com plano custom (cálculo exibido) | Aba Faturamento |

---

## Resumo de artefatos

- **Migrations:** alteração em `plans` (plan_type, is_default); nova tabela `plan_interval_prices`; opcional estender billing_interval em tenant_billing.
- **Backend:** ajustes em plansController (create/update/list/get com interval_prices e is_default); authController (buscar plano padrão no registro); tenantsController ou billing (cálculo de amount_cents para plano custom); endpoint opcional GET /plans/default.
- **Frontend:** formulário de plano (tipo, preços por intervalo, checkbox plano padrão); listagem com badges; fluxo tenant com plano custom (quantidades); aba Faturamento com exibição do cálculo para plano custom.

---

## Extra — Plano padrão (resumo)

- Coluna `plans.is_default` (boolean).
- Ao marcar um plano como padrão, a aplicação garante que só esse plano tenha `is_default = true`.
- No cadastro pelo site, o tenant criado recebe `plan_id` do plano com `is_default = true`; se não houver, usa o primeiro plano ativo por sort_order (comportamento atual).
- Opcional: tela ou seção em “Configurações” do Super Admin para escolher o plano padrão sem entrar no formulário do plano.
