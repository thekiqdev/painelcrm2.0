# M5 S6 — Superadmin + suspensão/migração (D15)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 |
| **Sprint** | **S6** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) |
| **Próximo** | Hardening contínuo · `revenue_share` · NF (D19) |

---

## Entregas

### Schema
- `323_partner_suspension_migration_s6.sql`
  - `tenants.migrated_from_partner_id` / `partner_migrated_at`
  - `partner_suspension_events` (auditoria)

### Backend
| Rota | Função |
|------|--------|
| `GET /api/superadmin/partners/channel-stats` | Canal vs direto + seats |
| `POST /api/superadmin/partners/:id/suspend` | Suspende + migra clientes (D15) |
| `GET /api/superadmin/partners/:id/suspension-events` | Histórico |

**Migração (idempotente):**
1. Para cada `customer_tenant` do Partner: resolve preço (subscription → última fatura paid → catálogo)
2. Cria `tenant_commercial_overrides` `fixed_price` (`source=partner_migration_d15`)
3. Congela `subscriptions.contracted_plan_price_cents` quando possível
4. `account_type=platform_customer`, limpa `partner_id`/`seller_user_id`, grava origem
5. Partner `status=suspended`; arquiva sell-plans; domain deixa de servir WL
6. Evento + `super_admin_audit_log`

`PATCH ... partner_status=suspended` **bloqueado** — usar `/suspend`.

### Frontend
- Lista Partners: cards canal vs direto
- Detalhe: botão suspender + histórico

### Testes
- `partnerSuspensionService` (stats + migração mock)

---

## DoD S6

- [x] Dashboard canal vs direto
- [x] Suspender → migração Platform **preservando preço**
- [x] Auditoria (`partner_suspension_events` + audit log)
- [x] Runbook suporte (abaixo)
- [x] Venda direta intacta (`platform_customer` sem mudança)

---

## Runbook — suporte Platform → só Partner

1. **Cliente final reclama de marca/domínio**  
   - Verificar se Partner está `active` e domínio `verified`.  
   - Se Partner suspenso: cliente já é Platform — orientar login no domínio Platform.

2. **Suspender Partner (ops)**  
   - Super Admin → Partners → detalhe → **Suspender e migrar clientes**.  
   - Confirmar overrides criados no evento.  
   - Flag `partner.channel_v1` permanece; Partner não acessa `/partner` (middleware).

3. **Preço mudou após migração?**  
   - Checar `tenant_commercial_overrides` do tenant com `metadata.source=partner_migration_d15`.  
   - Renovações SaaS devem usar o resolvedor de override (M1–M4).

4. **Reexecução**  
   - `/suspend` é idempotente: clientes já migrados contam em `customers_skipped`; só processa `customer_tenant` restantes.

5. **Escopo suporte**  
   - Platform atende **Partners**; Partner atende clientes finais (D16). Pós-migração, cliente final passa a suporte Platform.

---

## Como validar

1. Migration `323`
2. Partner com ≥1 `customer_tenant` com subscription/fatura
3. `POST /suspend` → tenant vira `platform_customer` + override
4. `/channel-stats` reflete migrados
5. Domínio WL do Partner deixa de resolver brand
