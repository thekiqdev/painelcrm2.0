# Sprint WR4 CLOSEOUT — Seed automático

| Campo | Valor |
|-------|--------|
| **Sprint** | WR4 |
| **Gate** | **DONE** |
| **OK produto** | 2026-07-20 |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md](./PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md) |
| **Detalhe** | [SPRINT_WR4_AUTO_SEED.md](./SPRINT_WR4_AUTO_SEED.md) |
| **Próxima** | Série WR concluída (WR1–WR4) |

---

## Veredito

Com uma única conexão operable e sem routing prévio, o sistema ativa Chat + faturas + módulos nessa instância. Configuração existente nunca é sobrescrita. Segunda conexão permanece neutra nas finalidades de notify.

---

## O que foi feito

| Item | Detalhe |
|------|---------|
| Seed | `maybeSeedDefaultPurposeRouting` (+ sole helper) |
| Hooks | connect, status poll, webhook, `listInstances`, GET purpose-routing |
| UI | toast `auto_seeded`, copy no sheet, toast no QR |
| Testes | 3 casos de seed + regressão resolve |

---

## Aceite

| Critério | Status |
|----------|--------|
| 1ª/única connected → ticks on | **Pass** |
| Já configurado → não sobrescreve | **Pass** |
| >1 operable sem routing → não escolhe sozinho | **Pass** |

---

## Ops

Sem migration nova (reusa tabela WR1).
