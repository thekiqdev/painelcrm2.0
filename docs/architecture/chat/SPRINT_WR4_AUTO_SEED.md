# Sprint WR4 — Seed automático na única conexão

| Campo | Valor |
|-------|--------|
| **Sprint** | WR4 |
| **Gate** | Em execução (OK implícito do produto 2026-07-20) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md](./PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md) |

---

## Objetivo

Evitar a percepção de “bug” ao conectar o primeiro WhatsApp: a única instância operable assume Chat + faturas + módulos, até o usuário desativar.

## Regras

1. Seed **somente** se o tenant **não tem** nenhuma linha em `tenant_whatsapp_instance_routing`.
2. Seed **somente** se existe **exatamente uma** instância `connected`/`open` e é a candidata.
3. **Não** reativa tudo ao criar a 2ª conexão (já há routing ou há >1 operable).
4. Backfill: `listInstances` / GET purpose-routing / status poll / webhook / connect.

## Entregas

| Item | Detalhe |
|------|---------|
| Serviço | `maybeSeedDefaultPurposeRouting` / `maybeSeedSoleOperableInstanceRouting` |
| Hooks | connect, status poll, webhook connection, listInstances, GET purpose-routing |
| UI | copy + toast `auto_seeded`; aviso “outra conexão” |
| Testes | unit do seed |
