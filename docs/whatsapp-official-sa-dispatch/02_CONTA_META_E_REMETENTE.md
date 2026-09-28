# 02 — Conta Meta e identidade de remetente

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** decisões de arquitetura **fechadas** (alinhadas D1); checklist por ambiente **pendente ops**  
**Depende de:** [01](./01_ESCOPO_PRODUTO_E_CANAIS.md)  
**Bloqueia:** 03, 04, 05, 09

---

## 1. Objetivo

Definir a **identidade canônica de envio** do Super Admin quando o canal oficial estiver ativo: qual WABA / phone number / credenciais, e como coexistem com a instância UazAPI de plataforma.

---

## 2. Achados baseline

### 2.1 Conta oficial (Meta)

| Peça | Local |
|------|--------|
| Client Graph | `packages/backend/src/services/whatsappOfficial/whatsappOfficialClient.ts` |
| Config / upsert | `whatsappOfficialConfigService.ts` — `getSuperadminAccount()` (`owner_scope=superadmin`, `tenant_id IS NULL`) |
| Credenciais | `getAccountCredentials(accountId)` → token, `phone_number_id`, `business_account_id` |
| Segredos | `whatsappOfficialSecretCrypto.ts` + encryption bootstrap |
| Env | `whatsappOfficialEnv.ts` — Graph default **`v21.0`**, webhook signature |
| Rotas / UI | `superadminWhatsappOfficialRoutes.ts` · hub conexão / modelos / chat / campanhas |
| Tabelas | `whatsapp_official_accounts`, `whatsapp_official_templates`, campanhas |
| Flags | `whatsapp_official_enabled` default **true**; `whatsapp_official_tenant_enabled` default **false** (D1: tenant fora) |

Campos relevantes da conta: `business_account_id` (WABA), `phone_number_id`, `display_phone_number`, `verified_name`, `status`, `webhook_status`, `app_id` / app secret.

### 2.2 Remetente UazAPI (legado — motors/anúncios hoje)

| Peça | Local |
|------|--------|
| Resolução | `resolvePlatformWhatsAppOutboundReady` |
| Designação | `platform_notifications_whatsapp_chat_instance_id` |
| UI | `SuperAdminPlatformWhatsAppPanel` |
| Consumers | platform notifications, `opsLeadGatewaySend`, `announcementSendWorker` |

### 2.3 Tenant oficial

Schema permite `owner_scope=tenant`; **D1 = não usar** nesta fase.

---

## 3. Perguntas — respostas (D2 arquitetura)

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Conta por ambiente? | **Checklist ops** §4 — não fechável só por código |
| 2 | Remetente oficial? | Conta **`whatsapp_official_accounts` superadmin** — `phone_number_id` (+ display) |
| 3 | Webhook? | Já existe rota + verify signature; validar por ambiente no §4 |
| 4 | Motors/Ops param UazAPI quando oficial ON? | **Sim** nos fluxos migrados: só Meta; **sem fallback** (D1) |
| 5 | Dois números txn vs marketing? | **Um número na v1** (simplicidade); revisitar se quality/category exigir |
| 6 | UI designação remetente oficial? | **Hub WhatsApp Oficial** (conexão). Panel UazAPI só para fluxos legado |
| 7 | Tokens? | Rotação manual nas definições da conexão; erro `META_TOKEN_EXPIRED` já tratado na UI modelos |

---

## 4. Checklist de auditoria por ambiente (ops)

| Item | Local | Staging | Prod |
|------|-------|---------|------|
| Linha `whatsapp_official_accounts` (superadmin) | ☐ | ☐ | ☐ |
| `status=connected` + token válido | ☐ | ☐ | ☐ |
| `phone_number_id` + WABA preenchidos | ☐ | ☐ | ☐ |
| Webhook verify + signature OK | ☐ | ☐ | ☐ |
| Templates syncados | ☐ | ☐ | ☐ |
| Instância UazAPI designada (legado) | ☐ | ☐ | ☐ |
| Flag `whatsapp_official_enabled` | ☐ | ☐ | ☐ |
| Envio teste template APPROVED OK | ☐ | ☐ | ☐ |

---

## 5. Modelo de resolução (D1 + D2)

```
resolvePlatformWhatsAppOutbound(flow):
  if flow.channel == 'meta_cloud' OR flow.official_required:
    if superadmin_official_account_ready:
      return { provider: 'meta_cloud', accountId, phoneNumberId, accessToken }
    return not_ready   # NÃO cair para UazAPI (D1)
  if flow.channel == 'uazapi' OR flow still legacy:
    if uazapi_instance_designated AND ready:
      return { provider: 'uazapi', instanceToken }
    return not_ready
```

Onde viver (recomendação):

- **B)** novo `platformWhatsAppSenderResolve` usado por motors, Ops, anúncios oficiais  
- Gateway `meta_cloud` adapter (07) consome o mesmo resolve  

Não usar o rascunho antigo “Meta preferred → fallback UazAPI” nos fluxos oficiais.

---

## 6. Ficheiros-chave

- `whatsappOfficialConfigService.ts`
- `platformNotificationDispatchContext.ts`
- `opsLeadGatewaySend.ts`
- `announcementSendWorker.ts` (hoje só UazAPI)
- `WhatsappOfficialConnectionPage.tsx`
- `whatsappOfficialEnv.ts` / `systemFeatureFlagsService.ts`

---

## 7. Decisão D2

| Campo | Valor |
|-------|-------|
| Remetente canônico v1 | Conta oficial Super Admin (`phone_number_id` / WABA em `whatsapp_official_accounts`) |
| Fallback UazAPI em fluxo oficial | **Não** (D1) |
| UI de designação | Hub `/superadmin/conexoes/whatsapp-oficial` |
| Dois números (txn/marketing)? | **Não na v1** — um número |
| Ambientes prontos | Checklist §4 — **pendente ops** |
| Data decisões arq. | **2026-08-03** |

**ADR:** [11](./11_ADR_DECISOES.md) § D2  

**Próximo:** completar §4 ops → [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md) implementação P0 / [03](./03_BRIDGE_MOTOR_META.md)
