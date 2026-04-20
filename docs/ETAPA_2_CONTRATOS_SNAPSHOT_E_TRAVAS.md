# Etapa 2 — Snapshot, travas de documento e máquina de status

**Objetivo:** contrato emitido com corpo **congelado** após envio/ativação, regras no **backend**, UI alinhada; base para Etapa 3 (links públicos) sem implementar tokens nem e-mail.

---

## 1. Snapshot e fonte da verdade

| Campo | Papel |
|-------|--------|
| `contracts.content_html` | Texto HTML de trabalho em **rascunho** e cópia espelhada após congelamento. |
| `contracts.content_snapshot_html` | **Cópia imutável** do documento no momento do primeiro congelamento (envio para assinatura ou ativação direta). |
| `contracts.document_frozen_at` | Timestamp do congelamento. |

**Regra de exibição (API + frontend):** usar `content_snapshot_html` quando preenchido; senão `content_html` (legado / rascunho). Helper: `getContractDocumentHtml()` em `src/utils/contractDocument.ts`.

**Migração:** `database/init/110_contracts_document_freeze.sql` — adiciona colunas + backfill para contratos com `status <> 'DRAFT'` sem snapshot.

**Template:** alterar `contract_templates` **não** altera contratos existentes; o corpo do contrato é sempre o armazenado na linha do contrato.

---

## 2. Status (compatível com o enum existente)

| Conceito | Status no banco |
|----------|------------------|
| Rascunho | `DRAFT` |
| Enviado para assinatura | `PENDING_SIGNATURE` |
| Assinado parcialmente (futuro) | `PARTIALLY_SIGNED` |
| Vigente / concluído operacional | `ACTIVE` |
| Inativo / expirado / cancelado | `INACTIVE`, `EXPIRED`, `CANCELLED` |

**“Assinado” no sentido de produto:** quando existir captura real de assinatura, espera-se evoluir `PARTIALLY_SIGNED` → `ACTIVE`; **Etapa 2 não** implementa assinatura.

---

## 3. Congelamento e edição

- **`DRAFT`:** documento e estrutura editáveis (conteúdo, modelo, cliente, vigência, financeiro, signatários, etc.).
- **Qualquer status ≠ `DRAFT`:** documento **congelado** para a API:
  - `PATCH /api/contracts/:id` só aceita **`status`** e **`tags`** (demais campos → `409 CONTRACT_FROZEN`).
- **Signatários:** `POST/PATCH/DELETE` em `/api/contracts/.../signers` **apenas** com contrato em `DRAFT` (`409 CONTRACT_SIGNERS_LOCKED` caso contrário).
- **Eventos:** continuam criáveis com permissão de edição (auditoria operacional).

**Congelamento com snapshot** ocorre na transição **`DRAFT` → `PENDING_SIGNATURE`** ou **`DRAFT` → `ACTIVE`:** validações de título, corpo com texto útil e, para `PENDING_SIGNATURE`, **≥ 1 signatário** cadastrado.

---

## 4. Transições de status (backend)

Implementação: `packages/backend/src/services/contractLifecycle.ts` (`canTransitionStatus`).

- De `CANCELLED`: nenhuma transição.
- Demais transições seguem o mapa no arquivo (ex.: `DRAFT` → `PENDING_SIGNATURE`, `ACTIVE`, `CANCELLED`, `INACTIVE`).
- Não há retorno automático para `DRAFT` após envio.

---

## 5. Criação de contrato

- **`POST /api/contracts`:** obrigatório criar como **`DRAFT`** (ou omitir `status`). Corpo com `status` diferente de `DRAFT` → **`400 CONTRACT_CREATE_NON_DRAFT`**.
- Fluxo **enviar para assinatura** no frontend: `POST` rascunho → signatários → `PATCH { status: 'PENDING_SIGNATURE' }` (segunda chamada aplica snapshot + `document_frozen_at`).

---

## 6. Arquivos alterados / novos

| Arquivo | Mudança |
|---------|---------|
| `database/init/110_contracts_document_freeze.sql` | Colunas + backfill |
| `packages/backend/src/migrate.ts` | Inclusão do script 110 |
| `packages/backend/src/services/contractLifecycle.ts` | Regras de texto, transição, snapshot |
| `packages/backend/src/utils/contractAccess.ts` | `status` em linhas de acesso |
| `packages/backend/src/controllers/contractsController.ts` | Validações, freeze, create só DRAFT, formatação |
| `packages/backend/src/controllers/contractSignersController.ts` | Trava fora de `DRAFT` (mutações) |
| `src/utils/contractDocument.ts` | Helpers de exibição / validação de HTML |
| `src/types/contracts.ts` | `content_snapshot_html`, `document_frozen_at` |
| `src/components/shared/RichTextEditor.tsx` | `readOnly` |
| `src/pages/NewContract.tsx` | Fluxo em 2 passos para envio; travas na UI; alerta |
| `src/pages/ContractDetails.tsx` | Exibição e duplicação com snapshot |
| `src/pages/Contracts.tsx` | Duplicação com `getContractDocumentHtml` |
| `src/pages/ClientProfile.tsx` | Renovação com corpo do snapshot |
| `docs/ETAPA_2_CONTRATOS_SNAPSHOT_E_TRAVAS.md` | Este documento |

---

## 7. UI (Etapa 2)

- **Novo/Editar contrato:** se status ≠ `DRAFT`, campos e editor em modo somente leitura / desabilitados; botões de salvar/enviar desativados; alerta “Documento congelado”.
- **Detalhe:** conteúdo renderizado via `getContractDocumentHtml`.

---

## 8. Riscos remanescentes

- **Migração obrigatória** em ambientes existentes; sem colunas, inserts falham.
- **Ativação em massa** (`ACTIVE`) a partir de rascunho com corpo vazio falha na validação (esperado).
- **Leitura** de listagem/detalhe ainda sem Permission Engine em `view` (herdado da Etapa 1).
- **Tags** editáveis com contrato congelado — metadado não documental; revisar se o produto quiser travar também.

---

## 9. Pendências — Etapa 3+

- Link público de **visualização** (token) usando `content_snapshot_html`.
- Link público de **assinatura** e atualização de `signed_at` / status.
- Reenvio, e-mail/WhatsApp, PDF, auditoria forte (IP/UA).

---

## Checklist Etapa 2

- [x] Contrato usa conteúdo próprio + snapshot ao congelar
- [x] Template editado depois não altera contrato já congelado (corpo na linha do contrato)
- [x] Envio para assinatura aplica snapshot + travas
- [x] Edição de conteúdo bloqueada após sair de `DRAFT` (API + UI)
- [x] Backend impede mutações inválidas (`CONTRACT_FROZEN`, `CONTRACT_SIGNERS_LOCKED`, validações de envio)
- [x] UI reflete travas por status na edição

**Base pronta para Etapa 3:** sim — snapshot e `document_frozen_at` prontos para expor o mesmo HTML em rota pública read-only.
