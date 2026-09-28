# Investigação S8 — Segregação Super Admin: clientes SaaS vs Partner

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-19 |
| **Tipo** | Investigação + plano; Onda A (lista) e Onda B (métricas) implementadas |
| **Plano-mãe** | [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) |
| **Depende de** | S1 schema (`account_type`, `partner_id`) · S4 carteira Partner · S6 migração D15 · S7 checkout canal |
| **Status** | Onda A + Onda B **feitas** (2026-08-19) |

---

## 1. Pedido

Evoluir o controle de Partner no Super Admin do SaaS:

- **Separar** clientes da venda direta (SaaS / Platform) dos clientes do canal Partner.
- Clientes do Partner devem **aparecer na lista do Partner** (carteira / ficha do Partner).
- **Não** devem aparecer na lista de clientes SaaS (`/superadmin/clients`).

Decisões de produto (esta investigação):

| ID | Tema | Decisão |
|----|------|---------|
| **P-S8.1** | Lista SaaS | `customer_tenant` e `partner` **somem** da lista padrão de clientes Platform |
| **P-S8.2** | Operação Super Admin | **Acesso pleno permanece** (GET/PUT/billing/features/usuários por UUID). Só a **listagem default** muda |
| **P-S8.3** | Onde listar canal | Carteira já existe no painel Partner; Super Admin passa a ter **drill-down na ficha do Partner** (hoje não lista clientes no detalhe) |

---

## 2. Conclusão (executiva)

| Pergunta | Resposta |
|----------|----------|
| É possível? | **Sim.** O modelo já existe: `tenants.account_type` + `partner_id` (migration `318`). |
| Precisa de migration nova? | **Não** para o núcleo. Opcional: índices/comentários e API de listagem por Partner no Super Admin. |
| Quão difícil? | **Baixa na lista** (1 SQL + FE). **Média** se o dashboard/MRR/export/anúncios também forem segregados — senão o Super Admin “esconde” na lista mas **continua inflando métricas SaaS**. |
| Quebra o sistema? | **Não**, se GET por id continuar sem filtro e se D15 (migração) continuar virando `platform_customer`. |
| Risco principal | Tratar **métricas financeiras** como se `customer_tenant` fosse receita da Platform (hoje o dashboard **conta todos os tenants**). |

**Recomendação:** implantar em **duas ondas**.

- **Onda A (MVP, ~0,5–1,5 d):** filtrar lista + CSV de clientes; drill-down Super Admin → clientes do Partner; badge no detalhe.
- **Onda B (métricas, ~1–2 d):** dashboard, analytics comercial, export, anúncios, “tenants recentes” — só `platform_customer` (e opcionalmente cards separados para canal).

---

## 3. Como o sistema está hoje

### 3.1 Modelo (já correto)

Constraint `tenants_partner_account_chk` (`database/init/318_partner_channel_s1.sql`):

| `account_type` | Quem é | `partner_id` |
|----------------|--------|----------------|
| `platform_customer` | Venda direta SaaS | `NULL` |
| `partner` | Tenant da agência (painel `/partner`) | `NULL` |
| `customer_tenant` | Cliente final do canal | **obrigatório** |

Checkout Partner (`partnerChannelSignupService`) e carteira (`partnerCustomerService`) já gravam `account_type='customer_tenant'` + `partner_id`.

Carteira Partner: `GET /api/partner/customers` filtra `account_type = 'customer_tenant' AND partner_id = $1`.

### 3.2 O que o Super Admin lista hoje (gap)

`GET /api/superadmin/tenants` (`listTenants`) **não filtra** `account_type`.

Efeito: na tela **Clientes** (`SuperAdminClients.tsx`) aparecem misturados:

1. Clientes SaaS (`platform_customer`)
2. Tenants **Partner** (a agência como “empresa”)
3. Clientes finais do canal (`customer_tenant`)

O detalhe `/superadmin/tenants/:id` e billing/features **já funcionam** para qualquer UUID — alinhado a P-S8.2.

### 3.3 Super Admin Partners hoje

| Superfície | O que mostra |
|------------|----------------|
| `/superadmin/partners` | Lista de Partners + `channel-stats` (contagens globais) |
| `/superadmin/partners/:id` | Licenças, suspender/migrar — **sem tabela de clientes do canal** |
| `/partner/customers` | Carteira **do Partner logado** (não é Super Admin) |

Ou seja: o cliente do canal **já tem lista no Partner**, mas o Super Admin **só o vê misturado em Clientes SaaS**.

### 3.4 D15 (suspensão) — relevante

Ao suspender Partner, clientes viram `platform_customer` e **entram de propósito** na lista SaaS (preço preservado). A segregação **deve respeitar isso**: pós-migração = cliente Platform.

---

## 4. Dificuldade

| Fatia | Esforço | Notas |
|-------|---------|--------|
| Filtro `listTenants` + CSV export | **Baixo** | `WHERE t.account_type = 'platform_customer'` (default) |
| FE lista: copy + vazio | **Baixo** | Texto “somente venda direta” |
| Drill-down Super Admin Partner | **Baixo–médio** | Reusar query de `listPartnerCustomers` com `partnerId` da URL (hoje o service assume contexto Partner autenticado) |
| Badge/aviso no detalhe SaaS | **Baixo** | Se alguém abrir UUID de `customer_tenant` por URL: “Cliente do canal X — cobrança no gateway Partner” |
| Query param `?scope=all` (ops) | **Baixo** | P-S8.2: acesso pleno **incluindo busca/listagem excepcional** |
| Dashboard / MRR / growth 30d | **Médio** | Várias queries em `superadminDashboardService`, `superadminController.getDashboard`, `commercialAnalyticsService` |
| Anúncios (grupos de tenants) | **Baixo–médio** | Hoje carrega `/api/superadmin/tenants` — herdaria o filtro; risco de **não anunciar** para canal (pode ser desejável) |
| Jobs (trial expire, dunning SaaS) | **Avaliar caso a caso** | Ver §6 — alguns **devem** continuar vendo todos os tenants |

**Estimativa Onda A:** 0,5–1,5 dia (1 dev).  
**Estimativa Onda B:** 1–2 dias + QA de números do dashboard.

Não é refator de billing nem de schema. É **governança de visão + métricas**.

---

## 5. O que implica no sistema

### 5.1 Implica (deve mudar na Onda A)

- Lista Super Admin de clientes e CSV `export/clients`.
- UX: deixar explícito que Partners têm tela própria.
- Super Admin Partner detail: lista de `customer_tenant` daquele Partner (senão o Super Admin **perde** a visão operacional da carteira).

### 5.2 Implica (Onda B — senão números mentem)

Queries atuais **sem** filtro de canal (contam Partner + customer_tenant como “empresa SaaS”):

| Local | Impacto se não filtrar |
|-------|-------------------------|
| `superadminDashboardService` totais / growth / MRR catálogo | Infla MRR e “novas empresas” com cadastros do canal |
| `superadminController.getDashboard` | Mesmo |
| `commercialAnalyticsService` `WHERE t.status = 'active'` | Mix canal + direto |
| `exportController` clientes | CSV mistura |
| Planos: `COUNT tenants` por `plan_id` | Envelope do Partner (plano plataforma) conta clientes de canal |

**Regra proposta de métrica Platform:**

- **Receita / MRR / clientes SaaS** = `account_type = 'platform_customer'` (e opcionalmente excluir `migrated_from_partner_id` só se produto quiser “orgânicos vs migrados”).
- **Canal** = cards já existentes em `channel-stats` + detalhe por Partner.
- **Partners** (`account_type = 'partner'`) = **não** são clientes finais; não entram em “Clientes” nem em MRR de catálogo do cliente final. (O Partner é B2B da Platform — licenças.)

### 5.3 Não implica (não quebrar)

- Runtime do tenant (CRM, chat, limites): continua por `tenant_id`.
- Gateway: `customer_tenant` já resolve gateway do Partner pai.
- Checkout canal, sale-link, seats do pool.
- `GET /api/superadmin/tenants/:id` e rotas filhas (billing, users, features).
- Login do cliente final.

### 5.4 Cuidado especial — jobs Platform

Não aplicar o filtro da **lista** cegamente em workers:

| Job / serviço | Canal `customer_tenant` |
|---------------|-------------------------|
| Trial expiration Platform | Pode **não** aplicar regra SaaS; trial do canal é do Partner |
| Cobrança recorrente SaaS (`subscriptions` type saas) | Cliente canal **não deveria** ter assinatura Platform; se houver lixo de dados, filtrar |
| Dunning / overdue SaaS | Idem |
| Anúncios “todos os clientes” | Produto: default **só Platform**; canal = marca Partner |

---

## 6. Riscos

| # | Risco | Gravidade | Mitigação |
|---|--------|-----------|-----------|
| R1 | Super Admin não acha cliente do canal na lista antiga | Média (UX) | Drill-down na ficha Partner + busca `?q=` / `?scope=all` |
| R2 | Dashboard MRR sobe com PIX do Partner (receita **não** é da Platform) | **Alta** (financeiro) | Onda B: filtrar analytics; não usar preço de `plans` envelope × customer_tenant |
| R3 | Anúncio Platform vai para tenants WL (marca errada) | Média | Audiência default = `platform_customer` |
| R4 | D15: cliente migrado some do Partner e **deve** aparecer no SaaS | Baixa se filtro for só `customer_tenant`/`partner` | Teste de regressão suspend |
| R5 | Filtrar jobs e **deixar de expirar/cobrar** tenant SaaS por bug de SQL | Alta | Allowlist de arquivos na Onda A (só list/export); jobs na Onda B com testes |
| R6 | Tenant `partner` some da lista e Super Admin tenta “criar cliente” duplicando agência | Baixa | Copy na UI + Partners no menu |
| R7 | Acesso por URL direta a `/superadmin/tenants/:id` de canal | Aceito (P-S8.2) | Banner: canal, Partner, gateway |
| R8 | Contagem de usuários do dashboard inclui users do canal | Média | Onda B: users de `platform_customer` vs canal separados |
| R9 | CSV financeiro / comercial legado | Média | Alinhar export ao mesmo predicado |

**Não é risco de segurança de isolamento:** o cliente do canal já é outro `tenant_id`. O gap é **operacional/financeiro na UI Super Admin**.

---

## 7. Predicado canônico (implementação)

Helper SQL / função TS única, reusada em listagens Super Admin de “cliente Platform”:

```sql
-- Cliente da venda direta (lista SaaS)
t.account_type = 'platform_customer'
```

Não usar só `partner_id IS NULL`: isso **incluiria** o tenant `partner` (a agência).

Escopos extras:

```sql
-- Carteira de um Partner
t.account_type = 'customer_tenant' AND t.partner_id = $partnerId

-- Ops excepcional
-- sem filtro, ou scope=all
```

---

## 8. Plano de implantação

### Onda A — Visão operacional (MVP)

**Objetivo:** lista Clientes = só SaaS; Super Admin vê canal na ficha do Partner.

1. **Backend**
   - `listTenants`: default `account_type = 'platform_customer'`.
   - Query `scope=all` (opcional, documentada) para suporte.
   - `GET /api/superadmin/partners/:id/customers` — mesma forma da carteira Partner (reuso de `listPartnerCustomers(partnerId)`).
   - `exportClients`: mesmo predicado default.
   - Incluir `account_type`, `partner_id` no `GET` tenant (já vem de `t.*` no get).

2. **Frontend Super Admin**
   - `SuperAdminClients`: subtítulo “Venda direta (Platform). Clientes de Partner ficam em Partners.”
   - `SuperAdminPartnerDetail`: tabela de customer_tenants + link para `/superadmin/tenants/:id`.
   - `SuperAdminClientDetail`: se `account_type !== platform_customer`, banner + link para o Partner.

3. **Testes**
   - `listTenants` não retorna fixture `customer_tenant` / `partner`.
   - `listPartnerCustomers` Super Admin retorna só os do `:id`.
   - Regressão D15: após suspend, cliente **aparece** em `listTenants`.

4. **QA manual**
   - Cadastro `/{slug}/cadastro` → some de Clientes SaaS, aparece no Partner e no detalhe Super Admin Partner.
   - Cliente direto `/checkout` continua na lista SaaS.
   - Abrir UUID canal no detalhe Super Admin ainda edita (P-S8.2).

**DoD Onda A:** nenhum `customer_tenant` na lista default; nenhum Partner-tenant na lista default; carteira visível no Super Admin.

**Status Onda A (2026-08-19): FEITO** — lista/CSV default `platform_customer`; `GET /api/superadmin/partners/:id/customers`; banners no detalhe Super Admin. GET por UUID permanece sem filtro.

### Onda B — Métricas honestas

1. Inventário fechado das queries §5.2 (dashboard legado + `superadminDashboardService` + analytics).
2. Totais Platform vs canal vs partners (não misturar MRR).
3. Anúncios: default Platform-only.
4. Documentar no dashboard o que cada card conta.

**DoD Onda B:** número de “empresas ativas” SaaS não sobe quando um cliente Partner ativa trial/pago.

**Status Onda B (2026-08-19): FEITO**

- Dashboard Super Admin (`getSuperadminDashboardSnapshot` + `getDashboard` legado): tenants/users/growth/MRR catálogo/caixa `tenant_billing` só `platform_customer`.
- MRR contratado / renewals 30d: subscriptions cujo tenant é Platform.
- Analytics comercial e CSV planos/uso: mesma regra.
- Anúncios: grupos usam `GET /tenants` (Onda A) → default Platform-only.
- Job `platform.trial.expiring` + notificação Super Admin de trial: só Platform.
- Relatórios `/api/superadmin/reports`, CSV planos/uso, caixa 30d do analytics, audiência de anúncios WhatsApp, listagem de cobranças Platform e lista de assinaturas SaaS Super Admin: só `platform_customer`.
- GET cobrança por UUID e GET tenant por UUID: **sem** filtro (P-S8.2).
- Jobs de cobrança/dunning genéricos **não** alterados nesta onda.

---

- Mudar D16 (suporte: Platform atende só Partner).
- Impedir Super Admin de editar billing de `customer_tenant` (contradiz P-S8.2).
- Separar banco / schema.

---

## 9. Ordem sugerida de PRs

1. PR1: filtro lista + export + testes.  
2. PR2: Super Admin Partner customers + banner detalhe.  
3. PR3 (Onda B): dashboard/analytics.

Rollback de PR1: remover o `WHERE` — uma linha.

---

## 10. Checklist de decisão residual (opcional)

- [ ] Anúncios “Todos os clientes” incluem canal? **Sugestão: não.**
- [ ] Migrados D15 entram em “novos clientes SaaS” no gráfico 30d? **Sugestão: sim** (passam a ser Platform).
- [ ] Tenant `partner` aparece em alguma lista de “empresas”? **Sugestão: só em Partners.**

---

## 11. Veredito

Ajuste **factível e alinhado ao schema M5**. O trabalho pesado (provision, attribution, carteira) **já está feito**. O gap é a **Super Admin UI/API de listagem** que ainda trata a tabela `tenants` como homogênea.

Dificuldade: **baixa** para o pedido visual/listagem; **média** se a Platform quiser números financeiros corretos no mesmo sprint.

Risco de regressão funcional do CRM: **baixo**. Risco de **leitura errada de MRR**: **alto** se só a lista mudar e o dashboard não.
