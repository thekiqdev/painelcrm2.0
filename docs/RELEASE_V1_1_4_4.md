# Atualização da Plataforma — v1.1.4.4

## Resumo

Esta versão consolida o **método de pagamento Mercado Pago (Fase 2 — OAuth e status)**, melhorias no **Chat** (realtime e otimização), o fluxo de **confirmação pública de compromissos** pelo cliente, **reagendamento** e evoluções na **Agenda** (lembretes, recorrência, presença, pós-reunião, relatórios), além de **integração Asaas** (webhook automático), **notificações** e **WhatsApp** (avatar, instâncias). Inclui documentação de apoio (auditorias, QA operacional, planos de integração).

---

## Novidades e implantações

### Novo método de pagamento — Mercado Pago (Fase 2)

- Gateway **mercado_pago** no catálogo (`payment_gateways`), com feature flag **`MERCADO_PAGO_GATEWAY_ENABLED`**.
- OAuth isolado: URLs de connect/callback, state assinado, tokens cifrados (AES-GCM), endpoints `/api/integrations/mercado-pago/*` (connect-url, callback, test, status, disconnect, availability).
- UI dedicada: **`MercadoPagoGatewaySection`** em `/settings/payments/mercado_pago`; listagem de gateways respeita a flag (sem misturar fluxo Asaas).
- Ambiente OAuth configurável: **`MERCADO_PAGO_OAUTH_ENVIRONMENT`** (padrão produção), **`MERCADO_PAGO_SANDBOX_AUTH_BASE_URL`** opcional; exibição de ambiente alinhada ao backend (sem assumir Sandbox quando `environment` é `null`).
- **Não inclui** nesta fase: criação de cobrança MP, webhook MP, alteração do domínio de pagamento principal (Asaas permanece intocado no fluxo existente).

### Fix e otimização no Chat

- Ajustes de **realtime** (eventos, diagnóstico onde aplicável) e uso mais eficiente de atualizações para reduzir carga e melhorar responsividade.
- Evoluções alinhadas ao plano de **Chat Engine** (ver `docs/CHAT_ENGINE_AUDITORIA_E_PLANO.md`).

### Confirmação de compromisso pelo cliente

- **Link público** de confirmação de presença (`PublicAppointmentConfirmation`, rotas públicas e serviço `publicAppointmentConfirmationService`).
- Notificações de **solicitação de confirmação** (preferências e motor de notificações).
- Campos e migrações associados a confirmação e automação pós-envio.

### Reagendamento

- Suporte a **alteração de data/hora** de compromissos no fluxo da Agenda (serviço, API e UI), mantendo consistência com convites e notificações quando aplicável.

### Agenda — outros itens implantados

- **Lembretes** (incl. tipo 30 min), log de lembretes e **worker** de lembretes.
- **Séries de recorrência** simples para compromissos.
- **Status de presença** (attendance) e integração com confirmação.
- **Pós-reunião / follow-up** e notificação de **compromisso concluído**.
- **Relatórios** na Agenda (`AgendaReportsView`).
- **Automação** e logs operacionais (`appointment_automation_logs`).
- Atualização de **templates WhatsApp** para compromissos e eventos de notificação por agenda.
- **Histórico e próximos compromissos** no perfil do cliente (`ClientAppointmentsHistory`, `ClientUpcomingAppointments`).

### Integração Asaas (sem alterar o fluxo de cobrança existente)

- **Provisionamento automático de webhook** por tenant (metadados e serviço de integração onde aplicável).
- Documentação: `docs/INTEGRACAO_ASAAS_AUTOMATICA_WEBHOOK.md`.

### CRM, notificações e WhatsApp

- **Avatar WhatsApp** em clientes/leads (persistência e UI).
- **Contactos de comunicação** multicanal (`communication_contacts`).
- **Instâncias WhatsApp**: cartão, sheet de detalhes, perfil de instância.
- **Notificações in-app**: sinos, preferências agrupadas, eventos de agenda no motor de notificações.
- **Realtime** no painel (`useRealtimeEvents`, `realtimeClient`, `realtimeService`) onde integrado.

### Dashboard e tenant

- Ajustes em **dashboard** e **TenantMarks** conforme métricas e marcas do tenant.

---

## Documentação nova ou atualizada

- `docs/INTEGRACAO_MERCADO_PAGO_GATEWAY_PLANO.md` — plano Mercado Pago.
- `docs/INTEGRACAO_ASAAS_AUTOMATICA_WEBHOOK.md` — webhook Asaas automático.
- `docs/AUDITORIA_MODULO_AGENDA_FASE_3_8.md` — auditoria Agenda.
- `docs/QA_OPERACIONAL_AGENDA_FASE_4_9.md` — QA operacional Agenda.
- `docs/CHAT_ENGINE_AUDITORIA_E_PLANO.md` — auditoria e plano Chat Engine.

---

## Migrações e base de dados

- Executar migrações em **`database/init`** (ordem em `packages/backend/src/migrate.ts`), incluindo ficheiros **166–180** e scripts Supabase espelhados em **`supabase/migrations`** quando o ambiente usar Supabase CLI.
- Variáveis Mercado Pago (ex.: `MERCADO_PAGO_GATEWAY_ENABLED`, credenciais OAuth, `MERCADO_PAGO_OAUTH_STATE_SECRET`, `MERCADO_PAGO_OAUTH_TOKEN_ENCRYPTION_KEY`, `MERCADO_PAGO_OAUTH_ENVIRONMENT`) devem estar definidas no **servidor** em produção.

---

## Impacto para o utilizador

- Novo gateway **Mercado Pago** visível nas configurações de pagamento quando a flag estiver ativa e após migração do catálogo.
- Clientes podem **confirmar presença** por link público.
- Agenda mais completa: **lembretes**, **recorrência**, **presença**, **relatórios** e **pós-reunião**.
- Chat mais estável e preparado para evolução realtime.
- Asaas continua operacional; melhorias focam em **configuração automática de webhook** onde implementado.

---

## Notas de deploy

1. Fazer **backup** da base de dados antes de aplicar migrações.
2. Correr **`npm run migrate:tsx`** (ou equivalente) no backend após deploy do código.
3. Reiniciar **API** e **workers** (lembretes, notificações, billing se aplicável).
4. Não commitar ficheiro **`.env`** com segredos; usar variáveis no orchestrator/CI.

---

*Branch sugerida: `deploy-v1.1.4.4`.*
