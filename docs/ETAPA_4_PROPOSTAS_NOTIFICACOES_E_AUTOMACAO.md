# Etapa 4 — Propostas: notificações, mensagens operacionais e base de automação

Esta etapa fecha a camada **operacional** e a **base** para automação comercial e integrações, **sem** substituir o link público por rota autenticada, **sem** engine completa de e-mail/WhatsApp e **sem** misturar aceite público com a ação administrativa de faturamento no painel.

## Migração de banco

- Arquivo: `database/init/121_proposals_etapa4_automation.sql`
- Incluído em `packages/backend/src/migrate.ts` após `120_proposal_public_view_tokens.sql`.
- Conteúdo:
  - Coluna `proposals.post_accept_billing_mode` com valores: `none` | `notify_team` | `auto_pending_invoice`.
  - Tabela `proposal_integration_events` (append-only + listagem autenticada).

**Deploy:** aplicar migração antes ou junto do backend que referencia a coluna nas APIs de listagem/detalhe/criação. O aceite público tenta ler a política com `SELECT` separado; se a coluna ainda não existir, o código assume `none` (compatibilidade parcial), mas **listagens e PATCH com a coluna exigem a migração**.

## 1. Templates de mensagem

### Comportamento

- **Fallbacks** centralizados em `packages/backend/src/services/proposalOperationalCopy.ts` (placeholders `{{client_name}}`, `{{proposal_title}}`, `{{proposal_amount}}`, `{{proposal_link}}`, `{{valid_until}}`, `{{tenant_name}}`, `{{responsible_name}}`).
- **Override** opcional via `message_templates` (`resource_type = 'proposals'`), ações: `sent`, `reminder_sent`, `accepted`, `rejected`, `expired`, `converted_to_invoice` (mapeadas aos snippets operacionais).
- **Seed / inicialização:** templates pré-definidos adicionados em `messageTemplatesController.ts` para as ações acima (alinhados aos placeholders do helper).

### Preview autenticado

- `POST /api/proposals/:id/operational-preview` — body opcional `{ "public_url": "..." }`; resposta `{ snippets }` com chaves: `initial_send`, `reminder`, `accepted_client_note`, `rejected_client_note`, `expired_client_note`, `invoiced_internal_note`.
- Permissão: `proposals.view`.

## 2. Fluxo operacional de envio / reenvio (manual assistido)

No detalhe da proposta (`src/pages/ProposalDetails.tsx`), aba **Faturamento**:

- **Link público:** copiar URL, gerar novo token (revoga o anterior), revogar — inalterado em relação à Etapa 3.
- **Mensagens prontas:** botões que copiam assunto + corpo (área de transferência) para uso em WhatsApp, e-mail, etc., com placeholders já mesclados.
- **Atualizar textos:** recarrega o preview (útil após gerar o link para incluir a URL real no texto).

Não há envio automático por canal nesta etapa.

## 3. Notificações internas (CRM)

- Tipo novo: `crm_proposal` em `packages/backend/src/services/notifications.ts`.
- Wrapper: `proposalCrmNotifications.ts` → `createNotification` com `data.module = 'proposals'`.

### Quando disparam

| Momento | Comportamento |
|--------|----------------|
| Aceite **público** | Notificação ao responsável (`proposals.user_id`) + texto conforme política pós-aceite. |
| Recusa **pública** | Notificação ao responsável. |
| Conversão em fatura (manual ou automática) | Notificação ao responsável + evento de integração `proposal.invoiced`. |
| Falha da fatura automática | Notificação com detalhe resumido da mensagem de erro. |
| Aceite sem cliente (modo automático) | Notificação informando que a fatura automática foi ignorada. |

Aceite/recusa feitos **só pelo painel** (PATCH) não passam pelos hooks públicos; continuam na timeline como hoje.

## 4. Política pós-aceite (faturamento)

Campo `post_accept_billing_mode` na proposta:

| Valor | Efeito após aceite **pelo link público** |
|-------|------------------------------------------|
| `none` | Timeline + evento `proposal.public_accepted` + **notificação** ao responsável (“Proposta aceita pelo cliente”), **sem** texto extra sobre automação de fatura. |
| `notify_team` | Igual ao acima, com **texto adicional** na mesma notificação orientando a gerar a fatura no painel quando aplicável. |
| `auto_pending_invoice` | Notificação conforme acima + tentativa de `convertAcceptedProposalToInvoice` com as **mesmas regras** do botão manual (vencimento = `valid_until` se válida, senão +14 dias). Falhas geram notificação. |

API:

- `POST` criação e `PATCH` aceitam `post_accept_billing_mode` (validação Zod no backend).
- `PATCH` bloqueia alteração da política em proposta `rejected` / `expired`; proposta já faturada continua bloqueada como na Etapa 2.

## 5. Eventos / webhooks / integração futura

Tabela `proposal_integration_events`:

- Colunas principais: `tenant_id`, `proposal_id`, `event_key`, `payload` (jsonb), `created_at`.
- Chaves usadas nesta etapa:
  - `proposal.public_accepted`
  - `proposal.public_rejected`
  - `proposal.invoiced`

API:

- `GET /api/proposals/:id/integration-events` — lista recente (permite painel e futuro worker de webhooks). Permissão: `proposals.view`.

**Próximos passos sugeridos (Etapa 5+):** fila outbound, assinatura HMAC, retry, e consumo por tenant sem polling no painel.

## 6. Permissões operacionais

- **Mantidas** as ações existentes: `view` / `create` / `edit` / `delete` no módulo `proposals`.
- **Não** foram introduzidos novos bits no motor de roles (`send`, `convert_to_invoice`) para evitar migração ampla em `role_module_permissions` nesta entrega.
- **Mapeamento atual:**
  - Preview operacional e eventos de integração: `proposals.view`.
  - Link público (emitir/revogar) e conversão em fatura: `proposals.edit` (com regras `edit_own` quando aplicável), como já era na Etapa 2/3.

Documentar evolução: granularidade fina pode reutilizar o mesmo `assertModulePermission` estendendo `PermissionAction` e seeds de roles numa etapa dedicada.

## 7. UX operacional

- Aba **Faturamento:** política pós-aceite (select), mensagens prontas, bloco do link público, CTA de gerar fatura quando aplicável.
- Aba **Histórico:** timeline existente + bloco **Eventos de integração** (aceite/recusa pública, fatura).

## Riscos remanescentes

1. **Ordem de deploy:** backend novo + banco sem coluna `post_accept_billing_mode` → erros em listagem/detalhe/INSERT até rodar `121`.
2. **Fatura automática:** depende de gateway, dados do cliente e demais pré-condições do `createManualInvoice`; falhas são esperadas e devem ser tratadas operacionalmente (notificação já enviada).
3. **Dupla notificação:** aceite público com `auto_pending_invoice` pode gerar notificação de aceite e, em seguida, de fatura gerada — comportamento intencional para rastreabilidade.
4. **Permissões:** qualquer usuário com `proposals.edit` no escopo do registro continua podendo converter em fatura; não há separação `convert_to_invoice` nesta etapa.
5. **Eventos de integração:** sem webhook externo ainda; a tabela é a fonte de verdade mínima.

## Checklist final

- [x] Proposta possui mensagens/templates utilizáveis (fallback + DB + preview API).
- [x] Equipe consegue operar envio/reenvio do link público e copiar textos prontos.
- [x] Aceite/recusa pública geram notificação ao responsável e eventos em `proposal_integration_events`.
- [x] Proposta aceita pode alimentar fluxo de automação de faturamento (`post_accept_billing_mode`, incl. automático com baixo risco documentado).
- [x] Base pronta para integração futura (eventos persistidos + chaves estáveis).
- [x] UX operacional mais clara (política, mensagens, histórico de eventos).

## Pronto para Etapa 5?

**Sim**, no sentido de: política e eventos estão **definidos e persistidos**; falta apenas camada de **entrega** (webhooks assinados, retries, UI de configuração por tenant) sem reabrir modelo de dados da proposta. Recomenda-se Etapa 5 focada em **outbound + observabilidade**, reutilizando `proposal_integration_events` ou uma fila derivada.
