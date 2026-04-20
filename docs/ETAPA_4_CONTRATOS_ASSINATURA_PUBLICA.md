# Etapa 4 — Assinatura pública por signatário

**Objetivo:** permitir que cada **signatário** assine o contrato através de um **link e token próprios**, distintos do link de **visualização** (Etapa 3), com captura mínima de evidências e evolução coerente de status. **Sem** envio real por e-mail/WhatsApp nem PDF final.

---

## 1. Modelagem (`contract_signer_signature_invites`)

| Coluna | Uso |
|--------|-----|
| `id` | UUID do convite |
| `contract_signer_id` | FK → `contract_signers` (unidade do fluxo) |
| `token_hash` | SHA-256 hex do secret da URL (mesma função criptográfica que Etapa 3; **tabela diferente**) |
| `created_at`, `expires_at`, `revoked_at`, `consumed_at` | Ciclo de vida; `consumed_at` ao concluir assinatura (uso único) |
| `signer_name_confirmed`, `client_ip`, `user_agent`, `accepted_terms_version` | Evidências mínimas no convite (duplicadas em `signature_data` do signatário) |

**Índices:** único em `token_hash`; **um convite ativo por signatário** (`UNIQUE (contract_signer_id) WHERE revoked_at IS NULL AND consumed_at IS NULL`).

**RLS:** política via `contract_signers` → `contracts` → `users.tenant_id`, alinhada à Etapa 3.

**Função SQL:** `get_signature_invite_full_by_token_hash` — `SECURITY DEFINER`, resolve hash → contrato, signatário, tenant, HTML **apenas** de `content_snapshot_html` (sem fallback para `content_html` na assinatura).

**Migração:** `database/init/112_contract_signer_signature_invites.sql`.

---

## 2. Geração e validação do token

- **Emissão (painel):** `POST /api/contracts/:contractId/signers/:signerId/signature-invite` com `{ regenerate?: boolean }`. Permissão **`contracts` + `edit`**. Revoga convite pendente do mesmo signatário, insere novo hash, regista evento `SIGNATURE_INVITE_ISSUED`.
- **409** se já existe convite ativo e `regenerate !== true` (`SIGNATURE_INVITE_ALREADY_EXISTS`).
- **Revogação:** `DELETE` mesmo path → `revoked_at` + evento `SIGNATURE_INVITE_REVOKED`.
- **Meta:** `GET .../signature-invite/meta` → `{ has_active_invite, created_at, expires_at }` (sem secret).
- **Resolução pública:** `GET /api/public/contracts/sign/:token` usa a função SQL + regras em Node (`computePublicSignatureGetState`).

---

## 3. Elegibilidade por signatário e contrato

**Emitir convite:**

- Contrato no tenant do utilizador; signatário pertence ao contrato.
- Status do contrato: **`PENDING_SIGNATURE`** ou **`PARTIALLY_SIGNED`** apenas.
- **`content_snapshot_html`** com texto útil (`hasMeaningfulDocumentHtml`) — **obrigatório** (sem snapshot, não há assinatura pública).
- Signatário com **`signed_at` IS NULL**.

**Assinar (POST público):**

- Convite não revogado, não expirado, não consumido.
- Signatário ainda sem `signed_at`.
- Mesmas restrições de status + snapshot na leitura pública.
- Nome confirmado **case-insensitive** após normalização de espaços, igual ao nome do signatário no CRM.

**Não elegível:** `DRAFT`, `CANCELLED`, estados fora de pendência de assinatura, snapshot vazio, token inválido.

**Signatários obrigatórios:** não existe flag “opcional” no schema atual — **todos** os registos em `contract_signers` contam para concluir o contrato.

---

## 4. Rotas públicas

| Método | Rota | Comportamento |
|--------|------|----------------|
| GET | `/api/public/contracts/sign/:token` | Leitura: documento congelado, signatário, estado (`pending` / `already_signed`) ou 410 indisponível |
| POST | `/api/public/contracts/sign/:token` | Corpo `{ accept_terms: true, confirmed_name }` — única mutação permitida nesta rota |

Rate limits: `RATE_LIMIT_PUBLIC_CONTRACT_SIGNATURE_GET_MAX`, `RATE_LIMIT_PUBLIC_CONTRACT_SIGNATURE_POST_MAX` (env; ver `env.example`).

**SPA:** `/contract-sign/:token` (separado de `/contract-view/:token`).

---

## 5. Captura da assinatura e evidências

- Checkbox obrigatório: `accept_terms: true` (validado com `z.literal(true)`).
- Nome digitado = confirmação.
- Em `contract_signers.signature_data` (JSONB): `method`, `invite_id`, `confirmed_name`, `accepted_terms`, `accepted_terms_version` (`v1`), `client_ip`, `user_agent`, `signed_at`.
- `signed_at` na linha do signatário preenchido na mesma transação.
- Convite: `consumed_at`, `signer_name_confirmed`, `client_ip`, `user_agent`, `accepted_terms_version`.

**Evento:** `PUBLIC_SIGNATURE_COMPLETED` em `contract_events` (`created_by` NULL).

---

## 6. Atualização de status do contrato

Após cada assinatura bem-sucedida:

- Conta signatários totais vs. com `signed_at`.
- Se **todos** assinaram → **`ACTIVE`** (contrato **concluído operacionalmente** após todas as assinaturas; reutiliza o estado já usado no CRM quando o contrato é “vigente”).
- Se **alguns** assinaram e falta pelo menos um → **`PARTIALLY_SIGNED`**.
- Transição só se `canTransitionStatus` permitir (compatível com Etapa 2).

**Documentação de produto:** não foi introduzido novo status “100% assinado”; **`ACTIVE`** representa o contrato concluído após todas as assinaturas neste fluxo.

---

## 7. UI interna (`ContractDetails`)

- Aba **Assinantes:** coluna **Convite público (assinar)** com: Gerar e copiar, Regenerar, Copiar último, Abrir, Revogar; indicação de convite ativo com data.
- Visível apenas quando o contrato está em **`PENDING_SIGNATURE` / `PARTIALLY_SIGNED`** e há **snapshot** válido; caso contrário “Indisponível neste estado”.
- Listagem de signatários (`GET .../signers`) inclui `signature_invite: { has_active, created_at, expires_at }` via `LEFT JOIN LATERAL`.

**Cliente:** `src/services/contracts.ts` — `getSignatureInviteMeta`, `issueSignatureInvite`, `revokeSignatureInvite`.

---

## 8. Distinção visualização vs assinatura

| | Etapa 3 | Etapa 4 |
|---|---------|---------|
| Rota API | `/api/public/contracts/view/:token` | `/api/public/contracts/sign/:token` |
| Rota SPA | `/contract-view/...` | `/contract-sign/...` |
| Tabela | `contract_public_view_tokens` | `contract_signer_signature_invites` |
| Unidade | Contrato | Signatário |
| Ação | Só leitura | POST assina |

---

## 9. Riscos remanescentes

- Nome + checkbox não equivalem a assinatura manuscrita avançada; adequado como **MVP** com trilha IP/UA.
- Quem tem o link pode tentar submeter (rate limit mitiga brute force leve).
- **Regenerar** invalida o link anterior — comunicação ao signatário fica fora do produto até Etapa 5.

---

## 10. Pendências — Etapa 5

- Envio de convite por e-mail/WhatsApp com link seguro.
- PDF final / pacote de evidências.
- Notificações internas, lembretes, expiração por política de produto.

---

## 11. Checklist Etapa 4

- [x] Assinatura usa token separado do link de visualização
- [x] Cada signatário tem fluxo próprio de convite
- [x] Página pública mostra documento congelado (`content_snapshot_html` apenas na função SQL)
- [x] Assinatura regista evidências mínimas (IP, UA, nome, versão aceite, JSON em `signature_data`)
- [x] Backend bloqueia duplicado / inválido / revogado / expirado
- [x] Contrato atualiza para `PARTIALLY_SIGNED` / `ACTIVE` conforme contagens
- [x] Painel gere convites por signatário (gerar/copiar/regenerar/revogar)

**Base pronta para Etapa 5:** sim — eventos e metadados permitem acoplar envio, PDF e notificações sem alterar o núcleo de tokens.
