# Correção — Restaurar conversa ao voltar do perfil

## 1. Problema observado

Ao voltar do perfil do cliente para o chat (fluxo iniciado na conversa), a rota `/chat` abria, mas a **conversa ativa não era restaurada**: o usuário via só a lista, como se nenhuma thread estivesse selecionada.

## 2. Causa real

Havia **duas causas** que se somavam:

### 2.1 Race no primeiro paint (principal)

O efeito que aplicava a restauração dependia de `loadingConversations === false` e de `conversations` já preenchida. No **primeiro ciclo de efeitos** após montar o Chat:

- `loadConversations` ainda não tinha aplicado `setLoadingConversations(true)` no render visível ao efeito seguinte, ou a lista ainda estava `[]`;
- `loadingConversations` podia estar **false** com **lista vazia**;
- o código interpretava como “conversa não existe” e **limpava a pendência** antes do primeiro carregamento terminar.

Ou seja: falha de **timing**, não (só) de identificador.

### 2.2 Deduplicação da lista por `external_chat_id`

Em `loadConversations`, a lista é deduplicada com `Map` usando só `external_chat_id`. Se existirem duas linhas com o mesmo identificador externo, **o UUID interno (`id`) retornado na lista pode não ser o mesmo** que estava selecionado antes do reload. Restaurar **apenas** por `id` interno podia falhar mesmo com a conversa “sendo a mesma” na prática.

## 3. O que foi corrigido

1. **`conversationsHydratedRef`**: marcado `false` no início de cada `loadConversations` e `true` no `finally`, para só tentar restaurar **depois** de um ciclo de carga completo.
2. **Efeito de restauração**:
   - não roda enquanto `enabledInstanceIds.size === 0`;
   - não roda enquanto `loadingConversations`;
   - não roda enquanto `!conversationsHydratedRef.current`;
   - só então resolve o id e chama `handleSelectConversation`.
3. **Chaves estáveis na ida/volta**: na navegação Chat → Perfil passam-se também `external_chat_id` e `instance_id` (query `chatExternal`, `chatInstance` + `location.state`). No retorno, o state inclui `openExternalChatId` e `openInstanceId`.
4. **`resolveRestoreConversationId`**: tenta primeiro o UUID salvo; se não achar, casa **`external_chat_id` + `instance_id`**; depois só `external_chat_id` (com desempate por instância se necessário).
5. **`ClientSidebar`**: ao mudar de aba, `navigate` agora repassa também **`state: location.state`**, reduzindo perda do state do React Router (a URL com query continua sendo a fonte principal para o contexto “veio do chat”).

## 4. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/utils/clientProfileNavigation.ts` | Query/state com `chatExternal` e `chatInstance`; `resolveRestoreConversationId`; `navigateBackFromClientProfile` com state completo. |
| `src/pages/Chat.tsx` | `conversationsHydratedRef`, pendência como objeto, efeito de restauração com guards, `goToClientProfileFromChat` recebe a conversa inteira. |
| `src/components/clients/ClientSidebar.tsx` | Preservar `location.state` nas trocas de aba. |

## 5. Como a restauração funciona agora

1. **Ida (chat → perfil)**: URL com `?from=chat&conversation=<uuid>&chatExternal=…&chatInstance=…` e state com os mesmos campos.
2. **Volta (perfil → chat)**: `navigate('/chat', { state: { openConversationId, openExternalChatId, openInstanceId } })`.
3. **No Chat**: o efeito grava a pendência no ref e limpa o state da rota com `replace`.
4. **Após `loadConversations` concluir** (`conversationsHydratedRef === true`): resolve o id com `resolveRestoreConversationId` e executa `handleSelectConversation` (sync, mensagens, perfil), igual ao clique manual.

## 6. Como validar manualmente

1. Abrir uma conversa com cliente vinculado.  
2. Abrir o perfil a partir dessa conversa.  
3. Clicar em **Voltar** (header ou sidebar).  
4. Confirmar que a **mesma** thread volta selecionada e carregada.  
5. Abrir o perfil pela lista **Clientes** e voltar → deve ir para `/clients`.  
6. (Opcional) Trocar de aba no perfil antes de voltar → ainda deve restaurar (query + state preservado no sidebar).

## 7. Riscos remanescentes

- Sem instâncias habilitadas, a pendência não é resolvida até existir instância (caso raro).  
- Vários chats com o mesmo `external_chat_id` em instâncias diferentes: a resolução prefere `instance_id` quando disponível; ambiguidade residual é possível se faltar `instance_id` no contexto.  
- Documento anterior `CORRECAO-VOLTAR-PARA-CONVERSA-CHAT.md` descrevia a intenção; a **causa real** de timing foi corrigida nesta rodada — ver §2 acima.
