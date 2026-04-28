# Auditoria Tecnica do Modulo Agenda - Fase 3.8

Data: 2026-04-28  
Escopo: estabilidade, permissoes, integracoes, notificacoes, worker, relatorios, migrations e prontidao operacional para Fase 4.

## 1) Resumo executivo

O modulo Agenda esta funcional de ponta a ponta (CRUD, Google, notificacoes WhatsApp, conclusao/follow-up e relatorios), com boa cobertura de controles por tenant e por permissao de modulo.  
Foi encontrado e corrigido um ajuste de autorizacao: o endpoint de cancelamento estava validando permissao de `edit` em vez de `delete`.

Correcao aplicada:
- `POST /api/appointments/:id/cancel` agora exige `agenda.can_delete` (com regra own-only via `delete_own_only` quando aplicavel).

Status geral:
- Estabilidade backend/frontend: **OK** (builds passando).
- Risco alto bloqueante para Fase 4: **nao identificado**.
- Riscos residuais: **monitoramento operacional e testes E2E automatizados** (ver secao 7).

## 2) Checklist de auditoria

### 2.1 Permissoes e tenant

- [x] Isolamento por tenant nos endpoints de Agenda (`tenant_id` em queries principais).
- [x] Usuario comum com escopo own-only (criador/responsavel) em listagem e detalhe.
- [x] Admin/manager com visao ampla.
- [x] `GET /api/appointments` respeita `agenda.can_view`.
- [x] `GET /api/appointments/:id` respeita `agenda.can_view` + own-only.
- [x] `POST /api/appointments` respeita `agenda.can_create`.
- [x] `PATCH /api/appointments/:id` respeita `agenda.can_edit` (+ own-only).
- [x] `POST /api/appointments/:id/complete` respeita `agenda.can_edit` (+ own-only).
- [x] `POST /api/appointments/:id/retry-sync` respeita `agenda.can_edit` (+ own-only).
- [x] `GET /api/appointments/client/:clientId` respeita `agenda.can_view` e escopo own-only.
- [x] `GET /api/appointments/reports/summary` respeita own-only para usuario nao admin/manager.
- [x] `POST /api/appointments/:id/cancel` corrigido para respeitar `agenda.can_delete` (+ own-only).

### 2.2 Google Agenda e Meet

- [x] Fluxo de conexao OAuth presente e consistente.
- [x] Refresh de token implementado (`refreshTokenIfNeeded`).
- [x] Criacao de evento grava `google_event_id` em sucesso.
- [x] Criacao de Meet retorna e persiste link quando habilitado.
- [x] Edicao atualiza evento no Google quando sincronizado.
- [x] Cancelamento tenta refletir no Google sem quebrar cancelamento local.
- [x] Falha Google nao bloqueia criacao local (usa `sync_status='error'`).
- [x] `retry-sync` permite recuperar itens com `error/not_synced`.
- [x] Nao ha exposicao direta de tokens em resposta HTTP.

### 2.3 Motor de notificacoes (Agenda)

- [x] Eventos cobertos: `appointment.invited`, `appointment.reminder`, `appointment.completed`.
- [x] Allowlist/env com permissao explicita para eventos da Agenda.
- [x] Preferencias por tenant sao respeitadas no orquestrador (skip controlado).
- [x] Idempotency keys implementadas para convite/lembretes/conclusao.
- [x] Diagnostico de skip/falha com motivos padronizados e sem segredos.
- [x] Comportamento sem telefone e sem remetente WhatsApp tratado.

### 2.4 Worker de lembretes

- [x] Janelas de lembrete: 10m, 30m, 60m, 1 dia.
- [x] Nao envia lembrete nao selecionado.
- [x] Nao duplica interno (`appointment_notifications_log` com conflito unico).
- [x] Envio ao cliente independe de sucesso da notificacao interna.
- [x] Tipo de 1 dia alinhado para outbound com `1440m`.

### 2.5 UI/UX (auditoria de consistencia)

- [x] Texto de WhatsApp atualizado (sem "fase futura").
- [x] Modal com 10m/30m/1h/1d.
- [x] Abas Calendario/Relatorios presentes.
- [x] Estados de erro/vazio e feedbacks presentes nos fluxos principais.
- [x] Perfil do cliente com secoes de proximos/historico de compromissos.

### 2.6 Relatorios

- [x] Metricas agregadas: total, scheduled, done, cancelled, no_show, follow_ups_created, completion_rate.
- [x] Quebras por responsavel, tipo e outcome.
- [x] Exportacao CSV implementada.
- [x] Escopo own-only aplicado para usuarios nao admin/manager.

### 2.7 Banco e migrations

- [x] `migrate.ts` contem 165 a 171.
- [x] Migrations SQL em `database/init` presentes (165..171).
- [x] Espelho em `supabase/migrations` presente para o mesmo conjunto funcional.
- [x] Constraint de reminder_type contempla `30m`/`60m` e legado.

## 3) Problemas encontrados

1. **Autorizacao de cancelamento desalinhada**
   - Sintoma: endpoint de cancelamento exigia permissao de edicao.
   - Risco: usuario com perfil sem exclusao poderia cancelar compromisso.
   - Correcao: troca para validacao de permissao `delete` no controller.

## 4) Correcoes aplicadas

- Arquivo alterado: `packages/backend/src/controllers/appointmentsController.ts`
  - Ajuste no `postAppointmentCancelHandler`: `assertModulePermission(..., 'delete', ...)`.

## 5) Validacao operacional sugerida (passo a passo)

Fluxo minimo recomendado em homologacao:

1. Conectar Google.
2. Criar compromisso local.
3. Criar compromisso com Google + Meet.
4. Criar compromisso com WhatsApp ao cliente.
5. Editar horario.
6. Cancelar.
7. Retentar sync.
8. Concluir com outcome.
9. Criar follow-up.
10. Validar perfil do cliente.
11. Validar dashboard.
12. Validar relatorio.
13. Validar `notification_outbound_deliveries`.

Consultas SQL de apoio:

```sql
select id, send_reminder_to_client, reminders_json, sync_status, sync_error
from appointments
where id = '<appointment_id>';
```

```sql
select event_key, status, recipient_address, idempotency_key, created_at, error_message
from notification_outbound_deliveries
where idempotency_key like 'appointment:<appointment_id>:%'
order by created_at desc;
```

## 6) Evidencias tecnicas desta fase

- Build frontend: `npm run build` (raiz) -> **OK**
- Build backend: `npm run build` (`packages/backend`) -> **OK**
- Revisao de codigo em:
  - rotas/controllers de Agenda;
  - service de Agenda;
  - integracao Google;
  - motor de notificacoes (Agenda);
  - worker de lembretes;
  - relatorios;
  - migrations 165..171.

## 7) Riscos restantes e recomendacoes para Fase 4

Riscos residuais:
- Ausencia de suite E2E automatizada cobrindo todo fluxo Agenda + Google + notificacoes.
- Dependencia de configuracao externa (Google OAuth, instancia WhatsApp, flags/env).

Recomendacoes para Fase 4:
- Criar testes E2E para os 13 passos operacionais (especialmente retry-sync e idempotencia).
- Adicionar painel interno de diagnostico para sync Google (falhas por categoria).
- Monitorar taxa de `notification_disabled_by_tenant`, `missing_whatsapp_sender` e `whatsapp_dispatch_failed`.
- Definir alerta operacional para backlog de reminders e falhas repetidas de dispatch.
- Padronizar testes de permissao por papel (admin/manager/member/viewer + own-only).

