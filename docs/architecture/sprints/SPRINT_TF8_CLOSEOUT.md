# SPRINT_TF8_CLOSEOUT — Shell load / escala F5

| Campo | Valor |
|---|---|
| **Sprint** | TF8 (completo) |
| **Gate** | **CLOSED** (aguardando QA F5 final) |
| **Plano** | [`PLAN_TF8_SHELL_LOAD_SCALE.md`](./PLAN_TF8_SHELL_LOAD_SCALE.md) |
| **Audit** | [`AUDIT_TF8_SHELL_LOAD_SCALE.md`](./AUDIT_TF8_SHELL_LOAD_SCALE.md) |
| **Preflight** | [`AUDIT_TF8_PREFLIGHT_RISKS.md`](./AUDIT_TF8_PREFLIGHT_RISKS.md) |
| **Data** | 2026-07-16 |

---

## Etapas

| Etapa | Closeout | Tema |
|---|---|---|
| E1 | [`SPRINT_TF8_E1_CLOSEOUT.md`](./SPRINT_TF8_E1_CLOSEOUT.md) | F5 inbox skip + soft reconcile WS |
| E2 | [`SPRINT_TF8_E2_CLOSEOUT.md`](./SPRINT_TF8_E2_CLOSEOUT.md) | `operations-dashboard` single-flight + TTL |
| E3 | [`SPRINT_TF8_E3_CLOSEOUT.md`](./SPRINT_TF8_E3_CLOSEOUT.md) | Cap warmup `/messages` (2) |
| E4 | [`SPRINT_TF8_E4_CLOSEOUT.md`](./SPRINT_TF8_E4_CLOSEOUT.md) | Shell polls + bubble Store |

---

## Meta atingida (código)

| Sintoma pré-TF8 | Pós |
|---|---|
| F5 sempre GET inbox (WS down) | Warm + skip; ≤1 soft reconcile |
| `operations-dashboard` ×N | ≤1 / 60 s |
| Warmup `/messages` ×5 | ≤2 (open + 0–1) |
| Badges / tags / categories storm | single-flight + TTL + debounce |
| Bubble `limit=4` paralelo | prefer Store / join inbox |

---

## QA final (checklist plano)

1. F5 &lt; 5 min: zero GET inbox no **boot**; ≤1 após WS.  
2. ≤1 `operations-dashboard`.  
3. ≤2 GETs messages warmup.  
4. Badges sem storm.  
5. Msg inbound: WS, sem GET lista.  
6. “Atualizar lista”: force OK.

---

## Fora de escopo (mantido)

Auth/me dedupe profundo · Redis · MB-028 Store OFF · IndexedDB SoT.
