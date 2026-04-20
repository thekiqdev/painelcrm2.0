# Etapa 6 — Hardening final do módulo de contratos

Documento de fechamento técnico da **Etapa 6** (endurecimento para produção), sobre as Etapas 1–5 já consolidadas.

## 1. Tokens públicos (visualização e assinatura)

### Visualização (`contract_public_view_tokens`)

- **Cancelado:** a função SQL `get_contract_public_view_by_token_hash` passa a excluir contratos em estado `CANCELLED` (migration `113_contract_public_view_block_cancelled.sql`). Assim, mesmo com token não revogado na base, o conteúdo **não** é servido após cancelamento.
- **Emissão:** `isEligibleForPublicViewContract` em `contractPublicViewService.ts` também bloqueia `CANCELLED` (coerência com a API de emissão).
- **Regeneração / concorrência:** em `issuePublicViewToken`, violações de unicidade (`23505` no índice parcial “um ativo por contrato”) devolvem `CONFLICT` em vez de erro 500; o controlador responde `409` com `CONTRACT_PUBLIC_VIEW_CONFLICT`.
- **Revogação em massa no cancelamento:** ao transicionar o contrato para `CANCELLED` em `updateContract`, o backend revoga tokens de **visualização** e convites de **assinatura** ainda pendentes, e regista o evento `CONTRACT_ACCESS_TOKENS_REVOKED` (dentro do contexto RLS do tenant).

### Assinatura (`contract_signer_signature_invites`)

- **Concorrência:** em `issueSignatureInvite`, `23505` no insert (convite ativo único por signatário) mapeia para `CONFLICT` → `409` / `SIGNATURE_INVITE_CONFLICT`.
- **Metadados:** eventos `SIGNATURE_INVITE_ISSUED` incluem `action: ISSUE | REGENERATE`; `SIGNATURE_INVITE_REVOKED` inclui `action: REVOKE`.
- **Unicidade:** mantidos os índices parciais existentes (111/112); sem alteração de modelo central.

## 2. Permissões e leitura

- **`GET /api/contracts/:id`:** passa a exigir `assertModulePermission(..., 'contracts', 'view', ...)`.
- **`GET .../signers` e `GET .../events`:** mesma verificação de `view`.
- **Meta de convite (`GET .../signature-invite/meta`):** passa de `edit` para **`view`** (leitura do estado do convite sem poder emitir).
- **Emitir / regenerar / revogar link de visualização pública:** passam a exigir **`edit`** (antes era `view`), alinhando mutação sensível à política de edição.
- **PDF e evidências:** mantêm `view` (inalterado na intenção; já validados nos serviços).

## 3. Rastreabilidade operacional (envio assistido)

- **Novos eventos no servidor:**
  - `PUBLIC_VIEW_LINK_ISSUED` / `PUBLIC_VIEW_LINK_REVOKED` (com `regenerate`, `action`, `expires_at` ou `revoked_tokens` em metadata).
  - `CONTRACT_ACCESS_TOKENS_REVOKED` no cancelamento automático.
- **Novo endpoint:** `POST /api/contracts/:id/operational-audit`  
  Corpo: `{ action_kind, signer_id? }` (enum fechado no backend). Permissão: **`view`** (qualquer utilizador que vê o contrato pode registar ações assistidas).  
  Tipos: cópia/abertura de mensagens (convite, lembrete, view, conclusão), cópia/abertura de URL de assinatura.
- **Painel:** `ContractDetails` chama o endpoint ao abrir modais de texto, ao copiar texto (via ref de auditoria), ao copiar/abrir link de assinatura.

*Não* há motor de e-mail/WhatsApp; apenas trilha e UX assistida.

## 4. Templates e placeholders (Etapas 5–6)

- `buildContractMessagingContext` centraliza saneamento (`sanitizePlainText`, `displayOrFallback`).
- Mensagens continuam em `contractMessagingTemplates.ts`; o painel usa o builder único.
- **Estado “concluído” vs `ACTIVE`:** quando todas as assinaturas existem e o contrato está `ACTIVE`, o texto de contexto usa o rótulo **“Concluído (contrato ativo no sistema)”** para não confundir com “ativo” genérico.

## 5. PDF

- Cabeçalho sequencial mais legível; metadados PDF (`Title`, `Author`, `Subject`).
- `htmlToPlainText` remove `script`/`style`, normaliza entidades comuns e quebras de bloco.
- Corpo com `width` fixo para quebra de linha estável; segunda página para signatários com datas em **UTC**, método, IP, UA e versão de aceite.
- Nota de rodapé sobre natureza do documento (sem aconselhamento jurídico).

## 6. Evidências

- Resposta `GET .../evidence-summary`: `schema_version`, `generated_at`, `summary_lines` (lista legível por signatário).
- UI: resumo em lista + JSON técnico em `<details>`; export JSON inclui os novos campos.

## 7. Bordas e UX

- Convites e link público de leitura **desativados** na UI quando o contrato está `CANCELLED`.
- Tratamento explícito de conflitos (`CONFLICT`) na emissão de links.
- Badge de estado com `contractStatusShortLabel` / `contractStatusHint` (`contractStatusUi.ts`).
- Timeline: ícones para `PUBLIC_VIEW_LINK_*`, `CONTRACT_ACCESS_TOKENS_REVOKED`, `CONTRACT_OPERATIONS_AUDIT`.
- Aviso no modal de link público: emissão/revogação exige **edição**; cancelamento invalida links.

## 8. Riscos remanescentes

- **Migração 113** tem de ser aplicada em cada ambiente; sem ela, apenas o bloqueio em TypeScript na emissão impede novos links para cancelados — a função SQL antiga ainda poderia servir documento até migrar.
- **Auditoria assistida** depende do cliente chamar `operational-audit` (falhas de rede não bloqueiam a operação).
- **Listagem `GET /contracts`** continua sem `assertModulePermission` por linha (comportamento herdado; reduzir risco seria filtrar por responsável no SQL numa evolução futura).

## 9. Limitações conhecidas (MVP)

- Sem envio automático de mensagens.
- Sem pacote ZIP único “PDF + evidências” (export JSON + PDF separados).
- PDF continua a ser representação textual simplificada do HTML congelado.

---

## Checklist final (Etapa 6)

- [x] Tokens públicos endurecidos (cancelado, conflito, revogação em cancelamento)
- [x] Permissões revisadas (view em leituras; edit em mutação de link público; meta convite em view)
- [x] Trilha operacional de envio/reenvio mais robusta (eventos servidor + `operational-audit`)
- [x] Placeholders/templates centralizados e protegidos (`buildContractMessagingContext`)
- [x] PDF refinado e mais estável
- [x] Evidências mais claras (`summary_lines` + UI)
- [x] Bordas principais tratadas (cancelado, conflito, rótulos ACTIVE/concluído)
- [x] UX final mais previsível (badges, modal, timeline)
- [x] Módulo pronto para produção com **riscos documentados** e migração 113 obrigatória

**Recomendação:** apto para produção após aplicar a migration `113_contract_public_view_block_cancelled.sql` e validar permissões de `contracts` (view/edit) nos perfis reais.
