# Pacote — WhatsApp Oficial (Super Admin + futuro tenant)

**Data:** 2026-08-03 · **Revisão:** 2026-08-04  
**Status:** D1–D3 fechados · execução **Program A** · Program B adiado  

---

## Começar por aqui

| Doc | Para quê |
|-----|----------|
| **[PLAN_MESTRE.md](./PLAN_MESTRE.md)** | Visão revisada, Program A vs B, DoD, riscos |
| **[PLAN_SPRINTS_S0_S4.md](./PLAN_SPRINTS_S0_S4.md)** | Sprints da implantação **atual** (Super Admin) |
| **[PLAN_FUTURO_TENANT.md](./PLAN_FUTURO_TENANT.md)** | Implantação **futura** (plataforma do cliente) — não iniciar agora |
| **[11_ADR_DECISOES.md](./11_ADR_DECISOES.md)** | Decisões D1–D3 |

---

## Problema de produto (Program A)

No Super Admin:

1. Kanban de registro (Ops) — automações + envio manual  
2. Mensagens padrão plataforma — **todo** `platform.*`  
3. Campanhas + anúncios oficiais (wizard APPROVED → Enviar)  
4. Builder / edição de modelos ↔ Meta  

**Não** nesta fase: oficial na plataforma do **cliente** (tenant). Ver Program B.

### Regra de ouro

Na API oficial **não se envia texto solto** — sync → enviar HSM → vincular → só APPROVED. [04B](./04B_CICLO_VIDA_MODELOS.md) · [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md).

---

## Como usar

1. Ler [PLAN_MESTRE.md](./PLAN_MESTRE.md).  
2. Executar sprints em [PLAN_SPRINTS_S0_S4.md](./PLAN_SPRINTS_S0_S4.md).  
3. Consultar investigações 01–10 conforme a sprint.  
4. **Não** misturar PRs de tenant — [PLAN_FUTURO_TENANT.md](./PLAN_FUTURO_TENANT.md).

---

## Índice completo

| # | Ficheiro | Tema |
|---|----------|------|
| — | [PLAN_MESTRE.md](./PLAN_MESTRE.md) | Plano mestre (revisão 2026-08-04) |
| — | [PLAN_SPRINTS_S0_S4.md](./PLAN_SPRINTS_S0_S4.md) | Program A — sprints |
| — | [PLAN_FUTURO_TENANT.md](./PLAN_FUTURO_TENANT.md) | Program B — futuro |
| 01 | [01_ESCOPO…](./01_ESCOPO_PRODUTO_E_CANAIS.md) | D1 FECHADO |
| 02 | [02_CONTA…](./02_CONTA_META_E_REMETENTE.md) | D2 FECHADO (arq.) |
| 03 | [03_BRIDGE…](./03_BRIDGE_MOTOR_META.md) | D3 = C híbrido |
| 04 | [04_TEMPLATES…](./04_TEMPLATES_EVENT_KEY_HSM.md) | Matriz event_key |
| 04B | [04B_CICLO…](./04B_CICLO_VIDA_MODELOS.md) | Fase Modelos |
| 04C | [04C_BUILDER…](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md) | Builder / anúncios |
| 05 | [05_OPS…](./05_OPS_KANBAN_DISPARO.md) | Kanban Ops |
| 06 | [06_SUPERFICIES…](./06_SUPERFICIES_SUPER_ADMIN.md) | UI SA |
| 07 | [07_GATEWAY…](./07_GATEWAY_ROUTING.md) | Adapter Meta |
| 08 | [08_COMPLIANCE…](./08_COMPLIANCE_META.md) | Compliance |
| 09 | [09_OBSERV…](./09_OBSERVABILIDADE_ROLLBACK.md) | Obs / rollback |
| 10 | [10_TESTES…](./10_TESTES_E_AMBIENTES.md) | Testes |
| 11 | [11_ADR…](./11_ADR_DECISOES.md) | ADR |

---

## Mapa do que já existe

| Trilho | Estado | Nota |
|--------|--------|------|
| Meta Cloud SA | Real | Conta, sync/create HSM, campanhas, chat |
| Vínculo event↔HSM / edit Meta / wizard anúncio | Falta | Program A S0–S2 |
| Motors / anúncios / Ops | UazAPI | Bridge Meta em S1–S3 |
| Gateway `meta_cloud` | Stub | S3 |
| Oficial tenant | Flag OFF | **Program B** |

---

## Critérios

**Investigação / decisões**

- [x] D1 · [x] D2 arq. · [x] D3 · [x] 04B/04C baseline · [x] Planos A/B separados  
- [ ] Checklist conta ops · [ ] D4 schema (S0) · [ ] Assinatura formal ADR  

**Program A Done** — ver [PLAN_MESTRE.md](./PLAN_MESTRE.md) §4.4
