# Investigação: `/meu-plano` como hub comercial e retomada pós-trial

**Escopo:** análise técnica e plano de evolução. **Sem implementação** nesta etapa. **Sem alteração** ao fluxo atual da Fase 2 (checkout / `resume`).

---

## 1. Resumo do estado atual de `/meu-plano`

A rota **`/meu-plano`** renderiza a página lazy `MeuPlano`, dentro de `AuthGuard` + `AppLayout` (mesmo shell do CRM). É acessível a qualquer usuário autenticado na rota; porém **a API de plano só responde para o administrador primário do tenant** (primeiro usuário criado na conta). Quem não for primary recebe **403** na API e vê estado de erro genérico na tela.

**Função atual na prática:** vitrine do **plano atual** (nome, descrição, preço exibido, benefícios), indicações simples de **status** (`active`, `payment_pending`), data de **trial** quando `plan.is_free` e `trial_ends_at`, **próxima cobrança** (`plan_period_end`) quando ativo, **seletor de usuários + intervalo** para plano **custom** com persistência via `PUT`, grade de **outros planos** com CTA para abrir o checkout, e botão para **ir ao checkout** quando `payment_pending` ou quando o tenant **não está ativo** (inclui `suspended`, etc., desde que o plano não seja gratuito).

**O que não é hoje:** central única de “pendências comerciais”, integração com **assinatura recorrente** (`/subscription`), listagem de **faturas SaaS** (`tenant_billing`), polling de **pagamento**, nem uso do **contexto de retomada** (`checkout-context`) da Fase 2.

---

## 2. Arquivos envolvidos (frontend)

| Artefato | Caminho / uso |
|----------|----------------|
| Página principal | `src/pages/MeuPlano.tsx` |
| Rota | `src/App.tsx` — `path="/meu-plano"` |
| Navegação / permissão de menu | `src/layouts/AppLayout.tsx` (`can_manage_plan` + módulo `meu_plano`), `src/landingpage/components/Navbar.tsx` |
| Módulo de permissão | `src/components/RequireModuleView.tsx` — chave `meu_plano` |
| Redirecionamentos relacionados | `src/contexts/AuthContext.tsx` (`requires_checkout_resume`, `plan_expired`), `src/pages/Dashboard.tsx` (link trial), `src/pages/PlanCheckout.tsx` (volta para `/meu-plano` em upgrade logado) |
| Pré-carregamento | `src/routePreload.ts` |

**Componentes:** a página é **monolítica** (Cards + botões do `shadcn/ui` + ícones `lucide-react`); não há subpastas dedicadas nem service layer próprio — chamadas diretas com `apiClient`.

---

## 3. Endpoints consumidos hoje por `/meu-plano`

| Método | Endpoint | Uso em `MeuPlano.tsx` |
|--------|----------|------------------------|
| `GET` | `/api/me/tenant/plan` | Plano atual, `trial_ends_at`, overrides, `tenant_status`, `plan_period_*` |
| `GET` | `/api/plans` | Catálogo público para “Outros planos” |
| `PUT` | `/api/me/tenant/plan` | Trocar `plan_id` ou atualizar `users_count` (plano custom) |

**Montagem da API no backend:** `app.use('/api/me/tenant', myTenantPlanRoutes)` em `packages/backend/src/index.ts`. O handler de plano está em `packages/backend/src/controllers/myTenantPlanController.ts` (`getMyTenantPlan`, `putMyTenantPlan`), com restrição explícita ao **primary user**.

---

## 4. Endpoints já existentes (reaproveitáveis e não usados pela página)

Estes já estão sob `/api/me/tenant` ou adjacentes e podem sustentar um hub comercial **sem reinventar** backend na primeira onda:

| Capacidade | Endpoint(s) | Observação |
|------------|-------------|------------|
| Assinatura SaaS (Billing Engine) | `GET /api/me/tenant/subscription`, `PATCH /api/me/tenant/subscription`, `POST /api/me/tenant/subscription/cancel` | `myTenantSubscriptionController.ts` — útil para “plano ativo”, próxima cobrança, cancelamento |
| Limites (usuários) | `GET /api/me/tenant/limits` | Já usado em outras telas (`tenantLimits.ts`) |
| Usuários do tenant | `GET/POST /api/me/tenant/users`, `PUT .../role` | Gestão de equipe (complementar a “contratar mais usuários”) |
| Retomada Fase 2 (pré-preenchimento checkout) | `GET /api/me/tenant/checkout-context` | Registrado fora do router de `myTenantPlan` em `index.ts`; exige auth + tenant; pensado para trial expirado / pagamento |
| Status de cobrança (polling) | `GET /api/billing/:billingId/status` | Confirmação PIX / ativação via `activatePlanFromBilling` |

**Catálogo público:** `GET /api/plans` — já usado.

**O que `/meu-plano` não consulta hoje:** `checkout-context`, `subscription`, `limits`, `billing/status`, nem qualquer listagem de faturas do tenant no painel (pode existir em outros módulos/superadmin, mas não nesta página).

---

## 5. Relação com a Fase 2 (checkout `mode=resume`)

### Comportamento atual do `resume`

Em `PlanCheckout.tsx`, com `VITE_CHECKOUT_RESUME_V1 === 'true'` e `?mode=resume`:

1. Após auth, chama **`GET /api/me/tenant/checkout-context`**.
2. Preenche plano, empresa, e-mail, WhatsApp, CPF/CNPJ, `users_count`.
3. Ativa **`resumePaymentOnly`**, força **etapa 4** (pagamento), alinhado ao desenho “só pagar”.

### Comportamento atual ao sair de `/meu-plano`

O CTA **“Ver link de pagamento” / “Assinar plano”** faz `navigate('/checkout', { state: { plan, billingInterval, usersCount } })` **sem** `mode=resume` e **sem** chamar `checkout-context`. O checkout trata isso como **upgrade / fluxo logado com plano vindo do state**, reiniciando do passo 2 (dados da empresa), salvo persistência local do wizard.

### Pode `/meu-plano` substituir o `resume` “como está”?

**Não de forma equivalente.** Só trocar o redirect de `requires_checkout_resume` de `/checkout?mode=resume` para `/meu-plano` **mantém** o CRM desbloqueado na rota permitida, mas **perde** o atalho de ir direto ao pagamento com dados já consolidados no servidor, a menos que `/meu-plano` (ou o CTA dela) **reencaminhe explicitamente** para `/checkout?mode=resume` ou replique o contrato do `checkout-context` na UI.

### Inconsistências a evitar

- **Primary vs não-primary:** só o primary consegue `GET /api/me/tenant/plan`. Trial expirado com `requires_checkout_resume` pode afetar **todos** os usuários do tenant; se apenas o primary enxergar plano, colaboradores podem cair em tela vazia ou 403.
- **Duas “fontes da verdade”:** `tenant_status` + assinatura + `tenant_billing` podem divergir na percepção do usuário se a UI só olhar `GET /plan`.
- **Rotas permitidas no `AuthContext`:** hoje `path !== '/meu-plano'` é exceção junto com `/checkout` para quem tem `requires_checkout_resume`; qualquer mudança de estratégia deve manter **pelo menos uma rota** onde o usuário conclua pagamento sem loop de redirect.

---

## 6. Gaps encontrados

1. **Sem visão unificada de pendência:** não há card de “cobrança aberta” com `billing_id`, link PIX/boleto ou polling; isso hoje mora no fluxo do **checkout** + `/api/billing/:id/status`.
2. **Trial expirado / suspenso:** a UI diferencia pouco **trial ativo**, **trial no fim**, **suspenso por trial** e **payment_pending**; textos e CTAs são genéricos (“Assinar plano”).
3. **Retomada Fase 2:** `/meu-plano` **não** integra `checkout-context`; o caminho natural para equivaler ao `resume` é um CTA “Concluir pagamento” → `/checkout?mode=resume` (ou embutir o mesmo contrato na página).
4. **Assinatura recorrente:** endpoints de `subscription` existem mas a página não mostra status de assinatura, cancelamento ou mudança de plano via `PATCH` (hoje troca de plano parcialmente via `PUT /plan` + checkout para pagamento).
5. **Faturas / histórico SaaS:** nenhuma listagem para o tenant na própria página (pode ser desejável para “gestão comercial”).
6. **Contratar mais usuários:** para plano **custom**, há stepper local + `PUT /plan`; para planos **standard**, o fluxo passa pelo **checkout** com state — não há um único padrão visual “aumentar assentos” alinhado à assinatura.
7. **Permissões de rota:** a API protege primary, mas a rota `/meu-plano` não; UX de colaborador precisa de decisão de produto (esconder menu vs página somente leitura vs mensagem orientando falar com o admin).

---

## 7. Recomendação técnica: manter `checkout resume` ou pivotar para `/meu-plano`?

**Recomendação:** **hub em `/meu-plano` + preservação do checkout como motor de pagamento** — não como “ou um ou outro”.

- O **`mode=resume`** concentra lógica sensível (dados do `checkout-context`, etapa 4, `resumePaymentOnly`) já alinhada à Fase 2.
- **`/meu-plano`** é o lugar certo para **status**, **explicação**, **CTAs múltiplos** (pagamento pendente, upgrade, usuários, método de pagamento) e para usuários que **não** devem cair direto num wizard.

**Abordagem mais segura para mudar a estratégia de redirect:**  
Manter a implementação de retomada no **checkout**, mas fazer **`/meu-plano` a porta de entrada oficial**: exibir contexto comercial e um CTA primário **“Concluir pagamento”** que navega para **`/checkout?mode=resume`** (e opcionalmente segundo CTA “Alterar plano” indo ao checkout com state ou catálogo). Assim não se reestrutura o backend do `plan-purchase` nem o contrato do `checkout-context` na primeira entrega.

Trocar o redirect global **apenas** para `/meu-plano` **sem** esse CTA explícito para `mode=resume` **degrada** a experiência de retomada (mais passos, risco de divergência de dados).

---

## 8. Plano incremental de implementação (se `/meu-plano` for o hub)

Ordem sugerida para reduzir risco e não quebrar upgrade logado nem webhooks:

### Fase A — Conteúdo e navegação (baixo risco)

1. Enriquecer `MeuPlano` com blocos textuais: trial ativo / trial encerrado / pagamento pendente / ativo, usando campos já retornados por `GET /api/me/tenant/plan` (+ opcionalmente `GET /subscription`).
2. CTA **“Concluir pagamento / Retomar assinatura”** que leva a **`/checkout?mode=resume`** quando `requires_checkout_resume` ou quando `tenant_status`/`suspension_reason` indicarem trial expirado sem pagamento (alinhado às flags da Fase 2).
3. Manter CTA atual para **`/checkout` com state** para upgrade troca de plano / payment_pending que hoje não passa pelo `resume`, avaliando caso a caso com backend.

### Fase B — Dados de pendência (médio risco)

4. Novo endpoint **somente leitura** ou extensão de `GET /api/me/tenant/plan` com: última `tenant_billing` pendente (`id`, status, valor, método) — **sem** duplicar regras de ativação já existentes em `subscriptionService` / `plan-purchase`.
5. Na UI: exibir “Cobrança em aberto” + link para retomar checkout ou abrir URL de pagamento se já existir no modelo atual.

### Fase C — Assinatura e usuários (produto)

6. Integrar `GET /api/me/tenant/subscription` para assinantes recorrentes (cancelamento, período, próxima data).
7. Alinhar “mais usuários” com `limits` + `PATCH /subscription` ou fluxo de checkout documentado, evitando dois fluxos conflitantes para o mesmo plano.

### Fase D — Permissões e colaboradores

8. Decisão de produto: ocultar `/meu-plano` para não-primary **ou** mostrar página explicativa com contato do admin **sem** chamar APIs restritas.

### Fase E — Redirect global (último passo)

9. Só então alterar `AuthContext` (e equivalentes) para preferir **`/meu-plano`** em vez de ir direto a `/checkout?mode=resume`, garantindo que **da `/meu-plano` o usuário alcance o resume em um clique**.

---

## 9. Checklist de validação (para quando houver implementação)

- [ ] Trial ativo: `/meu-plano` informa data fim; não força pagamento indevido.
- [ ] Trial expirado + Fase 2: usuário chega em `/meu-plano` (se redirect mudar) e consegue ir ao checkout **resume** sem perder contexto.
- [ ] `payment_pending`: pendência visível; conclusão ainda passa por checkout + `billing/status` / webhook.
- [ ] Upgrade logado a partir de outro plano: continua funcionando (state ou catálogo).
- [ ] Primary vs não-primary: sem 403 silencioso injusto ou com mensagem clara.
- [ ] `VITE_CHECKOUT_RESUME_V1` false: comportamento documentado (hoje já há ramo para `/meu-plano`).

---

## 10. Referências rápidas no repositório

- Página: `src/pages/MeuPlano.tsx`
- Rotas API tenant: `packages/backend/src/routes/myTenantPlanRoutes.ts`
- Plano (primary only): `packages/backend/src/controllers/myTenantPlanController.ts` (`getMyTenantPlan`, `putMyTenantPlan`)
- Assinatura: `packages/backend/src/controllers/myTenantSubscriptionController.ts`
- Checkout resume: `src/pages/PlanCheckout.tsx` (`isResumeMode`, `checkout-context`)
- Contexto retomada: `packages/backend/src/controllers/checkoutContextController.ts`
- Polling cobrança: `packages/backend/src/controllers/billingStatusController.ts`
- Redirect auth: `src/contexts/AuthContext.tsx` (linhas com `requires_checkout_resume` e `/meu-plano`)

---

*Documento gerado para apoio à decisão de produto/arquitetura; não altera código nem fluxos em produção por si só.*
