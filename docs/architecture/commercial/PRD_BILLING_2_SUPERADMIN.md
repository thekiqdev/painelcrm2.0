# PRD — BILLING 2.0 (SUPER ADMIN)

| Campo | Valor |
|-------|-------|
| **Nome** | `PRD_BILLING_2_SUPERADMIN` |
| **Versão** | 1.1 |
| **Tipo** | Product Requirements Document |
| **Prioridade** | Critical |
| **Escopo** | Super Admin SaaS (PainelCRM → clientes da plataforma) |
| **Data** | 2026-07-27 |
| **Modo** | Planejamento (sem implementação) |
| **Baseline técnica** | [`AUDIT_SUPERADMIN_BILLING_ASAAS.md`](./AUDIT_SUPERADMIN_BILLING_ASAAS.md) · [`AUDIT_BILLING2_PHASE2_ARCHITECTURE.md`](./AUDIT_BILLING2_PHASE2_ARCHITECTURE.md) |

### Histórico de alterações

| Versão | Data | Alteração |
|--------|------|-----------|
| 1.0 | 2026-07-27 | PRD inicial (seções 1–16 + apêndices A–C) |
| 1.1 | 2026-07-27 | Adendo: seções 17–23 (princípios, feature flags, MVP, não objetivos, prioridade de UI, KPIs estratégicos, governança) |

---

## Princípios de produto (não negociáveis)

1. O **PainelCRM** é o cérebro do faturamento (assinatura, preço, ciclo, policy, estados de acesso).
2. O **Asaas** (e futuros gateways) é apenas o **executor** de cobranças.
3. Billing 2.0 cobre **somente** cobrança da plataforma aos tenants — **não** CRM / customer invoices.
4. Migração **sem big-bang**: default = comportamento atual; features novas por flag / opt-in.
5. Este PRD **não** gera código, migrations nem alterações de sistema.

---

# 1. Visão Geral

### Objetivo

Criar um módulo financeiro moderno no Super Admin que automatize cobranças, recupere inadimplência e centralize a governança do faturamento SaaS, mantendo a inteligência no PainelCRM.

### Problemas que resolve

| Problema hoje | Impacto |
|---------------|---------|
| Renovação emite cobrança, mas cartão não captura sozinho | Quebra de receita silenciosa |
| Sem dunning configurável (suspender/cancelar por atraso) | Inadimplência sem ação automática |
| Pix Automático (BACEN) inexistente | Cliente precisa pagar PIX manualmente a cada ciclo |
| Settings de grace/auto-suspend pouco efetivos | Política financeira “de papel” |
| Visão financeira fragmentada (cobranças vs jobs vs gateway) | Operação lenta para Financeiro/Suporte |
| MRR de dashboard baseado em catálogo | Decisão com número errado |
| Sem trilha única de auditoria de cobrança | Dificuldade em auditorias e chargebacks |

### Benefícios

- Maior taxa de renovação (cartão tokenizado + Pix Automático opt-in).
- Menor inadimplência (Collection Policy + notificações + suspensão).
- Recuperação financeira mensurável (funil overdue → pago).
- Operação centralizada no hub Financeiro.
- Base multi-gateway sem reescrever o core.
- Compatibilidade retroativa com clientes, planos, add-ons e WhatsApp extras.

### Critérios de aceitação (visão)

- [ ] Super Admin consegue configurar Cobrança Automática sem deploy.
- [ ] Com flags OFF, renovação atual permanece idêntica.
- [ ] Pagamento confirmado via webhook reativa acesso quando aplicável.
- [ ] Toda ação automática deixa rastro auditável.

### Dependências

Auditorias Fase 1 e 2 aprovadas; gateway Asaas global; motor de renovação existente; notificações plataforma (WhatsApp/email).

### Observações

“PIX Recorrente” no produto = **Pix Automático Asaas** (débito autorizado). Diferente de “gerar PIX na renovação” (já existe).

---

# 2. Personas

| Persona | Papel | Necessidades |
|---------|-------|--------------|
| **Super Admin** | Dono da plataforma | Configurar policy, gateways, ver KPIs, suspender/reativar |
| **Financeiro** | Operação de receita | Cobranças, inadimplência, reconciliação, exportações, chargebacks |
| **Suporte** | Atendimento ao tenant | Ver status assinatura/fatura, reenviar link de pagamento, entender por que suspenso |
| **Administrador comercial** | Planos e contratos | Upgrade/downgrade, overrides, próximo vencimento |
| **Cliente da plataforma (tenant admin)** | Pagador | Pagar com pouco atrito, autorizar Pix Automático, trocar cartão, entender suspensão |

### Critérios de aceitação

- [ ] Permissões distinguem quem altera **policy** vs quem só **consulta**.
- [ ] Suporte resolve 80% dos casos sem acessar o painel Asaas.

### Dependências

RBAC Super Admin existente; tela de faturamento por cliente.

---

# 3. Fluxos do Produto

Cada fluxo: **Objetivo · Descrição · Fluxo · Regras · Critérios de aceitação · Dependências · Observações**.

---

## 3.1 Compra do plano

### Objetivo

Converter checkout em tenant ativo com assinatura SaaS e primeira cobrança liquidada.

### Descrição

Fluxo já existente; Billing 2.0 **não quebra** — apenas enriquece com audit log, policy pós-falha e (opcional) captura de token / jornada Pix Automático no primeiro pagamento.

### Fluxo

```text
Cliente
  → Checkout (plano + intervalo + método)
  → Sistema cria/reusa tenant (payment_pending | trial)
  → Cria tenant_billing + customer no gateway
  → Cria cobrança (PIX | boleto | cartão)
  → [Cartão] captura imediata
  → [PIX] exibe QR / copy-paste
  → Gateway webhook (pago)
  → Ativa plano + cria/atualiza subscription (type=saas)
  → Notifica confirmação
```

### Regras

- Valor canônico em `tenant_billing.amount_cents` (após motor de preço/overrides).
- Zero amount elegível pode ativar sem gateway.
- Só um fluxo de ativação canônico pós-`paid`.
- Métodos habilitados respeitam config global do gateway.

### Critérios de aceitação

- [ ] Pago → tenant `active` + subscription `active` + período preenchido.
- [ ] Webhook duplicado não ativa duas vezes.
- [ ] Falha de cartão permite trocar para PIX sem nova compra de plano.

### Dependências

Checkout, `subscribePlan`, webhooks payment, página `/saas-pay` quando aplicável.

### Observações

Add-ons (seats / WhatsApp) seguem fluxos próprios de cobrança; renovação agrega no ciclo.

---

## 3.2 Renovação

### Objetivo

Emitir e cobrar o próximo ciclo automaticamente conforme Collection Policy.

### Descrição

Scheduler/worker gera fatura `plan_renewal`; o gateway executa o método escolhido pela policy; webhooks atualizam billing/subscription/tenant.

### Fluxo

```text
next_billing_date chega
  → Job de renovação
  → Motor calcula valor (contrato + extras)
  → Cria tenant_billing (plan_renewal)
  → Collection Policy decide método:
       ├─ Cartão auto ON + token → captura
       ├─ PIX Recorrente ON + auth ACTIVE → Pix Automático
       ├─ Gerar PIX auto ON → PIX avulso
       └─ Fallback → boleto / link público
  → Notifica charge.created (se unpaid)
  → Webhook paid → estende período / limpa past_due
```

### Regras

- PainelCRM decide **quando** renovar e **quanto** cobrar.
- Não migrar ciclo comercial só porque o gateway gerou cobrança.
- Idempotência por `subscription_id + period_start`.
- Se cobrança falhar, policy inicia recuperação — não “fingir” pago.
- Avanço de `next_billing_date` deve ser coerente com modelo aprovado (emitido vs liquidado) — ver estados §9.

### Critérios de aceitação

- [ ] Renovação com flags OFF = comportamento atual.
- [ ] Uma fatura por ciclo (sem duplicar por reprocessamento de job).
- [ ] Notificação de cobrança chega ao tenant (WhatsApp e/ou email conforme config).

### Dependências

BillingRenewalEngine, jobs, gateway, platform notifications.

### Observações

Janela Pix Automático: instrução 2–10 dias úteis antes do vencimento.

---

## 3.3 Pagamento recusado / recuperação (dunning)

### Objetivo

Maximizar recuperação antes de suspender ou cancelar.

### Fluxo

```text
Falha (cartão / instrução Pix Auto / overdue)
  → Collection Policy
  → Tentativa N (intervalo configurado)
  → Notificações (WhatsApp / Email)
  → Gerar novo PIX (se configurado)
  → Após X dias unpaid → Suspender conta (se auto_suspend ON)
  → Após Y dias → Cancelar assinatura (policy)
  → Pagamento chega → Reativação automática (se ON)
```

### Regras

- Tentativas ≤ máximo configurado.
- Suspensão afeta **acesso do tenant**; assinatura vai para `past_due` (ou equivalente).
- Cancelamento pode ser imediato ou `cancel_at_period_end` conforme regra.
- Reativação automática só com pagamento confirmado (`paid`).
- Suporte/SA pode reativar manualmente com auditoria.

### Critérios de aceitação

- [ ] Sequência de ações respeita intervalos da policy.
- [ ] Tenant suspenso por atraso recebe motivo claro.
- [ ] Pago após suspensão reabre acesso sem intervenção, se flag ON.

### Dependências

Policy engine, notificações, status tenant/subscription, `/saas-pay`.

---

## 3.4 Pix Automático (PIX Recorrente)

### Objetivo

Débito PIX sem ação do cliente a cada ciclo, após consentimento único.

### Fluxo

```text
Flag PIX Recorrente ON + sem autorização ACTIVE
  → Na renovação/jornada: criar autorização (QR composto)
  → Cliente consente no app do banco + paga 1ª cobrança
  → Webhooks: AUTHORIZATION_ACTIVATED + PAYMENT paid
  → Persistir authorization_id
  → Ciclos seguintes: cobrança com authorization_id
  → Falha instrução → Policy (retry / PIX avulso / notificar)
  → Auth CANCELLED/EXPIRED/REFUSED → fallback PIX avulso
```

### Regras

- **Exige consentimento** — sem migração silenciosa de base instalada.
- Opt-in global e/ou por tenant.
- Sem auth ACTIVE, nunca enviar instrução recorrente.
- Liquidação sempre via webhooks de **payment**; eventos Pix Auto sincronizam auth/instrução.

### Critérios de aceitação

- [ ] Default OFF não altera nenhum cliente.
- [ ] Após auth ACTIVE, ciclo seguinte tenta débito automático.
- [ ] Cancelamento da auth no banco desliga o modo efetivo e notifica.

### Dependências

Elegibilidade conta Asaas; webhooks `PIX_AUTOMATIC_*`; capability no adapter.

### Observações

Produto deve rotular claramente “autorização no banco” para o tenant.

---

## 3.5 Cartão (tokenização + renovação)

### Objetivo

Cobrar renovações sem pedir cartão de novo; permitir troca segura.

### Fluxo

```text
Primeira cobrança cartão (checkout ou saas-pay)
  → Tokenização no gateway (quando habilitada)
  → Persistir token (sem PAN/CVV)
  → Renovação: Renovar cartão auto ON → captura com token
  → Troca de cartão: nova captura/token → substitui token
  → Falha → Policy (retry cartão → PIX → notificar → suspender)
```

### Regras

- Nunca armazenar número completo / CVV no PainelCRM.
- Token pertence ao customer do gateway; não reutilizar entre customers.
- Produção depende de tokenização habilitada no Asaas.
- Troca de cartão não gera cobrança extra salvo se produto definir “validação com valor”.

### Critérios de aceitação

- [ ] Renovação com token sucede sem UI do cliente.
- [ ] Troca de cartão atualiza método default.
- [ ] Falha registra código de recusa (sem dados sensíveis) para KPI/suporte.

### Dependências

Tokenização gateway; `payWithCreditCard`; página pública de pagamento.

---

# 4. Funcionalidades

Formato por capacidade: **Objetivo · Descrição · Regras · Critérios · Dependências · Observações**.

| Funcionalidade | Objetivo resumido | MVP? |
|----------------|-------------------|------|
| **Assinaturas** | Contrato SaaS (ciclo, valor, status, próximo vencimento) | Sim (lista SA + estados) |
| **Cobranças** | Faturas `tenant_billing` + link público | Sim (já + evolução) |
| **Renovações** | Jobs + motor | Sim (já + policy) |
| **PIX avulso** | Gerar QR na compra/renovação/recuperação | Sim (já) |
| **Pix Automático** | Débito autorizado | Pós-MVP |
| **Cartão + token** | Renovação automática | Pós-core policy |
| **Boleto** | Alternativa de método | Sim (já, se habilitado) |
| **Tentativas** | Attempts por método + retries policy | Sim |
| **Notificações** | WhatsApp + Email (Push/SMS depois) | Sim (canais atuais) |
| **Recuperação** | Dunning + ops recovery | Sim (policy) + ops |
| **Suspensão / Reativação** | Acesso vs pagamento | Sim |
| **Upgrade** | Mudança imediata com cobrança | Sim (evoluir pró-rata) |
| **Downgrade** | Efeito no próximo ciclo | Sim (formalizar) |
| **Cancelamento** | Fim de contrato | Sim |
| **Troca de plano** | Upgrade/downgrade unificado | Sim |
| **Logs** | Audit trail | Sim |
| **Webhooks** | Saúde + eventos | Sim (visão SA) |
| **Gateways** | Config executor | Sim (Asaas) |
| **KPIs** | Dashboard financeiro real | Evolutivo |

### Critérios de aceitação (módulo)

- [ ] Cada funcionalidade do MVP tem tela ou API SA correspondente ou reutiliza a existente.
- [ ] Funcionalidades pós-MVP não bloqueiam o MVP.

### Observações

Detalhamento de telas na §8; policy na §6–7.

---

# 5. Regras de Negócio

### Objetivo

Única fonte de verdade comportamental para produto, QA e engenharia.

### Catálogo de regras

| ID | Regra |
|----|-------|
| RN-01 | Renovar na `next_billing_date` da subscription `active` (ou `past_due` conforme policy de retry de ciclo). |
| RN-02 | Valor da renovação = contrato (`contracted_*` / amount) + extras elegíveis (seats, WhatsApp), não “chutar” catálogo se houver snapshot. |
| RN-03 | Se **Renovar cartão automaticamente = SIM** e houver token válido → tentar cartão primeiro. |
| RN-04 | Se cartão falhar → respeitar **máx. tentativas** e **intervalo**; depois ações pós-falha. |
| RN-05 | Se **Gerar PIX automaticamente = SIM** (e/ou ação pós-falha) → criar PIX avulso + notificar. |
| RN-06 | Se **PIX Recorrente = SIM** e auth ACTIVE → preferir Pix Automático (respeitando janela). |
| RN-07 | Se auth Pix Auto inválida → fallback imediato para PIX avulso (não deixar ciclo sem cobrança). |
| RN-08 | **Suspender** após N dias de inadimplência se `auto_suspend` / config de dias estiver ON. |
| RN-09 | **Cancelar** assinatura após M dias (ou ao fim do período se `cancel_at_period_end`). |
| RN-10 | **Reativar automaticamente** quando fatura relevante for `paid` e flag ON. |
| RN-11 | WhatsApp/Email só disparam se canal habilitado na policy **e** nas notificações plataforma. |
| RN-12 | Apenas Super Admin (papel autorizado) altera Cobrança Automática / Gateways. |
| RN-13 | Financeiro/Suporte podem consultar e executar ações manuais auditadas (reenviar link, marcar observação). |
| RN-14 | Webhooks são a fonte de liquidação; poll de reconciliação é rede de segurança. |
| RN-15 | Não duplicar cobrança do mesmo ciclo (idempotency key). |
| RN-16 | Upgrade: cobrança/ativação conforme regra comercial; downgrade de plano: efeito no **próximo ciclo** salvo exceção documentada. |
| RN-17 | Chargeback/refund → alerta SA + política de acesso (suspender opcional). |
| RN-18 | Feature flags novas default **OFF** em produção. |

### Critérios de aceitação

- [ ] QA possui checklist RN-01…RN-18.
- [ ] UI de Cobrança Automática reflete RN-03…RN-11.

### Dependências

Collection Policy; RBAC; motor de preço existente.

---

# 6. Collection Policy

### Objetivo

Interpretar eventos financeiros e disparar ações configuráveis sem hardcode de negócio no worker.

### Descrição

Arquitetura aprovada: **tabela de configuração + interpretador fixo** (não Rule Engine/Workflow na v1).

```text
Evento de domínio
  → CollectionPolicyEngine
  → Lê billing_collection_policy (global; futuro: por tenant)
  → Emite Actions tipadas
  → Executores (charge, notify, suspend, cancel, audit)
```

### Eventos de entrada (mínimo)

| Evento | Origem |
|--------|--------|
| `renewal.due` | Scheduler |
| `payment.failed` | Gateway / captura cartão |
| `payment.overdue` | Webhook / sync overdue |
| `pix_automatic.instruction_refused` | Webhook Pix Auto |
| `pix_automatic.authorization_lost` | cancel/expire/refuse |
| `payment.paid` | Webhook |
| `grace.elapsed` | Job dunning |
| `cancel.threshold_elapsed` | Job dunning |

### Ações de saída (mínimo)

`charge_card` · `create_pix` · `create_pix_automatic_instruction` · `notify_whatsapp` · `notify_email` · `suspend_tenant` · `mark_subscription_past_due` · `cancel_subscription` · `reactivate_tenant` · `write_audit_log`

### Comportamento esperado

1. Engine é **determinística**: mesmos evento + policy + contexto → mesmas actions.
2. Actions são **idempotentes** por `(entity, action, cycle_key, attempt)`.
3. Falha de uma action não apaga o audit; pode reagendar retry da action.

### Critérios de aceitação

- [ ] Alterar tentativas/intervalo na UI muda o comportamento no próximo evento sem deploy.
- [ ] Com policy “só gerar PIX + WhatsApp”, cartão não é tentado.
- [ ] `payment.paid` com reativação ON remove suspensão por atraso.

### Dependências

Persistência de policy; jobs; notificações; gateway adapter.

### Observações

`billingSettingsService` (grace / auto_suspend) deve ser absorvido ou sincronizado com esta policy.

---

# 7. Configurações — Cobrança Automática

### Objetivo

Tela única no Super Admin para parametrizar o dunning e a renovação automática.

### Wireframe textual

```text
FINANCEIRO → Cobrança Automática
────────────────────────────────────────
[ ] Renovar cartão automaticamente
[ ] Gerar PIX automaticamente
[ ] PIX Recorrente (Pix Automático)

Tentativas máximas:     [ 3 ▼ ]
Intervalo entre tentativas: [ 2 dias ▼ ]

Suspender após:   [ 10 ] dias de inadimplência
Cancelar após:    [ 30 ] dias de inadimplência

[ ] Enviar WhatsApp
[ ] Enviar Email
[ ] Gerar novo PIX após falha de cartão
[ ] Reativar automaticamente após pagamento

[ Salvar ]   [ Restaurar padrão ]
Última alteração: usuário · data · audit id
```

### Comportamento de cada configuração

| Config | Comportamento |
|--------|----------------|
| Renovar cartão automaticamente | Na renovação, tenta captura com token antes de outros métodos. |
| Gerar PIX automaticamente | Na renovação (ou como fallback), cria cobrança PIX avulsa. |
| PIX Recorrente | Habilita jornada/uso de Pix Automático quando gateway e auth permitirem. |
| Quantidade de tentativas | Limite de retries de cobrança automática no ciclo. |
| Intervalo | Dias entre retries. |
| Dias de suspensão | Após overdue contínuo ≥ N → suspender tenant (se ligado). |
| Dias de cancelamento | Após overdue contínuo ≥ M → cancelar subscription. |
| Enviar WhatsApp / Email | Liga actions de notificação na policy (ainda depende de templates/canais globais). |
| Gerar novo PIX após falha | Action explícita pós-falha de cartão/instrução. |
| Reativação automática | `paid` → tenant active + limpa past_due. |

### Regras

- Salvar exige permissão e gera audit.
- Valores inválidos (suspender > cancelar, tentativas < 1) bloqueiam save.
- Default seguro: cartão auto OFF, PIX auto ON (compatível com hoje), PIX Recorrente OFF, reativação ON.

### Critérios de aceitação

- [ ] Persona Financeiro entende cada toggle sem ler doc técnica.
- [ ] Preview textual: “Com esta config, após 2 falhas de cartão geramos PIX e enviamos WhatsApp”.

### Dependências

§6 Collection Policy; notificações plataforma.

---

# 8. Estrutura do Super Admin

### Objetivo

Hub Financeiro claro para operação e produto.

```text
Financeiro
├── Dashboard
├── Cobranças
├── Assinaturas
├── Cobrança Automática          ★ nova
├── Ciclos
├── Gateways & Métodos           (unificado)
├── Operações & Recuperação
├── Webhooks
├── Logs
├── Notificações                 (atalho)
├── Relatórios
└── Configurações
```

| Tela | Propósito |
|------|-----------|
| **Dashboard** | Saúde financeira e alertas (inadimplência, falhas, jobs). |
| **Cobranças** | Lista/filtro `tenant_billing`; abrir detalhe; link `/saas-pay`. |
| **Assinaturas** | Lista `subscriptions` SaaS; próximo vencimento; método; status; auth Pix Auto. |
| **Cobrança Automática** | Policy (§7). |
| **Ciclos** | Flags/comportamento de ciclos (já existente). |
| **Gateways & Métodos** | Asaas key, sandbox/prod, métodos habilitados, default. |
| **Operações & Recuperação** | Health jobs, reprocessar, recovery run. |
| **Webhooks** | Últimos eventos, falhas, taxa de sucesso, reprocessar se seguro. |
| **Logs** | Audit trail pesquisável/exportável. |
| **Notificações** | Templates/canais plataforma. |
| **Relatórios** | KPIs profundos / export. |
| **Configurações** | Grace técnico, feature flags, defaults. |

### Critérios de aceitação

- [ ] Hub `/superadmin/financeiro` lista todas as entradas.
- [ ] Cobrança Automática acessível em ≤ 2 cliques a partir do hub.

### Dependências

Nav/hub Super Admin; APIs existentes + novas de policy/assinaturas/logs.

---

# 9. Estados

### Objetivo

Separar claramente **acesso**, **contrato**, **fatura**, **pagamento gateway** e **jobs**.

### 9.1 Tenant (acesso)

| Estado | Significado |
|--------|-------------|
| `trial` | Período de avaliação |
| `payment_pending` | Aguardando 1º pagamento |
| `active` | Acesso liberado |
| `suspended` | Acesso bloqueado (trial expirado ou inadimplência) |

**Transições principais:** checkout → `payment_pending`/`trial`; `paid` → `active`; policy/job/admin → `suspended`; `paid`/admin → `active`.

> `REACTIVATED` **não** é estado — é evento de transição para `active`.

### 9.2 Subscription (contrato)

| Estado | Significado |
|--------|-------------|
| `active` | Contrato vigente |
| `past_due` | Em atraso (Billing 2.0 deve **passar a usar**) |
| `paused` | Pausado (uso futuro / manual) |
| `trialing` | Se aplicável |
| `cancelled` | Encerrado |

**Transições:** ativação → `active`; inadimplência → `past_due`; policy/cancel → `cancelled`; pago → `active`.

### 9.3 Billing / Payment attempt (fatura)

`pending` · `waiting_payment` · `processing` · `paid` · `overdue` · `cancelled` · `failed` · `refunded`

Anti-regressão: não voltar de `paid` para `pending`; `overdue` → `paid` permitido.

### 9.4 Payment (gateway espelho)

Status bruto do executor (`PENDING`, `RECEIVED`, `CONFIRMED`, `OVERDUE`, …) normalizado para status interno da fatura.

### 9.5 Jobs

`pending` → `processing` → `completed` | `failed` | `cancelled` (+ retries).

### Critérios de aceitação

- [ ] UI nunca mistura “PENDING do tenant” com “pending da fatura” sem label.
- [ ] Assinatura `past_due` aparece quando houver atraso real pós-Billing 2.0.
- [ ] Diagrama de estados documentado no QA.

### Observações

Homônimos são risco de UX — labels: “Conta pendente de pagamento” vs “Fatura pendente”.

---

# 10. UX

### Objetivo

Reduzir atrito do pagador e clareza para o operador.

### Experiências

| Momento | UX desejada |
|---------|-------------|
| **Primeira cobrança** | Um método em destaque; PIX com copy-paste + QR; cartão com feedback imediato de falha. |
| **Renovação** | Se automático ok → silêncio + email de recibo; se precisa ação → WhatsApp/email com link único `/saas-pay`. |
| **PIX Recorrente** | Explicar “você autoriza no banco uma vez”; mostrar status “autorizado / pendente / cancelado”. |
| **Troca de cartão** | Fluxo curto no saas-pay; confirmar últimos 4 dígitos. |
| **Pagamento recusado** | Mensagem humana + próximo passo (tentar de novo / pagar PIX). |
| **Conta suspensa** | Banner no login: motivo + botão pagar agora. |
| **Conta reativada** | Confirmação WhatsApp/email; acesso imediato. |

### Recomendações anti-atrito

1. Um link de pagamento por fatura (token estável).
2. Não exigir login para pagar fatura pública.
3. Após falha de cartão, oferecer PIX na mesma tela.
4. Evitar jargão BACEN na UI do cliente; usar “PIX automático”.
5. Super Admin: actions destrutivas com confirmação + motivo.

### Critérios de aceitação

- [ ] Tenant suspenso entende como reativar em &lt; 30 segundos de leitura.
- [ ] Suporte encontra status da assinatura em &lt; 3 cliques.

---

# 11. Notificações

### Objetivo

Comunicar cobrança e recuperação nos canais certos.

### Canais

| Canal | Fase |
|-------|------|
| WhatsApp | MVP (já existe motor plataforma) |
| Email | MVP |
| Push | Futuro |
| SMS | Futuro |
| Webhook outbound (cliente) | Futuro |

### Matriz evento → canais (MVP)

| Evento | WhatsApp | Email |
|--------|----------|-------|
| Cobrança criada / renovação | ✅ | ✅ |
| PIX gerado / regenerado | ✅ (copy-paste) | ✅ |
| Pagamento confirmado | ✅ | ✅ |
| Cobrança vencida | ✅ | ✅ |
| Falha de cartão | ✅ | ✅ |
| Autorização Pix Automático necessária | ✅ | ✅ |
| Conta suspensa | ✅ | ✅ |
| Conta reativada | ✅ | ✅ |
| Assinatura cancelada | — | ✅ |
| Chargeback | — | ✅ (SA/Financeiro) |

### Regras

- Respeitar flags globais de envio WhatsApp/email.
- Idempotência por `event + channel + billing_id`.
- Falha de envio não reverte estado financeiro; entra em retry outbound.

### Critérios de aceitação

- [ ] Renovação com WhatsApp ON gera delivery registrado.
- [ ] Template editável no Super Admin para eventos MVP.

---

# 12. Dashboard

### Objetivo

Indicadores acionáveis para receita e risco.

| Indicador | Definição de produto |
|-----------|----------------------|
| **MRR** | Soma mensalizada do valor **contratado** de assinaturas `active` (+ past_due se política contar) |
| **ARR** | MRR × 12 |
| **Receita** | Soma `paid` no período (`tenant_billing`) |
| **Inadimplência** | Estoque overdue (R$ e qtd) |
| **Renovações** | Jobs/faturas `plan_renewal` no período |
| **Falhas** | Capturas cartão / instruções Pix Auto recusadas |
| **Recuperações** | Overdue → paid após início do dunning |
| **Chargebacks** | Eventos chargeback no período |
| **PIX / Pix Automático / Cartão** | Mix de método em cobranças geradas/pagas |
| **Assinaturas** | Active / past_due / cancelled |
| **Suspensões** | Tenants suspensos por pagamento |
| **Churn** | Taxa de cancelamento no tempo (coorte) |
| **LTV** | Receita histórica média por tenant encerrado/ativo |
| **ARPU** | MRR / assinaturas ativas |

### Regras

- MRR **não** deve usar só `plans.price_cents` de catálogo.
- Cada card tem tooltip com definição.
- Alertas: inadimplência ↑, webhooks falhando, jobs stuck.

### Critérios de aceitação

- [ ] MRR bate com amostra manual de 10 assinaturas.
- [ ] Financeiro usa o dashboard sem planilha paralela para o básico.

---

# 13. Logs

### Objetivo

Trilha auditável de tudo que mexe em dinheiro ou acesso.

### Tipos de log

Criação cobrança · renovação · tentativa cartão · tentativa PIX · Pix Automático · webhook ok/inválido · suspensão · cancelamento · reativação · mudança de plano · alteração de método · mudança de policy.

### Visualização

- Tela **Logs** com filtros: tenant, billing_id, subscription_id, action, actor, período.
- Detalhe: payload sanitizado + correlation_id.
- Export CSV (Financeiro).

### Regras

- Append-only.
- Sem PAN/CVV; token só mascarado.
- Retenção mínima definida por compliance interno (ex.: 24 meses — a confirmar).

### Critérios de aceitação

- [ ] Toda suspensão automática gera log com reason + policy version.
- [ ] Export de 1 tenant em &lt; 1 min para 90 dias.

---

# 14. Segurança

### Objetivo

Integridade financeira e controle de acesso.

| Tema | Requisito |
|------|-----------|
| **Permissões** | Roles: Admin (write policy/gateway), Financeiro (read + ações manuais), Suporte (read + reenviar link) |
| **Auditoria** | Toda mutação sensível com actor |
| **Idempotência** | Webhooks e charges de ciclo |
| **Reconciliação** | L1 pending sem ref; L2 poll status gateway; alertas de divergência |
| **Duplicidade** | Unique de eventos; supersede attempts após paid |
| **Acesso** | SaaS pay token não enumera outras faturas; rate limit |
| **PCI** | Dados de cartão só no gateway / campos tokenizados |

### Critérios de aceitação

- [ ] Token inválido de webhook não processa evento.
- [ ] Usuário Suporte não altera Cobrança Automática.
- [ ] Relatório de divergência L2 disponível em Operações.

---

# 15. Escalabilidade

### Objetivo

Crescer sem reescrever o Billing Core.

| Dimensão | Como o produto escala |
|----------|------------------------|
| **Novos gateways** | Adapter + registry; core só fala `PaymentGateway` + capabilities |
| **Novos métodos** | Capability flags; policy escolhe método abstrato |
| **Novos países / moedas** | `currency` na subscription/fatura; gateway por região no futuro |
| **Novos canais de notificação** | Novos dispatchers no multi-channel |
| **Novas regras de cobrança** | Novos campos na policy / versionamento; se explodir complexidade → Rule Engine depois |
| **Volume** | Jobs + workers já separados; audit e webhooks append-only |

### Critérios de aceitação

- [ ] Documento de onboarding de gateway (checklist produto) existe antes do 2º gateway.
- [ ] Nenhuma tela de Cobrança Automática menciona “Asaas” nos labels de negócio (só em Gateways).

### Observações

Pix Automático é capability Asaas/Brasil — não bloquear cartão/Stripe futuros.

---

# 16. Roadmap Funcional

### Objetivo

Entrega incremental de valor, do mais seguro ao mais avançado.

```text
MVP — Fundação
  · Collection Policy + tela Cobrança Automática
  · Consumir grace / auto_suspend de verdade
  · past_due na subscription
  · Audit logs básicos
  · Hub Financeiro atualizado (links)

↓

Billing Core Hardening
  · Reconciliação L2 (pago no gateway × sistema)
  · Lista Assinaturas SA
  · Webhooks health
  · Correção MRR contratado no Dashboard

↓

Recovery
  · Dunning completo (retries, PIX pós-falha, suspender, cancelar)
  · Notificações de recuperação
  · Funil de recuperação no Dashboard

↓

Tokenização Cartão
  · Persistir token
  · Renovação automática cartão
  · Troca de cartão no saas-pay
  · KPI falhas de cartão

↓

Pix Automático
  · Flag PIX Recorrente
  · Jornada de autorização
  · Cobranças seguintes
  · Fallbacks + webhooks dedicados

↓

KPIs avançados
  · Churn temporal, LTV, ARPU, chargebacks, mix métodos

↓

Multi Gateway
  · 2º gateway SaaS (ex.: Stripe ou MP)
  · Capabilities por vendor

↓

Automações
  · Policy por tenant/segmento
  · Playbooks avançados (sem workflow genérico até haver necessidade)
```

### Critérios de aceitação do roadmap

- [ ] Cada etapa tem demo de valor ao Financeiro.
- [ ] Nenhuma etapa exige desligar cobrança atual.
- [ ] Pix Automático e 2º gateway não são pré-requisito do MVP.

### Dependências

Aprovação deste PRD; capacidade Asaas (tokenização / Pix Automático) alinhada comercialmente.

### Observações

Ordem cartão × Pix Automático pode inverter conforme elegibilidade Asaas e mix de clientes — produto decide na Sprint Planning mantendo o MVP intacto.

---

# 17. Princípios do Produto (não negociáveis)

### Objetivo

Definir os princípios arquiteturais e de negócio que deverão orientar toda evolução do Billing 2.0.

### Descrição

Estes princípios complementam o bloco introdutório “Princípios de produto (não negociáveis)” e vinculam produto, engenharia e QA. Em caso de conflito entre inovação e estabilidade, **vence a compatibilidade**.

### Princípios

#### 1. Compatibilidade acima de inovação

Nenhuma funcionalidade nova poderá quebrar clientes existentes.

Toda nova automação deverá possuir fallback para o fluxo atual.

#### 2. Configuração acima de programação

Sempre que possível, o comportamento do sistema deverá ser controlado por configurações do Super Admin.

Evitar regras hardcoded.

#### 3. Toda automação deve poder ser desligada

Nenhuma automação financeira poderá ser obrigatória.

Cada funcionalidade deverá possuir Feature Flag ou configuração equivalente.

#### 4. Nenhuma cobrança poderá ser perdida

Sempre deverá existir algum mecanismo de:

- reconciliação
- auditoria
- retry
- recuperação

#### 5. Toda movimentação financeira deverá ser auditável

Toda alteração deverá possuir:

- usuário
- data
- motivo
- origem
- entidade
- correlation id

#### 6. O PainelCRM continuará sendo o cérebro

Assinaturas, planos, preços, estados, Collection Policy e governança sempre permanecerão no PainelCRM.

O gateway apenas executará cobranças.

#### 7. O Billing deverá ser Multi Gateway

Nenhuma regra de negócio poderá depender exclusivamente do Asaas.

Toda lógica deverá permanecer no Billing Core.

### Fluxo

```text
Nova feature proposta
  → Respeita princípios 1–7?
  → Possui Feature Flag / fallback?
  → Possui audit + reconciliação/retry quando financeiro?
  → Pode seguir para Sprint Planning
```

### Regras

- Princípios são **obrigatórios** para qualquer incremento pós-v1.1.
- Feature sem flag de desligamento **não** entra em produção.
- Dependência hard de vendor no Billing Core é rejeitada em review de produto.

### Critérios de aceitação

- [ ] Todas as futuras funcionalidades deverão respeitar estes princípios.
- [ ] Checklist de PR/Sprint inclui verificação dos 7 princípios.
- [ ] QA valida existência de fallback quando a feature está OFF.

### Dependências

§6 Collection Policy · §14 Segurança · §15 Escalabilidade · §18 Feature Flags.

### Observações

O bloco introdutório no topo do PRD permanece válido; a §17 detalha e formaliza o mesmo espírito para governança contínua.

---

# 18. Feature Flags

### Objetivo

Centralizar todas as funcionalidades configuráveis do Billing 2.0.

### Descrição

Feature Flags (e toggles equivalentes na Cobrança Automática / Configurações) controlam ativação em produção sem deploy de emergência. Defaults privilegiam **compatibilidade** e **não surpreender** a base instalada.

### Tabela

| Feature | Valor padrão |
|----------|--------------|
| Renovação automática por cartão | OFF |
| PIX Automático | OFF |
| Gerar PIX automaticamente | ON |
| WhatsApp cobrança | ON |
| Email cobrança | ON |
| Suspensão automática | OFF |
| Cancelamento automático | OFF |
| Reativação automática | ON |
| Reconciliação automática | ON |
| Logs detalhados | ON |

### Fluxo

```text
Feature nova
  → Cadastrar flag (default seguro, em geral OFF se automação destrutiva)
  → UI Super Admin expõe toggle (quando aplicável)
  → Runtime consulta flag antes de executar
  → Audit registra mudança de flag (actor, before/after)
```

### Regras

- Toda nova funcionalidade financeira deverá possuir Feature Flag antes de ser disponibilizada em produção.
- Flags destrutivas (suspender/cancelar) default **OFF**.
- Flags de observabilidade (logs, reconciliação) default **ON**.
- Alteração de flag exige permissão adequada e gera audit (§13 / §14).
- Alinhamento com a tela Cobrança Automática (§7): toggles de policy e flags globais não podem contradizer sem documentação.

### Critérios de aceitação

- [ ] Tabela acima refletida em Configurações / Cobrança Automática / flags técnicas.
- [ ] Com “Suspensão automática = OFF”, nenhum job suspende por inadimplência.
- [ ] Com “PIX Automático = OFF”, renovação usa fluxo atual (PIX avulso quando aplicável).
- [ ] Mudança de flag aparece em Logs com actor e timestamp.

### Dependências

§7 Configurações · §17 Princípios · §19 Escopo do MVP.

### Observações

“Gerar PIX automaticamente = ON” preserva o comportamento atual de emissão de PIX na renovação. “PIX Automático” (BACEN) permanece OFF até elegibilidade e sprint dedicada.

---

# 19. Escopo do MVP

### Objetivo

Definir claramente o que pertence ao MVP do Billing 2.0.

### Descrição

O MVP entrega governança, política configurável e visibilidade operacional **sem** depender de Pix Automático, tokenização ou segundo gateway.

### Funcionalidades obrigatórias

- Collection Policy
- Cobrança Automática
- Dashboard Financeiro
- Assinaturas
- Cobranças
- Logs
- Reconciliação Financeira
- Reativação Automática
- Operações
- Health dos Webhooks

### Funcionalidades fora do MVP

- PIX Automático
- Tokenização de cartão
- Multi Gateway
- Push
- SMS
- Workflow Engine
- Rule Engine
- Cobrança Internacional

### Fluxo

```text
Item de backlog
  → Está na lista obrigatória do MVP? → elegível à sprint MVP
  → Está na lista fora do MVP? → só após revisão formal do PRD (nova versão)
```

### Regras

- Nenhuma funcionalidade fora deste escopo poderá entrar no MVP sem revisão formal do PRD.
- Itens fora do MVP podem ser preparados tecnicamente (stubs/flags OFF), mas **não** liberados como entrega de MVP.
- Roadmap (§16) permanece a visão longa; esta seção **trava** o perímetro da primeira entrega.

### Critérios de aceitação

- [ ] Demo de MVP cobre todas as funcionalidades obrigatórias.
- [ ] Nenhuma demo de MVP exige PIX Automático ou token de cartão ligado.
- [ ] Changelog do PRD registra qualquer expansão do MVP.

### Dependências

§8 Estrutura Super Admin · §16 Roadmap · §21 Prioridade das Interfaces.

### Observações

Reativação automática no MVP assume pagamento confirmado (webhook) + flag ON (default da §18).

---

# 20. Não Objetivos

### Objetivo

Definir explicitamente o que o Billing 2.0 NÃO pretende resolver.

### Descrição

Evitar escopo creep e confusão com outros domínios do PainelCRM.

### Fora de escopo

O Billing 2.0 NÃO será responsável por:

- ERP Financeiro
- Fluxo de Caixa
- Contas a Pagar
- Emissão de Nota Fiscal
- Gestão Tributária
- Financeiro do CRM dos tenants
- Customer Invoices
- Contabilidade
- Substituir o Asaas
- Substituir o Billing CRM
- Gestão bancária

Esses módulos pertencem a outros domínios do PainelCRM.

### Fluxo

```text
Pedido de feature
  → Está na lista de Não Objetivos? → recusar / redirecionar domínio
  → Caso contrário → avaliar via §19 / roadmap
```

### Regras

- Solicitações de NF-e, ERP ou caixa **não** entram no backlog do Billing 2.0 Super Admin SaaS.
- Customer Invoices e Billing CRM continuam em trilhas próprias.
- Gateway continua sendo terceirizado (Asaas hoje); o produto não “substitui” o Asaas.

### Critérios de aceitação

- [ ] Product/engineering usam esta lista em triagem de backlog.
- [ ] Apêndice A permanece consistente com estes não objetivos (complementar, não conflitante).

### Dependências

Apêndice A · Escopo do cabeçalho do PRD.

### Observações

“Não substituir o Asaas” = não construir adquirente próprio; adapters multi-gateway (§15 / pós-MVP) são permitidos sem violar este não objetivo.

---

# 21. Prioridade das Interfaces

### Objetivo

Definir a ordem oficial de desenvolvimento das telas.

### Descrição

Prioridade de UI alinha Frontend, UX e Sprint Planning ao valor do MVP e aos riscos operacionais.

### Ordem

#### Prioridade P0

- Dashboard
- Cobranças
- Assinaturas
- Cobrança Automática

#### Prioridade P1

- Operações
- Logs
- Webhooks

#### Prioridade P2

- Relatórios
- Configurações Avançadas
- KPIs Avançados

#### Prioridade P3

- Multi Gateway
- PIX Automático
- Tokenização
- Automações Avançadas

### Fluxo

```text
Sprint de UI
  → Esgotar P0 antes de iniciar P3
  → P1 pode paralelizar após esqueleto P0
  → P2/P3 só com MVP estável ou flag OFF
```

### Regras

- P0 é bloqueante para declarar MVP de interface.
- P3 não compete com P0/P1 no mesmo sprint sem exceção documentada.
- Telas já existentes (Cobranças, Dashboard parcial, Operações, Gateways) entram como **evolução** na prioridade correspondente, não como greenfield obrigatório.

### Critérios de aceitação

- [ ] Board de UX/Frontend rotula épicos com P0–P3.
- [ ] Release notes do MVP citam conclusão de P0 (+ P1 mínimo: Operações/Logs/Webhooks health).

### Dependências

§8 Estrutura do Super Admin · §19 Escopo do MVP.

### Observações

Gateways & Métodos (já existentes) suportam P0 operacionalmente; redesign multi-gateway permanece P3.

---

# 22. KPIs Estratégicos

### Objetivo

Complementar o Dashboard (§12) com indicadores de receita em risco, recuperação, conversão e adoção de produto.

### Descrição

Os KPIs abaixo **somam-se** aos já definidos na §12; não os substituem.

### Receita

| Indicador | Definição de produto |
|-----------|----------------------|
| **Receita Prevista** | Soma das cobranças geradas / a vencer no período (ciclo contratado) |
| **Receita Recuperada** | Valor que estava overdue/failed e tornou-se `paid` após início do dunning |
| **Receita Perdida** | Valor cancelado/write-off ou não recuperado após limiar de cancelamento |

### Cobrança

| Indicador | Definição de produto |
|-----------|----------------------|
| **Valor em Risco** | Estoque open + overdue ainda recuperável |
| **Tempo Médio até Pagamento** | `paid_at − created_at` (ou due) das faturas pagas |
| **Tempo Médio até Recuperação** | `paid_at − primeiro_evento_dunning` |
| **Taxa de Recuperação** | Recuperadas / (recuperáveis no período) |

### Conversão

| Indicador | Definição de produto |
|-----------|----------------------|
| **Conversão para PIX Automático** | Tenants que concluíram auth ACTIVE / elegíveis convidados |
| **Conversão para Cartão Recorrente** | Tenants com token válido e renovação cartão elegível |
| **Conversão de Upgrade** | Upgrades concluídos / iniciados (ou elegíveis) no período |

### Produto (adoção)

| Indicador | Definição de produto |
|-----------|----------------------|
| **Feature Adoption** | % de uso das automações habilitáveis por flag |
| **% cobrança automática** | Clientes sob policy de renovação automática efetiva |
| **% PIX Automático** | Clientes com autorização ACTIVE |
| **% Cartão Automático** | Clientes com renovação por cartão/token ativa |

### Fluxo

```text
Eventos financeiros + flags + estados
  → Agregação Dashboard / Relatórios
  → Tooltips com definição desta seção
```

### Regras

- KPIs de PIX Automático / Cartão Recorrente podem aparecer como “N/A” ou zero no MVP (features OFF) sem bloquear o Dashboard.
- Receita Prevista ≠ MRR; documentar diferença no tooltip.
- Mesmas regras de honestidade da §12 (contratado vs catálogo).

### Critérios de aceitação

- [ ] Definições desta seção constam nos tooltips ou doc de métricas do SA.
- [ ] Taxa de Recuperação calculável após Recovery (§16) instrumentado.
- [ ] Feature Adoption reflete flags da §18.

### Dependências

§12 Dashboard · §18 Feature Flags · instrumentação de dunning/logs.

### Observações

Prioridade de UI: KPIs avançados = P2 (§21); MVP do Dashboard cobre o subconjunto essencial da §12 + Valor em Risco / Receita Prevista quando viável.

---

# 23. Governança do PRD

### Objetivo

Definir como este documento será mantido.

### Descrição

O PRD é a fonte de verdade funcional do Billing 2.0. Sprints não inventam regras de negócio à margem do documento.

### Regras

Toda alteração funcional deverá:

- atualizar este PRD
- gerar nova versão
- manter histórico de alterações
- atualizar roadmap quando necessário

Nenhuma Sprint poderá alterar regras de negócio sem atualização prévia deste documento.

### Fluxo

```text
Proposta de mudança funcional
  → Atualizar PRD (nova versão + histórico)
  → Atualizar roadmap (§16) se escopo/ordem mudar
  → Aprovar
  → Só então abrir/ajustar Sprint
```

### Critérios de aceitação

- [ ] Cabeçalho do PRD contém versão e histórico atualizados.
- [ ] Pull requests de regra de negócio citam a versão do PRD.
- [ ] Diff do PRD acompanha a mudança de produto na mesma iniciativa.

### Dependências

Histórico de alterações (topo deste documento) · §16 Roadmap · §19 Escopo do MVP.

### Observações

Correções tipográficas sem mudança semântica podem ser patch na mesma minor (ex.: 1.1.1) a critério do product owner; mudança de regra = bump de versão documentado (1.2, 1.3, …).

---

# Apêndice A — Fora de escopo (explícito)

- Customer invoices / Billing CRM dos tenants  
- Financeiro interno do tenant para clientes finais  
- Assinatura nativa Asaas como SSOT (opcional futuro; não MVP)  
- Rule Engine / Workflow genérico  
- Push / SMS / webhook outbound na v1  

---

# Apêndice B — Glossário

| Termo | Significado |
|-------|-------------|
| **SSOT** | Single Source of Truth — PainelCRM |
| **Collection Policy** | Política configurável de cobrança/dunning |
| **PIX avulso** | Cobrança PIX tradicional com QR |
| **PIX Recorrente / Pix Automático** | Débito PIX com autorização BACEN via Asaas |
| **saas-pay** | Página pública de pagamento da fatura da plataforma |
| **past_due** | Contrato em atraso |
| **Capability** | Capacidade opcional do adapter de gateway |

---

# Apêndice C — Rastreabilidade

| Necessidade de produto | Doc técnico |
|------------------------|-------------|
| Executor vs cérebro | AUDIT Fase 1 §1–2, §12 |
| Flag Pix Automático | AUDIT Fase 2 §1 |
| Policy tabela config | AUDIT Fase 2 §5 |
| Estados | AUDIT Fase 2 §4 |
| Multi-gateway | AUDIT Fase 2 §8 |
| KPIs | AUDIT Fase 2 §10 |
| Hub SA | AUDIT Fase 2 §9 |

---

**Fim do PRD Billing 2.0 — Super Admin v1.1**

Documento pronto para UX, Frontend, Backend, Banco, QA, Roadmap e Sprint Planning.  
Qualquer alteração de escopo deve versionar este PRD (1.2+) conforme a §23 e referenciar as auditorias.
`)