# 11 — ADR: decisões canônicas

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** D1 + D2 + D3 fechados; Program A = [PLAN_SPRINTS_S0_S4.md](./PLAN_SPRINTS_S0_S4.md); Program B = [PLAN_FUTURO_TENANT.md](./PLAN_FUTURO_TENANT.md) (adiado)  
**Plano mestre:** [PLAN_MESTRE.md](./PLAN_MESTRE.md)  
**Tipo:** Architecture Decision Record (consolidado)

---

## Contexto

O PainelCRM já possui:

- Integração **Meta Cloud** no Super Admin (conta, HSM, campanhas, webhook, chat).
- Motores de notificação **plataforma** e **tenant** que disparam WhatsApp só via **UazAPI**.
- **Ops Kanban** de registro com automações via **communication gateway** (UazAPI; `meta_cloud` stub).
- Anúncios SA e campanhas Meta como superfícies separadas.

O produto exige disparo oficial **somente no Super Admin**: catálogo completo de mensagens plataforma, Ops Kanban (auto + manual), campanhas, anúncios com wizard Meta, builder/edição de modelos.

Este ADR consolida as decisões das investigações **antes** da implementação.

---

## Decisões

### D1 — Escopo v1 — **FECHADO (2026-08-03)**

- **Decisão:** Implantar API oficial **somente no Super Admin**. Inclui:
  - **Todo** o catálogo de mensagens do motor plataforma (`platform.*`: senha, billing novo/atrasado/pago, account, trial, plan, tickets, etc.);
  - Ops Kanban: **automações + envio manual no card**;
  - **Campanhas** e **anúncios** da plataforma no plano;
  - **Fase Modelos** (sync → enviar → vincular) como gate;
  - Builder rico (botões, menus conforme Meta, links, variáveis) e modelos **editáveis** no SA com efeito na Meta ([04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md)).
- **Anúncio oficial (UX):** escolher API oficial → criar anúncio → step submete modelo à Meta → status APPROVED → **libera** botão Enviar.
- **Canal:** fluxo em API oficial = **Meta apenas**, **sem fallback UazAPI**. UazAPI só se o fluxo permanecer deliberadamente no não-oficial.
- **Alternativas rejeitadas nesta fase:** oficial no tenant CRM (`invoice.*`, WABA por empresa); fallback automático UazAPI.
- **Consequências:** pagamentos = `platform.billing.*`; bridge/tenant CRM fora; anúncios e builder entram **antes**/em paralelo aos sprints de bridge, não como “depois opcional”.
- **Ref:** [01](./01_ESCOPO_PRODUTO_E_CANAIS.md)

### D2 — Remetente oficial — **FECHADO (arquitetura, 2026-08-03)**

- **Decisão:** Remetente = conta `whatsapp_official_accounts` **superadmin** (`phone_number_id` + WABA). UI no hub oficial. **Um** número na v1.
- **Fallback UazAPI:** **não** em fluxos oficiais (D1). Resolve dedicado; `not_ready` se Meta indisponível.
- **Pendente ops:** checklist por ambiente ([02](./02_CONTA_META_E_REMETENTE.md) §4).
- **Ref:** [02](./02_CONTA_META_E_REMETENTE.md)

### D3 — Path técnico bridge — **FECHADO (2026-08-03)**

- **Decisão:** Opção **C (híbrido)**  
  - `platformWhatsAppSenderResolve` + `OfficialSend` (Graph template)  
  - Branch Meta no **dispatcher** (motors + anúncios)  
  - Adapter **`meta_cloud`** no **gateway** (Ops Kanban)  
  - Campanhas: worker atual; convergência depois  
- **Motivo:** D1 exige motors + anúncios + Ops; motors já têm retry/idempotency; Ops já está no gateway; um client Graph partilhado.  
- **Regras:** só HSM APPROVED; sem fallback UazAPI; PIX via CTA no HSM.  
- **Ref:** [03](./03_BRIDGE_MOTOR_META.md), [07](./07_GATEWAY_ROUTING.md), [PLAN_SPRINTS_S0_S4.md](./PLAN_SPRINTS_S0_S4.md)

### D4 — Binding event_key → HSM + Fase Modelos

- **Decisão (binding técnico):** (colunas / tabela ponte / convenção) — *em aberto*  
- **Lista v1 de templates:** **todo** catálogo `platform.*` (D1)  
- **Fase Modelos (obrigatória):** sync → enviar/criar HSM → vincular → disparar  
- **Regra:** sem vínculo APPROVED = não envia pela API oficial (sem texto solto na Graph)  
- **04C baseline:** wizard anúncio (gate APPROVED); builder P0 = atual + picker vars; edição = update Graph + fallback `name_vN`; menus session fora do HSM anúncio  
- **Ref:** [04](./04_TEMPLATES_EVENT_KEY_HSM.md), [04B](./04B_CICLO_VIDA_MODELOS.md), [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md)

### D5 — Ops Kanban — **parcialmente fechado (D1)**

- **Decisão:** **B** — automações **+** envio manual no card (D1)  
- **Colunas v1:** *em aberto* (detalhar em [05](./05_OPS_KANBAN_DISPARO.md))  
- **Ref:** [05](./05_OPS_KANBAN_DISPARO.md), [01](./01_ESCOPO_PRODUTO_E_CANAIS.md)

### D6 — Superfície canônica por intenção

- **Decisão:** (mapa resumido) — *em aberto*; anúncios e campanhas **no plano** (D1)  
- **Ref:** [06](./06_SUPERFICIES_SUPER_ADMIN.md), [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md)

### D7 — Compliance

- **Decisão:** motors / anúncios oficiais = template-only APPROVED; kanban conforme categoria  
- **Opt-in:** *em aberto*  
- **Ref:** [08](./08_COMPLIANCE_META.md)

### D8 — Rollout / rollback

- **Flag:**  
- **Allowlist:**  
- **Runbook:** crítico — **sem fallback UazAPI** (D1)  
- **Ref:** [09](./09_OBSERVABILIDADE_ROLLBACK.md)

### D9 — Gate de testes

- **Staging obrigatório:**  
- **Incluir:** wizard anúncio (gate APPROVED), builder P0, edição/resubmissão  
- **Ref:** [10](./10_TESTES_E_AMBIENTES.md), [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md)

---

## Fora de escopo explícito (D1) — Program A

- Plataforma do **cliente** (tenant): motor `invoice.*`, propostas, contratos, agenda; WhatsApp oficial por tenant.
- Fallback automático UazAPI quando o canal escolhido for API oficial.

**Futuro (não misturar com S0–S4):** [PLAN_FUTURO_TENANT.md](./PLAN_FUTURO_TENANT.md)

---

## Ordem de implementação

- Visão: **[PLAN_MESTRE.md](./PLAN_MESTRE.md)**  
- Sprints atuais: **[PLAN_SPRINTS_S0_S4.md](./PLAN_SPRINTS_S0_S4.md)** (Program A)  
- Tenant: **[PLAN_FUTURO_TENANT.md](./PLAN_FUTURO_TENANT.md)** (Program B — depois)

---

## Aprovações

| Papel | Nome | Data | Assinatura |
|-------|------|------|------------|
| Produto | | 2026-08-03 | ☐ D1 acordado em conversa — formalizar |
| Engenharia | | | ☐ |
| Operação / compliance | | | ☐ |

---

## Histórico

| Data | Nota |
|------|------|
| 2026-08-03 | Esqueleto criado |
| 2026-08-03 | Fase Modelos (04B) no pacote |
| 2026-08-03 | **D1 fechado:** SA only; catálogo platform completo; kanban auto+manual; campanhas+anúncios; sem fallback UazAPI; 04C aberto (builder/wizard/edição) |
| 2026-08-03 | **D2 arq. fechado** + **04C baseline** (matriz capacidades, wizard, estratégia edição 2) |
| 2026-08-03 | **D3 fechado = C (híbrido)** + plano sprints S0–S4 |
| 2026-08-04 | Revisão mestre: PLAN_MESTRE + PLAN_FUTURO_TENANT (Program A vs B) |
