# Correção — Voltar do Perfil para a Conversa do Chat

> **Atualização:** a causa principal observada em teste real (race no primeiro paint + possível troca de UUID após deduplicação) está documentada e corrigida em **`docs/CORRECAO-RESTAURAR-CONVERSA-CHAT.md`**. Este arquivo permanece como registro da primeira abordagem.

## 1. Problema identificado

Ao voltar do perfil do cliente para o chat (fluxo iniciado na conversa), a rota `/chat` abria, mas a **conversa específica** não era reaberta: o atendimento perdia o contexto visual da thread.

## 2. Causa

Havia **corrida entre efeitos** no `Chat.tsx`:

1. Um efeito lia `location.state.openConversationId` e chamava `setSelectedConversationId(cid)`.
2. Outro efeito, dependente de `enabledInstanceIds`, rodava ao montar o chat e **sempre** fazia `setSelectedConversationId(null)` antes de `loadConversations`.
3. Um terceiro efeito limpava a seleção quando a conversa não aparecia na lista — enquanto `conversations` ainda estava **vazia** durante o carregamento, a seleção era tratada como inválida e removida.

Assim, o `conversationId` enviado na navegação era apagado antes (ou durante) o carregamento da lista, e o usuário via só o chat “em branco”.

## 3. O que foi corrigido

- **`pendingConversationRestoreRef`**: ao entrar em `/chat` com `state.openConversationId`, o id fica guardado neste ref (sem depender só de `setState` imediato).
- **Recarga por `enabledInstanceIds`**: não zera `selectedConversationId` se existe restauração pendente.
- **Validação “conversa na lista”**: enquanto há restauração pendente, o efeito que desseleciona conversas ausentes **não roda**, evitando limpar o id durante `loadingConversations`.
- **Efeito de conclusão**: quando `loadingConversations` termina e a lista contém o id pendente, chama-se **`handleSelectConversation(pending)`** (sync de mensagens, `loadMessages`, perfil CRM) — mesmo fluxo de um clique manual na conversa.
- **`navigateBackFromClientProfile`**: se `from === 'chat'` mas não houver `conversationId` (estado inconsistente), navega para `/chat` **sem** `openConversationId` em vez de passar `undefined`.

## 4. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Chat.tsx` | Ref pendente, ajuste dos efeitos de lista/seleção, efeito que aplica restauração após `loadConversations`. |
| `src/utils/clientProfileNavigation.ts` | Fallback ao voltar do chat sem `conversationId`. |

O fluxo **abrir perfil pelo chat** (`buildClientProfileToFromChat` + `state` + query) e **voltar** (`navigateBackFromClientProfile`) permanece o mesmo em espírito; apenas a **aplicação** da seleção no chat foi tornada segura em relação ao carregamento assíncrono.

## 5. Como a navegação funciona agora

1. **Do chat para o perfil** (inalterado conceitualmente): `navigate` para `/clients/:id?from=chat&conversation=<uuid>` com `state: { from: 'chat', conversationId }`.
2. **Do perfil para o chat**: `navigate('/chat', { state: { openConversationId } })`.
3. **No mount do Chat**: o efeito lê `openConversationId`, grava em `pendingConversationRestoreRef`, limpa o state da URL com `replace`.
4. **Quando a lista de conversas termina de carregar**: se o uuid existir na lista, executa `handleSelectConversation`; caso contrário, limpa pendência e deixa o chat sem conversa selecionada (fallback).
5. **Pelo menu Clientes**: sem `from=chat` / state de chat, **Voltar** continua indo para `/clients` — sem uso de `pendingConversationRestoreRef`.

## 6. Como validar manualmente

1. Abrir uma conversa com cliente vinculado no chat.  
2. Abrir o perfil do cliente a partir dessa conversa.  
3. Clicar em **Voltar** (header ou sidebar).  
4. Confirmar que o chat abre com **a mesma conversa** selecionada, mensagens e cabeçalho coerentes.  
5. Abrir o perfil pela lista **Clientes** e **Voltar** → deve ir para a listagem de clientes.  
6. (Opcional) Simular conversa removida: após voltar, se o id não existir mais na API/lista, o chat deve abrir **sem** erro e sem conversa selecionada.

## 7. Riscos remanescentes

- **React Strict Mode (dev)**: remount pode resetar refs em cenários extremos; em produção o fluxo é mount único típico.  
- **Múltiplas instâncias / deduplicação**: a lista deduplica por `external_chat_id`; o id interno da conversa deve ser o mesmo retornado pela API ao recarregar — se a API passar a devolver outra linha para o mesmo contato, o uuid pendente pode não existir e cair no fallback.  
- **Refresh no perfil**: a query `?from=chat&conversation=` continua disponível para contexto; o botão Voltar usa `getClientProfileReturnContext` (state + query).
