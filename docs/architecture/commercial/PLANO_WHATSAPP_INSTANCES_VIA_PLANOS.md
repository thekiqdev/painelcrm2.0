# Plano — Limite e contratação de instâncias WhatsApp via planos

| Campo | Valor |
|-------|--------|
| **Status** | Aprovado para execução sequencial (gate por sprint) |
| **Data** | 2026-07-20 |
| **Hub comercial** | `/meu-plano` (não existe `/planos` no app autenticado; alias opcional na WI3) |
| **Padrão a reutilizar** | Add-on de assentos (`seat_addon`) |
| **Prefixo de sprints** | **WI** (WhatsApp Instances) |

---

## 1. Objetivo

1. Limitar a quantidade de **conexões WhatsApp** (`chat_instances`) pelo plano do tenant.
2. Permitir no cadastro do plano (Super Admin) definir **valor por instância** (além das inclusas).
3. Permitir no dashboard do utilizador (**Meu Plano**) **contratar conexões extras** self-service, no mesmo espírito do add-on de assentos.

Hoje o plano limita bem **usuários**; instâncias já têm coluna/checker, mas **não há enforcement na criação** nem **preço/compra**.

---

## 2. Veredito da auditoria (baseline)

| Já existe | Gap |
|-----------|-----|
| `plans.max_whatsapp_instances` | Não enforce na create instance |
| `tenants.max_whatsapp_instances_override` | Só relatório / overrides manuais SA |
| `checkTenantWhatsAppInstancesLimit` | Só em Super Admin usage |
| Seat addon (preview → checkout → activate) | Sem equivalente para instâncias |
| Hub `/meu-plano` | Sem UI de conexões extras |
| `plan_interval_prices.price_per_user_cents` | Sem `price_per_instance_cents` |

Docs relacionados: `docs/PLANO-PLANOS-PERSONALIZADOS-E-PADRAO.md`, `docs/architecture/commercial/AUDIT_TENANT_COMMERCIAL_OVERRIDES.md`, `docs/INVESTIGACAO-MEU-PLANO-HUB-COMERCIAL.md`.

---

## 3. Modelo comercial alvo

```
Plano (standard/custom)
  ├─ max_whatsapp_instances     → inclusas no plano (NULL = ilimitado — ver decisão WI0)
  └─ price_per_instance_cents   → preço de cada conexão extra (por intervalo)

Tenant
  limit efetivo = override ?? plano.max_whatsapp_instances
  current       = COUNT(chat_instances dos users do tenant)
  extras pagas  → sobem max_whatsapp_instances_override
```

**Ownership:** `chat_instances.user_id` continua dono técnico; **quota é tenant-wide** (já é a contagem do checker).

**Não misturar** com `seat_addon` / `max_users_override`.

---

## 4. Decisões fixas (WI0)

| # | Decisão | Valor |
|---|---------|--------|
| D1 | Hub | `/meu-plano` (+ alias `/planos` opcional na WI3) |
| D2 | Preço por intervalo | Coluna `plan_interval_prices.price_per_instance_cents` (nullable = extras não vendáveis) |
| D3 | NULL no limite do plano | Manter semântica **ilimitado**; planos comerciais ativos devem ter valor explícito (ex.: 1) — checklist operacional na WI1 |
| D4 | Quem compra extras | Admin do tenant (mesma permissão/padrão dos seats) |
| D5 | Check create | **Antes** da chamada UazAPI |
| D6 | `billing_reason` | `instance_addon` (espelho de `seat_addon`) |

---

## 5. Tracker de sprints (OK sequencial)

Só avançar à sprint N+1 após **OK** explícito na N.

| Sprint | Nome | Status | OK em | Doc detalhe |
|--------|------|--------|-------|-------------|
| **WI1** | Enforcement do limite + API limits + UI bloqueio | `DONE` | 2026-07-20 | [SPRINT_WI1_CLOSEOUT.md](./SPRINT_WI1_CLOSEOUT.md) |
| **WI2** | Preço por instância no catálogo (SA + migration) | `DONE` | 2026-07-20 | [SPRINT_WI2_CLOSEOUT.md](./SPRINT_WI2_CLOSEOUT.md) |
| **WI3** | Add-on self-service no Meu Plano | `DONE` | 2026-07-20 | [SPRINT_WI3_CLOSEOUT.md](./SPRINT_WI3_CLOSEOUT.md) |
| **WI4** | Renovação / próximo ciclo + polimento | `DONE` | 2026-07-20 | [SPRINT_WI4_CLOSEOUT.md](./SPRINT_WI4_CLOSEOUT.md) |

### Como dar OK

No chat / PR: **"OK Sprint WI1"** (ou "OK Sprint 1").  
Atualizar esta tabela: `Status = DONE`, `OK em = YYYY-MM-DD`, e passar a seguinte para `READY`.

---

## 6. Escopo por sprint

### WI1 — Enforcement (valor imediato)

**Objetivo:** ninguém cria conexão acima do limite do plano/override.

| Entrega | Detalhe |
|---------|---------|
| Gate backend | `createInstance` chama `checkTenantWhatsAppInstancesLimit` **antes** da UazAPI → 403 |
| API | `GET /api/me/tenant/limits` passa a expor `whatsapp_instances: { current, limit }` |
| UI | Contador “X de Y conexões” + bloquear criar + CTA para Meu Plano |
| Testes | Unit/integração do checker no create; regressão Super Admin usage |
| Ops | Checklist: planos ativos com `max_whatsapp_instances` preenchido onde o comercial exige limite |

**Fora de escopo WI1:** preço, checkout, `billing_reason`, Meu Plano add-on.

**Aceite:**

- [ ] Create acima do limite → 403; UazAPI **não** é chamada
- [ ] Create abaixo do limite → fluxo atual
- [ ] `GET .../limits` devolve current/limit de instâncias
- [ ] UI impede criar no limite e explica o motivo
- [ ] Override SA continua a funcionar como teto efetivo

---

### WI2 — Preço no cadastro do plano

**Objetivo:** Super Admin define valor por instância por periodicidade.

| Entrega | Detalhe |
|---------|---------|
| Migration | `plan_interval_prices.price_per_instance_cents` (INTEGER NULL) |
| API plans | CRUD aceita/devolve o campo |
| UI SA | `SuperAdminPlans` — “Valor por instância” (custom e, se aplicável, standard extras) |
| Contrato | Preparar campo snapshot/contratado se seats já tiverem padrão análogo (não ativar compra ainda) |

**Aceite:**

- [ ] Plano grava e lê `price_per_instance_cents` por intervalo
- [ ] NULL = extras não vendáveis (comportamento documentado)
- [ ] Sem regressão em preço por usuário / seat addon

---

### WI3 — Contratação self-service

**Objetivo:** tenant compra conexões extras em `/meu-plano`.

| Entrega | Detalhe |
|---------|---------|
| Serviço | `tenantInstanceCommercialService` (clone de seat: preview pró-rata, checkout) |
| Billing | `billing_reason = instance_addon`; activate → sobe `max_whatsapp_instances_override` |
| Rotas | `POST .../instance-addon/preview` + `.../checkout` |
| UI | Secção Conexões em `MeuPlano.tsx` + modo no checkout existente |
| Alias | Opcional: rota `/planos` → mesmo hub |

**Aceite:**

- [ ] Preview mostra valor pró-rata coerente
- [ ] Pagamento confirmado aumenta override e permite criar +N instâncias
- [ ] Falha de pagamento não sobe override
- [ ] Histórico de billing mostra `instance_addon`

---

### WI4 — Renovação e polimento

**Objetivo:** extras persistem na renovação; UX e SA completos.

| Entrega | Detalhe |
|---------|---------|
| Renew | Override / quantidade contratada de instâncias entra no cálculo de renovação SaaS |
| Schedule | Opcional: reduzir no próximo ciclo (espelho seats) |
| SA | Visibilidade de extras + usage |
| Docs | Closeouts WI1–WI4 + update `PLANO-PLANOS-PERSONALIZADOS-E-PADRAO.md` |

**Aceite:**

- [ ] Renovação não “esquece” extras pagas
- [ ] Mensagens de erro unificadas
- [ ] Closeout documentado

---

## 7. Pontos de extensão (código)

| Objetivo | Onde |
|----------|------|
| Checker | `packages/backend/src/services/tenantLimitService.ts` |
| Create gate | `packages/backend/src/controllers/chatController.ts` (create instance) |
| Limits API | `myTenantPlanController` / `GET /api/me/tenant/limits` |
| UI create | `AddConnectionDialog` / settings WhatsApp |
| Seat clone | `tenantSeatCommercialService.ts`, `activateSeatAddonFromBilling` |
| Hub | `src/pages/MeuPlano.tsx`, checkout SaaS |
| SA planos | `SuperAdminPlans.tsx`, `plansController.ts` |

---

## 8. Riscos

1. Check **depois** da UazAPI → órfãos no provedor — **proibido** (D5).
2. NULL = ilimitado → planos sem teto continuam abertos até ops preencher (D3).
3. Qualquer user que cria consome quota da empresa.
4. Não reutilizar campos de seat para instâncias.
5. Billing V2 (`billing_plans`) **fora** deste plano — path legado `/meu-plano` + `tenant_billing`.

---

## 9. Ordem de execução

```
OK WI1 → implementar WI1 → closeout WI1
OK WI2 → …
OK WI3 → …
OK WI4 → …
```

**Próximo passo agora:** plano WI1–WI4 **concluído**. Ops: aplicar migrations `293`–`295` em produção.
