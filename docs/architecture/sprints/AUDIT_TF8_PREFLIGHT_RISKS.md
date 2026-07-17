# AUDIT_TF8_PREFLIGHT_RISKS — Riscos antes de implementar

| Campo | Valor |
|---|---|
| **Documento** | Auditoria pré-implementação |
| **Data** | 2026-07-16 |
| **Plano** | [`PLAN_TF8_SHELL_LOAD_SCALE.md`](./PLAN_TF8_SHELL_LOAD_SCALE.md) |
| **Auditoria gaps** | [`AUDIT_TF8_SHELL_LOAD_SCALE.md`](./AUDIT_TF8_SHELL_LOAD_SCALE.md) |

---

## Veredito

| | |
|---|---|
| **Abrir TF8?** | Sim |
| **Risco geral** | Médio (produto/staleness), baixo (dados/segurança) se FE-only |
| **Maior perigo** | E1: lista “fresca demais” após F5 com missed WS events |
| **Regra de ouro** | Skip no F5 ≠ nunca mais falar com o servidor |

---

## Regra de ouro (obrigatória na E1)

```
Boot / F5:
  → warm disk + skip GET se updatedAt < 5 min (mesmo com WS down)
Assim que WS conectar (ou após N s):
  → soft reconcile (1 GET force leve / invalidate freshness + load)
```

Sem reconcile no reconnect, o ganho de escala vem com risco de **inbox fantasma** em rede ruim.

---

## Riscos por etapa (resumo)

| Etapa | Risco principal | Mitigação no plano |
|---|---|---|
| E1 | Stale 1–5 min pós-F5 | Seed TTL longo + **soft reconcile on WS connected** |
| E2 | Dashboard atrasado 60s | TTL ≤60s; cache keyed user/tenant; force no painel |
| E3 | Vizinha fria mais lenta | Cap 1–2; open rota intacto |
| E4 | Badge desatualizado | TTL curto 15–30s |

---

## Go / No-go

| Etapa | Go? | Condição |
|---|---|---|
| E1 | **Go** | Incluir soft revalidate no `connected` |
| E2 | Go | Cache keyed; TTL ≤60s |
| E3 | Go | Cap ≥1 inclui selected |
| E4 | Go | TTL badges curto |
