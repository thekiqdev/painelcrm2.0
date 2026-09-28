# PHASE10A_QA_REPORT — MB-059

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Tipo** | Code-path QA + static verification |

## Matriz

| Cenário | Instantâneo lista | Instantâneo conversa | Painel/perfil CRM | Sem loadConversations para UI | Sem poll/F5 |
|---|---|---|---|---|---|
| Adicionar Lead | ✅ upsert | ✅ | ✅ profile GET pontual | ✅ | ✅ |
| Vincular Cliente/Lead | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar Cliente | ✅ | ✅ | ✅ | ✅ | ✅ |
| Converter Lead | ✅ link+upsert | ✅ | ✅ | ✅ | ✅ |
| Remover vínculo | ✅ | ✅ | clear + profile | ✅ | ✅ |
| Arquivar | ✅ | ✅ | n/a | ✅ | ✅ |
| Desarquivar | ✅ | ✅ | n/a | ✅ | ✅ |

## Comparação Floating

| Aspecto | Floating | Chat pós-10A |
|---|---|---|
| Usa retorno do link | sim | sim |
| SoT patch | RQ meta | Domain Store upsert |
| Reload inbox obrigatório | não | não |

## Verificações técnicas

| Check | Resultado |
|---|---|
| `tsc --noEmit` (repo) | Pass (exit 0) |
| CRM effect não usa `conversations` local | Pass |
| `handleAddLead` sem `loadConversations` | Pass |
| Export `applyStoreConversationUpsert` em `store/public` | Pass |

## Regressões conhecidas / fora de escopo

| Item | Nota |
|---|---|
| Transfer ainda pode chamar `loadConversations` | Attendance refresh pós-transferência (não CRM link) |
| Sync manual batch (`handleSyncConversations`) | Mantém GET inbox (ação manual explícita) |
| Attendance counts pós-archive | GET pontual de counts (não UI de vínculo CRM) |

## Benchmark (qualitativo)

| Métrica | Antes | Depois |
|---|---|---|
| Round-trips HTTP para refletir Add Lead na lista | link + GET conversations (+ profile) | link + profile |
| Tempo até badges/ações CRM | após inbox GET + risk wipe | imediato pós-upsert |
