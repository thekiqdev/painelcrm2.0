# QA operacional — Módulo Agenda (Fase 4.9)

Documento técnico para validação ponta a ponta do módulo **Agenda** antes de releases ou após alterações em integrações (Google, WhatsApp, motor de notificações). Separa **QA manual**, **consultas SQL** e **regressão pré-deploy**.

---

## 1. Resumo do módulo

A Agenda orquestra **compromissos** no CRM com sincronização opcional ao **Google Calendar** / **Google Meet**, notificações ao cliente via **motor de notificações** (WhatsApp), lembretes internos, confirmação pública por link, presença, remarcação, recorrência, automações (tarefas e timeline) e visão consolidada no **dashboard** e **relatórios**.

### Artefactos de dados mais relevantes

| Área | Tabelas / sistemas |
|------|---------------------|
| Núcleo da agenda | `appointments`, `appointment_recurrence_series`, `appointment_attendees` (se usado) |
| Lembretes internos (anti-duplicação) | `appointment_notifications_log` |
| Automações (idempotência por compromisso) | `appointment_automation_logs` |
| Entregas WhatsApp (motor) | `notification_outbound_deliveries`, `notification_outbound_delivery_attempts` |
| Histórico do cliente | `client_timeline_events` |
| Tarefas | `client_tasks`, `lead_tasks`, `tasks` (standalone) |
| Integração Google | `google_calendar_connections`, campos `google_*` e `sync_*` em `appointments` |
| Produto | **Dashboard**, **Relatórios** da Agenda, página pública de confirmação |

**Nota:** Os lembretes em `appointment_notifications_log` cobrem janelas **10m**, **30m** (após migração 171), **1h** e **1d** — são registos de **lembrete interno** processado pelo worker. O evento WhatsApp **`appointment.reminder`** no motor refere-se ao **lembrete ao cliente** (canal configurado), não à mesma linha de log.

---

## 2. Checklist de ambiente

### 2.1 Variáveis de ambiente (backend)

Marcar cada item após verificação (valores reais apenas em gestão de segredos, não em tickets/logs).

- [ ] `ENABLE_GOOGLE_CALENDAR=true` (se Google for usado no QA)
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `GOOGLE_REDIRECT_URI` (alinhado ao URL real do backend OAuth callback)
- [ ] `FRONTEND_URL` (e URLs públicos de confirmação, se aplicável)
- [ ] `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY`
- [ ] `AGENDA_REMINDER_POLL_MS` (default lógico ~60s; mínimo efetivo no código: 60s)
- [ ] `AGENDA_AUTOMATION_POLL_MS` (default lógico ~300s)

**Motor de notificações (`NOTIFICATIONS_ENGINE_*`)** — em produção as flags principais costumam vir do **Super Admin**; o env atua como *kill switch*:

- [ ] `NOTIFICATIONS_ENGINE_ENABLED` (não forçar `false`/`0`/`no` sem intenção)
- [ ] `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_ENABLED`
- [ ] `NOTIFICATIONS_ENGINE_WHATSAPP_SEND_ENABLED` (para envio real WhatsApp)
- [ ] `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_KEYS` (se definido: CSV de `event_key`; vazio = regras padrão)
- [ ] `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_TENANT_IDS` (piloto por tenant, opcional)
- [ ] `NOTIFICATIONS_ENGINE_WHATSAPP_MAX_SEND_ATTEMPTS`, `NOTIFICATIONS_ENGINE_RETRY_BASE_MS`, `NOTIFICATIONS_ENGINE_OUTBOUND_RETRY_POLL_MS` (opcional, tuning)
- [ ] `NOTIFICATIONS_ENGINE_VERBOSE_LOG` (apenas em ambientes controlados; ver secção *logs sem segredo*)

### 2.2 Migrações e espelho Supabase

- [ ] Scripts **`database/init`** numerados **165 a 179** aplicados na base usada pelo QA (ordem coerente com `migrate` do projeto).
- [ ] Migrações em **`supabase/migrations`** espelhadas para o mesmo estado (evitar drift entre ambientes).
- [ ] Tabelas-chave existentes: `appointments`, `appointment_recurrence_series`, `appointment_notifications_log`, `appointment_automation_logs`, colunas de confirmação pública e `attendance_status`, etc.

Referência de ficheiros init no repositório (intervalo pedido): `165` … `179` (inclui alterações não exclusivas da Agenda, ex.: 173 Asaas — ainda assim deve estar aplicado se o pacote de release incluir esse intervalo).

### 2.3 Plano, feature e permissões

- [ ] Feature **`agenda`** ativa para o plano do tenant (`plan_features` / fluxo de provisioning).
- [ ] Permissões de módulo **`agenda`** presentes em `role_module_permissions` (admin, manager, member, viewer conforme política).
- [ ] Utilizador de teste com papel conhecido (para Fluxo 10).

### 2.4 Integrações

- [ ] **WhatsApp**: instância conectada; motor com envio não bloqueado; templates/eventos de agenda ativos no catálogo.
- [ ] **Google**: conta ligada no utilizador que cria o compromisso; calendário acessível; sem quota/credencial expirada.

---

## 3. Fluxos de QA (checklist manual)

Para cada fluxo: executar no ambiente de staging (ou produção só com janela autorizada), anotar **IDs** (`appointment_id`, `tenant_id`, `client_id`, `series_id`) para as queries da secção 4.

### Fluxo 1 — Criar compromisso local

- [ ] Criar compromisso **sem** Google (`create_google_event` desligado ou equivalente na UI).
- [ ] Validar no banco: linha em `appointments`, `sync_status` coerente (ex.: `not_synced`), horários e `tenant_id` corretos.
- [ ] Validar na UI: **lista**, **semana** e **mês** mostram o mesmo compromisso e horário.

### Fluxo 2 — Criar compromisso com Google + Meet

- [ ] Criar com Google ativo e Meet (conforme opções da UI).
- [ ] Validar `google_event_id` preenchido após sync.
- [ ] Validar `google_meet_link` (e/ou `google_html_link`) quando aplicável.
- [ ] Abrir o evento no **Google Calendar** web e confirmar horário, título e link Meet.

### Fluxo 3 — Envio WhatsApp da Agenda

- [ ] Criar compromisso com envio ao cliente (convite / canal WhatsApp habilitado).
- [ ] Validar evento motor **`appointment.invited`**: entrega em `notification_outbound_deliveries` com `status` evoluindo para `sent` (ou `failed` com `error_message` compreensível).
- [ ] Validar `idempotency_key` no padrão `appointment:<uuid>:invite` (ver secção 4).

### Fluxo 4 — Lembretes

- [ ] Configurar lembretes **10m**, **30m**, **1h**, **1d** (conforme UI e `reminders_json` / preferências).
- [ ] Aguardar processamento do worker (`AGENDA_REMINDER_POLL_MS`).
- [ ] Validar **`appointment_notifications_log`**: uma linha por `(appointment_id, reminder_type)` após cada tipo disparado.
- [ ] Se **lembrete ao cliente** estiver ligado: validar entregas com `event_key = 'appointment.reminder'` e chaves `appointment:<id>:reminder:<tipo>`.

### Fluxo 5 — Confirmação pública

- [ ] Solicitar confirmação (gerar token/link público).
- [ ] Abrir **página pública** (sem sessão CRM) e submeter resposta.
- [ ] Confirmar presença (fluxo “confirmado”) e validar `attendance_status` e `public_confirmation_response` coerentes com regras de negócio.
- [ ] Opcional: testar `needs_reschedule` e `declined` nos fluxos 6 e regressão.

### Fluxo 6 — “Preciso remarcar” (`needs_reschedule`)

- [ ] Na página pública, responder **preciso remarcar**.
- [ ] Validar **badge** / indicadores na Agenda ou cliente.
- [ ] Validar **dashboard** (contadores ou listagens de remarcação, conforme implementação).
- [ ] Validar **notificação interna** (sininho / motor interno, se aplicável).
- [ ] Validar **tarefa automática** criada (ver `client_tasks` / `lead_tasks` e `appointment_automation_logs` com `automation_key = 'needs_reschedule_task_created'`).
- [ ] Validar **timeline** do cliente (`client_timeline_events` com evento coerente, ex. confirmação pública).

### Fluxo 7 — Recorrência

- [ ] Criar série **semanal**; verificar várias linhas em `appointments` com mesmo `recurrence_series_id`.
- [ ] Criar **mensal** (e/ou dia do mês conforme UI).
- [ ] Criar **dias úteis** (`recurrence_frequency = 'weekdays'` na série).
- [ ] Validar `recurrence_series_id` e `recurrence_occurrence_index` nas ocorrências.
- [ ] **Cancelar uma ocorrência** — estado da ocorrência e série permanecem coerentes.
- [ ] **Cancelar a série** — novas ocorrências não devem aparecer; ocorrências existentes conforme regra de cancelamento.

### Fluxo 8 — Conclusão e follow-up

- [ ] **Concluir** compromisso (status `done` ou ação equivalente na UI).
- [ ] Disparar / configurar **follow-up pós-reunião** (conforme módulo).
- [ ] Validar **timeline** do cliente.
- [ ] Validar **relatório** (aparece em concluídos / follow-up, conforme métricas).

### Fluxo 9 — Relatórios

- [ ] Validar **totais** e quebras por período.
- [ ] Validar **status** (agendado, concluído, cancelado).
- [ ] Validar **no-show** (onde aplicável a `attendance_status`).
- [ ] Validar **remarcações** e **recusas** (`public_confirmation_response` / campos de relatório).
- [ ] Exportar **CSV** (se existir) e conferir colunas e encoding.

### Fluxo 10 — Permissões e isolamento

- [ ] **Tenant A** não vê compromissos de **Tenant B** (API + UI).
- [ ] Utilizador **member** (ou papel com *own only*): vê apenas compromissos no seu âmbito.
- [ ] **Admin** (ou manager sem restrição): vê todos do tenant.
- [ ] Tentativa de acesso direto por ID de outro tenant deve falhar ou retornar vazio (conforme API).

---

## 4. Queries SQL (validação)

**Placeholders:** substituir `:appointment_id`, `:tenant_id`, `:client_id`, `:series_id`, `:lead_id` por UUIDs literais (ou usar `\set` no `psql`).

**RLS:** executar com papel que respeite políticas (utilizador autenticado no Supabase) ou **service role** apenas em ambiente controlado.

### 4.1 Compromisso

```sql
-- substituir :appointment_id, :tenant_id, :client_id, :series_id
select *
from appointments
where id = :appointment_id;
```

Filtro opcional por tenant:

```sql
select *
from appointments
where id = :appointment_id
  and tenant_id = :tenant_id;
```

### 4.2 Série recorrente

```sql
select *
from appointment_recurrence_series
where id = :series_id;

select id, title, starts_at, ends_at, status, recurrence_occurrence_index
from appointments
where recurrence_series_id = :series_id
order by recurrence_occurrence_index;
```

### 4.3 Logs de lembretes internos

```sql
select *
from appointment_notifications_log
where appointment_id = :appointment_id
order by sent_at desc;
```

### 4.4 Logs de automação

```sql
select *
from appointment_automation_logs
where appointment_id = :appointment_id
order by created_at desc;
```

### 4.5 Entregas WhatsApp (e outros canais do motor)

Padrão de `idempotency_key` para a Agenda inclui prefixo `appointment:<uuid>:` (ex.: `invite`, `reminder:10m`, `completed`, `confirmation_request:...`).

```sql
select event_key, status, recipient_address, idempotency_key, created_at, error_message
from notification_outbound_deliveries
where idempotency_key like 'appointment:' || :appointment_id || ':%'
order by created_at desc;
```

### 4.6 Tentativas de envio

```sql
select a.*
from notification_outbound_delivery_attempts a
join notification_outbound_deliveries d on d.id = a.delivery_id
where d.idempotency_key like 'appointment:' || :appointment_id || ':%'
order by a.created_at desc;
```

### 4.7 Timeline do cliente

```sql
select *
from client_timeline_events
where client_id = :client_id
  and reference_type = 'appointment'
order by created_at desc;
```

Se `reference_type` não estiver preenchido em alguns eventos, usar fallback por `metadata` / `event_name` conforme implementação.

### 4.8 Tarefas automáticas

```sql
select *
from client_tasks
where client_id = :client_id
order by created_at desc;

select *
from lead_tasks
where lead_id = :lead_id
order by created_at desc;
```

**`public.tasks` (tarefas standalone):** no schema base **não existe** coluna `related_type`. Para correlacionar com compromissos, usar `client_id` e/ou texto em título/descrição, ou metadados em `appointment_automation_logs` (ex.: `metadata_json->>'task_href'`).

```sql
select *
from tasks
where client_id = :client_id
order by created_at desc;

-- Heurística quando não há FK direta para o compromisso:
select *
from tasks
where title ilike '%compromisso%'
   or title ilike '%remarc%'
   or description ilike '%compromisso%'
order by created_at desc
limit 50;
```

---

## 5. Queries de diagnóstico

### 5.1 Duplicidade de envio (idempotency)

Na base saudável, `(tenant_id, idempotency_key)` é único; esta query ajuda a detetar dados inconsistentes ou bugs antigos:

```sql
select idempotency_key, count(*)
from notification_outbound_deliveries
where idempotency_key like 'appointment:%'
group by idempotency_key
having count(*) > 1;
```

### 5.2 Compromissos com erro Google

```sql
select id, title, starts_at, sync_status, sync_error
from appointments
where sync_status = 'error'
order by updated_at desc;
```

### 5.3 Compromissos pendentes de confirmação vencidos

Ajustar predicados se a regra de negócio usar `attendance_status` distinto de `pending` para “aguardando resposta”:

```sql
select id, title, starts_at, attendance_status, public_confirmation_response
from appointments
where status = 'scheduled'
  and attendance_status = 'pending'
  and starts_at < now()
order by starts_at desc;
```

### 5.4 `needs_reschedule` sem registo de automação de tarefa

```sql
select a.id, a.title, a.public_confirmation_response
from appointments a
left join appointment_automation_logs l
  on l.appointment_id = a.id
 and l.automation_key = 'needs_reschedule_task_created'
where a.public_confirmation_response = 'needs_reschedule'
  and l.id is null;
```

---

## 6. QA de UI (checklist visual)

- [ ] Agenda — **lista**
- [ ] Agenda — **semana**
- [ ] Agenda — **mês**
- [ ] **Detalhe** do compromisso
- [ ] **Modal** de criação
- [ ] **Modal** de conclusão
- [ ] **Modal** de reagendamento
- [ ] **Página pública** de confirmação (layout, erros, mobile)
- [ ] **Dashboard** (cartões / lista relacionada à Agenda)
- [ ] **Perfil do cliente** (próximos compromissos / histórico, se existir)
- [ ] **Relatórios** da Agenda
- [ ] **Mobile** (navegação, gestos, overflow de modais)

---

## 7. Regressão antes de deploy

- [ ] **Build backend** (`packages/backend`) sem erros.
- [ ] **Build frontend** (app principal) sem erros.
- [ ] **Migrações** aplicadas e versão registada; smoke test de arranque do backend.
- [ ] **OAuth Google**: fluxo completo em staging (login, refresh, criação de evento).
- [ ] **WhatsApp** conectado; pelo menos uma entrega de teste `appointment.invited`.
- [ ] **Motor de notificações**: eventos de agenda não bloqueados por flags piloto/env.
- [ ] **Permissões** e **feature** `agenda` em novo tenant de teste.
- [ ] **Isolamento por tenant** (API + RLS).
- [ ] **Logs sem segredo**: tokens, chaves API, corpo completo de mensagens com PII — mascarar ou reduzir verbosidade em produção; `NOTIFICATIONS_ENGINE_VERBOSE_LOG` desligado em prod salvo necessidade pontual.

---

## 8. Escopo desta fase (4.9)

- **Não** implementar novas features.
- **Não** alterar regras de negócio nem integrações Google/WhatsApp no código.
- **Não** adicionar ou alterar migrações como parte desta fase.
- Entrega: **documentação** (este ficheiro); correções de **copy/typo** em código são opcionais e mínimas.

---

## 9. Critérios de aceite

- [x] Documento QA criado em `/docs`.
- [x] Queries SQL prontas para copiar/colar com placeholders indicados.
- [x] Checklist cobre os fluxos 1–10 e ambiente.
- [x] Separação explícita: QA manual (fluxos + UI), SQL (validação + diagnóstico), regressão pré-deploy.
- [x] Nenhuma nova feature incluída neste entregável.

---

## 10. Como usar este checklist

1. **Preparar ambiente** (secção 2) e só então executar fluxos por ordem de dependência (ex.: WhatsApp após motor e instância OK).
2. Para cada compromisso de teste, **copiar UUIDs** e correr as queries da secção 4; usar a secção 5 se algo falhar (sync Google, duplicados, remarcação sem automação).
3. Registar falhas com **passos**, **IDs**, **timestamp** e **trecho de `error_message`** (sem dados sensíveis).
4. Antes do deploy, percorrer a secção **7** como gate mínimo.

---

*Fase 4.9 — QA operacional Agenda. Documento apenas; sem alterações de produto obrigatórias.*
