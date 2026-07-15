# SPRINT_TF3.3_CLOSEOUT — Avatar na hidratação (F5 / view=list)

| Campo | Valor |
|---|---|
| **Sprint** | TF3.3 (hotfix) |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Data** | 2026-07-15 |
| **Comando** | falha de teste pós-TF3.2 (`ao atualizar F5, a foto continua sumindo`) |

---

## Resumo da entrega

TF3.2 preservava avatar **só em sessão** (merge no Domain Store).  
No **F5**, a inbox pede `view=list`: o backend zerava `avatar_url` quando só existia CDN WhatsApp / meta, e a listagem **não** enviava `metadata` → foto sumia no reload.

Agora a API de lista devolve URL de **exibição** (CDN/meta) em `avatar_url` quando não há cache de catálogo; `final_avatar_url` continua só URL estável.

### Contrato

| Pergunta | Resposta |
|---|---|
| TF3.2 resolvia F5? | **Não** — só Store em memória. |
| Grava CDN no banco? | **Não** — CDN só no payload de display (`avatar_url`). |
| Preferência de URL | Catálogo/CRM (`final_avatar_url`) > CDN/meta no `avatar_url`. |

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `uazapiIdentityResolve.ts` | Display fallback: `persisted ?? fromCol ?? fromMeta` |
| `rowMapper.ts` `toListViewItem` | Propaga `avatar_url` / `final_avatar_url` |
| Testes | `rowMapper.tf3.3.avatar-list.test.ts` (3) |

---

## Checklist de teste

1. Conversa/grupo com foto (mesmo sem cache local / só CDN).  
2. **F5** (reload completo) → foto **permanece** na lista e no header.  
3. Enviar mensagem → foto **não some**.  
4. Se existir cache de catálogo → usa URL estável (não só CDN).

---

## Observações

- Toque de Backend necessário: raiz estava em `conversationRowForClientApi` + `view=list` (fora do alcance do merge FE).  
- Persistência/backfill de avatar no disco permanece fora deste hotfix.

---

## Próximo

```
ok sprint 4
```
(após teste OK do TF3.3)
