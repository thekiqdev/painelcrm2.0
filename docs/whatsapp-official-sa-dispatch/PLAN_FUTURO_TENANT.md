# Program B — Implantação futura: WhatsApp Oficial na plataforma do cliente (tenant)

**Data:** 2026-08-04  
**Status:** **ADIADO** — não iniciar até Program A (Super Admin) estável em produção  
**Programa atual:** [PLAN_MESTRE.md](./PLAN_MESTRE.md) · sprints [S0–S4](./PLAN_SPRINTS_S0_S4.md)  
**ADR:** D1 exclui este escopo de propósito

---

## 1. Por que está separado

A decisão de produto (**D1**) foi implantar a API oficial **somente no Super Admin** nesta fase:

- Motor `platform.*`, Ops Kanban, anúncios/campanhas SA
- **Não** motor CRM do tenant (`invoice.*`, propostas, contratos, agenda)
- Flag `whatsapp_official_tenant_enabled` permanece **false** por default

Misturar tenant no mesmo PR/sprint aumenta risco (WABA por empresa, limites de plano, compliance por tenant, onboarding) e atrasa o go-live SA.

Este documento é o **placeholder oficial** da fase futura, para não perder requisitos e para reaproveitar o que Program A construir.

---

## 2. Objetivo futuro (quando abrir)

Permitir que **empresas clientes** (tenants) enviem mensagens transacionais e operacionais pela **API oficial Meta**, com:

1. Mensagens padrão CRM: pagamento criado / atrasado / pago (`invoice.*`), e demais eventos do motor tenant conforme prioridade.
2. Conta oficial por tenant **ou** modelo partilhado (BSP / número da plataforma) — **a decidir** num D1-B futuro.
3. Mesma regra de ouro: sync → enviar HSM → vincular → só APPROVED dispara.
4. UI no painel do cliente (Configurações / WhatsApp / Notificações), não só Super Admin.

---

## 3. O que reaproveitar de Program A (não reinventar)

| Ativo construído em A | Reuso em B |
|-----------------------|------------|
| `OfficialSend` + resolve de remetente | Estender resolve para `owner_scope=tenant` |
| Fase Modelos (sync/create/edit/vínculo) | Vínculos por `tenant_id` + `event_key` |
| Builder HSM (04C) | Mesmo builder; permissões tenant |
| Adapter gateway `meta_cloud` | Envio Ops/CRM tenant se aplicável |
| Classificador erros Graph + wamid em deliveries | `notification_outbound_deliveries` |
| Allowlist / flags / runbook | Flags por tenant + kill switch global |
| Schema `whatsapp_official_accounts` (tenant) | Já previsto; ativar fluxos |

---

## 4. O que é novo (investigar só quando abrir B)

| Tema | Perguntas | Doc a criar depois |
|------|-----------|---------------------|
| Modelo de conta | WABA própria por tenant vs número partilhado PainelCRM? | `B01_MODELO_CONTA_TENANT.md` |
| Comercial | Limites no plano (`whatsapp_official_*`); quem paga conversas Meta? | planos / billing |
| Onboarding | Fluxo Embedded Signup / token por empresa | onboarding WA |
| Catálogo | Matriz `invoice.*` / proposal / contract / appointment → HSM | espelho do 04 |
| Preferências | Tenant liga/desliga oficial vs UazAPI por módulo | NotificationsSection |
| Compliance | Opt-in cliente final; categorias UTILITY | 08 estendido |
| Isolamento | Segredos, webhook multi-tenant, rate limit por tenant | segurança |
| Migração | Coexistência UazAPI instâncias do cliente | cutover |

**Não** detalhar sprints B0–Bn até A estar estável e produto fechar modelo de conta.

---

## 5. Pré-condições para abrir Program B

- [ ] Program A DoD completo ([PLAN_MESTRE.md](./PLAN_MESTRE.md) §4.4)
- [ ] Oficial SA estável ≥ N dias em produção (definir N com ops)
- [ ] Decisão de produto: WABA por tenant vs shared
- [ ] ADR **D1-B** assinado (escopo tenant)
- [ ] Flag `whatsapp_official_tenant_enabled` planificado com rollout gradual
- [ ] Capacidade eng livre (não paralelizar com S0–S4 de A)

---

## 6. Esboço de fases futuras (não comprometido)

| Fase | Nome | Ideia |
|------|------|-------|
| **B0** | Investigação conta + comercial | Fechar modelo WABA / preços |
| **B1** | Conta tenant + modelos | Upsert conta, sync HSM, vínculo `invoice.*` piloto |
| **B2** | Bridge motor tenant | `dispatchWhatsAppText` path Meta + allowlist |
| **B3** | UI tenant + preferências | Settings WhatsApp oficial + Notifications |
| **B4** | Hardening multi-tenant | Webhook, quotas, runbook |

Detalhar só após B0.

---

## 7. Explicitamente fora até lá

- Ligar `whatsapp_official_tenant_enabled` em produção
- Migrar tenants “à força” de UazAPI → Meta
- Prometer parity total Evolution/legado no mesmo release de A
- Implementar builder “todas features Meta” só por causa do tenant

---

## 8. Ligações

- Escopo atual (exclui tenant): [01](./01_ESCOPO_PRODUTO_E_CANAIS.md)  
- Flag: `systemFeatureFlagsService` → `whatsapp_official_tenant_enabled`  
- Motor tenant hoje: `docs/notifications-engine/`  
- Mestre: [PLAN_MESTRE.md](./PLAN_MESTRE.md)
