# Plano de sprints — Chatbot Flows S28+ (Webhook estável + abrir conversa)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-06 |
| **Tipo** | Plano de implementação (continuação) |
| **Base** | [`PLAN_SPRINTS_CHATBOT_FLOWS.md`](./PLAN_SPRINTS_CHATBOT_FLOWS.md) · [`PLAN_SPRINTS_CHATBOT_FLOWS_S27.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S27.md) |
| **Nome** | **Chatbot Flows — Webhook sample fixo + ensure conversation (Woo / outbound)** |
| **Escopo** | URL de captura estável; webhook sem `conversation_id`; nó `ensure_conversation`; reuso de `send_message` / `delay` |
| **Princípio** | 1 sprint = 1 tema; sample/URL antes de runtime sem conversa; abrir conversa antes de “novo send” |
| **Status** | **S28 · S28.1 · S29 · S29.1 · S31 feitos** · **S30 skip** |

---

## 1. Contexto e problema

### 1.1 Link de teste instável (S27.1)

Hoje existem **duas** URLs:

| URL | Papel | Estável? |
|-----|--------|----------|
| `/webhooks/chatbot-flows/:token` | Produção (flow **publicado**) | Sim, até rotacionar token |
| `/webhooks/chatbot-flows-listen/:listenId` | **Ouvir** no editor (sample) | **Não** — one-shot, TTL ~60s, ID novo a cada “Ouvir” |

Integrações como **WooCommerce** cadastram um webhook e reenviam eventos. Se o agente cola o link do **Ouvir**, o segundo POST falha (listenId expirado / one-shot).

**Pedido de produto:** URL de captura de amostra **fixa**, com botão **Rotacionar** quando precisar invalidar a antiga. Manter separada da URL de produção.

### 1.2 Webhook não abre conversa

O runtime `runChatbotFlowsRuntimeFromWebhook` **exige `conversation_id`**. Pedidos Woo (e similares) trazem telefone/pedido, não UUID de conversa CRM → não dá para enviar WhatsApp nem usar o nó `send_message` atual.

### 1.3 Sugestão de nós (produto)

1. **Iniciar / garantir atendimento** — recebe número (literal ou variável), normalizar (toggle + preview), cria/reusa conversa e amarra a sessão.
2. **Envio de mensagem** — avaliar se, com o nó 1, o `send_message` existente basta; só criar upgrade se precisar “outro número” na mesma sessão. **Delay** já existe como nó `delay`.

---

## 2. Visão dos sprints

| Sprint | Nome | Objetivo |
|--------|------|----------|
| **S28** | Sample URL fixa | Endpoint de captura estável + Rotacionar; copy produção vs sample |
| **S28.1** | Webhook sem conversa | Aceitar POST só com body/vars; sessão até `ensure_conversation` (ou erro claro) |
| **S29** | `ensure_conversation` | Telefone + normalizar + create/reuse + bind sessão |
| **S29.1** | Hardening | Idempotência, limites, logs, DM-only, falhas explícitas |
| **S30** | Send avançado (opc.) | **SKIP** — ver [`PLAN_SPRINTS_CHATBOT_FLOWS_S30.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S30.md); `send_message` + `delay` bastam pós-S29 |
| **S31** | Gatilhos / opt-out | Tag/kanban trigger; opt-out `parar`/`sair` — **feito** ([`PLAN_SPRINTS_CHATBOT_FLOWS_S31.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S31.md)) |

Ordem: **S28 → S28.1 → S29 → S29.1** → ~~(S30 se necessário)~~ **S30 skip** → S31.

---

## 3. Decisões de produto (fechar no início de S28/S29)

| ID | Tema | Opções | Sugestão |
|----|------|--------|----------|
| **D28.1** | Sample fixo | Por **flow** / por nó `webhook_in` | **Por flow** (1 URL de sample; menos tokens) |
| **D28.2** | Persistência sample | Memória / DB | **DB** (sobrevive restart; Woo reenvia dias depois) |
| **D28.3** | Sample dispara runtime? | Sim / Não | **Não** — só grava `last_payload_*` (igual S27.1) |
| **D28.4** | Produção sem `conversation_id` | Rejeitar / sessão órfã / exigir nó seguinte | **Feito S28.1:** sessão órfã + runner `conversation_required` até bind; aviso de publish se path sem `ensure_conversation` |
| **D29.1** | Sem telefone no payload | Erro / fila revisar | **Erro de nó** com mensagem clara + handle `error` se existir |
| **D29.2** | Primeira msg outbound | UazAPI livre / template oficial | Seguir canal da instância; documentar limite 24h oficial |
| **D29.3** | Reuso de conversa | Sempre criar / reutilizar aberta / reabrir closed | **Reutilizar** por telefone+instância se aberta; senão criar |
| **D30.1** | Novo nó send? | Sim / Não | **Não** por default — reusar `send_message` + `delay` |

---

## 4. S28 — Sample URL fixa + Rotacionar

### Meta

Agente cadastra **uma** URL de captura no Woo (ou Postman) e reenvia eventos sem clicar “Ouvir” de novo. Produção continua no token publicado.

### Modelo

- Coluna/token estável no flow (ex. `inbound_webhook_sample_token`) **ou** tabela `chatbot_flow_webhook_samples`.
- Ingest público: `POST /webhooks/chatbot-flows-sample/:sampleToken`
  - Valida tenant/flow
  - Grava último payload (tamanho limitado, strip no publish já existente)
  - **Não** inicia `chatbot_flow_sessions`
- Auth: `POST .../rotate-sample-token` → invalida o anterior
- UI no `webhook_in`:
  - Bloco **URL de produção** (token publicado + Rotacionar produção — já parcial)
  - Bloco **URL de amostra (fixa)** + copiar + **Rotacionar amostra**
  - Copy explícita: produção dispara flow; amostra só preenche map

### Migração do Ouvir atual

- Manter one-shot **Ouvir** como atalho opcional (“janela 60s”) **ou** substituir pela URL fixa + botão “Aguardando próximo POST…” (poll).
- Preferência: **URL fixa é o caminho principal**; one-shot pode permanecer como avançado.

### Aceite

- [x] URL de amostra estável entre reloads e reenvios Woo.
- [x] Rotacionar invalida a URL antiga (404/410).
- [x] POST de amostra atualiza `last_payload_*` e árvore click-to-map.
- [x] Amostra **não** cria sessão runtime.
- [x] Copy UI deixa claro produção vs amostra.

### Entrega

- [x] Migration `315_chatbot_flow_webhook_sample.sql`
- [x] `flowWebhookInSample.ts` (ensure / rotate / ingest; sem runtime)
- [x] Rotas públicas `/webhooks/chatbot-flows-sample/:token` + auth get/rotate
- [x] UI `WebhookInFields` (produção vs amostra + Rotacionar)
- [x] Create / duplicate / import create geram `inbound_webhook_sample_token`
- [x] Testes unitários `flowWebhookInSample.test.ts`

---

## 5. S28.1 — Webhook de produção sem `conversation_id`

### Meta

Permitir POST Woo → flow publicado **sem** UUID de conversa, desde que o graph trate a abertura depois.

### Runtime

1. Se body tiver `conversation_id` válido → comportamento atual (compat).
2. Se não tiver:
   - Criar sessão com `conversation_id` **null** (migration nullable) **ou** placeholder interno até o nó 1.
   - Preferência: coluna nullable + runner bloqueia `send_message` / wait_input WhatsApp até bind.
3. Validação no **publish**: se o flow tem `webhook_in` e caminho sem `ensure_conversation` antes de nós que exigem conversa → warning ou erro de publish.

### Aceite

- [x] POST produção sem `conversation_id` inicia sessão (quando flag/graph ok).
- [x] `send_message` antes de bind falha com erro claro (não silêncio).
- [x] Legado com `conversation_id` continua igual.

### Entrega

- [x] Migration `316_chatbot_flow_sessions_orphan.sql` (`conversation_id` nullable)
- [x] Ajuste `runChatbotFlowsRuntimeFromWebhook` + rota (conversation_id opcional)
- [x] Runner bloqueia ações WhatsApp/CRM com `conversation_required`
- [x] Validação de publish / reachability (aviso soft se caminho sem `ensure_conversation`)
- [x] Testes `flowWebhookOrphan.test.ts`

---

## 6. S29 — Nó `ensure_conversation` (Iniciar atendimento)

### Meta

Transformar telefone (literal ou variável) em conversa WhatsApp amarrada à sessão — equivalente a “nova conversa iniciada” no `/chat`.

### Schema (rascunho)

```ts
{
  phone: string;              // literal ou {{var}}
  normalize_br: boolean;      // default true
  instance_id?: string | null; // ou herdar start guards
  reuse_policy: 'open' | 'any' | 'always_create';
  // preview só editor: last_normalized_preview (strip no publish)
}
```

### Runtime

1. Resolve `phone` via interpolate + opcional normalização BR E.164.
2. Resolve instância (nó / guard / default tenant).
3. Find-or-create `chat_conversations` (reusar serviços existentes de save/upsert chat).
4. `UPDATE chatbot_flow_sessions SET conversation_id = $id` (+ seed vars `conversation.*`).
5. Segue edge `default`; handle `error` se telefone inválido / sem instância.

### UI

- Campo telefone + picker de variável
- Toggle normalizar + preview ao vivo (sample / valor de teste)
- Select instância / política de reuso
- Preview curto: “Vai abrir/reusar conversa com +55…”

### Relação com `send_message`

**Com este nó, o `send_message` atual basta** para o caso Woo → avisar pedido.  
Não criar Nó 2 de envio no mesmo sprint.

### Aceite

- [x] Webhook Woo (só phone no map) → ensure → send_message entrega no WhatsApp.
- [x] Número inválido → erro controlado.
- [x] Conversa aparece no `/chat` (lista/filtro coerente).
- [x] Humano `in_progress` respeita D1 (não brigar com bot se já atendido — alinhar com pause existente).

### Entrega

- [x] Catálogo FE/BE `ensure_conversation`
- [x] Serviço BE (normalização + upsert conversa) — `flowEnsureConversation.ts`
- [x] Runner action + testes (`flowEnsureConversation.test.ts`, engine)
- [x] Help curto no painel do nó (saídas ok/erro + pause humano)

---

## 7. S29.1 — Hardening

### Escopo

- Idempotência opcional por chave (`order.id` → não duplicar rajada)
- Rate limit no webhook público
- Logs `chatbot_flows_runtime` com `reason: webhook | ensure_conversation`
- Grupos: bloquear se DM-only
- Métricas / falhas de mídia/instância desconectada

### Política documentada (idempotência)

No nó `ensure_conversation`, campo opcional **`idempotency_key`** (default no catálogo: `{{order.id}}`):

- Vazio → comportamento S29 (só `reuse_policy` por telefone+instância).
- Preenchido → após create/reuse, grava `(tenant, flow, key) → conversation_id` em `chatbot_flow_ensure_idempotency`.
- Reenvio Woo com a mesma chave **reusa a mesma conversa** (mesmo com `always_create`), evitando N chats.

### Aceite

- [x] Reenvio Woo do mesmo pedido não abre N conversas (política documentada).
- [x] Limites e erros observáveis.

### Entrega

- [x] Migration `317_chatbot_flow_ensure_idempotency.sql` (+ `316` no `migrationOrder`)
- [x] `flowEnsureConversation.ts` — idempotência · DM-only · instância desconectada
- [x] Rate limit dedicado (`flowWebhookRateLimit.ts`) em produção + sample
- [x] Logs estruturados `reason: webhook | ensure_conversation | send_media | …`
- [x] UI/schema `idempotency_key` no nó
- [x] Testes `flowEnsureConversation.test.ts` · `flowWebhookRateLimit.test.ts` · engine

### Não nesta entrega

- ~~**S30** send avançado~~ → **SKIP** ([`PLAN_SPRINTS_CHATBOT_FLOWS_S30.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S30.md))
- **S31** tag/opt-out

---

## 8. S30 — Send avançado (opcional) → **SKIP**

**Critério (inalterado):** só se, após S29, ainda faltar:

- enviar para **outro** MSISDN sem trocar a conversa da sessão, ou
- delay embutido no send (atalho UX; o nó `delay` já cobre).

**Decisão (2026-08-06):** **cancelar / skip**. Pós-S29, `ensure_conversation` + `send_message` + nó `delay` cobrem o fluxo Woo → WhatsApp. Detalhe e D30.x em [`PLAN_SPRINTS_CHATBOT_FLOWS_S30.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S30.md).

---

## 9. S31 — Candidatos antigos

| Tema | Notas |
|------|--------|
| Gatilho por tag / coluna kanban | **Feito** — ver [`PLAN_SPRINTS_CHATBOT_FLOWS_S31.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S31.md) |
| Opt-out global `parar` / `sair` | **Feito** — idem |

Não bloquear S28–S29.

---

## 10. Fluxo de referência (Woo → WhatsApp)

```
webhook_in
  → payload_map (billing.phone → order.phone, …)
  → ensure_conversation (phone={{order.phone}}, normalize_br=true)
  → send_message (“Recebemos o pedido {{order.id}}…”)
  → delay (opcional)
  → transfer_human / end
```

**Sample:** Woo aponta para URL de **amostra** enquanto monta o map; depois troca para URL de **produção** (mesmo `payload_map`).

---

## 11. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Confundir sample e produção | UI em dois blocos + cores/labels distintos |
| Abrir conversa spam | Rate limit + idempotência S29.1 |
| Contaminar chat-core | Reusar serviços de conversa existentes; bridge fino |
| Sessão sem conversa “fantasma” | Publish validation + timeout encerra órfãs |
| Oficial 24h / template | Documentar D29.2; falha explícita se política bloquear |

---

## 12. Fora de escopo (esta fase)

- Marketplace de templates Woo prontos
- Multi-canal além de WhatsApp da instância do flow
- Substituir HTTP out / webhook out
- Redesign completo do canvas

---

## 13. Definition of Done (fase)

- [x] Amostra Woo com URL fixa + rotacionar
- [x] Produção Woo sem `conversation_id` (sessão órfã; send bloqueado até S29)
- [x] Conversa visível no `/chat` (via S29 `ensure_conversation`)
- [x] S29.1 hardening (idempotência · rate limit · DM-only · logs)
- [x] Testes unitários dos caminhos felizes e de erro (S28 / S28.1 / S29 / S29.1)
- [x] Plano principal (`PLAN_SPRINTS_CHATBOT_FLOWS.md`) aponta para este doc como fase atual
- [x] **S30** avaliado → **skip** ([`PLAN_SPRINTS_CHATBOT_FLOWS_S30.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S30.md))

---

## 14. Próximo passo operacional

1. ~~Implementar **S28** (sample fixo).~~
2. ~~**S28.1** — webhook produção sem `conversation_id` (sessão órfã + bloqueio send).~~
3. ~~Fechar **D29.1–D29.3**; **S29** (`ensure_conversation`).~~
4. ~~**S29.1** (hardening: idempotência, rate limit, DM-only).~~
5. ~~Avaliar **S30**~~ → **skip** (D30.1).
6. ~~**S31** tag/opt-out~~ → feito ([`PLAN_SPRINTS_CHATBOT_FLOWS_S31.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S31.md)).
