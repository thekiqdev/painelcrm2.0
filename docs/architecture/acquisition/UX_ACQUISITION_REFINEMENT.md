# UX Acquisition Refinement — IA-ready onboarding

Sprints focadas em **UX + frontend** do fluxo `/cadastro`. Não altera billing, checkout legado, acquisition engine, trial orchestration, workflows nem provisioning core.

## Arquitetura conceitual: Lead ≠ Tenant

### Problema anterior

Empresa e dados administrativos apareciam cedo demais, misturando **aquisição**, **conversão** e **onboarding**.

### Novo fluxo

```
LEAD → intenção (plano) → CONVERSÃO → ONBOARDING interno
```

| Fase | O que acontece | O que NÃO cria |
|------|----------------|----------------|
| **1. Lead** | Nome, WhatsApp, e-mail → `acquisition_lead` via `step=contact` | tenant, company, workspace |
| **2. Plano** | Escolha plano + usuários (estado local) | tenant |
| **3. Conversão** | Trial ou pagamento → `step=plan` + `step=checkout` → redirect checkout | tenant aqui no frontend; provisionamento no checkout/trial legado |
| **4. Onboarding** | Pós-ativação: empresa, logo, equipe, WhatsApp, funis (`/onboarding/kickoff` → onboarding interno) | fora do `/cadastro` |

WhatsApp é **protagonista** na captura (recovery, onboarding assistido, IA SDR futura).

### Stepper UX

**Contato → Plano → Ativar → Operação** (último passo = onboarding pós-checkout, indicativo no stepper).

### Mapeamento API (engine intacto)

| UX step | Backend |
|---------|---------|
| Lead | `POST …/signup/step` `step=contact` |
| Plano | local (+ `users_count` em `utm`) |
| Conversão | `step=plan` → `step=checkout` → `/checkout?plan=&lead=` |
| Onboarding | checkout legado → `/onboarding/kickoff` → `/onboarding` |

Metadata `utm`: `flow=lead_first_v1`, `channel_primary=whatsapp`, `conversion_mode=trial|payment`.

---

Referências: **Linear**, **Stripe**, **Vercel**, **OpenAI**, Notion AI, Attio.

- Dark-first, profundidade com `bg-[hsl(222,47%,4%)]`, bordas `white/[0.08]`, blur leve
- Gradientes suaves (primary ~8% opacity) — sem neon, glow forte ou cyberpunk
- Sensação: operação viva, SaaS escalável, IA-ready

### Layout

| Área | Desktop | Mobile |
|------|---------|--------|
| Esquerda | `OnboardingVisualPanel` — métricas animadas, gráfico, atividade, IA | Preview **compacto** acima do formulário |
| Direita | Stepper + card + CTA sticky | Spacing otimizado, CTA sempre visível |

## Etapas (stepper)

**Contato → Plano → Ativar → Operação**

| Step ID | Label UX | Backend |
|---------|----------|---------|
| `lead` | Contato | `contact` (cria lead) |
| `plan` | Plano | local |
| `conversion` | Ativar | `plan` → `checkout` |
| `onboarding` | Operação | pós-checkout (kickoff) |

## Pricing psychology

### Problema: “Sob consulta”

Reduz conversão, parece ERP fechado. **Removido do onboarding** via `getOnboardingPlanPricing()` (`onboardingPricing.ts`).

### Fonte de dados (sem hardcode)

- `GET /api/plans` — `price_cents`, `plan_type`, `billing_interval`, `interval_prices`, `trial_days`, `free_access_days`, `description`, `name`
- Mesma base que checkout: `getCheckoutListPriceCents` + `formatMoneyBRL`

### Apresentação no card

| Caso | Copy |
|------|------|
| Standard com preço | `R$ XX` + `/mês` ou `/ano` |
| Custom / per-user | `A partir de R$ XX/mês` |
| Usuário adicional | `+ R$ XX por usuário adicional` (de `interval_prices`) |
| Período inicial | Badge discreto: `Período inicial · N dias` (não “grátis” na vitrine) |

Título e subtexto: `plan.name` + `plan.description` ou fallback operacional padrão.

## Trial & activation strategy

Trial **não** é “plano grátis”. É **ativação assistida / período inicial**.

### Vitrine (plano)

- Sem destaque de trial grande
- Badge opcional discreto com dias reais do plano

### Ativação (emocional)

- Headline: **Ative seu workspace agora**
- Bloco: **Experiência inicial assistida**
- Copy: `N dias para configurar sua operação`
- Cobrança: `A cobrança inicia após N dias de uso`
- CTA: **Ativar operação**

Dias: `effectiveCheckoutTrialDays(plan)` — dados reais.

## CTAs por etapa

| Etapa | Label |
|-------|--------|
| Plano | Iniciar workspace |
| Operação | Configurar operação |
| Admin | Criar workspace |
| Ativação | Ativar operação |

Definidos em `ONBOARDING_CTA_LABELS`.

## Preview operacional (motion)

`OnboardingVisualPanel` simula operação viva:

- Status **online** (pulse)
- KPIs animados: receita mensal, leads ativos, SLA
- Mini chart (barras com variação suave)
- Feed de atividade rotativo (IA, WhatsApp, automação)
- Badges **AI Assist** / **Copilot**
- Sugestão IA estática (placeholder)

Intervalo ~3,2s — fade/slide leves, sem bounce.

## Micro UX

- Plan cards: hover glow sutil, ring no selecionado, check animado
- CTA: shadow primary, `active:scale-[0.99]`, sticky no mobile
- Stepper: glow discreto no passo ativo
- Cards: `backdrop-blur-xl`, bordas refinadas

## Design system

| Arquivo | Responsabilidade |
|---------|------------------|
| `onboardingPricing.ts` | Preço onboarding sem “Sob consulta” |
| `OnboardingPlanPicker.tsx` | Cards premium + pricing |
| `OnboardingVisualPanel.tsx` | Preview vivo + compact mobile |
| `OnboardingLayout.tsx` | Shell + preview mobile |
| `constants.ts` | Steps, headlines, CTAs |
| `OnboardingCta.tsx` | Ações primárias |

## IA-ready (sem implementação real)

Badges e copy para copilots, AI Assist, sugestões — espaço visual reservado.

## Conversão (hipóteses)

| Mudança | Efeito esperado |
|---------|-----------------|
| Preço explícito | Menos abandono por insegurança |
| Trial = ativação | Maior percepção de valor / menor “churn de curiosos” |
| Preview vivo | Confiança em produto maduro |
| CTAs orientados a workspace | Alinhamento com positioning IA/ops |

Métricas: conclusão por etapa, tempo em ativação, CTR **Ativar operação**, bounce no step Plano.

## Como validar

1. Flags acquisition ON (`signup_flow_v1`, `master_off` OFF).
2. `/cadastro` — planos mostram `R$…/mês` ou `A partir de…`, nunca “Sob consulta”.
3. Trial só na ativação com copy de período inicial.
4. Mobile: preview compacto + CTA visível.
5. Desktop: painel esquerdo animando métricas/atividade.
6. Checkout redirect inalterado após **Ativar operação**.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Plano com `price_cents = 0` e sem `interval_prices` | Exibe `R$ 0` (dado real) — revisar catálogo no admin |
| Métricas fake no preview | Label implícito de preview; não confundir com dados reais |
| Tema escuro local | Escopo `/cadastro` apenas |

## Próximos refinamentos recomendados

1. Alinhar `/teste-gratis` ao mesmo DS + pricing helper
2. Seletor de intervalo no onboarding para planos `custom` (como landing)
3. IA contextual por etapa (copy dinâmica)
4. A/B: Operação antes vs depois de Plano
5. Métricas reais no preview pós-login (substituir simulação)

## Arquivos

- `src/pages/AcquisitionSignupFlow.tsx`
- `src/components/acquisition/onboarding/*`
- `docs/architecture/acquisition/UX_ACQUISITION_REFINEMENT.md`
