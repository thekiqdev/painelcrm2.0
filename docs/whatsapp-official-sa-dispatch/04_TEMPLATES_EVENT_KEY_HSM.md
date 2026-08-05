# 04 — Templates: `event_key` → HSM Meta

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** a preencher (investigação)  
**Depende de:** [01](./01_ESCOPO_PRODUTO_E_CANAIS.md), [02](./02_CONTA_META_E_REMETENTE.md)  
**Bloqueia:** implementação das mensagens padrão  
**Companheiro obrigatório:** [04B_CICLO_VIDA_MODELOS.md](./04B_CICLO_VIDA_MODELOS.md) — Fase Modelos (sync → enviar → vincular)

---

## 1. Objetivo

Inventariar todos os eventos de mensagem padrão relevantes e definir, para cada um, o **template Meta (HSM)** necessário, categoria, variáveis e mapeamento a partir dos merge fields atuais (texto livre).

Este doc é a **matriz técnica**. O fluxo de produto (biblioteca Meta + vínculo antes de disparar) está em **[04B](./04B_CICLO_VIDA_MODELOS.md)**.

**Importante:** sync e create na Meta **já existem** na UI Super Admin; o **vínculo** `event_key` ↔ HSM **ainda não** — sem ele o motor não pode enviar pela API oficial.

---

## 2. Diferença estrutural

| Motor atual | Meta Cloud |
|-------------|------------|
| `body_template` com `{{tenant.admin_name}}` (strict merge) | Template aprovado na WABA com `{{1}}`, `{{2}}`… |
| Override no Super Admin edita texto livre | Override Meta exige re-aprovação ou mapeamento de params |
| Canal `whatsapp` em `platform_notification_template_*` | Linhas em `whatsapp_official_templates` + status APPROVED |

Serviços Meta já existentes:

- `whatsappOfficialTemplateService.ts` — create/sync/list
- UI modelos: `WhatsappOfficialModelosPage.tsx`
- Helper FE: `src/lib/whatsappOfficialMetaTemplate.ts`

---

## 3. Inventário plataforma (`platform.*`) — baseline

Origem seed: `database/init/139_platform_notifications_engine_core.sql` (+ migrações trial, overdue, password, tickets, email).

| event_key | Módulo | Incluir v1? | Merge fields (resumo) | HSM proposto (nome) | Categoria Meta | Status Meta |
|-----------|--------|-------------|------------------------|---------------------|----------------|-------------|
| `platform.auth.password_reset_code_issued` | auth | ☐ | código, validade, nome… | | UTILITY | |
| `platform.account.created` | auth | ☐ | tenant, admin, login_link | | UTILITY? | |
| `platform.auth.login_link.issued` | auth | ☐ | login_link | | | |
| `platform.billing.charge.created` | billing | ☐ | amount, due, payment_link, invoice | | UTILITY | |
| `platform.billing.charge.overdue` | billing | ☐ | | | UTILITY | |
| `platform.billing.payment_confirmed` | billing | ☐ | | | UTILITY | |
| `platform.plan.activated` | billing | ☐ | plan.name | | | |
| `platform.trial.started` | trial | ☐ | | | | |
| `platform.trial.expiring` | trial | ☐ | | | | |
| `platform.trial.ended` | trial | ☐ | | | | |
| `platform_ticket_created` / reply / status | support | ☐ | | | | |

Preencher colunas após sync real da WABA (`listAllMessageTemplates` / tabela DB).

---

## 4. Inventário tenant CRM (só se escopo 01 incluir)

Origem: `database/init/133_notifications_engine_whatsapp_templates_and_links.sql` (+ agenda).

| event_key | Incluir? | HSM | Categoria | Notas |
|-----------|----------|-----|-----------|-------|
| `invoice.created` | ☐ | | UTILITY | Pedido do user: “pagamento criado” — confirmar se é este |
| `invoice.due_soon` | ☐ | | | Digest |
| `invoice.overdue` | ☐ | | | “atrasado” |
| `invoice.paid` | ☐ | | | “pago” |
| `proposal.*` | ☐ | | | |
| `contract.*` | ☐ | | | |
| `appointment.*` | ☐ | | | |

**Atenção:** tenant oficial default OFF — HSM tenant pode exigir WABA própria por empresa (fora v1 SA).

---

## 5. Modelo de vínculo a investigar

> Produto: ver ciclo completo e critérios de aceite em [04B](./04B_CICLO_VIDA_MODELOS.md).

Opções de persistência do mapeamento `event_key` → template Meta:

1. **Colunas novas** em `platform_notification_template_system` / overrides (`meta_template_name`, `meta_language`, `meta_param_map` JSON).
2. **Tabela ponte** `platform_notification_meta_template_bindings`.
3. **Convenção por nome** (`event_key` slug = nome do template) — frágil.

Investigar impacto no editor atual (`SuperAdminPlatformNotifications` override de body texto livre).

**Gate de runtime (obrigatório na Fase Modelos):** se canal oficial ON e não houver vínculo com HSM `APPROVED`, o envio falha de forma explícita — **não** cair para texto livre na Graph.

### Exemplo de `meta_param_map` (rascunho)

```json
{
  "body": [
    { "index": 1, "from": "tenant.admin_name" },
    { "index": 2, "from": "billing.amount" },
    { "index": 3, "from": "billing.due_date" },
    { "index": 4, "from": "billing.payment_link" }
  ],
  "button": [
    { "type": "url", "index": 0, "from": "billing.payment_link" }
  ]
}
```

---

## 6. Casos especiais

### 6.1 PIX follow-up

- Hoje: `platformNotificationWhatsappPixFollowup.ts` + botão UazAPI após `charge.created`.
- Meta: botão URL no template vs mensagem interativa (limitada) vs segundo template.
- Decisão: parity v1 ou defer.

### 6.2 Password reset

- Doc: `docs/platform-auth/PASSWORD_RESET_WHATSAPP.md`
- Serviço: `passwordResetWhatsappService.ts` → motor plataforma.
- Código de 6 dígitos: confirmar se Meta permite na categoria UTILITY e copy policy.

### 6.3 Login link / magic link

- Seed existe; publicação pode estar pendente (`STATUS` platform-notifications). Confirmar se entra no escopo.

---

## 7. Checklist operacional Meta

Para cada HSM da matriz v1:

- [ ] Criado na WABA (ou syncado)
- [ ] Categoria correta
- [ ] Idioma `pt_BR` (confirmar underscore vs hífen no client)
- [ ] Status `APPROVED`
- [ ] Paridade de variáveis com merge fields
- [ ] Preview no SA com dados de exemplo
- [ ] Teste envio 1:1 para número interno

---

## 8. Ficheiros a auditar

- `database/init/139_platform_notifications_engine_core.sql`
- `database/init/147_password_reset_whatsapp.sql` (+ templates password)
- `database/init/146_platform_notification_whatsapp_pix_button.sql`
- Migrações trial / overdue / tickets
- `packages/backend/src/services/whatsappOfficial/whatsappOfficialTemplateService.ts`
- `packages/backend/src/services/platformNotifications/platformBusinessNotifications.ts`
- `src/pages/superadmin/SuperAdminPlatformNotifications.tsx`
- `src/pages/superadmin/connections/WhatsappOfficialModelosPage.tsx`

---

## 9. Decisão (preencher)

| Campo | Valor |
|-------|-------|
| Estratégia de binding | 1 / 2 / 3 |
| Lista v1 HSM (nomes) | |
| PIX parity | |
| Overrides texto livre vs só params | |
| Fase Modelos (04B) como gate? | sim / não |
| Data | |

**Próximo:** [04B_CICLO_VIDA_MODELOS.md](./04B_CICLO_VIDA_MODELOS.md) → [05_OPS_KANBAN_DISPARO.md](./05_OPS_KANBAN_DISPARO.md) e [08_COMPLIANCE_META.md](./08_COMPLIANCE_META.md)
