# M5 S1 — Fundação Partner Channel

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-13 |
| **Sprint** | **S1** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) |
| **Base S0** | [`SPRINT_M5_S0_INVENTORY_AND_SCHEMA.md`](./SPRINT_M5_S0_INVENTORY_AND_SCHEMA.md) |
| **Próximo** | **S2** — White-label 100% (domínio custom + marca) |

---

## Entregas

### Schema
- `database/init/318_partner_channel_s1.sql` (+ espelho supabase `20260813120000_partner_channel_s1.sql`)
- `tenants.account_type` / `partner_id` / `seller_user_id`
- `partner_profiles`, `partner_memberships`, `partner_license_pool`
- Flags `partner.master_off`, `partner.channel_v1` (rollout **off** por default)

### Backend (`packages/backend/src/partner/`)
- `POST/GET/PATCH /api/superadmin/partners`
- `GET /api/partner/me`, `GET/PATCH /api/partner/profile`
- Middleware `requirePartnerChannelEnabled`, `requirePartnerAdmin`, `requirePartnerMember`
- Flag: registry **ou** env `PARTNER_CHANNEL_V1=true`

### Frontend
- Superadmin: `/superadmin/partners`, `/new`, `/:id` (+ nav Empresas)
- Shell Partner: `/partner` (contexto + pool)

### Testes
- `partnerAdminService.test.ts`, `partnerFlags.test.ts` — OK

---

## Como ativar (Super Admin)

1. Rodar migrations `318` + `319`
2. **Super Admin → Avançado → Feature Flags** → namespace `partner.*`
3. Ligar **Enabled ON**:
   - `partner.channel_v1` — canal (APIs + UI Partners + `/partner`)
   - `partner.domain_verify_bypass` — opcional, só dev/staging (DNS sem TXT)
4. Criar Partner em `/superadmin/partners/new`

Env `PARTNER_CHANNEL_V1` / `PARTNER_DOMAIN_VERIFY_BYPASS` ficam só como contingência se a flag **não existir** no DB — o Super Admin manda.

---

## Checklist S0 §7

- [x] Migration + flag
- [x] APIs superadmin partners (+ admin via `createTenantAdminUser`)
- [x] Middleware + `/api/partner/me`
- [x] Shell FE `/partner`
- [x] UI Superadmin criar/listar/alocar seats
- [x] Testes unitários create/patch/flag
- [x] Venda direta (`/api/superadmin/tenants`) intocada

**Fora de S1 (próximos):** DNS domínio, gateway Asaas UI, sell-plans, acquisition, comissões.
