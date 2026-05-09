# Fase 1 — Auditoria técnica do Dashboard Super Admin (V2)

## Escopo desta auditoria

- Objetivo: mapear estrutura atual, métricas existentes e reaproveitamento para evolução do dashboard.
- Não inclui implementação de endpoint novo nem mudanças de regra de negócio.
- Foco em: frontend atual, backend atual, queries existentes, serviços reutilizáveis, lacunas e riscos.

---

## 1) Estrutura atual encontrada

## Frontend (estado atual)

- Página atual: `src/pages/superadmin/SuperAdminDashboard.tsx`.
- Endpoint consumido: `GET /api/superadmin/dashboard`.
- Conteúdo renderizado hoje:
  - 4 cards simples: planos, empresas, empresas ativas, usuários;
  - 2 listas: últimas empresas e últimos usuários.
- Gráficos no dashboard atual: **não há**.
- Hook/serviço dedicado para dashboard: **não há serviço específico**; consumo direto via `apiClient.get(...)` na própria página.

## Backend (estado atual)

- Rota principal: `GET /api/superadmin/dashboard` em `packages/backend/src/routes/superadminRoutes.ts`.
- Handler atual: `packages/backend/src/controllers/superadminController.ts` (`getDashboard`).
- Queries atuais do dashboard:
  - `COUNT(*)` em `plans`, `tenants`, `users`;
  - `COUNT(*)` em `tenants WHERE status='active'`;
  - lista de `recent_tenants` com join em `plans`;
  - lista de `recent_users` com left join em `tenants`.

## Endpoints relacionados (reutilizáveis)

- Financeiro/cobrança:
  - `GET /api/superadmin/platform-billings`;
  - `GET /api/superadmin/platform-billings/:id`;
  - `GET /api/superadmin/billing/subscriptions`;
  - `GET /api/superadmin/billing/upcoming`;
  - `GET /api/superadmin/billing/recurring-jobs`;
  - `GET /api/superadmin/billing/jobs-failed`.
- Comercial/relatórios:
  - `GET /api/superadmin/reports`.
- Operacional:
  - `GET /api/superadmin/payment-gateways/status`;
  - `GET /api/superadmin/smtp-settings`;
  - `GET /api/superadmin/platform-whatsapp/instances`;
  - `GET /api/superadmin/notifications-engine/summary`;
  - `GET /api/superadmin/platform-notifications/deliveries`.

---

## 2) Métricas já disponíveis

## Receita e billing

- `tenant_billing`:
  - campos úteis: `amount_cents`, `status`, `due_date`, `paid_at`, `created_at`, `gateway`, `tenant_id`, `plan_id`;
  - status observados no sistema: `pending`, `paid`, `overdue`, `cancelled`, `waiting_payment`, `processing`.
- `subscriptions`:
  - campos úteis: `status`, `amount_cents`, `billing_interval`, `next_billing_date`, `current_period_*`, `cancel_at_period_end`;
  - status observados: `active`, `trialing`, `cancelled`, `past_due`, `paused`.
- `billing_recurring_jobs`:
  - resumo operacional pronto por status (`pending`, `processing`, `completed`, `failed`, `cancelled`) via `billingRecurringJobsOpsService`.

## Tenants/assinaturas

- `tenants.status` (base real de operação):
  - `active`, `trial`, `payment_pending`, `suspended`.
- `tenants.trial_ends_at` disponível para alertas de trial vencendo.
- `tenants.plan_id` e join em `plans` para composição de adoção/receita estimada.

## Crescimento

- Empresas: `tenants.created_at`.
- Usuários: `users.created_at`.
- Receita recebida por período: `tenant_billing.status='paid'` + `paid_at`/`created_at` (definir semântica única no endpoint).

## Operacional/saúde

- Gateway status: pronto via `paymentGatewayConfigController.getPaymentGatewaysStatus`.
- SMTP status/config: pronto via `smtpSuperadminSettingsController.getSmtpSuperadminSettingsHandler`.
- WhatsApp plataforma: pronto via `superadminPlatformWhatsAppController.listInstances`.
- Notificações:
  - resumo de entregas do motor de notificações;
  - listagem recente de deliveries de notificações da plataforma.

---

## 3) Queries reaproveitáveis

## Já existentes e úteis

- `superadminController.getDashboard`:
  - contagens globais e listas recentes (preservar em modo compatível).
- `reportsController.getReports`:
  - adoção por plano (ativos por plano);
  - receita estimada por plano;
  - contagem por status de tenant.
- `superadminPlatformBillingsService.listSuperadminPlatformBillings`:
  - filtros por status/tenant/período com joins de tenant/plano.
- `superadminBillingController.getBillingSubscriptions`:
  - base de assinaturas com dados de tenant/plano.
- `billingRecurringJobsOpsService.getBillingRecurringJobsStatusSummary`:
  - resumo de jobs recorrentes para saúde operacional.

## Agregações faltantes (ainda não centralizadas)

- MRR consolidado por período (snapshot vs mês anterior).
- Receita mensal recebida comparativa (mês atual vs anterior).
- Série temporal única para crescimento (`7d`, `30d`, `12m`) com granularidade controlada.
- Indicador consolidado de inadimplência (contagem de tenants + valor em aberto vencido).

---

## 4) Serviços reaproveitáveis

- `superadminPlatformBillingsService`:
  - excelente para bloco de "últimos pagamentos/cobranças" e distribuição por status.
- `billingRecurringJobsOpsService`:
  - base de health de recorrência.
- `financialReportsService` / `financialSummaryService`:
  - trazem padrões de agregação financeira já maduros (hoje tenant-scoped, mas úteis como referência de modelagem).
- `superadminNotificationsService`:
  - já trata alerta de trial próximo (`checkAndNotifyTrialEnding`).
- Controllers de operação:
  - `paymentGatewayConfigController`, `smtpSuperadminSettingsController`, `superadminPlatformWhatsAppController`,
    `superadminNotificationsEngineController`, `superadminPlatformNotificationsController`.

---

## 5) O que falta implementar (somente mapeamento)

- Endpoint consolidado superadmin com blocos agregados em uma chamada:
  - financeiro;
  - assinaturas;
  - crescimento;
  - operacional;
  - alertas.
- Padronização de semântica de métricas:
  - MRR (assinaturas) vs receita recebida (cobranças pagas).
- Série temporal unificada para gráficos com filtros de período.
- Definição de regras de alerta no backend (sem fake):
  - thresholds objetivos e derivados de dados reais.

---

## 6) Sugestão do payload consolidado

```json
{
  "financial": {
    "mrr": { "current_cents": 0, "previous_cents": 0, "change_pct": 0 },
    "revenue_received_month": { "current_cents": 0, "previous_cents": 0, "change_pct": 0 },
    "billing_by_status": { "paid_cents": 0, "pending_cents": 0, "overdue_cents": 0, "cancelled_cents": 0 },
    "delinquency": { "tenants_count": 0, "amount_cents": 0 }
  },
  "subscriptions": {
    "tenants_by_status": { "active": 0, "trial": 0, "payment_pending": 0, "suspended": 0 },
    "subscriptions_by_status": { "active": 0, "trialing": 0, "past_due": 0, "cancelled": 0, "paused": 0 },
    "trials_expiring_7d": 0,
    "cancellations_period": 0
  },
  "growth": {
    "period": "30d",
    "granularity": "day",
    "series": {
      "tenants_created": [],
      "users_created": [],
      "revenue_paid": []
    }
  },
  "operational": {
    "gateway": {},
    "smtp": {},
    "whatsapp": {},
    "recurring_jobs": {},
    "notifications_engine": {}
  },
  "alerts": [],
  "legacy": {
    "totals": {},
    "recent_tenants": [],
    "recent_users": []
  }
}
```

Notas:
- manter `legacy` durante transição para não quebrar dashboard atual;
- frontend passa a migrar por blocos (sem big-bang).

---

## 7) Riscos e performance

- Risco de query pesada ao juntar múltiplos KPIs com tabelas grandes:
  - mitigar com agregação por bloco e CTEs;
  - evitar N+1 em loops de tenants.
- Risco de divergência semântica entre fontes (subscriptions vs tenant_billing):
  - documentar no contrato do endpoint.
- Risco de regressão visual/funcional:
  - manter rota atual e payload compatível (`legacy`) até migração total.
- Risco de latência:
  - considerar cache curto (30-60s) para blocos agregados não críticos.

---

## 8) Plano incremental

## Fase 2 — Backend consolidado

- Expandir `GET /api/superadmin/dashboard` com blocos novos;
- reaproveitar queries/serviços existentes antes de criar novas;
- preservar `legacy`.

## Fase 3 — KPIs

- Implementar blocos de cards executivos:
  - MRR;
  - receita recebida;
  - ativos/trial;
  - inadimplência;
  - cancelamentos.

## Fase 4 — Gráficos

- Série temporal para:
  - crescimento de tenants;
  - crescimento de usuários;
  - receita recebida;
  - receita por status.

## Fase 5 — Alertas operacionais

- Consolidar alertas reais:
  - trial vencendo;
  - gateway com problema;
  - SMTP inconsistente;
  - WhatsApp desconectado;
  - falhas recorrentes/jobs críticos.

## Fase 6 — Refinamento visual

- Ajustar densidade de cards/listas;
- reduzir aparência administrativa simples;
- melhorar legibilidade executiva sem alterar regras de negócio.

---

## Validação desta fase (auditoria)

- Nenhuma implementação de lógica nova foi feita.
- Nenhuma rota atual foi alterada.
- Nenhuma migração foi criada.
- Documento preparado para orientar implementação incremental posterior.

