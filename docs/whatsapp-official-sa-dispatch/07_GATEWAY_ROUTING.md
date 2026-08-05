# 07 — Gateway de comunicação e routing (`meta_cloud`)

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** **fechado com D3 = C** — adapter Meta **obrigatório** para Ops  
**Depende de:** [03](./03_BRIDGE_MOTOR_META.md)  
**Bloqueia:** Ops Kanban oficial (S3)

---

## 1. Objetivo

Definir o papel do gateway na bridge híbrida (D3): completar o adapter `meta_cloud` (hoje stub) para **Ops Kanban**, sem obrigar motors/anúncios a migrarem para o gateway na v1.

---

## 2. Achados baseline

- Primary whatsapp routing default = `uazapi`; fallback declarado `meta_cloud` (**stub** → `provider_not_implemented_p0`).
- Ops usa `sendMessage` + `opsLeadGatewaySend` (injeta token UazAPI).
- Motors/anúncios **não** usam gateway (dispatcher direto).
- D1/D2: **sem** fallback UazAPI em fluxo oficial.

---

## 3. Decisões (com D3)

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Adapter Meta na v1? | **Sim** — obrigatório para Ops (D3 C) |
| 2 | Primary whatsapp global? | Manter uazapi como default **legado**; path Ops oficial força provider `meta_cloud` / intent official |
| 3 | Fallback Meta→UazAPI? | **Não** em intent oficial |
| 4 | `instanceToken`? | Path Meta: usar `accountId` / credenciais resolve (D2), não token UazAPI |
| 5 | Webhook status? | Reusar webhook oficial; correlacionar wamid (09) — P1 se não fechar em S3 |
| 6 | Shadow gateway_v1 | Manter flag; envio oficial real só com flag ON + conta ready |

---

## 4. Trabalho técnico (S3 / parte S1)

| Tarefa | Notas |
|--------|-------|
| Implementar adapter `meta_cloud.sendMessage` | Delega a `OfficialSend` (template) |
| Registrar no `providerRegistry` (remover stub) | |
| Ops oficial: montar input com template name/lang/components | Vínculo coluna (04B) |
| Não injetar `instanceToken` UazAPI no path oficial | |
| Testes communication + adapter | |
| Routing: intent official → primary meta_cloud, **sem** fallback uazapi | Ajustar `FALLBACK` para não aplicar em official |

---

## 5. Relação com motors

Motors e anúncios oficiais usam **dispatcher + OfficialSend** (D3), **não** precisam do gateway na v1. Convergência futura opcional.

---

## 6. Decisão

| Campo | Valor |
|-------|-------|
| Implementar adapter Meta na v1? | **Sim** (Ops) |
| Primary whatsapp (Ops oficial) | `meta_cloud` |
| Fallback automático | **Não** |
| Motors no gateway | v1 **não** / depois opcional |
| Data | **2026-08-03** |

**Próximo:** [PLAN_SPRINTS_S0_S4.md](./PLAN_SPRINTS_S0_S4.md)
