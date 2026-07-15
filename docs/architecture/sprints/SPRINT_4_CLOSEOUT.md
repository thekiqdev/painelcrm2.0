# SPRINT_4_CLOSEOUT — Phase 10H · CRM Detail Ownership

| Campo | Valor |
|---|---|
| **Sprint** | 4 |
| **Phase** | 10H |
| **Gate** | **CLOSED** |
| **Data** | 2026-07-15 |
| **Tipo** | Frontend Runtime Hardening |
| **Backend / SQL / Redis / Socket / Workers / Flags / ADR** | **Não alterados** |

---

## Veredito

Vínculo CRM (lead/client) na UI deriva do **Conversation Store / row**.  
`getConversationProfile` é **projeção**: chave RQ inclui ids do SoT; Chat reconcilia detail local contra SoT e não limpa projeção em erro se o vínculo ainda existe.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `crm/crmDetailProjection.ts` | `reconcileCrmDetailWithConversationLink` + `conversationCrmProfileQueryKey` |
| Métricas | `crmDetailProjectionMetrics.ts` |
| Chat effect | Reconcile SoT → limpa mismatch; fetch só se linked; soft-hold em erro GET |
| Float identity / CompactProfile | Query key com `client_id`/`leadId`; `enabled` só se linked |
| Testes | `crmDetailProjection.test.ts` (5) |

### Critério de aceite

| Critério | Status |
|---|---|
| Link SoT = Conversation fields | **Pass** |
| Detail = projection (não redefine vínculo) | **Pass** |
| Unlink limpa projection | **Pass** |
| Float + Chat alinhados à key/SoT | **Pass** |
| Sem Backend/Flags | **Pass** |

---

## Observações (não corrigidas)

1. **Chat ainda mantém `currentLead`/`currentClient` em useState**  
   Projeção local intencional; não migramos o painel CRM inteiro para RQ. Unificação total via hook compartilhado = polish futuro.

2. **Invalidate CRM ainda usa prefixo de 3 segmentos**  
   Continua válido com keys de 5 segmentos (partial match RQ). OK.

3. **Kanban Gate / Store OFF dual path**  
   Sprints 5–6.

4. **Avatar merge ainda depende do profile GET**  
   Esperado (projeção); sem profile, cai no identity da Conversation.

---

## Próximo

```
ok sprint 5
```

→ Kanban Gate (decisão A/B)
