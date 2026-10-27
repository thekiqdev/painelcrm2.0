# PE Etapa 4 — UI SSL + E2E canal — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Etapa** | **4** (**feito** — UI no repo; E2E = checklist staging) |
| **Plano-mãe** | [`PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md`](./PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md) |
| **Anterior** | [`SPRINT_PE_E3_CLOUDFLARE_PROVISION.md`](./SPRINT_PE_E3_CLOUDFLARE_PROVISION.md) |
| **Próximo** | Etapa 5 **feita** → [`SPRINT_PE_E5_GOLIVE_HARDENING.md`](./SPRINT_PE_E5_GOLIVE_HARDENING.md) |

---

## Objetivo

Partner entende DNS/SSL na UI; fluxo de compra no subdomínio validável ponta a ponta.

---

## Entregas (repo)

### UI Domínio (`PartnerDomainPage`)
- Badges **DNS** + **SSL** com rótulos amigáveis (`cfSslStatusLabel`)
- Checklist: Configurado · DNS · HTTPS
- Banner **“Certificado em provisionamento”** quando SSL pending
- Alert de erro Cloudflare (`cf_last_error`)
- Botão **Abrir checkout do canal** → `https://{sub}/cadastro` (quando DNS ativo)

### UI Link de vendas
- Botão **Abrir checkout** no link atual (path ou domínio WL)

### Helpers
- `cfSslStatusLabel`, `isCfSslPending`, `partnerChannelCheckoutUrl` em `partnerTypes.ts`

---

## Checklist E2E staging (ops / QA)

Pré-requisitos: Etapas 2–3 (CF + flag edge ON + migration 353) · Partner com sell-plans + Asaas sandbox.

| # | Passo | Esperado |
|---|--------|----------|
| 1 | `/partner` → Domínio → salvar subdomínio | Só subdomínio; apex rejeitado |
| 2 | DNS TXT + CNAME → Verificar | Status DNS Ativo; badge SSL aparece |
| 3 | Aguardar SSL `active` (ou banner pending) | HTTPS no Host |
| 4 | Abrir checkout do canal | `/{…}/cadastro` no subdomínio · marca Partner |
| 5 | Escolher plano → dados → pagamento sandbox | Gateway **do Partner** |
| 6 | Após pagamento/trial | `customer_tenant` com `partner_id` |
| 7 | Link de vendas no painel | URL no hostname do canal (não só `/{slug}/cadastro` na Platform) |
| 8 | Checkout: copy/marca | Sem “PainelCRM” no header/shell do canal |
| 9 | `GET /api/public/partner-brand?domain=` | 200 + brand |
| 10 | Remover domínio | Custom Hostname removido (flag edge); link volta ao path Platform |

Marque no ambiente quando validar:

- [ ] Passos 1–10 OK em staging

---

## DoD

| Item | Estado |
|------|--------|
| UI DNS + SSL + banner + abrir checkout | **OK** |
| E2E compra no subdomínio | **Checklist ops** acima |
| Marca / gateway Partner | Validar no checklist §8 / §5 |

---

## Kickoff próximo

`ok pe etapa 5` — go-live produção + hardening + piloto.
