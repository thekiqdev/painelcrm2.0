# Plano: horário de recorrência por tenant

## Escopo deste documento

Investigação e plano técnico/funcional para suportar **horário configurável por tenant** em recorrência de faturas, sem implementar mudanças ainda.

Objetivo de produto: evitar geração/notificação em horários inadequados (ex.: madrugada), preservando arquitetura atual:

- `subscriptions`
- `billing_recurring_jobs`
- `billing:scheduler` (`runRecurringScheduler.ts`)
- `billing:worker` (`runRecurringWorker.ts`)
- `next_billing_date`
- gateway (Asaas) + link público (`payment_token`)

---

## 1) Arquitetura atual encontrada

## 1.1 Recorrência (billing engine)

- A primeira recorrência CRM nasce em `createRecurringManualInvoice` (`customerBillingService.ts`), que:
  - cria `subscription` (`type='customer'`);
  - cria primeira invoice;
  - vincula invoice com `subscription_id`.
- O scheduler (`enqueueRenewalJobs` em `recurringBillingJobService.ts`) busca:
  - `subscriptions.status='active'`
  - `next_billing_date <= CURRENT_DATE`
  - enfileira `billing_recurring_jobs` com `cycle_key = next_billing_date`.
- O worker (`processNextBatch`) processa jobs `pending`:
  - valida assinatura e `next_billing_date <= dbToday`;
  - cria invoice do ciclo;
  - cria cobrança no gateway;
  - avança `subscription.next_billing_date/current_period_*`.

**Conclusão:** hoje o motor é guiado por **data** (`DATE`), não por horário local do tenant.

## 1.2 Notificações de invoice hoje

- `publishInvoiceCreatedNotification` e `publishInvoicePaidNotification` são chamados diretamente em `customerInvoiceService.ts`.
- Essas publicações passam por `businessTransactionalNotifications.ts` e `notificationEngineOrchestrator.ts`.
- O envio WhatsApp tende a ocorrer **imediatamente** no fluxo transacional (não existe coluna explícita de agendamento inicial por horário local).
- Há worker de retry (`notificationOutboundRetryWorker.ts`) com `next_retry_at`, mas ele trata retry de falha, não “send window” de primeira entrega.

## 1.3 Timezone atual

- Existe `tenants.timezone` (migração `34_tenants_config.sql`).
- O motor de recorrência atual não usa `tenants.timezone` para elegibilidade.
- Vários pontos usam `CURRENT_DATE` (timezone da sessão DB), com boa consistência interna, mas sem noção de horário local por tenant.

---

## 2) Comparação de abordagens

## Abordagem A — cron global diário (ex.: 09:00)

### Vantagens
- Simples de explicar.
- Menos execuções técnicas de scheduler/worker.

### Desvantagens
- Ruim para multi-timezone: 09:00 global != 09:00 local de cada tenant.
- Picos de carga em horário único (todos tenants juntos).
- Menor resiliência: se o job diário falha, atraso de 24h.
- Menos granular para tenant com horário diferente.

**Veredito:** não é a melhor opção para produção multi-tenant.

## Abordagem B — scheduler/worker frequentes + janela por tenant

### Vantagens
- Respeita horário local por tenant.
- Mantém resiliência atual (poll curto + retries).
- Distribui carga ao longo do dia.
- Preserva arquitetura existente (`next_billing_date` + jobs).

### Desvantagens
- Exige lógica de elegibilidade por timezone no scheduler/worker.
- Demanda cuidado com jobs pendentes quando configuração muda.

**Veredito:** melhor abordagem para segurança, escalabilidade e compatibilidade.

---

## 3) Recomendação final

**Recomendo Abordagem B**: manter scheduler/worker frequentes e introduzir janela de horário por tenant.

### Regra funcional recomendada (geração)

Uma assinatura fica elegível quando:

1. `next_billing_date <= hoje_local_do_tenant`
2. `hora_local_do_tenant >= recurring_generate_time_local`

Com fallback seguro:

- se não houver configuração do tenant, usar padrão (`09:00`, `America/Sao_Paulo` ou timezone do tenant existente).

### Regra funcional recomendada (notificação)

Duas políticas possíveis por tenant:

1. **Junto com geração** (padrão inicial, menor risco).
2. **Horário separado** (evolução): `invoice_notify_time_local`.

---

## 4) Modelo de configuração sugerido (tenant)

## Campos mínimos

- `timezone` (já existe em `tenants`).
- `recurring_generate_time_local` (`TIME`, ex.: `09:00`).
- `invoice_notify_time_local` (`TIME`, opcional).
- `invoice_notify_same_as_generation` (`BOOLEAN`, default `true`).

## Onde salvar

Opção mais simples e segura: adicionar colunas em `tenants`.

Alternativa futura: tabela dedicada `tenant_billing_preferences` (se crescerem parâmetros).

---

## 5) Impacto em jobs e `next_billing_date`

## Recomendação de baixo risco

Manter `next_billing_date` como está (não migrar para `next_billing_at` nesta etapa).

## Ajustes de motor

1. **Scheduler**: filtrar candidatos por janela local do tenant (join com `tenants`).
2. **Worker (defesa em profundidade)**: revalidar janela local antes de processar.
   - Se ainda não chegou horário local: **não processar**.
   - Reagendar via `retry_at` para próxima janela elegível (em vez de cancelar definitivo).

3. Preservar idempotência atual:
   - `UNIQUE(subscription_id, cycle_key)`
   - checagem de invoice existente por período no worker.

## Observação

Migrar para `next_billing_at` aumenta precisão, mas é mudança mais invasiva. Para esta evolução, **não é necessário**.

---

## 6) Impacto em notificações

Hoje `invoice.created` é publicado no momento da criação da invoice.

Para suportar horário por tenant sem quebrar produção:

### Fase inicial (recomendada)
- manter publicação no mesmo momento da geração (se `invoice_notify_same_as_generation=true`).

### Fase evolutiva
- adicionar agendamento de primeira entrega no motor de notificações (não só retry):
  - ex.: `dispatch_not_before` em `notification_outbound_deliveries`;
  - worker processa apenas quando `dispatch_not_before <= now()`.

Isso permite separar “gerar invoice” de “notificar cliente”.

---

## 7) Impacto no gateway / Asaas

- Mudança de horário de geração **não altera** o contrato técnico de criação de cobrança.
- `due_date` continua semântica de data de vencimento (não depende da hora de geração).
- Principal risco é operacional (fila/horário), não de integração API.

**Conclusão:** compatibilidade com Asaas tende a permanecer estável com a abordagem recomendada.

---

## 8) UX proposta (Configurações > Faturas)

Seção nova em **Cobrança** (`BillingSection`) com:

1. **Timezone da recorrência**
   - select IANA (default: timezone do tenant).
2. **Horário de geração da recorrência**
   - input HH:mm.
3. **Notificação**
   - toggle: “Notificar no mesmo horário da geração”.
   - se desligado: input HH:mm para notificação.
4. Texto de ajuda:
   - “As faturas são geradas quando a data do ciclo chega e o horário local configurado é atingido.”

---

## 9) Ordem de implementação segura (proposta)

1. **Fase 0 — Observabilidade**
   - logs com `tenant_id`, `tenant_timezone`, hora local calculada, janela elegível.

2. **Fase 1 — Persistência/config**
   - migração de campos em tenant;
   - endpoint GET/PUT para preferências de recorrência (tenant self-service).

3. **Fase 2 — Motor (geração)**
   - scheduler com filtro por janela local;
   - worker com revalidação + requeue por `retry_at`.

4. **Fase 3 — UI Configurações > Faturas**
   - formulário para timezone/horários e validações.

5. **Fase 4 — Notificação separada (opcional)**
   - infraestrutura `dispatch_not_before` e processamento por janela.

6. **Fase 5 — Hardening**
   - testes de timezone (UTC-5, UTC-3, UTC+1), DST, mudança de configuração em produção.

---

## 10) Riscos e mitigação

- **Risco:** scheduler enfileirar cedo por timezone incorreto.
  - Mitigação: worker revalida sempre; fallback para timezone padrão conhecido.

- **Risco:** jobs pendentes antigos após mudança de horário.
  - Mitigação: política explícita de requeue (`retry_at`) em vez de execução imediata.

- **Risco:** inconsistência entre geração e notificação.
  - Mitigação: fasear “horário separado de notificação” após geração estável.

---

## Respostas diretas (pedido)

1. **Cron global diário às 9h faz sentido?**  
   **Não como solução principal** (multi-timezone, picos, baixa resiliência).

2. **Melhor manter scheduler/worker frequentes + horário por tenant?**  
   **Sim.** É a opção mais segura e escalável.

3. **Quais campos/configs no tenant?**  
   `timezone`, `recurring_generate_time_local`, `invoice_notify_same_as_generation`, `invoice_notify_time_local`.

4. **Como tratar timezone?**  
   Converter `now()` para horário local do tenant na elegibilidade (scheduler e worker), com fallback padrão.

5. **Como controlar notificação?**  
   Inicialmente junto com geração; evoluir para agendamento de primeira entrega por tenant.

6. **O que entra primeiro?**  
   Persistência + motor de geração por janela local; depois UX; depois separação de horário de notificação.

