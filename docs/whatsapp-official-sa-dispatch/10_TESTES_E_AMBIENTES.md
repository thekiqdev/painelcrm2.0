# 10 — Testes e ambientes

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** a preencher (investigação)  
**Depende de:** [04](./04_TEMPLATES_EVENT_KEY_HSM.md), [04B](./04B_CICLO_VIDA_MODELOS.md), [05](./05_OPS_KANBAN_DISPARO.md), [08](./08_COMPLIANCE_META.md), [09](./09_OBSERVABILIDADE_ROLLBACK.md)  
**Bloqueia:** merge/go-live

---

## 1. Objetivo

Definir a **matriz de testes** e a prontidão por ambiente (local, staging, produção) para o disparo oficial no Super Admin, reaproveitando testes unitários existentes e smoke E2E manuais/Meta.

Incluir sempre cenários da **Fase Modelos**: sync, create, vínculo, e **recusa de envio sem vínculo APPROVED**.

---

## 2. Testes automatizados já relevantes

| Área | Ficheiros (exemplos) | O que cobrem hoje |
|------|----------------------|-------------------|
| Dispatcher WA | `whatsappChannelDispatcher.dispatch.test.ts` | UazAPI send paths |
| Erros WA | `whatsappDispatchErrorClassifier.test.ts` | Transient vs fatal (UazAPI) |
| Communication gateway | `communication/communication.test.ts` | Routing + stub meta |
| Platform notifications | testes orchestrator/retry se existirem | Gates / dispatch |
| Campanhas oficiais | services campaign (auditar cobertura) | Queue / CSV |
| Billing + WA token | `chatInstanceInvalidTokenSelfHeal.test.ts`, billing window tests | UazAPI unhealthy |

**Gap:** poucos/nenhum teste que mocke `whatsappOfficialClient.sendTemplateMessage` no caminho do motor plataforma.

---

## 3. Ambientes

| Ambiente | Conta Meta | Números teste | UazAPI plataforma | Notas |
|----------|------------|---------------|-------------------|-------|
| Local | ☐ | | ☐ | Tokens em secret crypto |
| Staging | ☐ | | ☐ | Webhook público necessário |
| Produção | ☐ | | ☐ | Allowlist event_keys |

Checklist webhook: URL pública, verify token, signature (`WHATSAPP_OFFICIAL_WEBHOOK_VERIFY_SIGNATURE`).

---

## 4. Matriz de testes funcional (preencher resultados)

### 4.1 Mensagens padrão (platform)

| Caso | Pré-condição | Esperado Meta | Status |
|------|--------------|---------------|--------|
| Password reset | HSM APPROVED | 1 template, código correto | ☐ |
| Charge created | HSM + link | delivery sent + wamid | ☐ |
| Charge overdue | | | ☐ |
| Payment confirmed | | | ☐ |
| Account created | | | ☐ |
| Provider flag = uazapi | mesma ação | path UazAPI, sem Graph | ☐ |
| Meta unhealthy + fallback ON | | UazAPI ou fail explícito | ☐ |
| Template REJECTED/PENDING | | fail não-retryable claro | ☐ |
| Fora allowlist event_key | | não envia Meta | ☐ |
| Sync modelos Meta | conta ligada | lista local atualizada | ☐ |
| Create modelo + sync até APPROVED | | status visível no SA | ☐ |
| Evento **sem** vínculo HSM + oficial ON | | fail explícito / CTA vincular; **sem** texto Graph | ☐ |
| Evento com vínculo APPROVED | | `sendTemplateMessage` + wamid | ☐ |

### 4.2 Ops Kanban

| Caso | Esperado | Status |
|------|----------|--------|
| Enter checkout abandonado → HSM | 1 envio, timeline | ☐ |
| Lead sem telefone | skip + log | ☐ |
| Lead sem opt-in (se exigido) | skip | ☐ |
| Envio manual no dialog (se B) | template picker → Graph | ☐ |
| Dual-send prevenção | não anúncio+auto no mesmo trigger | ☐ |
| Gateway flag shadow | não envia real | ☐ |

### 4.3 Regressão

| Caso | Status |
|------|--------|
| Campanhas Meta existentes intactas | ☐ |
| Chat oficial 1:1 | ☐ |
| Motor tenant CRM inalterado (se fora escopo) | ☐ |
| Platform notifications history UI | ☐ |
| PIX follow-up (se ainda UazAPI) | ☐ |

---

## 5. Testes automatizados a planejar (pós-investigação)

1. Unit: mapper `merge_fields` → components Meta.
2. Unit: dispatcher/gateway branch `meta_cloud` com client mockado.
3. Unit: classificador erros Graph (rate limit 4xx/80007 etc. — códigos a confirmar).
4. Integration (staging): webhook status atualiza delivery (se no escopo 09).
5. Não criar exploit/PoC; apenas testes defensivos com mocks.

---

## 6. Dados de teste

| Recurso | Valor / onde obter |
|---------|-------------------|
| Número interno allowlisted Meta | |
| Lead staging com WhatsApp válido | |
| Tenant staging com admin_whatsapp | |
| Templates APPROVED nomes | ver 04 |
| Conta com template PENDING (negativo) | |

---

## 7. Critérios de pronto para produção

- [ ] ADR 11 assinado
- [ ] Fase Modelos (04B): sync + create + vínculo + gate sem vínculo
- [ ] Matriz 4.1 dos event_keys v1 verde em staging
- [ ] Pelo menos 1 fluxo kanban v1 verde em staging
- [ ] Rollback testado (flag → uazapi) em staging
- [ ] Runbook 09 linkado e revisado
- [ ] Compliance 08 revisado (categorias / opt-in)
- [ ] Monitoramento mínimo (logs + history UI) acordado

---

## 8. Decisão (preencher)

| Campo | Valor |
|-------|-------|
| Ambientes prontos | |
| Owner QA | |
| Gate de produção | |
| Data | |

**Próximo:** [11_ADR_DECISOES.md](./11_ADR_DECISOES.md)
