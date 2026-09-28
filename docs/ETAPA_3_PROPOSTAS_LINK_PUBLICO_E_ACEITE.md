# Etapa 3 — Propostas: link público, página comercial e aceite pelo cliente

Documento da **Etapa 3** do módulo Propostas / Orçamentos: compartilhamento seguro, visualização sem login, aceite/recusa públicos, validade comercial e auditoria, sem alterar a base das etapas 1 e 2 (listagem, funil, KPI, itens, conversão em fatura, `customer_invoices.proposal_id`).

## Migração

Arquivo: `database/init/120_proposal_public_view_tokens.sql`

- Tabela `proposal_public_view_tokens`: `proposal_id`, `tenant_id`, `token_hash` (único), `created_at`, `revoked_at`.
- O **segredo cru do token não é armazenado**; apenas hash SHA-256 (hex), no mesmo espírito dos links públicos de contrato (`hashPublicViewToken` reutilizado).
- Índice parcial para tokens ativos por proposta.

Registrar em `packages/backend/src/migrate.ts` (já incluído). Rodar `npm run migrate` no backend.

## Link público

| Aspecto | Detalhe |
|--------|---------|
| **URL (frontend)** | `/proposal-view/:token` (token em `base64url`, ~43 caracteres). |
| **API leitura** | `GET /api/public/proposals/view/:token` |
| **API ações** | `POST .../accept`, `POST .../reject` |
| **Emissão (CRM)** | `POST /api/proposals/:id/public-link` (auth + `proposals.edit` com dono) |
| **Meta** | `GET /api/proposals/:id/public-link` (`active`, `created_at`) — requer `proposals.view` |
| **Revogação** | `DELETE /api/proposals/:id/public-link` (`proposals.edit`) |
| **Regenerar** | Novo `POST` revoga tokens ativos da proposta e cria novo hash; o token anterior deixa de funcionar. |

Rate limit (env): `RATE_LIMIT_PUBLIC_PROPOSAL_VIEW_MAX`, `RATE_LIMIT_PUBLIC_PROPOSAL_ACTION_MAX` (ver `env.example`).

## Quem pode receber link

- **Emissão permitida** apenas se status da proposta for **`sent` ou `accepted`** (rascunho e encerradas não geram link).
- **Visualização** devolve **404** se a proposta estiver em **rascunho** (conteúdo não exposto).
- **Aceite/recusa públicos** só com status **`sent`**, sem `converted_invoice_id`, e **`valid_until` ≥ data corrente** no banco (`CURRENT_DATE`).

## Expiração (validade)

- **Política desta etapa (baixo risco):** expiração **dinâmica na leitura** — não há job que persiste `status = expired` só pelo calendário.
- Se `valid_until::date < CURRENT_DATE` e a proposta ainda está `sent`, a UI pública mostra situação **expirada**, bloqueia CTAs e o backend recusa `accept`/`reject`.
- **Não** foi adicionado evento automático de timeline “expirada por job”; evolução futura pode persistir `expired` ou registrar evento diário.

## Dados expostos na página pública

Incluídos: título, descrição, itens (descrição, qtd, unitário, desconto implícito no total da linha), total, cliente (nome, se pertencer ao tenant), nome do tenant, “contato comercial” (nome a partir de `profiles` ou texto genérico), validade, rótulo de status, flags `can_accept` / `can_reject`.

**Não** expostos: e-mail interno do responsável, IDs internos desnecessários, funnel/stage, metadados de fatura além do necessário para estado (ex.: `converted_invoice_id` não é detalhado ao cliente; só afeta elegibilidade).

## Aceite e recusa

- **Cliente:** botões na página pública quando `can_accept` / `can_reject`.
- **Equipe:** fluxo interno existente (painel) inalterado para conversão em fatura; mensagens deixam claro que **faturamento é interno**.
- Timeline:
  - `proposal_accepted` / `proposal_rejected` com `payload.source = public_link` e `actor_user_id` nulo.
  - Aceite/recusa pelo painel continuam com `actor_user_id` preenchido (Etapa 2).
- **Visualização:** até **um** evento `proposal_viewed` por proposta por **dia civil** (`created_at::date = CURRENT_DATE` no PostgreSQL), na primeira visualização válida do dia.

## Segurança e tenant

- Resolução do token exige linha **não revogada** e proposta cujo dono (`users.tenant_id`) coincide com `tenant_id` gravado no token.
- Rotas `/api/public/*` não usam sessão do painel.
- Rotas `/api/proposals/*` de emissão continuam com `tenantAuthCrm` e permissões de módulo.

## Compatibilidade

- **Conversão em fatura** e **unique** `proposal_id` na fatura: inalterados.
- Usuário logado com plano/trial bloqueado: `AuthContext` passa a **não** redirecionar para `/meu-plano` em `/proposal-view/...` (mesmo tratamento conceitual de `/contract-view/` e `/pay/`).

## Riscos remanescentes

- Timezone da expiração segue **`CURRENT_DATE` do servidor PostgreSQL**; ambientes multi-região podem alinhar TZ ou migrar para regra explícita de fuso.
- `proposal_viewed` é melhor esforço (1/dia); não substitui analytics fino.
- Link antigo após **regeneração** deixa de funcionar (comportamento desejado).

## Checklist de aceite (Etapa 3)

- [x] Proposta possui link público de visualização (token + rota dedicada).
- [x] Página pública legível e com apresentação comercial (sem layout do painel).
- [x] Cliente pode aceitar proposta elegível (`sent`, dentro da validade, não faturada).
- [x] Cliente pode recusar nas mesmas condições.
- [x] Proposta fora da validade não aceita ação pública.
- [x] Proposta faturada / não `sent` não volta ao fluxo de aceite público.
- [x] Isolamento por tenant e revogação/regeneração cobertos no backend.

## Próxima etapa (4)

A base fica pronta para **Etapa 4** (ex.: notificações ao aceite público, templates de e-mail com link estável, webhooks ou automações), pois já existem: endpoint público estável, eventos de timeline discriminando `public_link`, e emissão/revogação de token pela API interna.
