# Plano — Quantidade WhatsApp obrigatória no plano personalizado

| Campo | Valor |
|-------|--------|
| **Status** | WC1–WC2 **DONE** · WC3 opcional |
| **Data** | 2026-07-20 |
| **Hub comercial** | `/meu-plano` (alias `/plano` ou `/planos` opcional na WC2) |
| **Padrão a reutilizar** | Assentos no custom (`max_users_override` + seat addon) + WI (`instance_addon`) |
| **Prefixo de sprints** | **WC** (WhatsApp Custom) |
| **Pré-requisito** | Série [WI1–WI4](./PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md) **DONE** |
| **Não misturar** | [WR — roteamento por finalidade](../chat/PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md) |

---

## 1. Objetivo

1. No **plano personalizado**, a quantidade de conexões WhatsApp deixa de ser “ilimitada por omissão”.
2. Super Admin **define/obriga** a quantidade contratada ao criar/editar o tenant (override).
3. O tenant **contrata extras** no `/meu-plano`, no mesmo espírito dos assentos — reutilizando WI3/WI4 (`instance_addon`).

Hoje (pós-WI): se `plans.max_whatsapp_instances` e `tenants.max_whatsapp_instances_override` forem ambos NULL, o limite efetivo é **ilimitado** (WI0 D3). No custom isso é frequente → Meu Plano mostra ilimitado e **bloqueia** extras (`limit == null`).

---

## 2. Veredito da auditoria (baseline pós-WI)

| Já existe | Gap no custom |
|-----------|----------------|
| Enforcement create + `GET .../limits` (WI1) | Custom sem override → `limit: null` |
| `price_per_instance_cents` + SA catálogo (WI2) | Preço sem teto não vende extras |
| `instance_addon` preview/checkout + UI Meu Plano (WI3) | `canBuyWhatsappExtras` exige `limit != null` |
| Renovação / schedule (WI4) | Renovação de extras só faz sentido com teto |
| SA `SuperAdminClientNew`: campo opcional de qtd. WhatsApp | Campo **não obrigatório**; edição de limites frágil |
| Docs custom: overrides = quantidade contratada | Não enforce na API |

Docs relacionados: [PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md](./PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md), [PLANO-PLANOS-PERSONALIZADOS-E-PADRAO.md](../../PLANO-PLANOS-PERSONALIZADOS-E-PADRAO.md).

---

## 3. Modelo alvo (sem schema novo)

```
Plano custom
  ├─ max_whatsapp_instances     → piso / inclusas no pacote (preferir 0 ou N; evitar NULL comercial)
  └─ price_per_instance_cents   → preço da conexão extra (por intervalo)

Tenant (custom)
  max_whatsapp_instances_override  → quantidade CONTRATADA (obrigatória)
  limit efetivo = override ?? plano.max_whatsapp_instances
  extras self-service → sobem override via instance_addon (WI3)
```

Espelho de assentos: usuários = `max_users_override` / `users_count`; conexões = `max_whatsapp_instances_override`.

**Não** criar tabela nova. **Não** reutilizar campos de seat.

---

## 4. Decisões fixas (WC0)

| # | Decisão | Valor |
|---|---------|--------|
| D1 | Semântica NULL | Mantém WI0 D3 (NULL = ilimitado) para **standard** legado; **custom comercial ativo** exige teto numérico via override (ou plano) |
| D2 | Fonte da quantidade custom | `tenants.max_whatsapp_instances_override` (contratado) |
| D3 | Inclusas no catálogo | `plans.max_whatsapp_instances` = piso do pacote (ex.: 0); extras = acima do piso, cobrados com `price_per_instance` |
| D4 | Hub de contratação | `/meu-plano` (já tem secção Conexões); alias `/plano` opcional |
| D5 | Quem define o contrato inicial | Super Admin (criar cliente / limites) |
| D6 | Quem compra extras | Admin do tenant (mesmo padrão seats / WI) |
| D7 | Billing | Reusar `instance_addon` + renovação WI4 — sem `billing_reason` novo |
| D8 | Tenants custom já ilimitados | Não auto-limitar em produção sem ops; WC3 (opcional) = backfill assistido |

---

## 5. Tracker de sprints (OK sequencial)

Só avançar à sprint N+1 após **OK** explícito na N.  
**Não implementar** até **"OK Sprint WC1"** / **"OK Sprint 1"** neste plano.

| Sprint | Nome | Status | OK em | Doc detalhe |
|--------|------|--------|-------|-------------|
| **WC1** | Quantidade obrigatória no custom (SA + API) | `DONE` | 2026-07-20 | [SPRINT_WC1_CLOSEOUT.md](./SPRINT_WC1_CLOSEOUT.md) |
| **WC2** | Meu Plano: contratação alinhada a seats | `DONE` | 2026-07-20 | [SPRINT_WC2_CLOSEOUT.md](./SPRINT_WC2_CLOSEOUT.md) |
| **WC3** | Backfill + governança (opcional) | `OPTIONAL` — aguarda OK se necessário | — | — |

### Como dar OK

No chat / PR: **"OK Sprint WC1"** (ou **"OK Sprint 1"** neste plano).  
Atualizar esta tabela: `Status = DONE`, `OK em = YYYY-MM-DD`, e passar a seguinte para `READY`.

---

## 6. Escopo por sprint

### WC1 — Quantidade obrigatória (contrato)

**Objetivo:** plano personalizado não “nasce” ilimitado por omissão.

| Entrega | Detalhe |
|---------|---------|
| SA criar cliente | Quantidade WhatsApp **obrigatória** se `plan_type = custom` |
| SA limites | Editar override WhatsApp com validação (mín. ≥ uso atual, se aplicável) |
| API | Create/update tenant custom → 400 se override WhatsApp ausente/invalid |
| Catálogo | Copy em custom: piso inclusas + preço por extra (clarificar labels) |
| Ops | Checklist: listar tenants custom com `limit` efetivo NULL |

**Fora de escopo WC1:** mudar pricing; backfill em massa; alias de rota.

**Aceite:**

- [ ] Não é possível associar custom ativo sem quantidade WhatsApp contratada
- [ ] `GET .../limits` devolve `limit` numérico para esses tenants
- [ ] Create instance acima do teto → 403 (já WI1; regressão)

---

### WC2 — `/meu-plano` como canal de expansão

**Objetivo:** paridade de UX com assentos; extras compráveis quando há teto + preço.

| Entrega | Detalhe |
|---------|---------|
| UI Meu Plano | Copy custom: contratadas / em uso / disponíveis; CTA extras |
| Legado ilimitado | Mensagem clara (“definir quantidade com o suporte/SA”) — sem fingir add-on |
| Alias | Opcional: `/plano` e/ou `/planos` → mesmo hub |
| Regressão | Preview/checkout `instance_addon` + schedule downgrade com override custom |
| Docs | Closeout WC1–WC2 + link no plano personalizados |

**Aceite:**

- [ ] Custom com teto + `price_per_instance` → admin compra extras no Meu Plano
- [ ] Pagamento sobe override; falha não sobe
- [ ] Custom sem preço → mensagem SA (não quebra)

---

### WC3 — Backfill (opcional)

**Objetivo:** tenants custom já em produção com WA ilimitado.

| Entrega | Detalhe |
|---------|---------|
| Relatório SA | Custom com `limit == null` + current usage |
| Assistente | Sugerir override = `max(uso, N comercial)` — aplicar só com confirmação |
| Docs | Runbook ops |

**Aceite:**

- [ ] Nenhum tenant alterado sem ação explícita SA/ops

---

## 7. Pontos de extensão (código)

| Objetivo | Onde |
|----------|------|
| Limite efetivo | `tenantLimitService.ts` |
| Create tenant / overrides | controllers SA tenants + `SuperAdminClientNew` / `SuperAdminClientLimites` |
| Instance addon | `tenantInstanceCommercialService.ts`, rotas `myTenantPlan*` |
| Hub | `src/pages/MeuPlano.tsx` (`#meu-plano-whatsapp-conexoes`) |
| Catálogo | `SuperAdminPlans.tsx`, `plansController.ts` |
| Rotas front | router (alias `/plano`) |

---

## 8. Riscos

1. Obrigar override em create **sem** backfill → tenants antigos continuam ilimitados até WC3/ops (aceitável por D8).
2. Piso do plano `NULL` + override preenchido → OK; piso `NULL` + override `NULL` → proibido no custom ativo (WC1).
3. Não misturar com WR (finalidades Chat/Faturas).
4. Downgrade agendado não pode ir abaixo do uso atual (já WI4 — regressão).

---

## 9. Ordem de execução

```
OK WC1 → implementar WC1 → closeout WC1
OK WC2 → …
(OK WC3 opcional)
```

**Próximo passo agora:** série WC1–WC2 concluída. WC3 (backfill) só com **OK Sprint WC3** explícito.
