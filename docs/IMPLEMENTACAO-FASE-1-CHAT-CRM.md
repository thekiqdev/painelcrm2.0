# Implementação — Fase 1 Chat + CRM

## 1. O que foi implementado

- Centralização do matching de conversa por telefone em um serviço único.
- Separação explícita entre:
  - `match_sugerido` (resultado do matching),
  - `vinculo_efetivo` (campos persistidos da conversa).
- Aplicação de precedência determinística:
  - cliente > lead.
- Bloqueio de auto-vínculo em caso ambíguo.
- Persistência de metadados de vínculo na conversa:
  - `link_source`,
  - `link_confidence`,
  - `link_state`,
  - `match_sugerido`.
- Preservação de vínculo manual (não sobrescrever no sync).
- Base de migração lead -> cliente quando lead convertido.
- Exposição no frontend do estado de vínculo (`Cliente`, `Lead`, `Revisão`, `Sem vínculo`).

## 2. Regras aplicadas

1. Matching sempre tenant-scoped (não apenas user-scoped).
2. Match automático:
   - cliente único -> high confidence client;
   - sem cliente e lead único -> high confidence lead;
   - múltiplos candidatos -> ambiguous (sem auto-vínculo);
   - sem candidatos -> none.
3. Vínculo efetivo exclusivo:
   - `client_id` OU `lead_id` (nunca ambos).
4. Vínculo manual:
   - quando `metadata.link_source = manual`, sync automático não sobrescreve.
5. Conversão lead -> cliente:
   - ao consultar perfil, se lead vinculado está `Convertido` e cliente correspondente é encontrado por telefone no mesmo tenant, migra vínculo para `client_id` e limpa `lead_id`.

## 3. Serviços criados/alterados

- **Novo**: `packages/backend/src/services/conversationMatchingService.ts`
  - `normalizeConversationPhone()`
  - `resolveConversationMatch()`
  - retorna tipo sugerido, id sugerido, confiança e candidatos ambíguos.

- **Alterado**: `packages/backend/src/controllers/chatController.ts`
  - `upsertConversation`: agora usa o service central de matching.
  - `getConversations`: remove fallback híbrido por JOIN de leitura; usa vínculo persistido + metadados.
  - `getConversationProfile`: usa vínculo persistido e aplica base de migração lead->cliente.
  - `getClientMessages`: usa apenas vínculo efetivo (`client_id`) para buscar conversas.
  - helpers incrementais:
    - detecção segura de coluna `lead_id` (compatibilidade com bancos sem migração aplicada),
    - resolução de tenant por usuário para matching tenant-scoped.

- **Alterado (frontend)**:
  - `src/services/chat.ts`: adiciona campos de estado de vínculo no `ChatConversation`.
  - `src/pages/Chat.tsx`: exibe badge de estado (`Revisão` / `Sem vínculo`) quando não há vínculo efetivo.

## 4. Arquivos alterados

- `packages/backend/src/services/conversationMatchingService.ts` (novo)
- `packages/backend/src/controllers/chatController.ts`
- `src/services/chat.ts`
- `src/pages/Chat.tsx`

## 5. Como funciona o matching agora

Entrada:
- telefone bruto da conversa,
- `tenantId`,
- `userId`.

Passos:
1. normaliza telefone (somente dígitos, mínimo válido),
2. busca clientes do tenant+usuário com telefone equivalente,
3. se cliente único -> `suggestedType=client`, `confidence=high_confidence`,
4. se múltiplos clientes -> `confidence=ambiguous` (sem vínculo automático),
5. se nenhum cliente, repete para lead,
6. se nenhum lead -> `none`.

Saída:
- `suggestedType` (`client` | `lead` | `none`)
- `suggestedId`
- `confidence` (`high_confidence` | `ambiguous` | `none`)
- `candidates` (resumo para caso ambíguo)

## 6. Como funciona o vínculo agora

- O vínculo efetivo fica em `chat_conversations`:
  - `client_id` ou `lead_id`.
- Regras de atualização no upsert:
  - se vínculo atual é manual (`metadata.link_source=manual`), não muda automaticamente;
  - se match `high_confidence`, grava vínculo automático com exclusividade mútua;
  - se match `ambiguous`, não cria vínculo, grava estado de revisão.
- Metadados gravados:
  - `link_source`: `auto` | `manual` | `system`
  - `link_confidence`: `high` | `review` | `manual`
  - `link_state`: `client_linked` | `lead_linked` | `review_required` | `unlinked`
  - `match_sugerido`: tipo/id/confiança/candidatos

## 7. Riscos e limitações

- Se o banco não tiver coluna `lead_id`, o sistema funciona em modo compatível, mas vínculo efetivo com lead fica limitado.
- Vínculo manual depende de `metadata.link_source=manual`; se algum fluxo manual não marcar isso corretamente, pode haver comportamento inesperado.
- Migração lead->cliente implementada de forma incremental no `getConversationProfile`; ainda não é um job global de reconciliação.
- Ainda não há UX completa de resolução manual de ambiguidade (isso é Fase 2).

## 8. Como validar manualmente

1. **Telefone só em cliente**
   - receber/sincronizar conversa;
   - esperado: `client_id` preenchido, `lead_id` nulo, `link_state=client_linked`.

2. **Telefone só em lead**
   - receber/sincronizar conversa;
   - esperado: `lead_id` preenchido (se coluna disponível), `client_id` nulo, `link_state=lead_linked`.

3. **Telefone ambíguo**
   - criar duplicidade de telefone (mesmo escopo);
   - receber/sincronizar conversa;
   - esperado: sem vínculo efetivo, `link_state=review_required`, `match_sugerido.confidence=ambiguous`.

4. **Sem número encontrado**
   - receber conversa com telefone sem cadastro;
   - esperado: sem vínculo, `link_state=unlinked`.

5. **Vínculo manual**
   - marcar conversa manualmente com `metadata.link_source=manual` e vínculo;
   - executar sync;
   - esperado: vínculo não é sobrescrito.

6. **Conversão lead -> cliente**
   - conversa vinculada a lead convertido;
   - abrir perfil da conversa;
   - esperado: migração para `client_id`, limpeza de `lead_id`, registro de migração em metadata.
