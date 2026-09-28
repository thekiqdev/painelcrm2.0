# SUPERADMIN DASHBOARD V2 PLAN

## 1) Estrutura atual encontrada

### Backend

- Rota já existente: `GET /api/superadmin/dashboard` em `packages/backend/src/controllers/superadminController.ts`.
- Payload atual é básico:
  - `totals.plans`, `totals.tenants`, `totals.active_tenants`, `totals.users`;
  - `recent_tenants` (10);
  - `recent_users` (10).
- Já existem rotas superadmin com dados operacionais e financeiros reutilizáveis:
  - `GET /api/superadmin/reports` (`reportsController`);
  - `GET /api/superadmin/platform-billings` e detalhe (`superadminPlatformBillingsController` + `superadminPlatformBillingsService`);
  - `GET /api/superadmin/billing/subscriptions`, `.../upcoming`, `.../recurring-jobs`, `.../jobs-failed` (`superadminBillingController`);
  - `GET /api/superadmin/payment-gateways/status` (`paymentGatewayConfigController`);
  - `GET /api/superadmin/smtp-settings` (`smtpSuperadminSettingsController`);
  - `GET /api/superadmin/platform-whatsapp/instances` (`superadminPlatformWhatsAppController`, reuso de `chatController`);
  - `GET /api/superadmin/notifications-engine/summary` e `/platform-notifications/deliveries` (saúde de notificações).

### Frontend

- Tela atual do dashboard: `src/pages/superadmin/SuperAdminDashboard.tsx`.
- Atualmente renderiza 4 cards simples + 2 listas.
- Outras telas superadmin já possuem blocos úteis e padrões de consulta:
  - `src/pages/superadmin/SuperAdminPlatformBillings.tsx`;
  - `src/pages/superadmin/SuperAdminReports.tsx`;
  - `src/pages/superadmin/SuperAdminNotifications.tsx`;
  - `src/pages/superadmin/SuperAdminSubscriptionCyclesSettings.tsx`.

## 2) Métricas já disponíveis (sem recriar lógica)

## Receita e cobrança

- `tenant_billing`:
  - status já usados: `pending`, `paid`, `overdue`, `cancelled`, `waiting_payment`, `processing`;
  - valores em `amount_cents`, datas em `due_date`/`paid_at`.
- `subscriptions` (SaaS):
  - `status` com `active`, `trialing`, `cancelled`, `past_due`, `paused`;
  - `amount_cents`, `billing_interval`, `next_billing_date`.
- `billing_recurring_jobs`:
  - resumo operacional por status já pronto em `billingRecurringJobsOpsService`.

## Tenants e crescimento

- `tenants.status` suporta `active`, `trial`, `payment_pending`, `suspended`.
- `tenants.trial_ends_at` disponível para alertas de trial próximo.
- `tenants.created_at` disponível para séries de crescimento.
- `users.created_at` disponível para crescimento de usuários.

## Distribuição e planos

- Contagem de tenants por status já usada em `reportsController`.
- Adoção por plano e receita estimada por plano já existem em `GET /api/superadmin/reports`.

## Saúde operacional

- Gateways: `GET /api/superadmin/payment-gateways/status`.
- SMTP global: `GET /api/superadmin/smtp-settings`.
- WhatsApp plataforma: `GET /api/superadmin/platform-whatsapp/instances`.
- Entregas/falhas de notificações:
  - `GET /api/superadmin/notifications-engine/summary`;
  - `GET /api/superadmin/platform-notifications/deliveries`.

## 3) APIs reutilizáveis no V2

- Manter consumíveis e estáveis:
  - `GET /api/superadmin/platform-billings` (listagem detalhada e filtros);
  - `GET /api/superadmin/reports` (adoção/churn inicial);
  - `GET /api/superadmin/billing/subscriptions` (base para assinaturas por status);
  - `GET /api/superadmin/payment-gateways/status`, `GET /api/superadmin/smtp-settings`, `GET /api/superadmin/platform-whatsapp/instances`.
- Novo endpoint consolidado V2:
  - `GET /api/superadmin/dashboard` (mesma rota, payload expandido);
  - preservar compatibilidade com o payload antigo durante fase de transição (versão dupla no JSON).

## 4) Queries existentes aproveitáveis

## Já prontas no código

- `superadminPlatformBillingsService.listSuperadminPlatformBillings`:
  - filtros por status/tenant/período e join com `tenants` + `plans`.
- `superadminBillingController.getBillingSubscriptions`:
  - base de assinaturas com `tenant_name` e `plan_name`.
- `reportsController.getReports`:
  - agregação por plano e contagem por status de tenant.
- `billingRecurringJobsOpsService.getBillingRecurringJobsStatusSummary`:
  - visão operacional de jobs de recorrência.

## Novas agregações (simples, em SQL direto no controller/service)

- MRR real (snapshot):
  - soma de `subscriptions.amount_cents` para `status IN ('active','trialing')` e `type='saas'`.
- Receita por status de cobrança (período):
  - `tenant_billing` agrupado por status e com `SUM(amount_cents)`.
- Crescimento:
  - `tenants.created_at` por dia/mês;
  - `users.created_at` por dia/mês;
  - receita recebida por mês com `tenant_billing.status='paid'`.
- Trials próximos do vencimento:
  - `tenants.status='trial' AND trial_ends_at BETWEEN now() AND now()+interval`.
- Cancelamentos:
  - `subscriptions.status='cancelled'` por período (ou `updated_at` quando aplicável).

## 5) Novo layout proposto (V2)

## Linha 1 — KPIs executivos

- Receita mensal (recebida no mês atual + variação vs mês anterior).
- MRR atual (assinaturas ativas/trialing + variação).
- Clientes ativos (tenants `active`) + crescimento.
- Trials ativos e trials vencendo em 7 dias.
- Inadimplentes (`tenant_billing` `overdue`/`pending` vencido) + valor pendente.
- Cancelamentos recentes (assinaturas canceladas no período).

## Linha 2 — Gráficos

- Crescimento da plataforma:
  - novos tenants;
  - novos usuários;
  - receita recebida.
- Receita por status:
  - `paid`, `pending`, `overdue`, `cancelled`.
- Controle de período: `7d | 30d | 12m`.

## Linha 3 — Saúde comercial

- Distribuição de clientes por status de tenant (`active`, `trial`, `payment_pending`, `suspended`).
- Planos mais usados:
  - plano;
  - clientes;
  - receita estimada.

## Linha 4 — Operacional

- Últimas empresas (compacto).
- Últimos pagamentos/cobranças (compacto, com status/gateway/data).
- Alertas operacionais:
  - trials vencendo;
  - gateway desconectado/erro;
  - falhas recentes de webhook/notifications;
  - tenants suspensos;
  - SMTP inválido/desligado;
  - WhatsApp plataforma desconectado.

## 6) Estrutura proposta do endpoint consolidado

```json
{
  "legacy": {
    "totals": {},
    "recent_tenants": [],
    "recent_users": []
  },
  "kpis": {
    "revenue_month": { "current_cents": 0, "previous_cents": 0, "change_pct": 0 },
    "mrr": { "current_cents": 0, "previous_cents": 0, "change_pct": 0 },
    "active_tenants": { "current": 0, "previous": 0, "change_pct": 0 },
    "active_trials": { "current": 0, "expiring_7d": 0 },
    "delinquency": { "tenants": 0, "amount_cents": 0 },
    "cancellations": { "period_count": 0 }
  },
  "subscriptions": {
    "by_status": {},
    "upcoming_30d_count": 0
  },
  "tenants": {
    "by_status": {},
    "latest": []
  },
  "billing": {
    "by_status_amount_cents": {},
    "latest": []
  },
  "growth": {
    "series": {
      "tenants": [],
      "users": [],
      "revenue_paid": []
    },
    "period": "30d",
    "granularity": "day"
  },
  "plans": {
    "top_used": []
  },
  "health": {
    "gateway": {},
    "smtp": {},
    "whatsapp": {},
    "notifications": {}
  },
  "alerts": []
}
```

### Compatibilidade

- Fase inicial: manter o bloco `legacy` para não quebrar a tela atual.
- Depois, migrar frontend para `kpis/growth/billing/alerts`.

## 7) Plano incremental de implementação (sem big-bang)

## Fase A — Consolidação backend (sem mexer visual grande)

- Expandir `GET /api/superadmin/dashboard` com blocos novos (`kpis`, `subscriptions`, `tenants`, `billing`, `alerts`) mantendo `legacy`.
- Reusar serviços/queries existentes onde possível:
  - platform billings;
  - subscriptions;
  - reports;
  - payment gateway status;
  - smtp settings.

## Fase B — Dashboard V2 frontend

- Refatorar `SuperAdminDashboard.tsx` para consumir payload consolidado único.
- Implementar:
  - cards executivos;
  - 2 gráficos principais;
  - tabelas compactas (últimas empresas e últimos pagamentos);
  - bloco de alertas.

## Fase C — UX sidebar superadmin

- Ajustar `SuperAdminLayout.tsx` e `superadminNavConfig.ts`:
  - menor altura dos itens;
  - menor espaçamento entre grupos;
  - tipografia e densidade mais “console executivo”.
- Sem quebrar rotas e sem alterar hierarquia funcional.

## Fase D — otimização/performance

- Cache curto no backend (ex.: 30-60s em memória) para agregados pesados.
- Controle de período no endpoint (`period=7d|30d|12m`) para reduzir volume.

## 8) Riscos e performance

- Risco de query pesada por múltiplos `COUNT/SUM` em tabelas grandes:
  - mitigar com agregações únicas por bloco e índices já existentes.
- Risco de regressão no dashboard atual:
  - mitigar com payload `legacy` preservado na mesma rota.
- Risco de inconsistência entre fontes (subscriptions vs tenant_billing):
  - documentar claramente semântica:
    - MRR: base assinaturas;
    - receita recebida: base cobranças pagas.
- Evitar N+1:
  - preferir `GROUP BY` e CTEs.

## 9) Sugestão visual do dashboard

- Estética “executiva clean”:
  - cards compactos com número principal, subtítulo e delta;
  - cores sem excesso (positivo/atenção/crítico);
  - gráficos com foco em tendência e comparação.
- Princípios:
  - evitar listas longas;
  - evitar textos descritivos extensos;
  - priorizar KPIs, tendências e exceções.
- Referência funcional:
  - abrir e responder em menos de 30 segundos:
    - quanto faturou;
    - quantos ativos/trial/cancelados/inadimplentes;
    - qual plano puxa receita;
    - onde há risco operacional imediato.

## 10) Decisões de arquitetura para validação

- Manter rota única `GET /api/superadmin/dashboard` com payload consolidado.
- Não criar endpoint por card.
- Não mover cálculo para frontend.
- Não alterar regras de billing/gateway/assinatura (somente leitura e agregação).
- Métricas sem dado real não entram no V2.

