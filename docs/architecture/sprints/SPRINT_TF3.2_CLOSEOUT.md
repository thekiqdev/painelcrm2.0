# SPRINT_TF3.2_CLOSEOUT — Preserve avatar on full upsert

| Campo | Valor |
|---|---|
| **Sprint** | TF3.2 (hotfix) |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Data** | 2026-07-15 |
| **Comando** | `ok hotfix TF3.2` |

---

## Resumo da entrega

Upsert **full** de `conversation.updated` deixa de substituir a row magra e apagar caches de avatar.  
Merge: URL/caches só mudam se o incoming trouxer valor **não-vazio**.

### Contrato (resposta ao produto)

| Pergunta | Resposta |
|---|---|
| Grava avatar “para sempre”? | **Não** no disco sob demanda deste hotfix — preserva no **Domain Store em sessão** o que a inbox já hidratou. |
| Só troca ao clicar Atualizar? | **Não só.** Troca quando chega URL **nova não-vazia** (WS/HTTP) **ou** quando `loadInbox` / Atualizar rehidrata a lista do servidor. |
| Payload magro no send? | Mantém foto anterior (não wipe). |

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `conversationUpsertMerge.ts` | `mergeDomainConversationFullUpsert` |
| `actions.ts` upsert non-lean | Usa merge |
| `applyStoreConversationUpsert` | Mesma política |
| Testes | `store.tf3.2.avatar-upsert-merge.test.ts` (3) |

---

## Checklist de teste

1. Conversa com foto na lista (Store ON).  
2. Enviar mensagem → foto **permanece**.  
3. Clicar atualizar inbox → foto conforme servidor (joins).  
4. Se o servidor mandar nova URL válida no WS → foto atualiza.

---

## Observações (pós-teste)

- F5 ainda perdia foto — raiz em `view=list` + CDN nullificado (não no merge FE). → **TF3.3**.

---

## Próximo

```
ok sprint 4
```
(após teste OK do **TF3.3**)
