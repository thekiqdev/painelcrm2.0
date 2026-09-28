# Plano executivo — Fase 1: checkout único (base para trial futuro)

**Tipo:** plano de execução para implementação controlada.  
**Implementação:** esta fase **não inclui** trial no checkout, expiração de trial, retomada pós-trial nem jobs novos de trial (ver `PLANO-EXECUTIVO-TRIAL-CHECKOUT-COBRANCA-E-RETOMADA.md` para Fase 2).

**Documentos relacionados:** `PLANO-MESTRE-FLUXO-CONTRATACAO-NOVAS-EMPRESAS.md`, `PLANO-TECNICO-CHECKOUT-REGISTRO-UNICO.md`.

---

## 1. Resumo executivo

A Fase 1 consolida o **`/checkout`** como **única porta pública** para nova empresa com **pagamento imediato** (fluxo atual de `payment_pending` → cobrança → `active`), reorganizando etapas (plano → empresa/admin → resumo → pagamento com CPF/CNPJ), **senha definitiva** do administrador já no checkout, validação de **e-mail e WhatsApp** (unicidade + persistência em **`users.whatsapp_number`**), e **descontinuação segura** dos fluxos `/register`, wizard e cadastro público via `/api/auth/register`. Após pagamento confirmado: **login automático**, redirect **`/dashboard`**, **onboarding leve** em bloco no dashboard (não rota obrigatória). A cadeia **`POST /api/plan-purchase`** permanece **retrocompatível**; **webhook**, **polling** e **`activatePlanFromBilling`** seguem **equivalentes** ao baseline para **upgrade logado** e fluxo anônimo.

**Distinção explícita (onboarding antigo vs novo):** o **onboarding obrigatório** da arquitetura anterior (rota `/onboarding` que bloqueava ou era necessário para “concluir” a conta após o checkout) **não existe mais** nesta fase. Em substituição, a **ativação** pós-pagamento é **dashboard + bloco de onboarding leve** (ver §1.5). A rota `/onboarding` pode permanecer no código apenas se ainda houver uso legado, mas **não** como etapa obrigatória do fluxo checkout da Fase 1.

A arquitetura deve **facilitar** a Fase 2 (trial) com **pontos de extensão documentados**, **sem** introduzir lógica de trial executável nesta entrega.

---

### 1.5 Decisões finais fechadas desta fase

As decisões abaixo **não admitem interpretação alternativa** na implementação da Fase 1.

#### 1.5.1 UX pós-pagamento (fechado)

- Após **pagamento confirmado com sucesso**, o usuário deve ser direcionado para **`/dashboard`**.
- **Não** há redirecionamento pós-pagamento para uma rota de onboarding **obrigatória** nem rota que **bloqueie** o uso do sistema antes do dashboard.
- No **dashboard**, deve existir um **bloco inicial** (onboarding leve / tarefas / missões), **estrutura extensível** para futuras ações de ativação.
- Esse bloco deve conter **no mínimo**:
  - **Card** para conectar o WhatsApp;
  - **Card** para criar novos usuários, **quando fizer sentido** para o plano contratado (ex.: `max_users` / plano custom).
- Novas ações de ativação no futuro entram como itens adicionais nesse mesmo padrão extensível.

#### 1.5.2 Autenticação após pagamento — login automático (fechado)

- O usuário deve ficar **autenticado automaticamente** após concluir o checkout e ter o **pagamento confirmado** (polling/webhook → tenant ativo).
- O fluxo **normal** **não** redireciona para **login manual** (`/login`) para digitar senha de novo.
- A implementação deve **emitir, reaproveitar ou concluir** a sessão (ex.: JWT no `AuthContext`, cookie se existir, ou endpoint dedicado pós-confirmação) de forma **segura** (sem expor segredos na URL, validando tenant/usuário coerentes com a cobrança paga).
- **Risco técnico (não altera a decisão de produto):** se houver limitação de segurança (ex.: token só após `POST` específico), documentar no PR e tratar com endpoint mínimo; a decisão de produto permanece **login automático**.

#### 1.5.3 Contrato de erros do backend — códigos mínimos obrigatórios (fechado)

- O frontend deve tratar erros do fluxo checkout **`primariamente` pelo campo `code`** na resposta JSON; **não** pela comparação de `message` como contrato estável.
- Mensagens amigáveis (`error` / `message`) podem existir para UX, mas **lógica de branch** no front = **`code`**.
- Novos erros críticos deste fluxo devem seguir o **mesmo padrão** (`code` estável + HTTP adequado).

**Lista mínima obrigatória (Fase 1):**

| `code` | Uso |
|--------|-----|
| `EMAIL_ALREADY_REGISTERED_USE_LOGIN` | E-mail do admin já existe na plataforma. |
| `WHATSAPP_ALREADY_REGISTERED_USE_LOGIN` | WhatsApp do admin já existe na plataforma (unicidade em `users.whatsapp_number`). |
| `PLAN_REQUIRED` | Checkout anônimo sem `plan_id` resolvível (ex.: contexto inválido ou plano ausente). |
| `CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD` | Método exige documento (ex.: PIX) e CPF/CNPJ ausente ou inválido no tenant/contexto. |
| `INVALID_CHECKOUT_CONTEXT` | Combinação inválida de tenant/plano/sessão (ex.: tentativa de compra sem contexto mínimo). |

Detalhamento de HTTP e shape JSON: ver **§10.1**.

#### 1.5.4 WhatsApp do administrador — persistência e fonte de verdade (fechado)

- O WhatsApp do **administrador** deve ser persistido em **`users.whatsapp_number`** — **fonte oficial de verdade** para unicidade e para o perfil do usuário admin.
- O valor enviado no body do checkout (campo acordado, ex.: `phone` / `whatsapp`) após **normalização** (`normalizeWhatsappDigits` ou equivalente) deve ser **o mesmo** usado na **validação de duplicidade** e **o mesmo** gravado em `users.whatsapp_number` para o usuário admin criado.
- **`tenants.billing_phone`:** pode continuar a receber o mesmo valor **para compatibilidade com gateway/faturamento**, mas **não** substitui `users.whatsapp_number` como fonte de unicidade do admin; **evitar divergência** proposital (mesma normalização nos dois campos quando ambos forem preenchidos).
- Se o schema atual não permitir ou houver dados legados, **ação explícita:** migração ou script de alinhamento documentado no PR — **não** deixar como “talvez”.

#### 1.5.5 `POST /api/plan-purchase` — retrocompatibilidade obrigatória (fechado)

- O **body atual** aceito hoje em produção deve **continuar aceito** sem quebrar integrações.
- **Novos campos** (`password`, whatsapp explícito, etc.) entram como **opcionais no contrato global**, com obrigatoriedade **condicional**:
  - **Checkout anônimo (novo fluxo):** campos obrigatórios conforme tabela **§10.2** (empresa, admin, senha, e-mail, WhatsApp normalizado, etc.).
  - **Upgrade logado (`req.tenantId`):** **não** pode passar a **exigir** campos que hoje não são exigidos; em particular **`password` não é obrigatório** no upgrade se não o é hoje.
- Qualquer validação nova (duplicidade, etc.) não deve aplicar-se de forma a **impedir** o upgrade que hoje funciona com o mesmo body baseline.
- Compatibilidade retroativa é **critério de aceite** (ver §21).

---

## 2. Objetivo da fase

1. Unificar cadastro/contratação pública no **`/checkout`** com UX em etapas acordadas.
2. Eliminar dependência de **senha placeholder + onboarding obrigatório** para o primeiro acesso pós-pagamento.
3. Garantir **paridade de validação** (e-mail/WhatsApp) entre frontend e backend.
4. Preservar **100% da compatibilidade** de upgrade de tenant já logado via `plan-purchase` (body baseline, sem novos obrigatórios — §10.2).
5. Estabelecer **contrato de erros** por `code` (§10.1) e **persistência** do WhatsApp do admin em **`users.whatsapp_number`** (§1.5.4).
6. **Preparar** (apenas desenho e extensibilidade) a Fase 2 — **sem** implementar trial, suspensão por trial ou retomada.

---

## 3. Escopo da fase

| # | Entrega |
|---|---------|
| 1 | `/checkout` como fluxo oficial **único** para nova empresa **paga** (visitante). |
| 2 | **Etapa de plano** dentro do próprio `PlanCheckout`; **pular** se `location.state` já trouxer `plan` (ex.: vindo da home/pricing). |
| 3 | Etapa **empresa/admin**: nome empresa, nome administrador, e-mail, WhatsApp, **senha definitiva** (confirmação de senha no front). |
| 4 | Etapa **resumo** com plano, intervalo, usuários (se custom), totais, dados da empresa/admin. |
| 5 | Etapa **pagamento**: exibir nome da empresa; capturar **CPF/CNPJ**; escolha de método; **Gerar cobrança** → fluxo atual. |
| 6 | Manter **layout** atual (card plano + coluna de etapas) na medida do possível. |
| 7 | Preservar contrato e efeitos de **`POST /api/plan-purchase`**, polling `GET /api/billing/:id/status`, webhooks, **`activatePlanFromBilling`**. |
| 8 | **Pós-pagamento:** redirect para **`/dashboard`** + **login automático**; **bloco de onboarding leve** no dashboard (cards WhatsApp + usuários quando aplicável); **sem** onboarding de rota obrigatória (§1.5.1 e §1.5.2). |
| 9 | Descontinuação **segura** de `/register`, wizard, links e **opção** de desligar `POST /api/auth/register` para público (flag). |
|10| Validação **duplicidade e-mail e WhatsApp** (front + back no fluxo checkout). |
|11| Compatibilidade total com **`req.tenantId`** / upgrade logado. |
|12| **Mitigar perda de state** ao recarregar `/checkout` (estratégia explícita abaixo). |
|13| Documentar **ganchos** para Fase 2 (trial): onde entrerão `trial_days`, estados extras — **sem código de negócio de trial**. |

---

## 4. Fora do escopo (explícito)

- Criar tenant em **trial** pelo checkout.
- Cobrança automática após fim de trial, expiração de trial, `suspension_reason` por trial.
- Retomada de checkout por trial vencido.
- Bloqueio de “segundo trial” por empresa.
- Novos **jobs/crons** específicos de trial.
- Alteração do **Billing Engine** de recorrência **salvo** o necessário para não regressão (idealmente nenhuma).

**Regra de ouro:** nenhum `if (trial)` no checkout ou em `plan-purchase` nesta fase, exceto comentários `// Fase 2:` opcionais em ADR ou doc — não em lógica executável.

---

## 5. Critérios de entrada e saída

### 5.1 Entrada (começar Fase 1)

- Baseline do `PLANO-MESTRE` revisado e time alinhado ao escopo §3–4.
- Ambiente de homologação com gateway sandbox e webhooks testáveis.
- Lista de URLs de produção que ainda apontam para `/register` inventariada.

### 5.2 Saída (aceitar Fase 1 — ver também §18)

- Visitante conclui **somente** pelo `/checkout` (CTAs públicos) e paga → tenant `active`, admin com senha real, **sessão automática**, **`/dashboard`** com bloco de onboarding leve (§1.5).
- Upgrade logado indistinguível do comportamento atual em testes de regressão (**body antigo** de `plan-purchase` aceito — §1.5.5, §10.2).
- Fluxos legados **redirecionados** ou **desligados por flag** sem incidente em produção monitorado.
- Checklist §17 passou.

---

## 6. Dependências técnicas

| Dependência | Notas |
|-------------|--------|
| `plans` + `GET /api/plans` | Checkout precisa listar planos quando não há `state.plan`. |
| `createTenantAdminUser` | Deve aceitar **password** obrigatório no fluxo anônimo do checkout. |
| `planPurchaseController` | Body com empresa, e-mail, WhatsApp admin → **`users.whatsapp_number`**, `cpf_cnpj` na hora do POST de compra; validação duplicidade; **códigos `code`** §10.1; **retrocompatibilidade** §10.2. |
| `AuthGuard` / rotas | Não exigir `/register/steps` ou **`/onboarding` obrigatório** como gate pós-checkout; primeiro destino = **dashboard** (§1.5.1). |
| `users.whatsapp_number` | **Obrigatório** persistir WhatsApp do admin aqui; migração/backfill se schema legado divergir (§1.5.4). |

---

## 7. Regras de negócio (Fase 1)

1. **Nova empresa pública** só via `/checkout` (após descontinuação dos paralelos).
2. **Plano:** escolhido no checkout ou pré-carregado via `location.state`; persistência auxiliar contra refresh (§14.8).
3. **Admin:** um usuário owner criado com **senha definitiva** antes de gerar cobrança (mesma transação lógica que hoje cria tenant + admin, sem placeholder).
4. **CPF/CNPJ:** obrigatório para PIX antes de `subscribePlan` (regra atual); coletado **só** na etapa de pagamento.
5. **Duplicidade:** mesmo e-mail ou WhatsApp já cadastrados na plataforma → **bloquear** com resposta JSON contendo **`code`** (lista mínima §1.5.3 / §10.1); unicidade de WhatsApp do admin = **`users.whatsapp_number`** (§1.5.4).
6. **Upgrade logado:** não criar novo tenant; apenas atualizar plano/cobrança como hoje; **sem** novos campos obrigatórios no body em relação ao baseline (§1.5.5, §10.2).

---

## 8. Arquivos impactados (previstos)

### Frontend

- `src/pages/PlanCheckout.tsx` — etapas, estado, pagamento, **sessão pós-confirmação**, redirect para **`/dashboard`**.
- `src/pages/Dashboard.tsx` (ou componente dedicado) — **bloco de onboarding leve** (cards WhatsApp, usuários — §1.5.1).
- `src/landingpage/components/Pricing.tsx`, `Hero.tsx`, `CtaSection.tsx`, `Navbar.tsx`, `AuthModal.tsx`.
- `src/pages/Login.tsx`, `src/pages/Register.tsx`, `RegisterOrganizationWizard.tsx`.
- `src/components/AuthGuard.tsx`, `src/utils/superAdminRedirect.ts`.
- `src/App.tsx` (rotas/onboarding opcional).
- `src/pages/Onboarding.tsx` — **não** é destino obrigatório pós-checkout Fase 1; apenas legado/opcional se mantido.
- `src/contexts/AuthContext.tsx` — se redirect pós-checkout mudar.

### Backend

- `packages/backend/src/controllers/planPurchaseController.ts`
- `packages/backend/src/services/tenantAdminService.ts`
- Opcional: extrair `assertAdminWhatsappAvailable` / e-mail para módulo compartilhado (ex.: `userIdentityValidationService.ts`) consumido por `plan-purchase` e futuramente trial.
- `packages/backend/src/controllers/onboardingController.ts` — relaxar obrigatoriedade só se ainda houver chamadas que assumem senha só no onboarding.
- `packages/backend/src/routes/authRoutes.ts` — rate limit / feature flag em `POST /register`.

### Documentação

- Este plano; atualizar README interno de fluxo comercial se existir.

---

## 9. Mudanças no frontend

| Tema | Ação |
|------|------|
| Etapas | STEPS: Plano (condicional) → Empresa/Admin → Resumo → Pagamento → Resultado. |
| Plano | Se `state?.plan` existe, `initialStep` pula seleção; senão, lista de `GET /api/plans`. |
| Empresa/Admin | Campos + validação local; tratamento de erro por **`code`** (§10.1); opcional debounce para “check availability”. |
| Resumo | Dados completos + valor. |
| Pagamento | CPF/CNPJ, nome empresa visível; método; botão gerar cobrança; erros PIX/documento via **`code`** (`CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD`). |
| Pós-pagamento confirmado | **Login automático** (§1.5.2); redirect **`/dashboard`**; **não** `/login` manual no fluxo feliz. |
| Dashboard | Bloco inicial onboarding leve: cards **WhatsApp** + **novos usuários** (condicional ao plano); extensível (§1.5.1). |
| State | Ver §18.6. |

---

## 10. Mudanças no backend

| Tema | Ação |
|------|------|
| `createTenantAdminUser` | Parâmetro `password` obrigatório no **checkout anônimo**; persistir WhatsApp em **`users.whatsapp_number`** (§1.5.4). |
| `plan-purchase` | Novos campos **retrocompatíveis** (§10.2); validação duplicidade e-mail/WhatsApp; respostas com **`code`** (§10.1). |
| Unicidade | Mesmo valor normalizado usado na validação e em **`users.whatsapp_number`** (e opcionalmente `tenants.billing_phone` alinhado). |
| **Não alterar** | Assinatura pública de `subscribePlan`, `activatePlanFromBilling`, webhook pipeline — salvo props necessários já existentes. |

### 10.1 Contrato de erros — formato e HTTP

- Respostas de erro do fluxo checkout devem incluir **`code`** (string estável) no JSON; lista mínima §1.5.3.
- O frontend **deve** ramificar por `code`; `message` / `error` é apenas apresentação.
- Mapeamento HTTP sugerido (ajustar ao padrão já usado no projeto): **400** para validação de negócio conhecida (`EMAIL_*`, `WHATSAPP_*`, `PLAN_REQUIRED`, `CPF_CNPJ_*`, `INVALID_CHECKOUT_CONTEXT`); manter consistência com `apiClient` existente.
- Novos erros críticos do mesmo fluxo: **sempre** incluir `code` novo documentado no PR.

### 10.2 `POST /api/plan-purchase` — obrigatoriedade de campos por modo

**Regra:** body **antigo** continua válido; campos novos são **aditivos**.

| Modo | Obrigatórios (Fase 1) | Proibido exigir |
|------|------------------------|-----------------|
| **Anônimo — novo checkout** | `plan_id`, `billing_interval`, dados mínimos de empresa/admin acordados (incl. **senha** para criar admin, **WhatsApp** → `users.whatsapp_number`), `payment_method` quando aplicável; `cpf_cnpj` quando PIX exige (regra atual) | — |
| **Logado — upgrade (`req.tenantId`)** | Conforme **baseline atual** do controller (ex.: `plan_id`, intervalo, `users_count` se custom) | **`password`**, campos de “novo cadastro” que o fluxo logado **nunca** enviou |

**Compatibilidade:** integrações e `MeuPlano` que hoje enviam apenas o subset logado **não** podem falhar por validação nova de senha/WhatsApp de admin.

---

## 11. Mudanças em autenticação e onboarding

| Tema | Ação |
|------|------|
| Pós-pagamento | **Login automático** obrigatório no fluxo feliz (§1.5.2); estabelecer sessão/JWT após confirmação de pagamento de forma segura. |
| Rota `/onboarding` (página antiga) | **Não** é destino pós-checkout Fase 1; não bloquear CRM. **Onboarding leve** = bloco no **dashboard** (§1.5.1). |
| `POST /api/onboarding/create-admin` | **Não** é caminho de primeira senha para usuários criados pelo novo checkout; manter só para **legado** / completar dados se ainda necessário. |
| `registration_complete` | `AuthGuard` não deve forçar `/register/steps` nem rota de onboarding **obrigatória** para quem entrou pelo checkout Fase 1. |
| Conexão WhatsApp / dados extras | Preferencialmente acionados pelos **cards** do dashboard (onboarding leve), não por wizard bloqueante. |

---

## 12. Mudanças em rotas legadas

| Rota / API | Estratégia |
|------------|------------|
| `/register` | Redirect **`301/302` → `/checkout`** (ou `/landing` com hash `#pricing`) com feature flag. |
| `RegisterOrganizationWizard` | Não acessível publicamente quando flag ligada; mensagem “Redirecionando…”. |
| `POST /api/auth/register` | Com flag `DISABLE_PUBLIC_LEGACY_REGISTER`, retornar **403/410** com mensagem e `code`; exceções apenas para clientes internos documentados. |
| `POST /api/auth/register/organization` | Idem ou redirect documentado no front apenas. |
| Links landing/login | Todos para `/checkout` ou login. |
| `/register/steps` | Continua para usuários **já** criados por legado; novos usuários checkout não devem depender disso. |

---

## 13. Preservação da lógica de pagamento

**O que não pode mudar semanticamente:**

- Ordem: resolver tenant → `subscribePlan` → gateway → URLs/PIX/boleto.
- `activatePlanFromBilling` ao **paid** (webhook + polling).
- Idempotência já existente em ativação.
- Upgrade logado: branch `req.tenantId` em `resolveTenantId`.
- **Corpo da requisição** aceito nos fluxos atuais (baseline) — ver §10.2; **retrocompatibilidade obrigatória**.

**O que pode mudar:** payload **aditivo** no modo anônimo (`password`, WhatsApp para `users.whatsapp_number`, etc.) e **momento** em que `cpf_cnpj` é enviado (sempre antes do charge PIX, como hoje). **Não** exigir novos campos no modo logado além do baseline.

**Pós `paid`:** transição para experiência do produto (**sessão + dashboard**) é responsabilidade da camada de app; **não** altera a função de ativação financeira do gateway.

---

## 14. Compatibilidade com upgrade logado

- **Obrigatório:** o mesmo **body mínimo** que hoje funciona em produção para upgrade **continua** aceito e com o mesmo comportamento (§1.5.5, §10.2).
- Testes obrigatórios: usuário com `tenant_id`, mesmo body de plano/intervalo/`users_count`, **sem** `company_name` obrigatório se hoje for opcional logado.
- **Não** exigir **`password`** no `plan-purchase` logado (não é hoje).
- Garantir que validações novas de duplicidade **não** rodem contra o **próprio** usuário do tenant ao atualizar telefone.
- Critério de aceite: regressão **zero** em `MeuPlano` / fluxos logados existentes.

---

## 15. Feature flags

| Flag | Finalidade | Default sugerido |
|------|------------|------------------|
| `CHECKOUT_V1_UNIQUE_PORTAL` | Liga nova navegação de etapas + senha + CPF só no pagamento | `false` → `true` em rollout |
| `REDIRECT_REGISTER_TO_CHECKOUT` | `/register` → `/checkout` | `false` → `true` |
| `DISABLE_PUBLIC_AUTH_REGISTER` | Bloqueia `POST /api/auth/register` público | `false` até comunicação |
| `DISABLE_PUBLIC_REGISTER_ORGANIZATION` | Bloqueia wizard API | `false` |
| `ONBOARDING_OPTIONAL_AFTER_CHECKOUT` | Remove gate duro pós-pagamento (**dashboard** primeiro, não rota onboarding obrigatória) | `true` quando checkout estável |

**Convenção:** flags lidas no backend (env) e espelhadas no front via `/api/config` ou build-time — documentar escolha no PR.

---

## 16. Plano de rollout

1. **Desenvolvimento** atrás de `CHECKOUT_V1_UNIQUE_PORTAL` em ambiente isolado.
2. **Homologação** — checklist §17 completo.
3. **Staging** com gateway sandbox; smoke de webhook + polling.
4. **Produção:** habilitar `CHECKOUT_V1_UNIQUE_PORTAL` para equipe interna → canário (%) → 100%.
5. Ativar **`REDIRECT_REGISTER_TO_CHECKOUT`** após 1–2 dias sem erro crítico.
6. **`DISABLE_PUBLIC_*`** apenas após métricas de erro e suporte alinhados.

---

## 17. Plano de rollback

| Cenário | Ação |
|---------|------|
| Regressão em `plan-purchase` | Desligar `CHECKOUT_V1_UNIQUE_PORTAL`; reverter deploy do front; backend compatível com body antigo se mantiver compat retroativa. |
| Redirect excessivo | Desligar `REDIRECT_REGISTER_TO_CHECKOUT` apenas. |
| UX pós-pagamento incorreta | Reverter front do checkout/dashboard; flag `CHECKOUT_V1_UNIQUE_PORTAL`; gate legado só se estritamente necessário (não como padrão). |

**Dados:** novos tenants criados com nova versão permanecem válidos; rollback é de **código/flag**, não de dados salvo hotfix pontual.

---

## 18. Estratégias transversais (pedido explícito)

### 18.1 O que não pode ser quebrado

- Pagamento anônimo e logado via `plan-purchase`.
- Webhook e polling ativando `activatePlanFromBilling`.
- Cálculo de valor (`calculateInvoiceAmount`) e planos custom.
- Jobs existentes (`cancelExpiredPendingBillings`, recorrência) — sem alteração nesta fase além de teste de não regressão.

### 18.2 Feature flags — resumo

Ver §15; toda mudança de rota pública atrás de flag até estabilizar.

### 18.3 Rollback — resumo

Ver §17.

### 18.4 Upgrade logado

Ver §14.

### 18.5 Eliminar dependência obrigatória do onboarding (alinhado §1.5)

- Após pagamento confirmado: **sessão automática** + redirect **`/dashboard`** — **sem** login manual no fluxo feliz.
- **Onboarding obrigatório antigo** (rota `/onboarding` como gate) **substituído** pelo **onboarding leve no dashboard** (cards §1.5.1).
- `AuthGuard`: não forçar `/onboarding` nem `/register/steps` para o novo fluxo; ajustar `registration_complete` conforme necessidade técnica única documentada no PR.

### 18.6 Perda de `location.state` no `/checkout`

**Estratégia combinada (recomendada):**

1. **`sessionStorage`** chave `checkout_plan_context` ao receber `state.plan` ou ao usuário selecionar plano — TTL session.
2. **Query opcional** `?plan=<uuid>` somente se produto aceitar expor id na URL (menos dados sensíveis).
3. Ao montar sem state e sem storage: **etapa plano** carrega `GET /api/plans` e força escolha.

Nunca depender só de `location.state` após Fase 1.

### 18.7 Unificar validação e-mail e WhatsApp

- **Backend:** funções compartilhadas chamadas por `plan-purchase` **antes** de INSERT; **persistência** do WhatsApp do admin = **`users.whatsapp_number`**, mesmo valor normalizado usado na validação (§1.5.4).
- **Frontend:** ramificação por **`code`** (§10.1); mesmas regras de formato; opcional endpoint de pré-validação alinhado ao contrato de erros.

### 18.8 Redirecionamento progressivo de `/register`

1. Semana 1: banner “cadastro mudou para /checkout”.
2. Semana 2: redirect 302 com flag.
3. Semana 3: remover rota do menu; manter redirect permanente opcional.

### 18.9 Preparação Fase 2 (trial) sem implementar

- Documentar no código (ADR curto) os pontos: onde nascerá `trial_days`, onde o tenant poderá ser `trial` sem charge — **nenhuma** dessas ramificações entra na build Fase 1.
- Opcional: coluna `plans.trial_days` **nullable**, default null — **só se** equipe quiser migração antecipada sem uso; caso contrário, **zero** migração de trial na Fase 1.

---

## 19. Riscos explícitos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Regressão `plan-purchase` / integrações | **Body antigo aceito** (§10.2); testes de contrato; branch `req.tenantId` sem novos obrigatórios. |
| Regressão upgrade logado | Casos de teste dedicados §14; **não** exigir `password` no upgrade. |
| Perda de `location.state` | §18.6. |
| WhatsApp divergente tenant vs user | Uma normalização; **`users.whatsapp_number`** = verdade; `billing_phone` alinhado se preenchido (§1.5.4). |
| Sessão pós-pagamento insegura ou token vazando | Revisão de segurança no PR; endpoint dedicado se necessário (§1.5.2). |
| Onboarding obrigatório ainda ativo | Revisão explícita `AuthGuard` / redirects; destino = **dashboard** (§1.5.1). |
| Erros tratados por texto em vez de `code` | Front obrigado a `code` §10.1; revisão de PR. |
| Legado criando tenant | Flags + monitoramento de chamadas a `auth/register`. |
| Inconsistência campos | Zod/schema alinhado ao §10.2 por modo (anônimo vs logado). |
| Trial prematuro | Code review: **nenhuma** lógica trial; PR template. |

---

## 20. Checklist de testes (homologação)

### Funcional — visitante

- [ ] Abrir `/checkout` sem state → etapa plano aparece; escolher plano e seguir.
- [ ] Ir da landing com state → etapa plano **pulada**.
- [ ] Refresh na etapa empresa → plano **não** perdido (sessionStorage).
- [ ] E-mail duplicado → bloqueio com mensagem correta.
- [ ] WhatsApp duplicado → bloqueio.
- [ ] Resumo confere com dados informados.
- [ ] PIX exige CPF/CNPJ na etapa pagamento; gera cobrança.
- [ ] Polling/webhook → tenant `active`; **sessão automática**; **sem** redirect para `/login` no fluxo feliz.
- [ ] Chegada ao **`/dashboard`** com **bloco onboarding leve** (cards WhatsApp + usuários quando aplicável).
- [ ] Rota **`/onboarding`** **não** bloqueia acesso ao CRM para o fluxo novo.

### Funcional — logado

- [ ] `MeuPlano` / upgrade → `plan-purchase` com **body baseline** aceito; comportamento igual ao atual.
- [ ] **Não** exige `password` nem campos de novo cadastro no upgrade.
- [ ] Erros de validação retornam **`code`** utilizável pelo front (§10.1).

### Regressão

- [ ] Webhook Asaas em staging.
- [ ] `cancelExpiredPendingBillings` não alterado em comportamento crítico (smoke).

### Legado (com flags)

- [ ] `/register` redireciona quando flag ligada.
- [ ] App mobile/legado (se existir) documentado ou ainda funcional com flag desligada.

---

## 21. Critérios de aceite da fase

1. **Único caminho público** acordado para nova empresa paga está documentado e implementado (checkout).
2. **Senha definitiva** no checkout; **sem** rota de onboarding **obrigatória** para primeira utilização; **dashboard** + **onboarding leve** conforme §1.5.1.
3. **Login automático** após confirmação de pagamento; **sem** login manual no fluxo feliz (§1.5.2).
4. **CPF/CNPJ** apenas na etapa de pagamento.
5. **Duplicidade** e-mail e WhatsApp validada **front + back**; erros com **`code`** mínimo §1.5.3; front trata por `code`.
6. **WhatsApp do admin** persistido em **`users.whatsapp_number`**, alinhado à validação (§1.5.4).
7. **`POST /api/plan-purchase` retrocompatível:** body antigo aceito; upgrade logado **sem** novos obrigatórios (especialmente **sem** `password`) — §10.2.
8. **Nenhuma** funcionalidade de trial nova entregue nesta release.
9. **Upgrade logado** validado sem regressão (critério explícito §7).
10. **Rollout** e **rollback** possíveis via flags sem migração destrutiva.
11. Checklist §20 executado e evidências anexadas ao release (ou ticket).

---

## 22. Próximo passo (Fase 2)

Implementar trial no checkout, expiração, retomada e flags conforme `PLANO-EXECUTIVO-TRIAL-CHECKOUT-COBRANCA-E-RETOMADA.md`, reutilizando a base de etapas e validações desta Fase 1.
