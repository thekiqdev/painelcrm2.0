# Plano de fechamento — Contratos para produção

Objetivo: habilitar **modelos persistentes**, **links de visualização e assinatura** seguros, **fluxo ponta a ponta** e **auditoria mínima**, sem quebrar o que já funciona (CRUD interno, listagem por tenant, permission engine no contrato principal).

Princípios: **compatibilidade**, **migrações incrementais**, **feature flag opcional** se necessário, **sem remover** rotas atuais na primeira entrega.

---

## Ordem recomendada (macro)

1. **Correções de consistência multiusuário / tenant** (baixo risco, alto valor).  
2. **UX mínima de modelos** + alinhamento de permissões.  
3. **Congelamento explícito** e metadados de envio (schema + API).  
4. **Superfície pública**: token de visualização e token de assinatura (rotas novas).  
5. **Notificações**: variáveis `view_link` / `sign_link` nos templates.  
6. **PDF / evidência** (opcional ou fase 2): snapshot armazenado ou gerado on-demand.  
7. **Testes e hardening**: rate limit, expiração, revogação.

---

## Etapa 1 — Consistência de API (signers / events / posse)

| Campo | Conteúdo |
|-------|-----------|
| **Objetivo** | Qualquer usuário do tenant que já pode ver/editar o contrato (conforme `assertModulePermission`) deve conseguir gerenciar signers/events **coerentemente** com `contractsController`. Hoje `contractSignersController` e `contractEventsController` exigem `c.user_id = req.userId`, o que **conflita** com `getContracts`/`getContractById` por tenant. |
| **Arquivos impactados** | `packages/backend/src/controllers/contractSignersController.ts`, `packages/backend/src/controllers/contractEventsController.ts` (e eventualmente testes). |
| **Risco** | Baixo se reutilizar o mesmo padrão SQL de `getContractById` + `assertModulePermission` em mutações. |
| **Impacto em produção** | Comportamento hoje “silenciosamente errado” para equipes com vários usuários passa a funcionar; sem mudança de schema. |
| **Estratégia segura** | Substituir verificação “só criador” por: (1) contrato existe e pertence ao tenant do usuário; (2) `assertModulePermission` para create/edit signers/events alinhado a `contracts`. |
| **Rollback** | Reverter commit do controller (sem migração). |
| **Critérios de aceite** | Usuário B do mesmo tenant, com permissão de edição no contrato de A, consegue listar/criar signers e ver eventos; usuário sem permissão continua bloqueado. |

---

## Etapa 2 — Modelos de contrato: permissões + UI

| Campo | Conteúdo |
|-------|-----------|
| **Objetivo** | Tornar **visível e utilizável** o CRUD já existente em `/api/contract-templates`; impedir que qualquer usuário altere templates de outro sem regra de negócio clara. |
| **Arquivos impactados** | `packages/backend/src/controllers/contractTemplatesController.ts` ( `assertModulePermission` ou regra “só owner ou admin”); `src/pages/Contracts.tsx` (botão **Modelos**); **novo** componente/página leve `ContractTemplates` (lista + criar/editar com `RichTextEditor` reaproveitado de `NewContract`). |
| **Risco** | Médio apenas se a política de “quem pode editar template alheio” não for comunicada — definir: *owner* do `user_id` do template vs *tenant admin*. |
| **Impacto em produção** | Novas telas; API já existe. |
| **Estratégia segura** | Fase A: permitir CRUD só ao criador (`template.user_id === req.userId`) + admin global do tenant; Fase B: papel “settings” se já existir no produto. |
| **Rollback** | Esconder rota/menu; backend pode manter checks adicionais sem quebrar clientes. |
| **Critérios de aceite** | Usuário cria modelo, lista na tela “Novo contrato → Usar modelo”; modelo sobrevive após reload e após login de outro dia. |

---

## Etapa 3 — Congelamento de conteúdo e rastreio de envio

| Campo | Conteúdo |
|-------|-----------|
| **Objetivo** | Garantir que, após “enviar para assinatura”, o documento exibido ao signatário seja o **snapshot** acordado; registrar `sent_at`, versão de conteúdo, e opcionalmente hash. |
| **Arquivos impactados** | Nova migração SQL (ex.: `contracts.content_snapshot_html`, `contracts.sent_at`, `contracts.content_hash`, `contracts.frozen_at` — nomes a definir); `contractsController` + `NewContract` / serviço dedicado `contractSendService`. |
| **Risco** | Médio: migração em tabela grande; mitigar com colunas nullable e preenchimento só em novos envios. |
| **Impacto em produção** | Contratos antigos: `content_html` continua fonte de verdade na UI interna até reenvio. |
| **Estratégia segura** | Ao passar para `PENDING_SIGNATURE`, copiar `content_html` → `content_snapshot_html` se snapshot vazio; bloquear edição de corpo após envio (ou exigir “cancelar envio” explícito). |
| **Rollback** | Migração reversa (DROP COLUMN) apenas se não houver dependência de links públicos. |
| **Critérios de aceite** | Alterar modelo **não** altera contrato já enviado; contrato reaberto no painel mostra o mesmo HTML do snapshot. |

---

## Etapa 4 — Links públicos: visualizar vs assinar

| Campo | Conteúdo |
|-------|-----------|
| **Objetivo** | Introduzir duas superfícies: **view** (somente leitura) e **sign** (coleta de assinatura), sem autenticação do painel, com token opaco por finalidade. |
| **Arquivos impactados** | Novas rotas **públicas** no backend (ex.: `GET /api/public/contracts/:id/view?token=` e `POST /api/public/contracts/:id/sign`); nova migração em `contract_signers` (`view_token_hash`, `sign_token_hash`, `token_expires_at`, `last_opened_at`, etc.) ou tabela `contract_public_access`; frontend: páginas **fora** de `AuthGuard` em `App.tsx`. |
| **Risco** | **Alto** (superfície de ataque); mitigar com tokens de alta entropia (32+ bytes), HTTPS, rate limit, expiração, invalidação ao assinar, CSRF no POST se usar cookies (preferir token no body/header). |
| **Impacto em produção** | Novo vetor exposto na internet — exige monitoramento e testes de segurança. |
| **Estratégia segura** | Não usar apenas UUID do contrato na URL; não expor lista; validar token constant-time; logar tentativas falhas; opcional: e-mail do signatário como segundo fator simples (código). |
| **Rollback** | Desligar rotas públicas via feature flag; tokens deixam de ser emitidos. |
| **Critérios de aceite** | Link de view não permite assinar; link de sign só aceita o signatário correspondente; reuso de link após assinatura negado; multidomínio: links absolutos com `PUBLIC_APP_URL` ou origem correta. |

---

## Etapa 5 — Notificações e reenvio

| Campo | Conteúdo |
|-------|-----------|
| **Objetivo** | Ao enviar/reenviar, disparar template `contracts.sent_for_signature` com `sign_link` e opcionalmente `view_link`; Chat e automações passam a usar as mesmas variáveis. |
| **Arquivos impactados** | Serviço de envio (novo ou extensão), `messageTemplatesController` seeds / documentação de variáveis, `Chat.tsx` se for reutilizar. |
| **Risco** | Médio (configuração de provedor WhatsApp/e-mail). |
| **Impacto em produção** | Mensagens com URLs novas — comunicar aos tenants. |
| **Critérios de aceite** | Reenvio gera **novo** token ou revalida o existente conforme política documentada; cliente recebe link funcional. |

---

## Etapa 6 — PDF e evidência (fase opcional)

| Campo | Conteúdo |
|-------|-----------|
| **Objetivo** | Arquivo imutável pós-assinatura ou download para arquivo. |
| **Arquivos impactados** | Worker ou endpoint on-demand; storage (S3/local) — alinhar ao padrão do projeto. |
| **Risco** | Médio/alto (infra + custo). |
| **Critérios de aceite** | PDF corresponde ao snapshot; hash bate com o registrado. |

---

## Plano de rollback (geral)

1. **Somente código:** revert PR; rotas públicas protegidas por flag primeiro.  
2. **Migração aplicada:** manter colunas novas nullable e não usadas pela UI antiga; desligar apenas leitura pública.  
3. **Incidente de segurança:** revogar tokens (coluna `revoked_at` ou rotacionar segredo HMAC).

---

## Critérios globais de “pronto para produção”

- [ ] Modelos criáveis e listáveis na UI; persistência verificada.  
- [ ] Envio congela conteúdo; edição indevida bloqueada ou auditada.  
- [ ] Link de visualização e de assinatura distintos; tokens seguros e expiráveis.  
- [ ] Assinatura grava `signed_at` + `signature_data` + evidência (IP/UA) mínima.  
- [ ] Status do contrato atualizado por regra clara (`PARTIALLY_SIGNED` / `ACTIVE`).  
- [ ] Permissões coerentes em **templates**, **signers** e **events**.  
- [ ] Nenhuma regressão nas rotas `/api/contracts` existentes (contratos atuais continuam listando).

---

## Comparativo de abordagens (links públicos)

| Abordagem | Menor risco | Melhor compatibilidade | Menor impacto | Melhor segurança |
|-----------|-------------|------------------------|---------------|------------------|
| **A)** Token só em `contract_signers` (1 par view/sign por signatário) | ✓ | ✓ (extensão natural) | ✓ | ✓ se hashes + expiração |
| **B)** Tabela `contract_invitations` separada | Médio | ✓ | Mais código | ✓✓ (auditoria central) |
| **C)** Terceiro (DocuSign/ZapSign) | Baixo técnico, alto custo/compliance | Depende do vendor | Integração nova | ✓✓✓ |

**Recomendação inicial:** **A ou B** alinhada ao stack atual (Postgres + API própria), evitando vendor lock até necessidade legal explícita.
