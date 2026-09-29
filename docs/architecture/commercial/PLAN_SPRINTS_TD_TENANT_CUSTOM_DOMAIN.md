# Plano de sprints — Domínio personalizado do Tenant (loja ou abertura de chamados)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Atualizado** | 2026-09-28 — escopo: host público com **papel selecionável** (`store` \| `support`), não login do CRM |
| **Tipo** | Plano de implementação (produto + arquitetura + sprints) |
| **Nome** | **TD — Tenant Custom Domain** (domínio personalizado do cliente Platform) |
| **Escopo** | Empresa **cliente da Platform** (`tenants.account_type = platform_customer`) configurar **subdomínio próprio** e **escolher o uso** na tela de Domínio: **Loja** *ou* **Abertura de chamados** (portal público de suporte) |
| **Base** | Partner WL ([`SPRINT_M5_S2_WHITELABEL_BRAND.md`](./SPRINT_M5_S2_WHITELABEL_BRAND.md)) · stub [`DomainSection.tsx`](../../../src/components/settings/DomainSection.tsx) · loja path `/{slug}/loja` · portal público de suporte (`PublicSupport*` · `/api/public/support/:slug`) · catálogo hosts ([`PLANO_EVOLUCAO_MODULO_CATALOGO.md`](../../app/PLANO_EVOLUCAO_MODULO_CATALOGO.md) §4) |
| **Fora de escopo (MVP)** | Domínio apex (`empresa.com.br`) · usar o host customizado como **login do CRM** (`app`) · domínio próprio de `customer_tenant` (cliente do Partner) · emitir TLS no Node · confiar no Host para autorização JWT |
| **Princípio** | Reusar DNS do Partner (**TXT + CNAME → active**) em **`tenant_hosts`**; o Host resolve **tenant + papel** e abre a superfície pública correta |
| **Status** | **Sprint 0–5 feitas** (2026-09-28) — MVP TD completo |
| **MVP** | **Sprint 4** (Settings com seletor de uso + host serve loja **ou** portal de chamados) |
| **Kickoff** | Em chat: `ok sprint 2` … `ok sprint 5` |

| Sprint | Foco | Status |
|--------|------|--------|
| **Sprint 0** | Decisões, ADR, inventário loja/portal, flag | **Feito** ([`SPRINT_TD_S0_INVENTORY_AND_FLAGS.md`](./SPRINT_TD_S0_INVENTORY_AND_FLAGS.md)) |
| **Sprint 1** | Schema `tenant_hosts` + role + set/verify/clear | **Feito** ([`SPRINT_TD_S1_TENANT_HOSTS_DNS.md`](./SPRINT_TD_S1_TENANT_HOSTS_DNS.md)) |
| **Sprint 2** | Host resolve → roteamento loja **ou** suporte + marca | **Feito** ([`SPRINT_TD_S2_HOST_RESOLVE.md`](./SPRINT_TD_S2_HOST_RESOLVE.md)) |
| **Sprint 3** | UI Settings: domínio + **seletor de uso** + Super Admin | **Feito** ([`SPRINT_TD_S3_SETTINGS_UI.md`](./SPRINT_TD_S3_SETTINGS_UI.md)) |
| **Sprint 4** | CORS + TLS edge + URLs canônicas por papel | **Feito** ([`SPRINT_TD_S4_CORS_TLS_CANONICAL.md`](./SPRINT_TD_S4_CORS_TLS_CANONICAL.md)) |
| **Sprint 5** | Hardening, colisões, monitoramento, legado | **Feito** ([`SPRINT_TD_S5_HARDENING.md`](./SPRINT_TD_S5_HARDENING.md)) |

---

## 1. Meta

Hoje o Partner já tem domínio personalizado. O **tenant SaaS** ainda não — e a tela de Domínio em Settings é stub.

**Objetivo do MVP:** o admin do tenant, em **Configurações → Domínio**:

1. Informa um **subdomínio** (ex.: `loja.minhaempresa.com.br` ou `suporte.minhaempresa.com.br`).
2. **Seleciona o uso do domínio:**
   - **Loja** — acesso à vitrine/catálogo público do tenant.
   - **Abertura de chamados** — acesso ao portal público de suporte (abrir/consultar chamado).
3. Vê instruções DNS (TXT + CNAME), verifica → status `active`.
4. Ao abrir o hostname no browser, cai na **superfície pública** escolhida, com marca do tenant — **sem** exigir login no CRM.

**Não-objetivo do MVP:** transformar o domínio customizado em URL de login do painel CRM; apex; emitir certificado no app.

---

## 2. Diagnóstico — como está hoje

| Peça | Estado atual | Gap para este plano |
|------|--------------|---------------------|
| Domínio Partner | Operacional (marca + canal) | Referência de DNS; **não** misturar com tenant |
| `tenants.domain` | Texto livre | Sem verify / role / roteamento |
| Settings Domínio | Stub | Precisa: hostname + **seletor Loja \| Chamados** + verify |
| Loja pública | Path `/{slug}/loja` (+ APIs por slug) | Resolver por **Host** quando role=`store` |
| Portal de chamados | Público por **slug** (`/api/public/support/:slug`, UI PublicSupport) | Resolver por **Host** quando role=`support` |
| CORS / TLS | Allowlist estática; TLS no edge | Hosts `active` do tenant |

---

## 3. Decisões de produto (fechadas — Sprint 0)

| ID | Tema | Fechado |
|----|------|---------|
| **TD1** | Quem configura | **Tenant admin** em Settings; Super Admin vê/status/clear |
| **TD2** | Tipo de host no MVP | Só **subdomínio**. **Apex fora** |
| **TD3** | Papel do host | **Obrigatório na UI:** `store` **ou** `support`. Um host = um papel. **Não** inclui `app` (CRM) no MVP |
| **TD4** | Modelo | Tabela **`tenant_hosts`** com `role` (S1) |
| **TD5** | Colisão de hostname | Unicidade global vs Partner `custom_domain` e demais `tenant_hosts` |
| **TD6** | `tenants.domain` legado | Metadado (merge/templates); SSOT público = `tenant_hosts` (fechado S5) |
| **TD7** | Marca no host | Nome/logo do tenant (+ branding já existente da loja/portal quando houver) |
| **TD8** | Feature flag | `tenant.custom_domain_v1` (**ON por padrão** / rollout global) — migration `338` + `341` |
| **TD9** | Plano/comercial | MVP sem gate de plano (opcional depois) |
| **TD10** | DNS fail após active | → `pending`/`error` + alerta; superfícies path legado continuam |
| **TD11** | Quantos hosts | Até **1 host por papel** (`store` e/ou `support`) — hostnames diferentes |
| **TD12** | Troca de papel | Permitido em Settings com confirmação; DNS permanece, muda o roteamento |

### Complementares (fechadas na S0)

| ID | Tema | Fechado |
|----|------|---------|
| **TDA1** | Path na raiz do host | Role `store` → landing loja; role `support` → landing portal |
| **TDA2** | Redirect path legado | Opcional na **S4** (301 canônica) |
| **TDA3** | Portal sem slug no path | Host `support` resolve contexto; slug interno na API |
| **TDA4** | `customer_tenant` | **Fora** — herda WL do Partner |
| **TDA5** | Papel `app` (CRM) | Backlog pós-MVP |

Inventário detalhado: [`SPRINT_TD_S0_INVENTORY_AND_FLAGS.md`](./SPRINT_TD_S0_INVENTORY_AND_FLAGS.md).

---

## 4. Modelo de dados (draft)

### 4.1 `tenant_hosts`

| Campo | Uso |
|-------|-----|
| `id` | UUID |
| `tenant_id` | FK `tenants` (`platform_customer`) |
| `hostname` | Lowercase, sem porta/path |
| `role` | **`store`** \| **`support`** (MVP). Futuro: `app`, `redirect` |
| `status` | `none` \| `pending` \| `verified` \| `active` \| `error` |
| `verification_token` | Token TXT |
| `verified_at` / `activated_at` | Auditoria |
| `last_check_at` / `last_error` | Ops |
| `created_at` / `updated_at` | — |

**Regras**

- `UNIQUE (lower(hostname))` (global).
- `UNIQUE (tenant_id, role)` onde `status IN ('pending','verified','active')` — no máximo um host “em uso” por papel (TD11).
- Check: tenant `platform_customer`; `role IN ('store','support')` no MVP.
- Colisão com `partner_profiles.custom_domain` (`verified|active`) na set/verify.

### 4.2 DNS

| Método | Como |
|--------|------|
| **TXT** | `_painelcrm-tenant.<hostname>` = token |
| **CNAME** | `<hostname>` → `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` |
| **Dev** | Flag `tenant.domain_verify_bypass` |

---

## 5. Experiência na tela de Domínio (Settings)

Fluxo alvo da UI (substitui o stub):

1. **Uso do domínio** — controle obrigatório (radio/select):
   - `Loja` → `role=store`
   - `Abertura de chamados` → `role=support`
2. **Hostname** — input (ex.: `loja.empresa.com.br`).
3. **Instruções DNS** — TXT + CNAME (iguais em ambos os papéis).
4. **Verificar** / status (`pending` → `active`).
5. **Pré-visualização** — link “Abrir loja” ou “Abrir portal de chamados” quando `active`.
6. Se já existir host do outro papel, listar ambos (card por papel) — cada um com seu hostname.

Copy sugerida:

- Loja: “Clientes acessam sua vitrine neste endereço.”
- Chamados: “Clientes abrem e acompanham chamados neste endereço.”

---

## 6. Arquitetura alvo (MVP)

```
Browser ──Host: loja.empresa.com──► Edge (TLS)
                                      │
                                      ▼
                         resolveTenantHostByHostname(host)
                                      │
                    ┌─────────────────┴──────────────────┐
                    │ role=store                         │ role=support
                    ▼                                    ▼
              Landing loja pública              Landing portal de chamados
              (contexto = tenant_id)            (contexto = tenant + portal)
```

| Role | Comportamento no Host |
|------|------------------------|
| **`store`** | Serve vitrine do tenant (equivalente canônico ao path `/{slug}/loja`) |
| **`support`** | Serve portal público de abertura/consulta de chamados (equivalente ao portal por slug) |

- **Auth do CRM:** Host customizado **não** é a porta do painel logado no MVP.
- **Segurança:** Host só define **contexto público** (qual tenant/loja/portal); APIs públicas já são escopadas; nunca usar Host sozinho em rotas autenticadas do CRM.

### Integrações internas (Sprint 2)

| Superfície | Hoje | Com host `active` |
|------------|------|-------------------|
| Loja | `/{storeSlug}/loja` | Host `store` → mesmo bundle/contexto sem slug na URL |
| Suporte público | Rotas/API por `portal.slug` | Host `support` → resolve portal do tenant (slug default ou portal principal) |
| Brand pública | Partner-only | `GET /api/public/tenant-host?domain=` → `{ tenant, role, brand, store_slug?, support_portal_slug? }` |

---

## 7. Sprints

### Sprint 0 — Inventário + ADR + flag

| Campo | Valor |
|-------|-------|
| **Objetivo** | Fechar TD1–TD12; mapear entrypoints loja + PublicSupport; CNAME target |
| **Entregas** | Decisões neste doc; inventário FE/BE; flags `tenant.*`; hosts bloqueados |
| **DoD** | Papéis `store`/`support` fechados; CRM/`app` fora do MVP |
| **Status** | **Feito** (2026-09-28) — [`SPRINT_TD_S0_INVENTORY_AND_FLAGS.md`](./SPRINT_TD_S0_INVENTORY_AND_FLAGS.md) |

**Kickoff:** `ok sprint 0`

---

### Sprint 1 — Schema + verify API (+ role)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Persistir hostname **com papel** e verificar DNS |
| **Entregas** | Migration `tenant_hosts`; `tenantDomainService` (set exige `role`; verify/clear; unicidade por hostname e por `(tenant, role)`); APIs tenant + Super Admin; testes |
| **APIs (alvo)** | `GET/POST /api/me/tenant/domain` (body: `{ hostname, role }`) · `POST …/verify` · `DELETE …/domain?role=` ou por `id` · Super Admin read/clear |
| **DoD** | Set com `role=store|support`; rejeita role inválida; rejeita colisão Partner; bypass dev |
| **Status** | **Feito** (2026-09-28) — [`SPRINT_TD_S1_TENANT_HOSTS_DNS.md`](./SPRINT_TD_S1_TENANT_HOSTS_DNS.md) |

**Kickoff:** `ok sprint 1`

---

### Sprint 2 — Host resolve → loja ou chamados

| Campo | Valor |
|-------|-------|
| **Objetivo** | Hostname `active` abre a superfície pública correta |
| **Entregas** | `resolveTenantHostByHostname`; API pública de contexto; roteamento FE (bootstrap no root: se Host é tenant host → render loja **ou** portal, não shell do CRM); marca (logo/nome); testes de resolução |
| **DoD** | Host `store` → loja do tenant; Host `support` → portal de chamados; host Platform inalterado; Partner host intacto |
| **Status** | **Feito** (2026-09-28) — [`SPRINT_TD_S2_HOST_RESOLVE.md`](./SPRINT_TD_S2_HOST_RESOLVE.md) |

**Kickoff:** `ok sprint 2`

---

### Sprint 3 — UI Settings (seletor de uso) + Super Admin

| Campo | Valor |
|-------|-------|
| **Objetivo** | Configuração completa na tela de Domínio |
| **Entregas** | Reescrever `DomainSection`: **seletor Loja \| Abertura de chamados**, hostname, DNS, verify, clear, lista por papel; Super Admin: hostname + role + status; empty states |
| **DoD** | Admin configura sem Postman; troca de papel com confirmação (TD12); stub removido |
| **Status** | **Feito** (2026-09-28) — [`SPRINT_TD_S3_SETTINGS_UI.md`](./SPRINT_TD_S3_SETTINGS_UI.md) |

**Kickoff:** `ok sprint 3`

---

### Sprint 4 — CORS + TLS + URLs canônicas

| Campo | Valor |
|-------|-------|
| **Objetivo** | Funcionar de ponta a ponta no browser real |
| **Entregas** | CORS/Socket allowlist com hosts `active`; runbook TLS/CNAME; URL canônica da loja e do portal preferem host do papel quando `active` (links WhatsApp/chat/settings) |
| **DoD** | E2E staging: DNS → cert → abre loja **e** (outro host) portal de chamados; doc ops |
| **Status** | **Feito** (2026-09-28) — [`SPRINT_TD_S4_CORS_TLS_CANONICAL.md`](./SPRINT_TD_S4_CORS_TLS_CANONICAL.md) |

**Kickoff:** `ok sprint 4`

---

### Sprint 5 — Hardening

| Campo | Valor |
|-------|-------|
| **Objetivo** | Produção estável |
| **Entregas** | Rate limit verify; recheck DNS opcional; testes colisão Partner↔Tenant e store↔support; política `tenants.domain` legado; auditoria; métricas |
| **DoD** | Rollout por flag documentado; conflitos cobertos |
| **Status** | **Feito** (2026-09-28) — [`SPRINT_TD_S5_HARDENING.md`](./SPRINT_TD_S5_HARDENING.md) |

**Kickoff:** `ok sprint 5`

---

## 8. Relação com outros planos

| Plano | Relação |
|-------|---------|
| M5 Partner S2 | Padrão DNS/brand a reusar |
| Catálogo §4 / V2-9 | Este plano **antecipa** o host `store` do tenant; apex continua depois; host `app` CRM continua fora |
| Portal de suporte público | Superfície `support`; domínio customizado é só o **front door** por Host |
| Partner wholesale | Sem dependência |

---

## 9. Riscos

1. **Confundir com login do CRM** — UI deve deixar claro: domínio é para **clientes finais** (loja ou chamados), não para a equipe entrar no painel.
2. **TLS / CORS** — sem Sprint 4 o verify “passa” e o browser falha.
3. **Dois papéis, um hostname** — proibido no MVP (TD3/TD11); forçar hostname diferente por uso.
4. **Portal sem portal configurado** — se role=`support` e portal público não estiver ativo, UI deve bloquear activate ou mostrar erro acionável.
5. **Loja sem catálogo/slug** — idem para `store`.
6. **Colisão Partner × Tenant** — regra dura de hostname único.

---

## 10. Ordem de execução em chat

1. ~~**`ok sprint 0`** — decisões + inventário loja/portal~~ **feito**
2. ~~**`ok sprint 1`** — schema + DNS + role~~ **feito**
3. ~~**`ok sprint 2`** — roteamento por Host~~ **feito**
4. ~~**`ok sprint 3`** — UI com seletor de uso~~ **feito**
5. ~~**`ok sprint 4`** — CORS + TLS + canônicos~~ **feito**
6. ~~**`ok sprint 5`** — hardening~~ **feito**
Ao concluir cada sprint: marcar DoD aqui e, se útil, abrir `SPRINT_TD_S{n}_….md`.

---

## 11. Critério de pronto do MVP (fim Sprint 4)

- [x] Settings → Domínio permite escolher **Loja** ou **Abertura de chamados**
- [ ] DNS TXT/CNAME verificável (ou bypass em dev)
- [ ] Host `store` `active` abre a loja do tenant
- [ ] Host `support` `active` abre o portal de abertura de chamados
- [ ] Sem colisão com domínio Partner
- [ ] CORS/edge testados em staging
- [ ] Apex e login CRM (`app`) explicitamente fora  

---

*Documento de planejamento — sem implementação neste artefato. Atualizado para papéis públicos selecionáveis (`store` \| `support`).*
