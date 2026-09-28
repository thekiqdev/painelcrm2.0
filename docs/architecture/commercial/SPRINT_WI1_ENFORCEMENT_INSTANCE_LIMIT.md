# Sprint WI1 — Enforcement do limite de instâncias WhatsApp

| Campo | Valor |
|-------|--------|
| **Sprint** | WI1 |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md](./PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md) |
| **Status** | `DONE` — ver [SPRINT_WI1_CLOSEOUT.md](./SPRINT_WI1_CLOSEOUT.md) |
| **Depende de** | — |
| **Desbloqueia** | WI2 (preço por instância) |
| **Data criação** | 2026-07-20 |

---

## Objetivo

Garantir que a criação de `chat_instances` respeita o limite efetivo do tenant (`max_whatsapp_instances_override` ?? `plans.max_whatsapp_instances`), com feedback na API e na UI — **sem** monetização/self-service ainda.

---

## Contexto (reaproveitar)

- Checker já existe: `checkTenantWhatsAppInstancesLimit` em `tenantLimitService.ts`.
- Contagem: `chat_instances` JOIN `users` do tenant.
- Limite efetivo: `getTenantLimit(..., 'max_whatsapp_instances', 'max_whatsapp_instances_override')`.
- Hoje o checker só alimenta relatório Super Admin (`getTenantUsage`).

---

## Escopo

### In

1. **Backend — create instance**  
   Antes de qualquer chamada à UazAPI / `INSERT`:
   - Resolver `tenantId` do user.
   - `checkTenantWhatsAppInstancesLimit(tenantId)`.
   - Se `!allowed` → **403** com mensagem clara (`current` / `limit`).
   - Se `limit == null` → permitir (ilimitado).

2. **API limits**  
   Estender `GET /api/me/tenant/limits` (hoje só users) com:

   ```json
   {
     "users": { "current": 3, "limit": 5 },
     "whatsapp_instances": { "current": 1, "limit": 1 }
   }
   ```

   Manter compatibilidade: campos antigos de users não podem quebrar clientes existentes (adicionar, não renomear à força).

3. **Frontend**
   - Serviço `tenantLimits` tipado com `whatsapp_instances`.
   - UI de conexões (`AddConnectionDialog` / settings WhatsApp):
     - Mostrar “X de Y conexões” (Y = “Ilimitado” se `limit == null`).
     - Desabilitar criar no limite.
     - CTA para `/meu-plano` (“Aumentar limite no Meu Plano” — copy ok mesmo antes do add-on WI3).

4. **Testes**
   - Checker + gate no create (mock pool / 403 sem chamar Uaz).
   - Limits endpoint devolve o novo bloco.

5. **Ops (checklist, não migration obrigatória)**
   - Listar planos ativos com `max_whatsapp_instances IS NULL` e decidir teto comercial (ex.: 1) fora do código se necessário.

### Out

- Preço por instância / migration `price_per_instance_cents` → **WI2**
- Checkout / `instance_addon` / Meu Plano compra → **WI3**
- Renovação SaaS com extras → **WI4**
- Mudança de ownership `chat_instances` (continua `user_id`)

---

## Critérios de aceite

| # | Critério | Pass? |
|---|----------|-------|
| A1 | Create com tenant no limite → 403; **sem** chamada UazAPI | ☐ |
| A2 | Create com folga no limite → comportamento atual | ☐ |
| A3 | Override SA acima do plano permite creates até o override | ☐ |
| A4 | `GET /api/me/tenant/limits` inclui `whatsapp_instances` | ☐ |
| A5 | UI mostra uso e bloqueia botão criar no limite | ☐ |
| A6 | Testes automatizados do gate passam | ☐ |

---

## Ficheiros prováveis

| Área | Path |
|------|------|
| Checker | `packages/backend/src/services/tenantLimitService.ts` |
| Create | `packages/backend/src/controllers/chatController.ts` |
| Limits | `packages/backend/src/controllers/myTenantPlanController.ts` (+ routes se preciso) |
| FE limits | `src/services/tenantLimits.ts` |
| UI | `AddConnectionDialog` / ecrãs de conexões WhatsApp |
| Testes | junto a `tenantLimitService` / chat create |

---

## Riscos WI1

| Risco | Mitigação |
|-------|-----------|
| Check depois da Uaz | Ordem fixa: check → Uaz → DB |
| Planos NULL = “furo” | Checklist ops; semântica documentada |
| Breaking change em `/limits` | Só adicionar campos |
| Mensagem fraca | Incluir current/limit e hint Meu Plano |

---

## Gate de aprovação

```
Status atual: READY
Para iniciar código: responder "OK Sprint WI1" ou "OK Sprint 1"
Após merge + aceite: Status → DONE + closeout curto neste ficheiro ou SPRINT_WI1_CLOSEOUT.md
```

### Checklist pós-implementação (preencher no closeout)

- [ ] Commit / PR link
- [ ] Aceite A1–A6
- [ ] Plano-mãe: WI1 = DONE, WI2 = READY
- [ ] Data OK produto: ________

---

## Fora desta sprint (lembrete)

WI1 **não** permite ainda aumentar o limite pelo Meu Plano. O CTA pode existir como navegação; a compra entra na **WI3**.
