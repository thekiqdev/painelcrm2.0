# Plano — Roteamento de instância WhatsApp por finalidade

| Campo | Valor |
|-------|--------|
| **Status** | Série WR concluída (WR1–WR4) |
| **Data** | 2026-07-20 |
| **UI** | Configurações → WhatsApp → detalhe da instância (`WhatsAppInstanceDetailsSheet` / dialog) |
| **Padrão a reutilizar** | Instância designada da plataforma SaaS (`platform_notifications_whatsapp_chat_instance_id`) |
| **Prefixo de sprints** | **WR** (WhatsApp Routing) |
| **Relacionado** | [PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md](../commercial/PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md) (quota/compra — **não** misturar) |

---

## 1. Objetivo

Permitir que o tenant defina **qual conexão WhatsApp** usa cada finalidade:

1. **Chat** — aparece no inbox / conversas (`enabled_in_chat`).
2. **Notificação de faturas** — motor de invoice WhatsApp.
3. **Notificações por módulo** — tick por módulo do catálogo (agenda, propostas, etc.).

Hoje: chat usa `conversation.instance_id`; faturas/módulos caem em heurística (“última instância operable do tenant”). Isso é imprevisível com várias conexões.

---

## 2. Veredito da auditoria (baseline)

| Já existe | Gap |
|-----------|-----|
| `chat_instances` + ownership `user_id` / operate por tenant | Sem `purpose` / routing |
| `metadata.enabled_in_chat` (inbox) | Dispatch de notify **ignora** o flag |
| `resolveWhatsAppSenderUserIdForTenant` → `loadInstanceForDispatch` | Escolhe user + “mais recente”, não instance_id |
| `tenant_notification_preferences` | Liga canal/evento; **sem** `chat_instance_id` |
| Plataforma SaaS: UUID de instância em settings | Tenant CRM **não** tem equivalente |
| Catálogo `notification_event_catalog.module` | Agrupa eventos; **não** roteia instância |

Pontos de código: `whatsappSenderResolve`, `whatsappChannelDispatcher`, `businessTransactionalNotifications`, `notificationEngineOrchestrator`, UI `WhatsAppInstanceCard` → `WhatsAppInstanceDetailsSheet`.

---

## 3. Modelo alvo

```
Tenant
  └─ tenant_whatsapp_instance_routing
        (tenant_id, purpose, module_key?, chat_instance_id)

purpose:
  - chat          → (opcional na tabela; pode continuar só em metadata.enabled_in_chat)
  - invoice       → faturas / billing notify
  - module        → exige module_key (ex.: appointments, proposals, …)

Regra: no máximo 1 instância por (tenant, purpose, module_key).
A mesma instância pode acumular vários purposes/módulos.
```

**Resolve no motor (ordem):**

1. Lookup routing por purpose/módulo + instância operable.  
2. Senão → fallback atual (heurística) + log.  
3. Chat humano **não** muda: continua `conversation.instance_id`.

**Ownership:** `chat_instances.user_id` permanece dono técnico/token; routing aponta para o **id** da instância (tenant-wide).

**Não misturar** com limite comercial WI (`max_whatsapp_instances` / `instance_addon`).

---

## 4. Decisões fixas (WR0)

| # | Decisão | Valor |
|---|---------|--------|
| D1 | Onde configurar | Detalhe da instância (sheet/dialog), **não** Meu Plano |
| D2 | Card | Só resumo (chips); edição no detalhe |
| D3 | Unicidade | 1 instância por `invoice`; 1 por `(module, module_key)` |
| D4 | Chat-only | `enabled_in_chat` + **não** marcada em invoice/módulos → notify não usa |
| D5 | Sem routing | Fallback heurística atual (compat); UI avisa “nenhuma dedicada” |
| D6 | Quem edita | Admin / quem já gere conexões WhatsApp (`can_manage`) |
| D7 | Sticky retry | Preferir gravar `dispatch_chat_instance_id` (WR3); WR1 pode manter sticky de user se instance resolvida no create |
| D8 | Módulos na UI | Lista a partir de `DISTINCT module` do `notification_event_catalog` (ativos) |

---

## 5. Tracker de sprints (OK sequencial)

Só avançar à sprint N+1 após **OK** explícito na N.

| Sprint | Nome | Status | OK em | Doc detalhe |
|--------|------|--------|-------|-------------|
| **WR1** | Schema + routing faturas + UI chat/faturas | `DONE` | 2026-07-20 | [SPRINT_WR1_CLOSEOUT.md](./SPRINT_WR1_CLOSEOUT.md) |
| **WR2** | Ticks por módulo + wire no motor | `DONE` | 2026-07-20 | [SPRINT_WR2_CLOSEOUT.md](./SPRINT_WR2_CLOSEOUT.md) |
| **WR3** | Sticky instance, badges, polimento | `DONE` | 2026-07-20 | [SPRINT_WR3_CLOSEOUT.md](./SPRINT_WR3_CLOSEOUT.md) |
| **WR4** | Seed automático na única conexão | `DONE` | 2026-07-20 | [SPRINT_WR4_CLOSEOUT.md](./SPRINT_WR4_CLOSEOUT.md) |

### Como dar OK

No chat / PR: **"OK Sprint WR1"** (ou **"OK Sprint 1"** neste plano).  
Atualizar esta tabela: `Status = DONE`, `OK em = YYYY-MM-DD`, e passar a seguinte para `READY`.

---

## 6. Escopo por sprint

### WR1 — MVP: chat + faturas

**Objetivo:** tenant escolhe instância de faturas; chat-only fica explícito; invoice deixa de ser “sorte”.

| Entrega | Detalhe |
|---------|---------|
| Migration | `tenant_whatsapp_instance_routing` (ou nome equivalente) + FK `chat_instances` + unique |
| API | GET/PUT routing da instância (ou do tenant); validar unicidade invoice |
| Resolve | Antes do dispatch de **invoice**: lookup `purpose=invoice` |
| UI | Secção no detalhe: “Usar no Chat” + “Notificação de faturas” |
| Inbox | Manter/alinhar `enabled_in_chat` com o tick Chat |
| Testes | Unit do resolve invoice; regressão fallback |

**Fora de escopo WR1:** ticks por módulo; badges no card; mudança de sticky retry.

**Aceite:**

- [ ] Marcar instância A como faturas → `notifyInvoiceCreated` / dispatch usa A (se operable)
- [ ] Instância só-chat não é escolhida para fatura quando outra está marcada
- [ ] Sem marca de fatura → fallback atual + comportamento documentado
- [ ] Chat humano inalterado (conversa → `instance_id`)

---

### WR2 — Módulos

**Objetivo:** um tick por módulo do catálogo; eventos daquele módulo usam a instância marcada.

| Entrega | Detalhe |
|---------|---------|
| UI | Lista de módulos (agenda, propostas, …) com switch |
| API | Upsert `purpose=module` + `module_key` |
| Motor | Em `gateAndPublish` / orchestrator: resolver por `catalog.module` |
| Unicidade | Trocar tick move o routing (desmarca a outra) |
| Testes | Resolve por módulo + fallback |

**Aceite:**

- [ ] Evento de agenda usa instância marcada em `appointments` (exemplo)
- [ ] Módulo sem tick → fallback
- [ ] Invoice continua isolado (`purpose=invoice`)

---

### WR3 — Polimento

**Objetivo:** operação previsível em retry e UX clara.

| Entrega | Detalhe |
|---------|---------|
| Sticky | `dispatch_chat_instance_id` (ou metadata) no retry outbound |
| Card | Chips: Chat · Faturas · Agenda… |
| Mensagens | Avisos se instância desconectada / routing órfão |
| Docs | Closeouts WR1–WR3 + update tracker |
| SA (opcional) | Visibilidade read-only do routing do tenant |

**Aceite:**

- [ ] Retry reutiliza a mesma instância da tentativa original quando possível
- [ ] Card mostra finalidades sem abrir detalhe
- [ ] Closeout documentado

---

### WR4 — Seed automático (UX)

**Objetivo:** a primeira/única conexão operable assume Chat + faturas + módulos até o usuário desligar.

| Entrega | Detalhe |
|---------|---------|
| Seed | Só se tenant sem routing **e** exatamente 1 operable |
| Hooks | connect / status / webhook / list / GET purpose-routing |
| UI | Toast + copy; 2ª conexão não herda auto |
| Testes | Unit do seed |

**Aceite:**

- [x] Única connected → finalidades on
- [x] Já configurado → não sobrescreve
- [x] Várias operable sem routing → sem auto-escolha

---

## 7. Pontos de extensão (código)

| Objetivo | Onde |
|----------|------|
| Schema | `database/init/` + `migrationOrder.ts` |
| Resolve notify | `whatsappSenderResolve` / novo `whatsappInstanceRoutingService` |
| Dispatch | `whatsappChannelDispatcher.dispatchWhatsAppText` (aceitar `chatInstanceId` opcional) |
| Invoice | `businessTransactionalNotifications` / `invoiceNotificationsService` |
| Módulos | `notificationEngineOrchestrator` + publishers por domínio |
| Inbox | `enabled_in_chat` / `inboxVisibility.ts` |
| UI | `WhatsAppInstanceDetailsSheet`, `WhatsAppInstanceCard`, `InstancesList` |

---

## 8. Riscos

1. Instância marcada **desconectada** → fallback ou falha explícita (preferir falha controlada + UI; decidir na WR1: **fallback + warning**).  
2. Duas UIs (`Sheet` + `Dialog`) — editar routing só no sheet principal usado pela lista.  
3. Heurística residual pode mascarar misconfig — logar `price_source`-style `routing_source: explicit|fallback`.  
4. Não colocar routing só em `metadata` JSON sem tabela (unicidade e queries ficam frágeis).

---

## 9. Ordem de execução

```
OK WR1 → … → OK WR4 → série concluída
```

**Próximo passo agora:** série WR concluída (WR1–WR4).
