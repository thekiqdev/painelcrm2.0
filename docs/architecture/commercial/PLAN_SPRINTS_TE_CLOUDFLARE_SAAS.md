# Plano de sprints — Edge Cloudflare for SaaS (domínio personalizado do Tenant)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-29 |
| **Atualizado** | 2026-10-19 — TE4 feito; fase TE completa (código) |
| **Tipo** | Plano de implantação (ops + produto + arquitetura + sprints) |
| **Nome** | **TE — Tenant Edge / Cloudflare for SaaS** |
| **Escopo** | Fazer hosts `tenant_hosts` (`store` \| `support`) **funcionarem em produção sem cadastrar cada domínio no Easypanel**, com TLS automático e abertura correta da **loja** ou do **portal de chamados** |
| **Base** | MVP TD feito ([`PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md`](./PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md)) · app já resolve Host → loja/chamados · gap = **edge TLS + roteamento** |
| **Decisão de edge** | **Cloudflare for SaaS** (Custom Hostnames) + origin = Easypanel (domínio já conhecido, ex. `painelcrm.com`) |
| **Prioridade go-live** | Partner PE-Go **feito** · agora TE (loja/chamados) no **mesmo** edge CF |
| **Fora de escopo (esta fase)** | Login CRM no domínio customizado (`app`) · Apex Proxying Enterprise · emitir TLS no Node |
| **Status** | **Fase TE completa (código)** — piloto ops no checklist TE4 |
| **Closeout TE0** | [`SPRINT_TE_S0_INVENTORY_AND_ADR.md`](./SPRINT_TE_S0_INVENTORY_AND_ADR.md) |
| **Closeout TE1** | [`SPRINT_TE_S1_OPS_SMOKE.md`](./SPRINT_TE_S1_OPS_SMOKE.md) · [`RUNBOOK_TE_TENANT_EDGE_SMOKE.md`](./RUNBOOK_TE_TENANT_EDGE_SMOKE.md) |
| **Closeout TE2** | [`SPRINT_TE_S2_CLOUDFLARE_PROVISION.md`](./SPRINT_TE_S2_CLOUDFLARE_PROVISION.md) |
| **Closeout TE3** | [`SPRINT_TE_S3_UI_SSL.md`](./SPRINT_TE_S3_UI_SSL.md) |
| **Closeout TE4** | [`SPRINT_TE_S4_HARDENING_GOLIVE.md`](./SPRINT_TE_S4_HARDENING_GOLIVE.md) · [`RUNBOOK_TE_INCIDENTES.md`](./RUNBOOK_TE_INCIDENTES.md) |
| **Kickoff** | — (fase entregue; executar checklist go-live) |

| Sprint | Foco | Status |
|--------|------|--------|
| **TE0** | Decisões, inventário gap, ADR, checklist Cloudflare/Easypanel | **Feito** (2026-10-19) |
| **TE1** | Ops: smoke tenant no edge PE (runbook) | **Feito** (2026-10-19) |
| **TE2** | Backend: provisionar/desprovisionar Custom Hostname na verify/`active` e clear | **Feito** (2026-10-19) |
| **TE3** | UI Settings + Super Admin: DNS CF, status SSL, copy | **Feito** (2026-10-19) |
| **TE4** | Hardening, E2E staging, monitoramento, backlog apex | **Feito** (2026-10-19) |

---

## 1. Meta

O MVP **TD** (Sprints 0–5) entregou:

- Tabela `tenant_hosts` + DNS TXT + verify → `active`
- UI Settings (Loja \| Abertura de chamados)
- Resolve público `GET /api/public/tenant-host?domain=`
- Bootstrap FE: Host customizado → loja **ou** portal (não shell do CRM)
- CORS dinâmico para hosts `active`

**Gap em produção (2026-09-29):**

1. Sem o hostname no **Easypanel/Traefik** → página **404 Easypanel**.
2. Com hostname cadastrado manualmente no Easypanel → SPA carrega, mas se `/api/public/tenant-host` falhar ou o Host não for reconhecido → **home do `painelcrm.com`** (fallback `LandingPage`).
3. Cadastrar **cada** domínio no Easypanel é **inviável** em escala.

**Objetivo desta fase (TE):**

> Tenant ativa subdomínio em Settings → DNS (TXT + CNAME para target CF) → verify → Cloudflare cria Custom Hostname + cert → cliente abre **loja** ou **chamados** — **zero clique no Easypanel por domínio**.

---

## 2. O que isso resolve / não resolve

| Problema | Resolve? |
|----------|----------|
| 404 Easypanel por domínio não cadastrado | **Sim** |
| Cadastro manual no Easypanel por tenant | **Sim** |
| Abre home da plataforma em vez da loja/portal | **Sim** (tráfego + API no mesmo stack; resolve já existe) |
| Certificado TLS por hostname do cliente | **Sim** (CF) |
| Subdomínio do cliente (`loja.empresa.com.br`) | **Sim** (caminho principal) |
| Domínio raiz com CNAME/ALIAS (quando o DNS do cliente permitir) | **Parcial** (hostname CF ok; onboarding DNS documentado) |
| Domínio raiz só com **A** genérico (qualquer registrador) | **Não nesta fase** (Apex Proxying = Enterprise) |
| Login do painel CRM no domínio customizado | **Não** (fora do TD/TE) |

---

## 3. Arquitetura alvo

```
Browser  Host: loja.empresa.com.br
    │
    │  CNAME → customers.painelcrm.com (target SaaS CF)
    ▼
Cloudflare for SaaS
    · Custom Hostname + certificado automático
    · Proxy para fallback origin
    · (recomendado) Origin Rule: Host no origin = painelcrm.com
    │
    ▼
Easypanel / Traefik
    · Só precisa do domínio “plataforma” já cadastrado
    · Mesmo frontend + API
    │
    ▼
SPA (window.location.hostname = loja.empresa.com.br)
    → GET /api/public/tenant-host?domain=loja.empresa.com.br
    → role=store → PublicStore
    → role=support → portal de chamados
```

### Por que Origin Host rewrite

Se o Traefik do Easypanel só roteia Hosts **já cadastrados**, a CF deve conectar no origin com `Host: painelcrm.com` (ou o hostname do serviço). O browser continua em `loja.empresa.com.br`. O FE usa `window.location.hostname` no `?domain=` — o resolve **não depende** do `Host` interno do origin.

CORS: header `Origin: https://loja.empresa.com.br` — allowlist dinâmica de `tenant_hosts.status=active` (já TD S4).

---

## 4. Decisões de produto / ops (fechar na TE0)

| ID | Tema | Decisão proposta |
|----|------|------------------|
| **TE1** | Edge | **Cloudflare for SaaS** (não Traefik catch-all como caminho principal) |
| **TE2** | Tipo de host nesta fase | **Subdomínio** obrigatório no copy; apex só se DNS permitir ALIAS/flattening (docs), sem Apex Proxying |
| **TE3** | CNAME target | Host dedicado na zona CF (ex. `customers.painelcrm.com`) = target SaaS; env `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` aponta para ele |
| **TE4** | Momento de provisionar na CF | Após TXT ok (ou bypass) e transição para `active` — criar Custom Hostname; SSL `active` pode ser assíncrono |
| **TE5** | Gate de “Abrir loja” | **Fechado TE0:** abrir com `active` + banner se SSL CF pending (paridade PE) |
| **TE6** | Clear | Apagar Custom Hostname na CF + limpar `tenant_hosts` |
| **TE7** | Flag | `tenant.edge_cloudflare_saas_v1` (default OFF até ops TE1 pronta; depois ON) |
| **TE8** | Partner WL | **Fechado TE0:** PE-Go já entregue — **reusar** client/env CF; não duplicar ops |
| **TE9** | Custo | Plano CF Free/Pro/Business: **100** custom hostnames inclusos; depois ~**US$ 0,10**/hostname/mês (cota compartilhada Partner+Tenant) |
| **TE10** | Segredos | API Token CF só no backend (Easypanel secrets); nunca no frontend |
| **TE11** | Só subdomínio | Validar apex na TE2 (reusar helper PE) |
| **TE12** | Colisão hostname | Manter regras TD vs Partner / tenant_hosts |

Docs oficiais: [Cloudflare for SaaS](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/) · [Plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/).

---

## 5. O que será necessário no Painel (checklist de implantação)

### 5.1 Conta e zona Cloudflare (ops — TE1)

- [ ] Conta Cloudflare ( Free suficiente para começar )
- [ ] Domínio da plataforma (`painelcrm.com` ou o domínio canônico) **na Cloudflare** (DNS proxied nos hosts relevantes)
- [ ] Ativar **Cloudflare for SaaS** na zona
- [ ] Configurar **fallback origin** = hostname/IP do serviço Easypanel que já serve o app
- [ ] Criar hostname de target CNAME (ex. `customers.painelcrm.com`) — proxied, apontando para o origin conforme docs CF
- [ ] **Origin Rule** (recomendado): para Custom Hostnames, enviar ao origin com `Host` = domínio já cadastrado no Easypanel (ex. `painelcrm.com`)
- [ ] API Token com permissões mínimas: Custom Hostnames (edit) + Zone read necessárias
- [ ] Anotar: `Zone ID`, target CNAME público, fallback origin

### 5.2 Easypanel (ops — TE1)

- [ ] Manter **um** (ou poucos) domínio(s) do app cadastrados (ex. `painelcrm.com`, `www`, API se separado)
- [ ] **Não** depender de “Add domain” por tenant
- [ ] Garantir que origin aceita tráfego vindo dos IPs Cloudflare (se firewall: allowlist CF ou só via CF)
- [ ] TLS do domínio da plataforma continua no Easypanel/CF conforme setup atual
- [ ] Remover (quando estável) hostnames de teste cadastrados manualmente por tenant

### 5.3 Variáveis de ambiente (backend — TE2)

| Variável | Uso |
|----------|-----|
| `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` | Valor mostrado ao cliente (ex. `customers.painelcrm.com`) — **obrigatório** em prod com TE |
| `CF_SAAS_ZONE_ID` | Zone ID da zona SaaS |
| `CF_SAAS_API_TOKEN` | Token API (secret) |
| `CF_SAAS_FALLBACK_ORIGIN` | Hostname do fallback (auditoria/ops; opcional se só UI CF) |
| `CF_SAAS_ENABLED` ou flag DB `tenant.edge_cloudflare_saas_v1` | Liga provisionamento automático |
| (existentes) `FRONTEND_URL` / `PUBLIC_APP_URL` | Continua fallback de CNAME se env TE ausente (dev) |

### 5.4 Banco / modelo (TE2)

Estender `tenant_hosts` (migration nova), por exemplo:

| Campo | Uso |
|-------|-----|
| `cf_custom_hostname_id` | ID do Custom Hostname na CF |
| `cf_ssl_status` | Ex.: `pending` \| `active` \| `moved` \| `error` (espelho útil) |
| `cf_ownership_status` | Status de ownership da CF (se distinto do TXT Painel) |
| `cf_last_sync_at` / `cf_last_error` | Ops / Super Admin |

Manter TXT `_painelcrm-tenant.` como prova de posse **do produto** (já existe). Validação SSL da CF pode usar HTTP ou TXT adicional — alinhar na TE0/TE2 (preferência: reutilizar fluxo atual + CF `ssl.method` adequado para não exigir 2 TXTs se possível).

### 5.5 Backend (TE2)

- [x] Cliente HTTP Cloudflare Custom Hostnames (`POST` / `GET` / `DELETE`) — **reuso PE**
- [x] Hook em `verifyTenantDomain` (após `active`): provisionar CF se flag ON
- [x] Hook em `clear` / Super Admin clear: deletar Custom Hostname
- [x] Soft sync + recheck DNS: sincronizar `cf_ssl_status`
- [x] Não falhar o verify do produto se CF estiver lenta: gravar `active` + `cf_*` pending
- [x] Testes unitários com mock da API CF
- [x] Logs estruturados (tenant_id, hostname, cf_id, erro) sem vazar token

### 5.6 Frontend / Settings (TE3)

- [x] Instruções DNS: TXT + CNAME (target edge Cloudflare / plataforma)
- [x] Badge/estado: DNS verificado · SSL Cloudflare (provisionando / ativo / erro)
- [x] “Abrir loja” / “Abrir portal” quando `active` (+ aviso se SSL ainda pending)
- [x] Erros acionáveis (`cf_last_error`) + botão Atualizar status SSL
- [x] Super Admin: ver `cf_ssl_status` + botão **Resync CF** (TE4)
- [x] Copy: domínio é para **clientes finais**; não substitui login do CRM

### 5.7 Feature flags

| Flag | Default sugerido | Uso |
|------|------------------|-----|
| `tenant.custom_domain_v1` | ON (já) | Features TD |
| `tenant.edge_cloudflare_saas_v1` | OFF até TE1 ok | Provisionamento CF |
| `tenant.domain_verify_bypass` | só non-prod | Dev |

### 5.8 Segurança e limites

- [ ] Token CF só server-side
- [ ] Rate limit já existente em verify; não abrir endpoint público que crie hostname CF arbitrário
- [ ] Só provisionar hostnames presentes em `tenant_hosts` do próprio tenant
- [ ] Monitorar cota CF (100 grátis + billing)
- [ ] Em clear: garantir delete CF mesmo se DB já limpou (idempotência / retry)

---

## 6. Sprints

### Sprint TE0 — Inventário, ADR, decisões

| Campo | Valor |
|-------|-------|
| **Objetivo** | Fechar TE1–TE10; inventariar gap Easypanel vs app; checklist conta CF |
| **Entregas** | Este plano validado · ADR curto (por que CF for SaaS vs Traefik catch-all) · inventário env/API · DoD TE0 |
| **DoD** | Decisões fechadas; Zone/target/origin definidos em rascunho; flag nomeada; lista de campos DB acordada |
| **Status** | Pendente |

**Kickoff:** `ok sprint te0`

---

### Sprint TE1 — Ops Cloudflare + Easypanel (runbook)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Edge pronto **manual**: 1 hostname de teste criado na CF UI aponta para o app e abre a loja |
| **Entregas** | Reusar [`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md) · prova manual **tenant** `loja.*` · `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` alinhado ao Partner |
| **DoD** | Sem Add Domain por tenant no Easypanel · HTTPS no hostname de teste · `/api/public/tenant-host` 200 · UI loja/portal (não home nem 404 Easypanel) |
| **Status** | **Feito (runbook)** (2026-10-19) — prova HTTPS: checklist em [`SPRINT_TE_S1_OPS_SMOKE.md`](./SPRINT_TE_S1_OPS_SMOKE.md) |

**Nota:** Se o edge PE já estiver em staging/prod, TE1 = **smoke test tenant** (não refazer zona do zero).

**Kickoff:** ~~`ok sprint te1`~~ **feito**

---

### Sprint TE2 — Provisionamento automático (backend)

| Campo | Valor |
|-------|-------|
| **Objetivo** | verify/`active` e clear sincronizam Custom Hostname na CF |
| **Entregas** | Migration `cf_*` · cliente CF · hooks verify/clear · sync status · testes · flag `tenant.edge_cloudflare_saas_v1` |
| **APIs (alvo)** | Internas: `provisionCloudflareHostname(hostId)` / `deprovision…` · sem endpoint público novo obrigatório |
| **DoD** | Flag ON em staging: verify cria hostname CF; clear remove; falha CF não corrompe posse TXT; `cf_ssl_status` atualizável |
| **Status** | **Feito** (2026-10-19) — [`SPRINT_TE_S2_CLOUDFLARE_PROVISION.md`](./SPRINT_TE_S2_CLOUDFLARE_PROVISION.md) |

**Kickoff:** ~~`ok sprint te2`~~ **feito**

---

### Sprint TE3 — UI Settings + Super Admin

| Campo | Valor |
|-------|-------|
| **Objetivo** | Admin do tenant configura e entende DNS/SSL sem suporte ops |
| **Entregas** | DomainSection: target CNAME CF · estados SSL · erros · Super Admin card com status CF |
| **DoD** | Copy alinhado ao runbook TE1 · “Abrir loja/portal” coerente com SSL · sem menção a “cadastre no Easypanel” |
| **Status** | **Feito** (2026-10-19) — [`SPRINT_TE_S3_UI_SSL.md`](./SPRINT_TE_S3_UI_SSL.md) |

**Kickoff:** ~~`ok sprint te3`~~ **feito**

---

### Sprint TE4 — Hardening, E2E, apex backlog

| Campo | Valor |
|-------|-------|
| **Objetivo** | Produção confiável + documentação do que ficou de fora |
| **Entregas** | Job recheck CF · métricas/logs · runbook incidente (quota, cert stuck) · doc apex (ALIAS vs Enterprise) · checklist go-live · opcional: botão Super Admin “resync CF” |
| **DoD** | E2E staging checklist verde · flag ON em prod · runbook ops anexado · apex explicitamente backlog |
| **Status** | **Feito** (2026-10-19) — [`SPRINT_TE_S4_HARDENING_GOLIVE.md`](./SPRINT_TE_S4_HARDENING_GOLIVE.md) · checklist ops |

**Kickoff:** ~~`ok sprint te4`~~ **feito**

---

## 7. Critério de pronto da fase TE (fim TE4)

- [x] Ops CF + Origin rewrite documentados (runbooks PE + TE smoke)
- [ ] `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` = target SaaS CF em prod — **ops**
- [x] Verify/`active` provisiona Custom Hostname automaticamente (código)
- [x] Clear remove na CF (código)
- [ ] Subdomínio `store` abre **loja** — **piloto ops**
- [ ] Subdomínio `support` abre **portal de chamados** — **piloto ops**
- [x] Zero Add Domain no Easypanel por tenant novo (arquitetura)
- [x] UI mostra DNS + estado SSL
- [ ] Flag de edge ON em produção — **ops** (Super Admin → Avançado → Feature Flags → `tenant.edge_cloudflare_saas_v1`)
- [x] Apex “A genérico” e login CRM fora / backlog documentado

---

## 8. Ordem de execução em chat

1. ~~**`ok sprint te0`** — decisões + inventário + ADR~~ **feito**  
2. ~~**`ok sprint te1`** — smoke tenant no edge PE~~ **feito (runbook)**  
3. ~~**`ok sprint te2`** — API CF + migration `cf_*` + hooks + só subdomínio~~ **feito**  
4. ~~**`ok sprint te3`** — UI Settings / Super Admin SSL~~ **feito**  
5. ~~**`ok sprint te4`** — hardening + go-live~~ **feito**  

**Fase TE (código): completa.** Pendência = checklist go-live em [`SPRINT_TE_S4_HARDENING_GOLIVE.md`](./SPRINT_TE_S4_HARDENING_GOLIVE.md).

---

## 9. Relação com outros planos

| Plano | Relação |
|-------|---------|
| [`PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md`](./PLAN_SPRINTS_TD_TENANT_CUSTOM_DOMAIN.md) | App/DNS/UI — **feito**; TE fecha o **edge** que S4 deixou como ops manual |
| [`SPRINT_TD_S4_CORS_TLS_CANONICAL.md`](./SPRINT_TD_S4_CORS_TLS_CANONICAL.md) | CORS/canônicos mantidos; runbook TLS Easypanel-por-host **substituído** por TE |
| Partner / PE-Go | Edge + client CF **já feitos** — TE reusa ([`PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md`](./PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md)) |
| Catálogo / hosts | Host `store` continua SSOT em `tenant_hosts` |

---

## 10. Riscos

1. **Zona ainda não na Cloudflare** — TE1 bloqueia; sem isso não há for SaaS.  
2. **Origin sem Host rewrite** — Traefik volta a 404; Origin Rule é crítica no Easypanel.  
3. **Verify TXTOK / CF SSL pending** — UX deve explicar atraso de cert (minutos).  
4. **Quota 100 hostnames** — alertar Super Admin perto do limite.  
5. **Token CF vazado** — secret só no backend; rotação documentada.  
6. **Apex mal prometido na UI** — copy deve dizer “use subdomínio”; raiz só com ALIAS/CF DNS.  
7. **Dois stacks de CNAME** (IP Easypanel vs CF) — após TE, instruções antigas no UI/docs devem ser atualizadas para não confundir.

---

## 11. Backlog pós-TE

| Item | Notas |
|------|-------|
| Apex Proxying (A em qualquer registrador) | Cloudflare Enterprise add-on |
| Partner WL via mesma CF | **Prioridade:** ver [`PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md`](./PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md) (PE-Go); TE reusa o edge |
| Wildcard plataforma `{slug}.loja.painelcrm.com` | Complementar (domínio da plataforma, não do cliente) |
| Papel `app` (login CRM) | Produto separado |

---

*Documento de planejamento da fase TE — implantação por sprints. Kickoff: `ok sprint te0`.*
