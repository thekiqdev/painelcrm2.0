# Auditoria — Disponibilidade pública da Agenda (Fase 5.6)

Documento de auditoria técnica e operacional do fluxo:

`Link público → disponibilidade (GET) → seleção de slot → validação (conflicts / POST) → remarcação → Google Calendar → timeline / notificações`

**Código de referência (backend):**

- `packages/backend/src/services/appointmentAvailabilityService.ts` — resolução efetiva, geração de slots, validação de remarcação.
- `packages/backend/src/services/publicAppointmentConfirmationService.ts` — confirmação pública, remarcação, timeline, notificação interna, sync Google.
- `packages/backend/src/controllers/publicAppointmentsConfirmationController.ts` — HTTP público (sem autenticação).
- Rotas: prefixo público conforme `publicRoutes` / `appointments` públicos.

---

## 1. Fluxo resumido

| Etapa | Endpoint / ação | Responsável principal |
|-------|------------------|------------------------|
| Abrir link | `GET .../confirm/:token` (visão) | `getPublicConfirmationViewByToken` |
| Slots do dia / período | `GET .../confirm/:token/availability` | `getPublicAvailabilitySlotsForToken` |
| Pré-visualização de conflitos (opcional UI) | `GET .../confirm/:token/conflicts` | `getPublicRescheduleConflictPreview` |
| Submeter resposta | `POST .../confirm/:token` | `submitPublicConfirmationByToken` |
| Sync Google (assíncrono após remarcação) | — | `syncGoogleAfterPublicTimeChange` |
| Timeline cliente | — | `createClientTimelineEvent` |
| Notificação responsável | — | `createNotification` (`agenda_public_reschedule_done`) |

---

## 2. Cenários de disponibilidade

### 2.1 Utilizador com disponibilidade própria **ativa**

- `resolveEffectiveAvailabilitySettings(tenantId, responsible_user_id)` usa linhas em `appointment_user_availability_settings` quando `is_active = true`.
- **Esperado:** slots gerados com `timezone`, `slot_duration_minutes`, `default_meeting_duration_minutes`, `weekdays`, `work_*`, `break_*`, `min_notice_minutes`, `max_days_ahead` vindos do utilizador.

### 2.2 Utilizador com disponibilidade própria **desativada**

- Quando não há linha de utilizador ou `is_active = false`, o efetivo volta para **tenant** (`appointment_availability_settings`).

### 2.3 Fallback para empresa e defaults seguros

- Tenant ausente ou incompleto: `ensureTenantAvailabilityRow` / merges garantem valores utilizáveis (ex.: timezone e grades horárias padrão no serviço).

### 2.4 Parâmetros validados na geração de slots (`generatePublicSlots`)

| Parâmetro | Comportamento |
|-----------|----------------|
| **Timezone** | Fuso de `ResolvedAvailabilitySettings`; Luxon converte `now` local para slots em UTC nas respostas (`starts_at` / `ends_at` ISO). |
| **Duração padrão** | `default_meeting_duration_minutes` define janela `[start, end)` de cada slot. |
| **slot_duration** | Passo entre candidatos a início de slot; alinhamento no POST validado com módulo do passo. |
| **Dias permitidos** | `weekdays` (1=Seg … 7=Dom, estilo ISO no Luxon). Dias fora do conjunto não geram slots. |
| **Antecedência mínima** | `min_notice_minutes`: slot só entra se `t >= now_local + min_notice`. |
| **Máx. dias à frente** | `max_days_ahead`: itera `d = 0 … maxDay`; horários além do último dia permitido não aparecem. |

**Nota:** O GET `availability` devolve `slots` como lista plana (vários dias até limite interno `MAX_SLOTS_RETURNED`). Não há paginação por `date` no query string neste endpoint — escopo conforme implementação atual.

---

## 3. Bloqueios (`appointment_availability_blocks`)

| Cenário | Comportamento esperado |
|---------|-------------------------|
| **Empresa** (`block_scope = tenant`) | Incluídos em `loadAvailabilityBlockBusyIntervals` para o tenant; afetam todos os responsáveis. |
| **Utilizador** (`block_scope = user`, `user_id = responsável`) | Afetam só esse responsável em conjunto com bloqueios tenant. |
| **Outro utilizador** | Bloqueio `user` de **outro** `user_id` **não** entra na query (apenas tenant OU user_id do responsável). |
| **Cancelado** (`cancelled_at NOT NULL`) | Excluídos na SQL (`cancelled_at IS NULL`). |
| **Dia inteiro / parcial** | Ambos reduzem disponibilidade por sobreposição de intervalos UTC com o slot candidato. |

---

## 4. Feriados (`appointment_holidays`)

| Cenário | Comportamento |
|---------|----------------|
| **Global seed** (`scope = global`, `source = seed`) | Incluídos no conjunto de datas bloqueadas quando país coincide com `holiday_country_code` do tenant (via serviço). |
| **Tenant** | Mesmo dia pode coexistir com global; bloqueio efetivo conforme `blocks_availability` e `is_active`. |
| **Desativado** (`is_active = false`) | Não entra nas queries de bloqueio. |
| **`block_holidays = true`** (tenant) | Dias feriados ativos removem slots; cenário especial GET pode incluir `unavailable_reason: 'holiday'` e `holiday: { name }` quando não há slots e há feriado bloqueante no período avaliado. |
| **`block_holidays = false`** | Feriados não bloqueiam slots públicos (demais regras continuam válidas). |
| **POST** | `validatePublicRescheduleAgainstAvailability` pode devolver código `holiday_blocked` se o dia local for feriado bloqueante. |

**Limitação conhecida:** feriados móveis (Carnaval etc.) não são calculados automaticamente nesta versão.

---

## 5. Conflitos entre compromissos

| Regra | Implementação |
|-------|----------------|
| Mesmo responsável | `loadBusyIntervals` lista compromissos com `status <> 'cancelled'`, sobrepostos ao intervalo; **exclui** o compromisso atual (`excludeAppointmentId`) ao gerar slots e ao validar remarcação. |
| **Cancelado** | `status = 'cancelled'` não entra — não bloqueia slots. |
| **Outro responsável** | Filtro por `responsible_user_id` — não interfere. |
| **Corrida GET → POST** | A validação pré-UPDATE (`validatePublicRescheduleAgainstAvailability`) inclui ocupação de outros compromissos. Entre a validação e o commit, cenários extremos de concorrência podem, em teoria, exigir nível de isolamento adicional; na prática o fluxo serializado por token reduz o risco para um único compromisso por link. |
| **Dupla reserva no mesmo horário (outro compromisso)** | Mensagem genérica de indisponibilidade via validação (HTTP **400**, `code: validation_error` no POST quando aplicável). |

Após remarcação bem-sucedida, `GET conflicts` pode ainda reportar `has_conflict` em cenários de sobreposição informacional — o cliente público deve priorizar a mensagem da validação síncrona.

---

## 6. Remarcação pública e token

| Estado | HTTP típico | `code` |
|--------|----------------|--------|
| Token inválido | 404 | `not_found` |
| Token expirado | 410 | `token_expired` |
| Já respondido | 409 | `already_responded` |
| Compromisso não `scheduled` | 400 (availability/conflicts) ou fluxo inválido | `invalid_state` / mensagem |

**Corpo POST** (`discriminatedUnion`):

- `confirmed`, `declined`, ou `needs_reschedule` com `starts_at` + `ends_at`.

**Recorrência:** a remarcação pública atualiza o registo do compromisso (ocorrência) vinculado ao token; metadados de série podem constar na timeline. Comportamento detalhado de séries segue `appointmentsService` / regras de recorrência já existentes.

---

## 7. Google Calendar

- Com `google_event_id` e utilizador OAuth resolvível: `syncGoogleAfterPublicTimeChange` tenta atualizar o evento.
- Falha de sync: erro registado (ex.: `sync_status`, `sync_error` conforme serviço); **não** reverte a remarcação local já gravada (sync é best-effort após `COMMIT`).
- Retry: fluxos internos de retry de sync permanecem disponíveis como no restante módulo Agenda.

---

## 8. Timeline e notificações

### Timeline (`client_timeline_events`)

Eventos relevantes (quando há `client_id`):

- `agenda_public_confirmation_confirmed` / `agenda_public_confirmation_declined` (confirmação sem mudança de horário).
- `agenda_public_rescheduled` (remarcação com novos `starts_at` / `ends_at`).

### Notificações in-app

- Após remarcação com sucesso: notificação ao **responsável** (`agenda_public_reschedule_done`) com link para a agenda.

### Automações

- `handlePublicConfirmationConfirmationAutomation` (e fluxos relacionados) podem disparar regras adicionais — dependem da configuração do tenant.

---

## 9. Queries SQL (copiar/colar)

Substituir `:tenant_id`, `:responsible_user_id`, `:token`, `:appointment_id`, `:starts_at`, `:ends_at` conforme o caso.

### Configuração efetiva (fontes)

```sql
SELECT *
FROM public.appointment_availability_settings
WHERE tenant_id = :tenant_id;

SELECT *
FROM public.appointment_user_availability_settings
WHERE tenant_id = :tenant_id
  AND user_id = :responsible_user_id;
```

### Bloqueios sobre um intervalo

```sql
SELECT *
FROM public.appointment_availability_blocks
WHERE tenant_id = :tenant_id
  AND cancelled_at IS NULL
  AND starts_at < :ends_at
  AND ends_at > :starts_at
ORDER BY starts_at;
```

### Feriados ativos e bloqueantes

```sql
SELECT *
FROM public.appointment_holidays
WHERE is_active = true
  AND blocks_availability = true
  AND (
    tenant_id = :tenant_id
    OR scope = 'global'
  )
ORDER BY holiday_date;
```

### Compromisso pelo token público

```sql
SELECT
  id,
  title,
  starts_at,
  ends_at,
  responsible_user_id,
  attendance_status,
  public_confirmation_token_expires_at,
  public_confirmation_responded_at,
  public_confirmation_response,
  sync_status,
  sync_error,
  google_event_id,
  status
FROM public.appointments
WHERE public_confirmation_token = :token;
```

### Conflitos de compromissos (mesmo responsável)

```sql
SELECT id, title, starts_at, ends_at, status, responsible_user_id
FROM public.appointments
WHERE tenant_id = :tenant_id
  AND responsible_user_id = :responsible_user_id
  AND status <> 'cancelled'
  AND starts_at < :ends_at
  AND ends_at > :starts_at
ORDER BY starts_at;
```

### Timeline do compromisso

```sql
SELECT *
FROM public.client_timeline_events
WHERE reference_type = 'appointment'
  AND reference_id = :appointment_id
ORDER BY created_at DESC;
```

---

## 10. Checklist de API pública

### `GET .../confirm/:token/availability`

| Situação | HTTP | `code` (corpo) | Notas |
|----------|------|------------------|--------|
| Sucesso com slots | 200 | — | `slots`, `timezone`, `slot_duration_minutes`, etc. |
| Sem slots por feriado (cenário serviço) | 200 | — | Pode incluir `unavailable_reason: 'holiday'`, `holiday.name`, `date` |
| Lista vazia outros motivos | 200 | — | Sem `unavailable_reason` específico — dias úteis vazios, fora janela, etc. |
| Token inválido | 404 | `not_found` | |
| Token expirado | 410 | `token_expired` | |
| Já respondido | 409 | `already_responded` | |
| Estado inválido (ex.: não agendado) | 400 | `invalid_state` | Mensagem no corpo |

**Esclarecimento:** valores explícitos `unavailable_reason: weekday` ou `out_of_range` **não** são devolvidos pelo endpoint atual — a lista de slots simplesmente vem vazia ou parcial. Documentar essa lacuna na secção de riscos.

### `POST .../confirm/:token`

| Situação | HTTP | `code` sugerido |
|----------|------|------------------|
| Sucesso | 200 | `ok` implícito (`success`, `status: updated`) |
| Validação Zod / regra de negócio genérica | 400 | `validation_error` |
| Bloqueio (pausa/expediente/bloqueio manual) | 400 | `slot_blocked` |
| Feriado bloqueante | 400 | `holiday_blocked` |
| Token inválido | 404 | `not_found` |
| Expirado | 410 | `token_expired` |
| Já respondido | 409 | `already_responded` |
| Estado inválido | 400 | `invalid_state` |

Corpo de erro costuma incluir `error` e/ou `message` e `code` — clientes devem ler `code` de forma defensiva.

### `GET .../confirm/:token/conflicts`

Mesmos códigos de token/estado que availability; sucesso: `has_conflict`, `conflicts[]`.

---

## 11. Testes manuais obrigatórios (roteiro)

1. **Disponibilidade do utilizador:** ativar personalizada, expediente diferente da empresa, abrir link → slots refletem utilizador.
2. **Fallback empresa:** desativar personalizada → slots refletem empresa.
3. **Bloqueio empresa:** criar bloqueio tenant em horário X → slot some; POST direto para X → `slot_blocked` (ou validação equivalente).
4. **Bloqueio utilizador:** bloqueio no responsável → some; bloqueio noutro utilizador → não altera.
5. **Feriado:** `block_holidays` ligado, data feriado → sem slots / `holiday` quando aplicável; desligar → slots voltam se dia útil na configuração.
6. **Corrida:** ocupar slot com outro compromisso antes do POST → esperar **400** com mensagem de indisponibilidade / `validation_error` (conforme validação síncrona).
7. **Google:** compromisso com evento Google, remarcar pelo link → verificar atualização; simular falha → `sync_status` / `sync_error` sem anular horário local.

---

## 12. Riscos restantes

| Risco | Descrição |
|-------|-----------|
| **Google externo** | A disponibilidade pública **não** lê ocupação do Google Calendar do utilizador — apenas CRM + bloqueios internos + feriados. |
| **Equipas / múltiplos calendários** | Modelo atual é por responsável único do compromisso; não há “equipa” com disponibilidade agregada. |
| **Feriados móveis** | Não calculados automaticamente. |
| **Escolha de responsável pelo cliente** | O link está ligado a um compromisso já com responsável — o público não escolhe outro responsável. |
| **Capacidade por slot** | Não há limite de “vagas” por intervalo além de não sobreposição de compromissos do mesmo responsável. |
| **Dependência de dados internos** | Validação baseia-se em `appointments` + bloqueios CRM; alterações manuais na DB podem afetar consistência. |
| **Granularidade `unavailable_reason` no GET** | Apenas `holiday` é explícito quando serviço retorna esse pacote; lista vazia sem motivo para outros casos. |
| **Concorrência extrema** | Dois processos alterando a mesma janela em paralelo podem exigir isolamento transacional mais forte em evoluções futuras. |

---

## 13. Como usar esta auditoria antes do deploy

1. **Escolher um tenant de staging** e um compromisso com token válido e não expirado.
2. **Executar as queries SQL** da secção 9 para cruzar `settings` de empresa vs utilizador e listar bloqueios/feriados ativos.
3. **Percorrer o checklist da secção 11** com pelo menos um utilizador “membro” e um “admin”.
4. **Inspecionar** `client_timeline_events` e notificações após cada tipo de resposta (`confirmed`, `declined`, `needs_reschedule`).
5. **Validar** respostas HTTP da secção 10 com ferramenta tipo curl/Insomnia e comparar `code` com a tabela.
6. **Rever** a secção 12 com produto/negócio para aceitar riscos ou planejar fase seguinte.

---

*Documento gerado para a Fase 5.6 — Auditoria final da disponibilidade pública da Agenda.*
