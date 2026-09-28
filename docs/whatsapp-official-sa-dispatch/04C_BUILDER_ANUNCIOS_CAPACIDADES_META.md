# 04C — Builder Meta, anúncios (wizard) e edição de modelos

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** investigação **em progresso** (baseline código + recomendações P0)  
**Depende de:** [01](./01_ESCOPO_PRODUTO_E_CANAIS.md) D1 fechado, [02](./02_CONTA_META_E_REMETENTE.md), [04B](./04B_CICLO_VIDA_MODELOS.md)  
**Bloqueia:** sprints de anúncios oficiais, builder avançado, edit-on-Meta

---

## 1. Objetivo

Expandir a Fase Modelos com três requisitos de produto (D1):

1. **Wizard de anúncio** pela API oficial (submeter modelo → APPROVED → liberar Enviar).
2. **Builder rico**: botões, menus, links, variáveis conforme Meta.
3. **Modelos editáveis** no SA com propagação na Meta.

---

## 2. Relação com 04B

| 04B | 04C |
|-----|-----|
| Sync / create / vincular event_key↔HSM | UX criação rica + **edição** + fluxo **anúncios** |
| Gate APPROVED motors/kanban | Gate APPROVED no wizard de **anúncio** |
| Param map merge→`{{n}}` | UI botões/URL/variáveis de negócio |

---

## 3. Wizard anúncio (API oficial)

### 3.1 Fluxo desejado (D1)

```
[Escolher canal: API oficial]
  → [Criar/editar anúncio]
  → [Step: enviar modelo à Meta]
  → [PENDING → APPROVED | REJECTED]
  → [Só APPROVED libera «Enviar»]
  → [Dispatch audiência]
```

### 3.2 Estado atual (auditoria código)

| Peça | Status | Evidência |
|------|--------|-----------|
| CRUD anúncios | Real | `superadminAnnouncementsController.ts` — campo `whatsapp_message` (texto livre) |
| Send + recipients | Real | `postAnnouncementSend` → `announcement_sends` / `announcement_send_recipients` |
| Worker envio | Real | `announcementSendWorker.ts` → `dispatchPlatformWhatsAppText` (**UazAPI**, texto livre) |
| Gate APPROVED | **Não** | Enviar não consulta `whatsapp_official_templates` |
| Campanhas Meta | Paralelo | `WhatsappOfficialCampaignsPage` — template APPROVED já existente; **não** é o wizard de anúncio |

### 3.3 Recomendações de desenho (fechar na implementação)

| Decisão | Recomendação P0 | Motivo |
|---------|-----------------|--------|
| HSM por anúncio vs biblioteca | **Biblioteca + opcional “criar a partir deste anúncio”** | Evita explosão de HSM; anúncio marketing costuma reutilizar copy |
| Se “criar a partir do anúncio” | Gera draft HSM `MARKETING` a partir de title/body/botões → submit Meta → liga `announcement.meta_template_*` | Atende wizard pedido |
| Categoria | `MARKETING` | Broadcast / anúncios |
| Público | Manter grupos atuais (tenants + lead groups) | Já no send |
| Status Meta | Poll: botão “Atualizar status” + opcional tick worker sync templates | Webhook de template status é secundário na v1 |
| REJECTED | Editar no builder → resubmeter (estratégia §5) | |
| UazAPI | Path legado só se canal ≠ oficial | D1: sem fallback no path oficial |

### 3.4 Wireframe de steps (produto)

1. **Canal** — `UazAPI (legado)` | `API oficial Meta`
2. **Conteúdo** — título, corpo, botões/vars (builder partilhado)
3. **Modelo Meta** — “Usar modelo existente APPROVED” **ou** “Criar/enviar novo modelo”
4. **Aprovação** — status + sync; CTA Enviar **disabled** até APPROVED
5. **Audiência + agendar** — grupos / delay (reusar UI send atual)
6. **Confirmar envio** — só Graph `sendTemplateMessage`

### 3.5 Critérios de aceite

- [ ] Canal oficial → Enviar disabled até HSM APPROVED ligado ao anúncio/send
- [ ] Step submete ou associa modelo; status visível
- [ ] REJECTED/PENDING com próximo passo claro
- [ ] Dispatch usa template Graph (não `whatsapp_message` texto)
- [ ] Sem fallback UazAPI nesse caminho

### 3.6 Schema / gaps técnicos a planear

- Colunas sugeridas em `announcements` ou `announcement_sends`: `outbound_channel` (`uazapi`|`meta_cloud`), `meta_template_name`, `meta_template_language`, `meta_template_status`, `meta_param_map` JSON.
- Worker: branch Meta quando `outbound_channel=meta_cloud`.

---

## 4. Builder — capacidades Meta

### 4.1 Já implementado no SA

Fontes: `whatsappOfficialTemplatePayload.ts`, `WhatsappOfficialTemplatesPage`, `whatsappOfficialClient.createWhatsAppMessageTemplate`.

| Capacidade | Status | Notas |
|------------|--------|-------|
| Categorias MARKETING / UTILITY / AUTHENTICATION | Sim | |
| Header NONE / TEXT / IMAGE / DOCUMENT / VIDEO | Sim | Media via `header_media_handle` |
| Body + `{{n}}` + examples | Sim | |
| Footer (≤60) | Sim | |
| QUICK_REPLY | Sim | text ≤25 |
| URL (+ exemplo se var) | Sim | |
| PHONE_NUMBER | Sim | |
| Validação max botões | Sim (≤10) | Confirmar limite Meta por categoria no QA |
| List / sync / status | Sim | |
| **Update** template Graph | **Não** | Só POST create + GET list |
| **Delete** template | **Não** no client SA | Graph: DELETE `/{waba}/message_templates` |

### 4.2 Matriz de capacidades (prioridade D1)

| Capacidade Meta | Tipo | Prio v1 | Expor UI? | No código? | Notas |
|-----------------|------|---------|-----------|------------|-------|
| Body vars `{{n}}` | HSM | **P0** | sim | sim | |
| Buttons QR / URL / phone | HSM | **P0** | sim | sim | |
| Header texto/media | HSM | **P0** | sim | sim | |
| Footer | HSM | **P0** | sim | sim | |
| Picker variável negócio → `{{n}}` | HSM UX | **P0** | **a fazer** | não | nome, link pagamento, etc. |
| AUTHENTICATION / OTP components | HSM | **P0** (senha) | melhorar | parcial | Categoria existe; components OTP específicos a validar docs Graph |
| LTO / coupon | HSM | P2 | não v1 | não | |
| Carousel | HSM | P2 | não v1 | não | |
| Flow / flow_cta | HSM | P2 | não v1 | não | |
| Catalog / MPM | HSM | P3 | não | não | |
| Interactive **list** (menu secções) | **Session** | P1 chat | chat oficial 24h | não | **Não** misturar com HSM anúncio |
| Interactive reply buttons | Session | P1 chat | chat 24h | não | |
| CTA URL session | Session | P1 | chat | parcial via template URL | |
| Location / contact | Session | P3 | não | não | |

**Regra UX:** na UI de **modelo/anúncio (HSM)** só componentes HSM. Menus tipo lista = secção “Chat / sessão 24h”, não no wizard de anúncio.

### 4.3 Variáveis de negócio (P0)

| Contexto | Campos exemplo | Onde |
|----------|----------------|------|
| Platform notifications | `tenant.admin_name`, `billing.amount`, `billing.payment_link`, `billing.due_date` | vínculo 04 |
| Anúncio | nome destinatário, link custom do anúncio | wizard |
| Ops Kanban | nome lead, link onboarding | coluna / manual |

UI: “Inserir variável” → escolhe campo → aloca próximo `{{n}}` + linha em `variable_examples` / `meta_param_map`.

### 4.4 Critérios builder P0

- [x] Inventário baseline documentado (§4.1–4.2)
- [ ] Picker de variáveis de negócio na UI
- [ ] Botões QR/URL/phone usáveis sem JSON (já no form modelos; reutilizar no anúncio)
- [ ] AUTHENTICATION/OTP validado para reset senha
- [ ] Session menus **não** no fluxo HSM anúncio

---

## 5. Edição local ↔ Meta

### 5.1 Estado

| Operação | Código SA | Graph (ref) |
|----------|-----------|-------------|
| Create | `POST /{waba}/message_templates` | sim |
| List/sync | GET message_templates | sim |
| Update | **ausente** | `POST /{whats_app_message_template_id}` (docs Graph HSM) |
| Delete | **ausente** | `DELETE /{waba}/message_templates?hsm_id=` |

### 5.2 Estratégia recomendada (v1)

**Estratégia 2 — versionamento lógico + update quando API permitir:**

1. Editar draft local (components JSON + UI).
2. Se existe `meta_template_id` e status permite edição: tentar **POST update** no id Meta; status → PENDING; **bloquear envios** até APPROVED de novo.
3. Se update falhar / Meta exigir nome novo: criar `name_v{n}` → sync → **trocar vínculo** (event_key / anúncio) para o novo APPROVED; arquivar o antigo.
4. Nunca enviar com status ≠ APPROVED no path oficial.

### 5.3 Critérios edição

- [ ] UI editar modelo (não só “+ Novo”)
- [ ] “Salvar local” vs “Enviar/atualizar na Meta”
- [ ] Pós-edição PENDING bloqueia Enviar / motors vinculados
- [ ] Audit mínimo (quem/quando)

---

## 6. Ordem desta frente (antes da bridge do motor)

1. ~~Inventário capacidades~~ (este doc §4)  
2. Fechar estratégia edição (§5.2) — **recomendação acima, validar com eng**  
3. Desenhar wizard anúncio (§3.4) + colunas DB  
4. Componentizar builder partilhado (Modelos + Anúncios + vínculos)  
5. P0: picker variáveis + update/delete client Graph  
6. Só então sprints de bridge `platform.*` / kanban  

---

## 7. Decisões 04C

| Campo | Valor |
|-------|-------|
| Anúncio: HSM | Biblioteca APPROVED **ou** criar a partir do anúncio (wizard) |
| Estratégia edição Meta | **2** — update por id + fallback versionamento `name_vN` |
| P0 builder | Body/header/footer/botões (já) + **picker vars** + AUTH/OTP check + gate anúncio |
| Session menus na v1 anúncio? | **Não** — só chat 24h (P1 separado) |
| Canal anúncio oficial | Sem fallback UazAPI (D1) |
| Owner | |
| Data baseline | **2026-08-03** |

**Em aberto (ops/produto):** copy exact wireframes; se anúncio **sempre** cria HSM novo ou default “reutilizar biblioteca”.

---

## 8. Ligações

- [01](./01_ESCOPO_PRODUTO_E_CANAIS.md) · [04B](./04B_CICLO_VIDA_MODELOS.md) · [04](./04_TEMPLATES_EVENT_KEY_HSM.md)  
- [06](./06_SUPERFICIES_SUPER_ADMIN.md) · [08](./08_COMPLIANCE_META.md) · [11](./11_ADR_DECISOES.md)  
- Código: `whatsappOfficialTemplatePayload.ts`, `announcementSendWorker.ts`, `whatsappOfficialClient.ts`  
- Docs Meta: Message Templates edge; HSM node update/delete (versão Graph do projeto: default `v21.0`)
