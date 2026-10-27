# Plano de implantação — Subdomínio do Partner (canal / compra de planos)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Tipo** | Plano de implantação por etapas (ops + produto + QA) |
| **Nome** | **PE-Go — Partner Edge / Subdomínio do canal** |
| **Objetivo** | Revendedor (Partner) conecta **apenas subdomínio** próprio; cliente final compra planos do canal nesse Host — **sem** Add Domain por Partner no Easypanel |
| **Decisão** | **Somente subdomínio** nesta implantação. Domínio raiz (apex) **fora** / backlog |
| **Base app** | M5 S2 (domínio + marca) · M5 S7 (checkout `/{slug}/cadastro` e `https://{customDomain}/cadastro`) — já feitos |
| **Edge** | Cloudflare for SaaS (mesmo padrão de [`PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md`](./PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md), prioridade **Partner primeiro**) |
| **Status** | **Etapas 0–5 feitas** (2026-10-19) — código completo; piloto prod = checklist ops E5 |
| **Kickoff** | — (fase PE-Go encerrada no repo) · ops: [`SPRINT_PE_E5_GOLIVE_HARDENING.md`](./SPRINT_PE_E5_GOLIVE_HARDENING.md) |
| **Closeout E0** | [`SPRINT_PE_E0_INVENTORY.md`](./SPRINT_PE_E0_INVENTORY.md) |
| **Closeout E1** | [`SPRINT_PE_E1_SUBDOMAIN_ONLY.md`](./SPRINT_PE_E1_SUBDOMAIN_ONLY.md) |
| **Closeout E2** | [`SPRINT_PE_E2_OPS_CLOUDFLARE.md`](./SPRINT_PE_E2_OPS_CLOUDFLARE.md) · [`RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md`](./RUNBOOK_PARTNER_CLOUDFLARE_SAAS.md) |
| **Closeout E3** | [`SPRINT_PE_E3_CLOUDFLARE_PROVISION.md`](./SPRINT_PE_E3_CLOUDFLARE_PROVISION.md) |
| **Closeout E4** | [`SPRINT_PE_E4_UI_SSL_E2E.md`](./SPRINT_PE_E4_UI_SSL_E2E.md) |
| **Closeout E5** | [`SPRINT_PE_E5_GOLIVE_HARDENING.md`](./SPRINT_PE_E5_GOLIVE_HARDENING.md) · [`RUNBOOK_PE_INCIDENTES.md`](./RUNBOOK_PE_INCIDENTES.md) |

---

## 1. Meta (MVP desta implantação)

O admin do Partner, em `/partner`:

1. Informa um **subdomínio** (ex.: `crm.revenda.com.br` ou `app.agenciadev.com.br`).
2. Configura DNS: **TXT** + **CNAME** → target da plataforma (Cloudflare).
3. Verifica → `domain_status = active`.
4. Link de vendas vira `https://{subdominio}/cadastro`.
5. Cliente abre o Host → **checkout do canal** (planos `partner_sell_plans`, marca Partner, gateway Partner).

**Não-objetivo deste MVP**

| Fora | Motivo |
|------|--------|
| Domínio raiz (`revenda.com.br`) | DNS apex / Apex Proxying — backlog |
| Domínio do tenant (loja / chamados) | Fase TE depois; compartilha o mesmo edge CF |
| Login CRM “como produto” no domínio (já existe WL no app do customer) | Não é o foco do go-live; checkout é o DoD |
| Emitir TLS no Node | Edge CF |

---

## 2. O que o subdomínio abre

| URL | Comportamento |
|-----|----------------|
| `https://{subdominio}/cadastro` | Checkout do canal (casa) — planos do Partner |
| `https://{subdominio}/{sellerUserId}/cadastro` | Checkout com vendedor atribuído |
| Login / auth no mesmo Host | Marca 100% Partner |
| App do `customer_tenant` no Host | Marca Partner (sidebar / headers) |

**Não abre:** loja pública do tenant nem portal de chamados (isso é `tenant_hosts` / TD).

Sem domínio próprio, o link continua: `https://{plataforma}/{partnerSlug}/cadastro`.

---

## 3. Arquitetura (implantação)

```
Cliente DNS
  TXT  _painelcrm-partner.crm.revenda.com.br = <token>
  CNAME crm.revenda.com.br → customers.painelcrm.com   (PARTNER_WL_CNAME_TARGET)

Browser → Cloudflare for SaaS (TLS + Custom Hostname)
       → Origin Easypanel (Host rewrite → painelcrm.com)
       → SPA + API

SPA: GET /api/public/partner-brand?domain=crm.revenda.com.br
   → marca Partner
/{…}/cadastro → Partner Channel Checkout → planos + Asaas do Partner
```

---

## 4. Etapas de implantação

### Etapa 0 — Travar decisões + inventário

| Campo | Valor |
|-------|-------|
| **Objetivo** | Fechar escopo subdomínio; inventariar env, flags, Partner de teste |
| **Entregas** | Este doc validado · checklist conta CF · Partner staging escolhido · lista env |
| **DoD** | Decisão “só subdomínio” OK · Zone/target/origin definidos em rascunho · flags conhecidas |
| **Status** | **Feito** (2026-10-19) — [`SPRINT_PE_E0_INVENTORY.md`](./SPRINT_PE_E0_INVENTORY.md) |

**Checklist**

- [x] Inventário flags/env/código (repo)
- [ ] Flag `partner.channel_v1` ON em staging *(ops — ambiente)*
- [x] Env documentados: `PARTNER_WL_CNAME_TARGET`, `PARTNER_WL_BLOCKED_HOSTS`, `PUBLIC_APP_URL` / `FRONTEND_URL`
- [ ] Partner de teste com sell-plans + gateway *(ops — ambiente)*
- [x] `/partner` domínio + sale-link + `/cadastro` mapeados no código
- [ ] Conta Cloudflare + zona *(ops — Etapa 2)*

**Kickoff:** ~~`ok pe etapa 0`~~ **feito**

---

### Etapa 1 — Produto: só subdomínio (app)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Painel e API rejeitam / desencorajam apex; copy alinhado |
| **Entregas** | Validação hostname (exige ≥1 label além do registrável, ex. `a.b.com`) · UI Partner: “Use um subdomínio…” · instruções DNS TXT+CNAME |
| **DoD** | Apex tipo `empresa.com.br` rejeitado com erro claro · exemplos na UI são subdomínio · docs S2 atualizados |
| **Status** | **Feito** (2026-10-19) — [`SPRINT_PE_E1_SUBDOMAIN_ONLY.md`](./SPRINT_PE_E1_SUBDOMAIN_ONLY.md) |

**Kickoff:** ~~`ok pe etapa 1`~~ **feito**

---

### Etapa 2 — Ops: Cloudflare + Easypanel (prova manual)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Um subdomínio de teste do Partner funciona **sem** Add Domain no Easypanel |
| **Entregas** | Runbook: zona CF · for SaaS · fallback origin · Origin Host rewrite · `PARTNER_WL_CNAME_TARGET=customers.…` · Custom Hostname **manual** na CF para o host de teste · secrets no Easypanel |
| **DoD** | HTTPS no subdomínio de teste · `/api/public/partner-brand` 200 · `/cadastro` abre checkout do canal (não 404 Easypanel, não home Platform) |
| **Status** | **Feito (runbook)** (2026-10-19) — prova HTTPS: checklist em [`SPRINT_PE_E2_OPS_CLOUDFLARE.md`](./SPRINT_PE_E2_OPS_CLOUDFLARE.md) |

**Kickoff:** ~~`ok pe etapa 2`~~ **feito**

---

### Etapa 3 — Automação: provisionar Custom Hostname no verify Partner

| Campo | Valor |
|-------|-------|
| **Objetivo** | Verify/`active` e clear do Partner sincronizam Cloudflare (sem clique ops) |
| **Entregas** | Cliente API CF · campos `cf_*` em `partner_profiles` · hook verify/clear · flag `partner.edge_cloudflare_saas_v1` · testes mock · logs |
| **DoD** | Flag ON em staging: verify cria hostname CF; clear remove; SSL status visível ou sincronizado |
| **Status** | **Feito** (2026-10-19) — [`SPRINT_PE_E3_CLOUDFLARE_PROVISION.md`](./SPRINT_PE_E3_CLOUDFLARE_PROVISION.md) |

> Reusar desenho da TE2 ([`PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md`](./PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md) §5–6), aplicado a **Partner** primeiro.

**Kickoff:** ~~`ok pe etapa 3`~~ **feito**

---

### Etapa 4 — UI / status SSL + E2E canal

| Campo | Valor |
|-------|-------|
| **Objetivo** | Partner entende DNS/SSL; fluxo compra completo no subdomínio |
| **Entregas** | Badge DNS + SSL na tela de domínio · banner “certificado provisionando” · QA: cadastro → pagamento sandbox → `customer_tenant` · link de vendas usa hostname do canal |
| **DoD** | Compra de plano no subdomínio OK · marca Partner · gateway Partner · sem menção PainelCRM no checkout |
| **Status** | **Feito** (2026-10-19) — UI no repo; E2E checklist em [`SPRINT_PE_E4_UI_SSL_E2E.md`](./SPRINT_PE_E4_UI_SSL_E2E.md) |

**Kickoff:** ~~`ok pe etapa 4`~~ **feito**

---

### Etapa 5 — Go-live produção + hardening

| Campo | Valor |
|-------|-------|
| **Objetivo** | Produção estável; runbook incidente; TE tenant na fila |
| **Entregas** | Env prod · flag edge ON · cota CF monitorada · runbook (cert stuck, DNS errado, clear órfão) · 1 Partner piloto real · backlog apex + fase TE tenant documentados |
| **DoD** | Piloto vende pelo subdomínio · zero Add Domain Easypanel por Partner novo · checklist §5 verde |
| **Status** | **Feito** (2026-10-19) — [`SPRINT_PE_E5_GOLIVE_HARDENING.md`](./SPRINT_PE_E5_GOLIVE_HARDENING.md) |

**Kickoff:** ~~`ok pe etapa 5`~~ **feito**

---

## 5. Checklist go-live (fim Etapa 5)

Detalhe operacional: [`SPRINT_PE_E5_GOLIVE_HARDENING.md`](./SPRINT_PE_E5_GOLIVE_HARDENING.md) · incidentes: [`RUNBOOK_PE_INCIDENTES.md`](./RUNBOOK_PE_INCIDENTES.md)

- [x] Só subdomínio aceito no set domain Partner *(app)*
- [ ] `PARTNER_WL_CNAME_TARGET` = target SaaS CF em prod *(ops)*
- [ ] Origin Host rewrite ativo *(ops)*
- [x] Verify provisiona CF; clear remove *(app — flag ON)*
- [ ] `https://{sub}/cadastro` → checkout canal *(piloto)*
- [ ] Marca Partner em auth/checkout *(piloto)*
- [ ] Pagamento sandbox/prod no gateway do Partner *(piloto)*
- [x] Link de vendas no painel usa o subdomínio quando `active` *(app)*
- [x] Apex explicitamente fora (copy + validação) *(app)*
- [x] Fase seguinte: TE tenant loja/chamados no **mesmo** edge CF *(documentado)*

---

## 6. Variáveis e flags (resumo)

| Item | Uso |
|------|-----|
| `partner.channel_v1` | Canal Partner ligado |
| `partner.domain_verify_bypass` | Só non-prod / staging |
| `partner.edge_cloudflare_saas_v1` | Provisionamento CF (Etapa 3+) |
| `PARTNER_WL_CNAME_TARGET` | CNAME que o Partner aponta (ex. `customers.painelcrm.com`) |
| `PARTNER_WL_BLOCKED_HOSTS` | Hosts proibidos (+ hosts da plataforma) |
| `CF_SAAS_ZONE_ID` / `CF_SAAS_API_TOKEN` | API Custom Hostnames |
| `PUBLIC_APP_URL` / `FRONTEND_URL` | Origin dos sale-links quando sem domínio próprio |

---

## 7. Ordem em chat

1. ~~**`ok pe etapa 0`** — inventário + decisões~~ **feito**  
2. ~~**`ok pe etapa 1`** — validação só subdomínio (app)~~ **feito**  
3. ~~**`ok pe etapa 2`** — ops CF + prova manual~~ **feito (runbook)**  
4. ~~**`ok pe etapa 3`** — automação CF no verify Partner~~ **feito**  
5. ~~**`ok pe etapa 4`** — UI SSL + E2E compra~~ **feito**  
6. ~~**`ok pe etapa 5`** — go-live + hardening~~ **feito**  

**Fase PE-Go (repo): completa.** Restante = checklist ops/piloto na E5.

---

## 8. Relação com outros planos

| Plano | Relação |
|-------|---------|
| [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) | App canal — feito; esta implantação é o **go-live do subdomínio** |
| [`SPRINT_M5_S2_WHITELABEL_BRAND.md`](./SPRINT_M5_S2_WHITELABEL_BRAND.md) | DNS/marca — atualizado: MVP = subdomínio |
| [`SPRINT_M5_S7_PARTNER_CHANNEL_CHECKOUT.md`](./SPRINT_M5_S7_PARTNER_CHANNEL_CHECKOUT.md) | Superfície `/cadastro` no Host |
| [`PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md`](./PLAN_SPRINTS_TE_CLOUDFLARE_SAAS.md) | Mesmo edge CF; **depois** do Partner, aplicar a `tenant_hosts` (loja/chamados) |
| TD Tenant | Fora deste MVP |

---

## 9. Riscos

1. **Easypanel sem Origin rewrite** — volta 404; Etapa 2 é bloqueante.  
2. **CNAME target errado** — Partner aponta para IP/host antigo; atualizar env + UI.  
3. **SSL CF pending** — UX deve explicar atraso.  
4. **Prometer apex** — validação Etapa 1 evita suporte.  
5. **Checkout Platform no link errado** — sale-link deve usar Host do canal quando `active`.

---

*Documento de implantação por etapas. Etapas 0–5 concluídas no repositório (2026-10-19). Ops/piloto: closeout E5.*
