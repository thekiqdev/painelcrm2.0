# Runbook — Cloudflare for SaaS (subdomínio Partner)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-19 |
| **Fase** | PE Etapa 2 ([`SPRINT_PE_E2_OPS_CLOUDFLARE.md`](./SPRINT_PE_E2_OPS_CLOUDFLARE.md)) |
| **Plano** | [`PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md`](./PLAN_IMPLANTACAO_PARTNER_SUBDOMINIO.md) |
| **Docs CF** | [Getting started](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/) · [Plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/) |

Objetivo: tráfego `https://crm.parceiro.com.br` chega no app do Easypanel **sem** cadastrar esse hostname no Traefik/Easypanel, com TLS na Cloudflare.

---

## Pré-requisitos

- [ ] Zona da plataforma (ex. `painelcrm.com`) na Cloudflare (plano Free ok)
- [ ] App PainelCRM no Easypanel já acessível em um hostname conhecido (ex. `https://painelcrm.com` ou `https://app.painelcrm.com`)
- [ ] Flag `partner.channel_v1` ON em staging
- [ ] Partner de teste com sell-plans + gateway
- [ ] Deploy com Etapa 1 (rejeita apex)

---

## A. Cloudflare — setup único da zona

### A1. Fallback origin

1. DNS da zona Platform → criar registro **proxied** (nuvem laranja):

| Tipo | Nome | Conteúdo |
|------|------|----------|
| `A` ou `CNAME` | `proxy-fallback` (exemplo) | IP do VPS / hostname do origin Easypanel |

2. Dashboard → **SSL/TLS** → **Custom Hostnames** (ou **Cloudflare for SaaS**) → **Fallback Origin** = `proxy-fallback.painelcrm.com` (o FQDN do passo 1).
3. Aguardar status do fallback **Active**.

> O fallback deve alcançar o **mesmo** stack FE+API que `painelcrm.com` (ou o host canônico do app).

### A2. CNAME target (o que o Partner aponta)

Criar registro **proxied**:

| Tipo | Nome | Target |
|------|------|--------|
| `CNAME` | `customers` | `proxy-fallback.painelcrm.com` |

Resultado público: **`customers.painelcrm.com`**.

No backend Easypanel:

```text
PARTNER_WL_CNAME_TARGET=customers.painelcrm.com
```

(Opcional TE depois: `TENANT_CUSTOM_DOMAIN_CNAME_TARGET` = mesmo valor.)

### A3. Origin Host Header (crítico no Easypanel)

O Traefik do Easypanel só roteia Hosts **cadastrados**. Sem rewrite, o request chega com `Host: crm.parceiro.com.br` → **404 Easypanel**.

No Cloudflare (zona Platform):

1. **Rules** → **Origin Rules** (ou Transform Rules → Request Header)  
2. Condição: tráfego de Custom Hostnames / host ≠ domínio da plataforma  
   - Exemplo prático: `http.host ne "painelcrm.com" and http.host ne "www.painelcrm.com"`  
   - Ou: hostname contém o padrão dos clientes (se usarem só Custom Hostnames, uma regra “All incoming” com cuidado)  
3. Ação: **Host Header** / **Set host header** = o hostname **já cadastrado** no Easypanel (ex. `painelcrm.com`)

Validar: request no origin deve ter `Host: painelcrm.com` (ou o host do serviço), enquanto o browser continua em `crm.parceiro.com.br`.

### A4. API Token (para Etapa 3; opcional na prova manual)

Criar API Token com permissão mínima:

- Zone → Zone Settings → Read  
- Zone → SSL and Certificates → Edit (Custom Hostnames)  
- Zone → DNS → Read (se necessário)

Guardar no Easypanel (Etapa 3):

```text
CF_SAAS_ZONE_ID=<zone id>
CF_SAAS_API_TOKEN=<token>
```

Não commitar no git.

---

## B. Easypanel — o que fazer / o que não fazer

### Fazer

- [ ] Manter domínio(s) da **plataforma** no serviço (ex. `painelcrm.com`)
- [ ] Setar `PARTNER_WL_CNAME_TARGET=customers.painelcrm.com`
- [ ] Setar `FRONTEND_URL` / `PUBLIC_APP_URL` = URL canônica HTTPS do app
- [ ] Garantir que o origin aceita tráfego vindo da Cloudflare (se houver firewall: allowlist IPs CF ou só via CF)

### Não fazer

- [ ] **Não** Add Domain por cada Partner (`crm.parceiro…`) no Easypanel após Origin Rule ok
- [ ] Não apontar CNAME do Partner direto ao IP do VPS (bypassa TLS SaaS)

---

## C. Prova manual (1 Partner de teste)

### C1. No Painel Partner

1. `/partner` → Domínio → salvar subdomínio (ex. `crm-teste.seudominio.com.br`)
2. Copiar TXT + CNAME da UI
3. No DNS do domínio do Partner (ou de um domínio de staging que você controle):

| Tipo | Nome | Valor |
|------|------|--------|
| TXT | `_painelcrm-partner.crm-teste` (ou FQDN completo conforme o provedor) | token da UI |
| CNAME | `crm-teste` | `customers.painelcrm.com` |

4. Verificar DNS no painel → `active` (ou bypass só em staging)

### C2. Custom Hostname na Cloudflare (manual nesta etapa)

1. Custom Hostnames → **Add** → hostname = `crm-teste.seudominio.com.br`
2. Método de validação SSL: TXT ou HTTP (seguir instruções CF se pedir registros extras)
3. Aguardar:
   - hostname `status` = `active`
   - `ssl.status` = `active`

### C3. Validar no browser

| Check | Esperado |
|-------|----------|
| `https://crm-teste…/` ou login | Marca Partner (não home marketing Platform “pura” sem brand) |
| `GET /api/public/partner-brand?domain=crm-teste…` | `200` + `brand` preenchido |
| `https://crm-teste…/cadastro` | Checkout do canal (planos Partner) |
| Certificado | Emitido para o hostname do Partner (CF) |
| Easypanel | **Sem** Add Domain desse hostname |

Se aparecer **404 Easypanel** → Origin Host rewrite ausente ou fallback errado.  
Se aparecer **home Platform sem brand** → `partner-brand` falhou ou domínio não `active`.

---

## D. Variáveis de ambiente (resumo)

| Variável | Onde | Quando |
|----------|------|--------|
| `PARTNER_WL_CNAME_TARGET` | Backend | **Etapa 2** (obrigatório) |
| `PARTNER_WL_BLOCKED_HOSTS` | Backend | Incluir `painelcrm.com,www.painelcrm.com,customers.painelcrm.com,…` |
| `FRONTEND_URL` / `PUBLIC_APP_URL` | Backend | Sale-link sem WL |
| `CF_SAAS_ZONE_ID` | Backend | Etapa 3 |
| `CF_SAAS_API_TOKEN` | Backend secret | Etapa 3 |
| `partner.channel_v1` | Feature flag DB | Staging/prod |
| `partner.domain_verify_bypass` | Flag | Só non-prod |
| `partner.edge_cloudflare_saas_v1` | Flag | Etapa 3+ |

---

## E. Rollback

1. Remover Custom Hostname do Partner na CF  
2. Clear domínio no `/partner`  
3. Partner volta a `/{slug}/cadastro` no domínio da plataforma  
4. Se Origin Rule quebrar a plataforma: desabilitar a regra e voltar a testar só `painelcrm.com`

---

## F. Automação (Etapa 3 — feita no código)

Após migration `353` + secrets `CF_SAAS_*` + flag `partner.edge_cloudflare_saas_v1` **ON**:

- Verify DNS → cria Custom Hostname (não precisa mais do passo C2 manual)
- Clear domínio → apaga Custom Hostname na CF

Closeout: [`SPRINT_PE_E3_CLOUDFLARE_PROVISION.md`](./SPRINT_PE_E3_CLOUDFLARE_PROVISION.md).

## G. Próximo

Etapa 4 — UI SSL polida + E2E compra no subdomínio (`ok pe etapa 4`).
