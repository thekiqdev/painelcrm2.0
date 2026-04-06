# Hardening — Fase 1 Chat + CRM

## 1. Problemas críticos tratados

1. Matching ainda acoplado a `user_id` no domínio de identificação (risco SaaS).
2. Regra `client_id` xor `lead_id` sem trava estrutural no banco.
3. Mutação de vínculo lead -> cliente em fluxo de leitura (`GET`) no perfil.
4. Índices insuficientes para matching por telefone em escala.
5. Risco de corrida entre sync automático e vínculo manual.
6. Normalização de telefone fraca (somente dígitos sem canônica definida).
7. Contrato de metadata de vínculo sem registro consolidado.

## 2. O que foi corrigido

- **Matching tenant-scoped** no serviço central:
  - `conversationMatchingService` agora usa `tenant_id` como escopo de domínio;
  - remove dependência de `user_id` para decisão de match.
- **Normalização canônica de telefone**:
  - local BR (10/11 dígitos) -> prefixa DDI `55`;
  - com DDI BR (12/13 iniciando com `55`) -> mantém;
  - formatos fora dessa regra -> `null` (sem heurística agressiva).
- **Proteção contra overwrite de vínculo manual**:
  - updates automáticos em `chat_conversations` usam `CASE` no SQL para preservar `client_id/lead_id` e metadados de link quando `metadata.link_source = 'manual'`.
- **Leitura sem mutação**:
  - `getConversationProfile` não migra mais vínculo.
  - criada função explícita de domínio para migração controlada:
    - `migrateConversationLeadToClient(...)` em `conversationLinkService`.
- **Integridade e performance via migration**:
  - migration `85_chat_conversations_link_hardening.sql`:
    - saneamento de linhas inválidas (`client_id` + `lead_id`) preservando precedência de cliente;
    - constraint CHECK de exclusividade (`client_id` xor `lead_id` ou ambos null);
    - índices de telefone normalizado para `clients` e `leads`;
    - índice de suporte para `users(tenant_id, id)`.

## 3. Regras reforçadas

- Matching de contato CRM é tenant-scoped.
- Auto-vínculo só ocorre com match inequívoco.
- Ambiguidade não cria vínculo automático.
- Vínculo manual tem precedência e não pode ser sobrescrito por sync.
- Conversa não pode manter `client_id` e `lead_id` simultaneamente.
- GET de perfil não altera estado de domínio.

### Contrato atual de metadata (vínculo)

- `link_source`: `auto` | `manual` | `system`
- `link_confidence`: `high` | `review` | `manual`
- `link_state`: `client_linked` | `lead_linked` | `review_required` | `unlinked`
- `match_sugerido`:
  - `type`: `client` | `lead` | `none`
  - `id`: `string | null`
  - `confidence`: `high_confidence` | `ambiguous` | `none`
  - `candidates`: lista resumida em ambiguidade

Nota: metadata foi mantida por segurança/incrementalidade. Em fase futura pode-se promover campos críticos para colunas dedicadas sem romper compatibilidade.

## 4. Migrations criadas

- `database/init/85_chat_conversations_link_hardening.sql`
  - cleanup seguro de inconsistências prévias;
  - CHECK de exclusividade de vínculo;
  - índices para matching por telefone normalizado;
  - índice auxiliar de tenant no `users`.

Também foi atualizado:
- `packages/backend/src/migrate.ts` para incluir a migration `85`.

## 5. Arquivos alterados

- `packages/backend/src/services/conversationMatchingService.ts`
- `packages/backend/src/controllers/chatController.ts`
- `packages/backend/src/services/conversationLinkService.ts` (novo)
- `database/init/85_chat_conversations_link_hardening.sql` (novo)
- `packages/backend/src/migrate.ts`

## 6. Riscos remanescentes

- A normalização canônica desta etapa é focada em formato BR (`55`) e não cobre variações internacionais complexas.
- Base antiga pode conter qualidade de telefone ruim (dados incompletos), gerando `none` até saneamento.
- A função de migração explícita foi preparada; a orquestração final de quando disparar essa migração fica para etapa controlada posterior.
- Metadata continua sendo fonte principal do estado de vínculo; exige disciplina de contrato até eventual promoção para colunas.

## 7. Como validar manualmente

1. **Tenant scope**
   - mesmo telefone em tenants diferentes;
   - validar que match/vínculo não cruza tenant.

2. **Exclusividade estrutural**
   - tentar persistir `client_id` e `lead_id` juntos (script/SQL controlado);
   - esperado: banco bloquear pelo CHECK.

3. **Sem mutação em GET**
   - chamar `GET /api/chat/conversations/:id/profile` repetidamente;
   - esperado: sem alteração de vínculo no banco.

4. **Proteção de vínculo manual**
   - marcar `metadata.link_source = 'manual'` e vínculo;
   - rodar sync/upsert;
   - esperado: vínculo manual preservado.

5. **Matching canônico**
   - testar formatos equivalentes (`(11) 99999-9999`, `5511999999999`, `11 99999-9999`);
   - esperado: mesma chave canônica e mesmo resultado de match.

6. **Performance básica**
   - validar plano de execução das queries principais de matching após índices.

## 8. O que fica para a Fase 2

- UX completa de resolução manual de ambiguidade.
- Interface rica de estado de vínculo (ações e feedbacks detalhados).
- Estratégia de foto externa vs cadastro CRM.
- Evoluções de automação/timeline.
