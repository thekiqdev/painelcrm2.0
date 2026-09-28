# Contratos — link público de visualização automático na criação

## Nova regra de produto

- O **link público de visualização** (somente leitura, separado dos convites de assinatura) passa a ser **provisionado automaticamente** no **POST de criação** do contrato.
- Não é mais necessário um fluxo principal de «gerar link» para o contrato **nascer** com URL: o token ativo é criado na mesma transação do `INSERT` em `contracts`.
- A página pública **pode exibir rascunho** (antes bloqueado no SQL): o cancelamento continua **sem acesso** por token.

## Momento da criação do token

1. **Transação** em `createContract` (`contractsController.ts`): após `INSERT INTO contracts`, chama-se `insertActivePublicViewTokenRow` em `contract_public_view_tokens`.
2. Registo de evento `PUBLIC_VIEW_LINK_ISSUED` com `metadata.auto_provision: true`.
3. Resposta **201** inclui `public_view`: `token`, `frontend_path`, `public_view_url` (se `FRONTEND_URL` estiver definido), `created_at`, `expires_at`.

## Resposta do create (automação / Kanban / chat)

O corpo do POST `/api/contracts` passa a incluir opcionalmente:

```json
{
  "...campos do contrato...",
  "public_view": {
    "token": "<raw>",
    "frontend_path": "/contract-view/<raw>",
    "public_view_url": "https://app.exemplo.com/contract-view/<raw>",
    "created_at": "...",
    "expires_at": null
  }
}
```

Programas (Kanban, chat, jobs) podem usar **imediatamente** `public_view_url` ou montar a URL com `FRONTEND_URL` + `frontend_path`.

## GET bootstrap (painel autenticado)

- **Rota:** `GET /api/contracts/:id/public-view-link/bootstrap`
- **Permissão:** mesmo nível que meta (`contracts` + `view`).
- **Comportamento:** lê o token ativo; **desencripta** `token_ciphertext` (AES-256-GCM) e devolve `token` + URLs para **Copiar / Abrir** sem exigir «gerar» manualmente.
- **Não recria** token após revogação (evita anular uma revogação intencional ao abrir o detalhe).

### Cifra no banco

- Coluna nova: `contract_public_view_tokens.token_ciphertext` (migration `114_contract_public_view_auto_provision.sql`).
- Chave: `CONTRACT_PUBLIC_VIEW_TOKEN_ENCRYPTION_KEY` ou derivação de `JWT_SECRET` (ver `env.example`).
- **Contratos antigos** sem ciphertext: `legacy_token_not_retrievable: true` — o URL antigo continua válido até **regenerar** uma vez pelo painel (grava ciphertext e novo token).

## UI (aba Links)

- Linguagem: **«Link público disponível»**, **Copiar link**, **Abrir link**.
- **Opções avançadas:** «Regenerar e copiar» (invalida URL anterior) ou «Criar link e copiar» quando não há token ativo (ex.: após revogar ou contrato legado sem linha).
- **Revogar link** inalterado em intenção.
- Navegação pós-criação pode enviar `state.publicView.token` para hidratar a sessão antes do primeiro GET bootstrap.

## SQL público (`get_contract_public_view_by_token_hash`)

- Removido filtro `DRAFT` — rascunho pode ser aberto com o token (conteúdo ainda vazio mostra «Sem conteúdo» no front público).
- Mantido bloqueio para `CANCELLED`.

## Compatibilidade revogação / regeneração

- **Revogar:** `UPDATE ... revoked_at = now()` — sem linha ativa; bootstrap devolve `has_active_link: false`.
- **Regenerar:** `issuePublicViewToken` com transação em **uma** conexão (corrige risco de BEGIN/COMMIT em conexões diferentes); insere novo hash + ciphertext.

## Riscos remanescentes

- Rotação de `JWT_SECRET` sem definir `CONTRACT_PUBLIC_VIEW_TOKEN_ENCRYPTION_KEY` pode impedir desencriptação de tokens existentes — definir chave dedicada em produção.
- Regenerar invalida bookmarks do URL anterior (comportamento desejado).

## Checklist

- [x] Link público criado automaticamente no create do contrato
- [x] Contrato nasce com token persistido; resposta inclui bootstrap
- [x] UI não depende de «gerar» como passo principal
- [x] Detalhe: copiar/abrir via GET bootstrap + ciphertext
- [x] Revogar / regenerar preservados
- [x] Assinatura pública permanece em fluxo e tabelas separadas
- [x] Base pronta para automação (payload `public_view` no create)
