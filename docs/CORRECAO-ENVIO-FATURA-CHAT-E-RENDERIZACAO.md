# Correção — Envio de Fatura no Chat e Renderização da Mensagem

## 1. Problemas identificados

1. **Erro no console** ao concluir o fluxo de fatura no chat: `TypeError: clientsService.createTimelineEvent is not a function` em `handleInvoiceCreatedInChat`.
2. **Mensagens com várias linhas** (ex.: texto da fatura com número, valor, vencimento e link) apareciam **em uma única linha** no chat da plataforma, enquanto no WhatsApp a formatação com quebras era respeitada.

## 2. Causa do erro de timeline

O fluxo chamava `clientsService.createTimelineEvent(...)`. Em cenários reais (HMR, cache de módulo, bundle desatualizado ou instância do `ClientsService` desalinhada), a **instância exportada** `clientsService` pode não expor o método na prática, gerando `is not a function` mesmo quando o método existe na classe no código-fonte.

A rota de API **`POST /api/clients/:id/timeline/events`** está correta e o backend já suporta o registro; o problema era a **forma de invocação no frontend** depender exclusivamente do método na instância.

## 3. O que foi corrigido no fluxo de envio

- Foi criada a função **nomeada exportada** `recordClientTimelineEvent(clientId, body)` em `src/services/clients.ts`, que chama `apiClient.post` diretamente para o mesmo endpoint.
- `ClientsService.createTimelineEvent` passou a **delegar** para `recordClientTimelineEvent`, mantendo compatibilidade para quem usar o service.
- `handleInvoiceCreatedInChat` em `Chat.tsx` passou a usar **`recordClientTimelineEvent`** nos dois pontos (`chat_invoice_created` e `chat_invoice_sent`), eliminando a dependência frágil da instância para esse fluxo.

Comportamento mantido: criação da fatura, envio da notificação/WhatsApp quando há `payment_token`, e registro dos eventos na timeline do cliente.

## 4. Causa da renderização sem quebra de linha

Em HTML/CSS, **quebras de linha (`\n`) em texto puro não criam nova linha** no layout: o navegador trata como espaço em branco colapsável. O balão da mensagem usava apenas `break-words`, que quebra palavras longas mas **não** preserva `\n`.

## 5. O que foi corrigido na UI

No corpo da mensagem no `Chat.tsx`, a classe **`whitespace-pre-wrap`** foi adicionada junto com `break-words`:

- preserva `\n` como quebra visual;
- continua quebrando linhas longas (URLs, etc.);
- não exige `dangerouslySetInnerHTML`.

## 6. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/services/clientTimeline.ts` | **`recordClientTimelineEvent`** em módulo dedicado (evita falha do Vite com export nomeado em `clients.ts`). |
| `src/services/clients.ts` | `CreateClientTimelineEventBody`, `createTimelineEvent` delegando para `clientTimeline` |
| `src/pages/Chat.tsx` | Import de `@/services/clientTimeline`; `whitespace-pre-wrap` na mensagem |

## 7. Como validar manualmente

1. **Fatura no chat**: conversa com cliente → criar fatura embutida → concluir. Não deve haver erro de `createTimelineEvent`; toast de sucesso; timeline do cliente com `chat_invoice_created` e, após envio com link, `chat_invoice_sent` quando aplicável.
2. **Quebras de linha**: enviar ou receber mensagem com várias linhas (incl. texto tipo fatura). Na plataforma, linhas devem aparecer separadas como no WhatsApp.
3. **Regressão**: mensagem curta de uma linha; preview da lista; mensagens antigas.

## 8. Riscos remanescentes

- Mensagens com **espaçamento excessivo** (muitos espaços consecutivos) também serão mais fiéis ao original por `pre-wrap` — em geral desejável para alinhar ao WhatsApp.
- Falhas de rede na timeline continuam sendo capturadas no `try/catch` de `handleInvoiceCreatedInChat` (com log); o toast de sucesso da fatura pode ocorrer mesmo se a timeline falhar — comportamento já existente no bloco.
