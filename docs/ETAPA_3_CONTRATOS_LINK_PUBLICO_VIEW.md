# Etapa 3 — Link público de visualização do contrato (read-only)

**Objetivo:** permitir um **link opaco** para terceiros **lerem** o documento do contrato **congelado**, sem login, sem assinatura e sem alterar estado. Preserva integralmente Etapas 1 e 2.

---

## 1. Modelagem (token de visualização)

| Artefato | Descrição |
|----------|-----------|
| Tabela `contract_public_view_tokens` | Uma linha **ativa** por contrato (`revoked_at IS NULL`), com `token_hash`, `created_at`, `expires_at` opcional. |
| `token_hash` | **SHA-256 hex (64 caracteres)** do secret enviado na URL. O secret em claro **não** é armazenado. |
| `revoked_at` | Revogação manual (painel) ou ao **regenerar** (invalida o link anterior). |
| `expires_at` | Opcional; `NULL` = sem expiração. Configurável por env (ver abaixo). |
| Índice único parcial | Um token ativo por `contract_id` (`WHERE revoked_at IS NULL`). |
| RLS | Política alinhada a `contract_signers` / `contract_events`: escopo via `contracts` + `users.tenant_id`. |
| Função SQL `get_contract_public_view_by_token_hash` | `SECURITY DEFINER`, **somente leitura**, retorna payload mínimo para a rota pública (bypass RLS controlado). |

**Decisão — hash vs token em claro:** adotado **armazenamento apenas do hash**, como na recomendação da etapa. O plaintext existe só no momento da emissão (resposta do `POST`) e na URL copiada pelo utilizador.

**Migração:** `database/init/111_contract_public_view_tokens.sql` (registrada em `packages/backend/src/migrate.ts`).

---

## 2. Geração e validação do token

**Geração (painel, autenticado):**

1. `POST /api/contracts/:id/public-view-link` com corpo opcional `{ "regenerate": boolean }`.
2. Valida posse do contrato no tenant (mesmo padrão de `getContractById`).
3. `assertModulePermission(..., 'contracts', 'view', ...)`.
4. Elegibilidade (ver secção 4); se inválido → `400 CONTRACT_PUBLIC_VIEW_NOT_ELIGIBLE`.
5. Se já existe token ativo e `regenerate !== true` → `409 CONTRACT_PUBLIC_VIEW_TOKEN_ALREADY_EXISTS` (o secret antigo não pode ser recuperado).
6. Transação: `UPDATE` revoga tokens ativos do contrato; `INSERT` novo hash + opcional `expires_at`.
7. Resposta `201`: `{ token, frontend_path, created_at, expires_at }` — **única** vez em que o secret é devolvido pela API.

**Validação (público):**

1. Cliente chama `GET /api/public/contracts/view/:token`.
2. Backend calcula `SHA-256(token)` e consulta `get_contract_public_view_by_token_hash`.
3. A função exige: hash válido, não revogado, não expirado, **`status <> 'DRAFT'`**.
4. O HTML devolvido é `COALESCE(NULLIF(trim(content_snapshot_html),''), content_html)` — alinhado à Etapa 2.
5. O serviço Node ainda exige `hasMeaningfulDocumentHtml` no resultado; caso contrário → 404 (defesa em profundidade).

**Revogação:** `DELETE /api/contracts/:id/public-view-link` (idempotente; `204`).

**Meta (painel):** `GET /api/contracts/:id/public-view-link/meta` → `{ has_active_link, created_at, expires_at }` sem revelar o secret.

---

## 3. Contratos elegíveis

| Situação | Geração de link |
|----------|-----------------|
| `DRAFT` | **Não** (função SQL filtra; painel só mostra ação se `!isContractDraft` e corpo válido). |
| Qualquer status **≠ DRAFT** com documento útil | **Sim**, desde que o utilizador tenha `view` no módulo contratos. |
| Corpo vazio / só tags | **Não** (`NOT_ELIGIBLE` no painel e 404 no público se algo passar). |

**Nota de produto:** corresponde à preferência “só contrato já emitido / não rascunho”. Contratos históricos sem snapshot foram backfill na Etapa 2; o HTML público segue a mesma regra de exibição do painel.

---

## 4. Rotas

| Método | Rota | Auth | Efeito |
|--------|------|------|--------|
| GET | `/api/contracts/:id/public-view-link/meta` | JWT + tenant CRM | Metadados do link ativo |
| POST | `/api/contracts/:id/public-view-link` | JWT + tenant CRM | Emitir / regenerar token |
| DELETE | `/api/contracts/:id/public-view-link` | JWT + tenant CRM | Revogar |
| GET | `/api/public/contracts/view/:token` | Nenhum | JSON read-only do contrato |

**Rate limit:** `GET /api/public/contracts/view/:token` usa limitador dedicado (`RATE_LIMIT_PUBLIC_CONTRACT_VIEW_MAX`, default 120 / 15 min por IP+token; desativado em `NODE_ENV=development`).

Nenhuma rota pública altera estado.

---

## 5. Montagem do domínio / link

- **Página SPA:** `/contract-view/:token` (sem `AuthGuard`), definida em `src/App.tsx`.
- **URL absoluta copiada no painel:** `window.location.origin + '/contract-view/' + token`.
- **API:** em dev, `VITE_API_URL` ou `localhost:3001`; em produção HTTPS, base relativa (`''`) como nas outras áreas — **sem** hardcode de domínio.
- A página pública obtém o HTML via `GET` **sem** header `Authorization` (`publicApiGet` em `src/integrations/api/client.ts`).

---

## 6. Dados expostos ao público

O JSON inclui apenas o necessário para leitura:

- `title`, `status`, `status_label`, `contract_number`
- `document_html` (snapshot-first)
- `client_name` (nome do cliente CRM, se houver)
- `tenant.name`, `tenant.logo_url`
- `responsible_display_name` (apenas `first_name` + `last_name` do perfil; **sem** e-mail)
- `disclaimer` (texto fixo: visualização somente leitura, sem assinatura)

**Não** são expostos: `contract_id`, `tenant_id`, signatários, eventos, IDs internos, histórico, template vivo.

---

## 7. UI interna (painel)

- **Onde:** `src/pages/ContractDetails.tsx`, menu **Ações** → “Link de visualização pública (somente leitura)”.
- **Visibilidade:** apenas se o contrato **não** é rascunho e o corpo (snapshot/HTML) tem texto útil — alinhado ao backend.
- **Diálogo:** explica diferença entre **visualizar** e **assinar**; ações:
  - Gerar e copiar / Regenerar e copiar
  - Copiar / abrir **último** token devolvido na sessão (após gerar; não é possível recuperar secret de emissões anteriores)
  - Revogar link
- **Cliente HTTP:** `src/services/contracts.ts` (`getPublicViewLinkMeta`, `issuePublicViewLink`, `revokePublicViewLink`).

---

## 8. Congelamento / template

- O público usa **exclusivamente** o HTML persistido na linha do contrato (`content_snapshot_html` com prioridade), não o template vivo.
- Alterar `contract_templates` **não** altera o que o link mostra após congelamento.

---

## 9. Variáveis de ambiente (opcional)

Documentadas em `env.example`:

- `RATE_LIMIT_PUBLIC_CONTRACT_VIEW_MAX`
- `CONTRACT_PUBLIC_VIEW_TOKEN_BYTES` (default 32)
- `CONTRACT_PUBLIC_VIEW_TOKEN_EXPIRY_DAYS` (omitir = sem expiração)

---

## 10. Riscos remanescentes

- Quem tem o link tem acesso de leitura ao documento até revogação/expiração (mitigação: regenerar/revogar; opcional expiração por env).
- Secret pode aparecer em histórico do browser, partilhas de URL ou logs de proxy se não usar HTTPS — **HTTPS em produção é obrigatório** em boa prática.
- `view` no módulo contratos permite gerar link; quem só pode “ver” lista pode partilhar conteúdo (aceite de produto; pode endurecer para `edit` numa etapa futura).

---

## 11. Pendências — Etapa 4+

- Token e rota **distintos** para **assinatura** (não reutilizar `contract_public_view_tokens`).
- Aceite / captura de assinatura, PDF, envio e-mail/WhatsApp, auditoria IP/UA.
- Atualizar `docs/MAPA_TECNICO_CONTRATOS.md` com rotas públicas de contrato (opcional housekeeping).

---

## 12. Checklist final (Etapa 3)

- [x] Contratos elegíveis conseguem gerar link público read-only
- [x] Contratos em `DRAFT` não expõem link público
- [x] Rota pública usa documento congelado/snapshot (com fallback legível alinhado à Etapa 2)
- [x] Link não depende do template vivo
- [x] Painel possui ação funcional para copiar/abrir o link (com limitações documentadas quando o token já foi emitido)
- [x] Nenhuma ação pública altera estado do contrato

**Base pronta para Etapa 4:** sim — tabela e padrão de token **só leitura** separados conceitualmente de futuro fluxo de assinatura; rota pública dedicada e payload mínimo estabelecidos.
