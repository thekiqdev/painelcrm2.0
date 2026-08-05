# 06 — Superfícies Super Admin (evitar 4º caminho de envio)

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** a preencher (investigação)  
**Depende de:** [01](./01_ESCOPO_PRODUTO_E_CANAIS.md) (D1), [05](./05_OPS_KANBAN_DISPARO.md), [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md)  
**Bloqueia:** UX / nav / documentação operacional

---

## 1. Objetivo

Inventariar **todas** as telas e APIs de envio WhatsApp no Super Admin e definir qual superfície é canônica para cada intenção (transacional, ops kanban, marketing, chat 1:1), evitando um quarto pipeline paralelo.

**D1:** anúncios e campanhas **no plano**; oficial sem fallback UazAPI; tenant CRM fora.

---

## 2. Mapa atual de superfícies

| Superfície | Rota / API | Provider hoje | Intenção / destino D1 |
|------------|------------|---------------|------------------------|
| WhatsApp Oficial Hub | `/superadmin/conexoes/whatsapp-oficial` | Meta | Conta, modelos, chat, campanhas + builder (04C) |
| Campanhas Meta | página campanhas no hub | Meta | No plano; alinhar ao builder |
| Platform Notifications | `/superadmin/platform-notifications` | UazAPI | Transacional SaaS → Meta + vínculos |
| Platform WhatsApp panel | tab em platform-notifications | UazAPI | Remetente legado; oficial = conta Meta (02) |
| Motor notificações tenant | `/superadmin/notifications-engine` | flags | **Fora** disparo oficial tenant |
| Templates CRM sistema | `/superadmin/notification-templates` | texto | Fora v1 oficial SA |
| Anúncios | `/superadmin/announcements*` | UazAPI | Wizard oficial APPROVED→Enviar ([04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md)) |
| Leads / grupos | `/superadmin/leads*` | feed anúncios | Audiência |
| Chat plataforma | `/superadmin/chat` | UazAPI chat | 1:1 operacional |
| Ops Kanban | `/superadmin/operacao/kanbans` | gateway→UazAPI | Auto + **manual** no card → Meta |
| Conexões UazAPI | `/superadmin/conexoes/uazapi` | UazAPI | Só fluxos não migrados |
| Alertas in-app | `/superadmin/notifications` | interno | Não é WhatsApp outbound |

Referências nav: `src/layouts/superadminNavConfig.ts`, hub `superadminHubConfig.ts`.  
Docs UX: `docs/PLANO_FASE_3_COMUNICACAO_SUPER_ADMIN.md`, `docs/FASE_3A_COMUNICACAO_SUPER_ADMIN_INVESTIGACAO.md`.

---

## 3. Perguntas a responder

1. Onde o operador escolhe “enviar oficial” vs “enviar UazAPI” durante a transição? *(D1: oficial = sem fallback; UazAPI só se fluxo não migrado.)*
2. Platform Notifications deve ganhar tab/ indicação “canal = Meta” ou a designação fica só no hub oficial?
3. Anúncios: wizard único partilhado com hub Modelos? Detalhe em [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md).
4. Ops Kanban aponta para o mesmo sender resolve das platform notifications?
5. Chat oficial (`WhatsappOfficialChatFull`) vs chat plataforma UazAPI — qual usar para follow-up humano pós-automação?
6. Precisamos de um hub único “Comunicação outbound” com cards por intenção?

---

## 4. Matriz intenção → superfície canônica (preencher)

| Intenção | Superfície canônica v1 | Provider | Superfícies a não usar |
|----------|------------------------|----------|------------------------|
| Reset / billing SaaS | | | |
| Follow-up lead (1:1 ops) | | | |
| Automação coluna kanban | | | |
| Broadcast marketing leads | | | |
| Broadcast clientes tenants | | | |
| Chat suporte humano | | | |
| Editar copy transacional | | | |
| Criar/aprovar HSM | Hub oficial → Modelos | Meta | Sync + create (já existe) |
| Vincular HSM ↔ evento/coluna | Platform Notifications e/ou ecrã vínculos + settings coluna | — | **Gap** — ver [04B](./04B_CICLO_VIDA_MODELOS.md) |

---

## 5. Riscos de UX

- Dois “WhatsApp” na sidebar (UazAPI vs Oficial) sem hierarquia clara.
- Editor de template texto livre que **não** reflete o HSM real após migração.
- Operador dispara campanha Meta **e** automação kanban no mesmo lead.
- Histórico fragmentado: `platform_notification_deliveries` vs campaign recipients vs timeline do card vs `chat_messages`.

---

## 6. Checklist de leitura UI

- [ ] `superadminNavConfig.ts` / `superadminHubConfig.ts`
- [ ] `SuperAdminWhatsappOfficialHub` + páginas filhas
- [ ] `SuperAdminPlatformNotifications.tsx`
- [ ] `SuperAdminAnnouncements` + Send
- [ ] `WhatsappOfficialCampaignsPage`
- [ ] `ChatKanbanOpsLeadDialog`
- [ ] `ConnectionsPage` (flags Meta/UazAPI)

---

## 7. Decisão (preencher)

| Campo | Valor |
|-------|-------|
| Mapa intenção→UI aprovado | sim / não |
| Mudanças de nav necessárias na v1 | |
| Anúncios: destino | |
| Histórico unificado? | v1 / depois |
| Data | |

**Próximo:** [07_GATEWAY_ROUTING.md](./07_GATEWAY_ROUTING.md)
