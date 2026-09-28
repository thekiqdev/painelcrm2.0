# Contratos — Pronto para produção (resumo operacional)

## Resumo executivo

O módulo de contratos do PainelCRM cobre o ciclo: **rascunho → snapshot/travas → visualização pública (só leitura) → convites de assinatura pública → PDF e evidências**, com **auditoria assistida** e **endurecimento** na Etapa 6 (tokens, permissões, cancelamento, conflitos).

## Fluxo final (ponta a ponta)

1. Criar/editar contrato em **DRAFT**; incluir signatários.
2. Enviar para assinatura / ativar conforme política do produto → documento **congelado** (`content_snapshot_html`).
3. **Link só leitura** (opcional): menu Ações → requer permissão **edição**; não assina.
4. Por signatário: **Gerar e copiar** convite (primeira emissão), **Copiar link** / **Lembrete** (mesmo token ativo), **Regenerar**, **Revogar**.
5. Signatário assina na página pública; estado do contrato evolui conforme regras existentes.
6. **PDF** (snapshot) e **evidências** (JSON + resumo no painel) para arquivo operacional.
7. **Cancelamento** do contrato: revoga automaticamente links públicos e convites pendentes.

## O que já está pronto

- Multi-tenant e RLS nas tabelas de tokens.
- Separação estrita: token de **view** ≠ token de **assinatura**.
- Índices únicos parciais: um link de visualização ativo por contrato; um convite ativo por signatário.
- Eventos de servidor para emissão/revogação de convites e links públicos.
- Endpoint de auditoria assistida (`POST .../operational-audit`) e integração na ficha do contrato.

## Limitações conhecidas

- Envio de mensagens é **manual** (copiar/colar ou canais externos).
- Trilha “assistida” depende do browser chamar a API de auditoria (falhas não impedem a operação).
- PDF é derivação textual estável do HTML congelado, não ficheiro Word idêntico.

## Como operar convites

- Na ficha do contrato → **Assinaturas**.
- **Emitir** = «Gerar e copiar» sem convite ativo.
- **Reenviar** = mesmo URL ativo; use «Lembrete» ou «Copiar link» (e trilha assistida).
- **Regenerar** = invalida o anterior.
- **Revogar** = convite inutilizável.

Requer permissão **edição** para criar/regenerar/revogar convites.

## Como operar assinatura

- Partilhe o URL `/contract-sign/:token` apenas com o signatário correspondente.
- O signatário confirma o nome e aceita os termos na página pública.

## Como consultar evidências

- Ficha do contrato → **Ações** → «Ver resumo de evidências» ou botão no banner pós-assinatura.
- Lista resumida + JSON técnico (expansível) + exportação `.json`.

## Como gerar PDF

- Com snapshot válido: **Ações** → «Baixar PDF (snapshot)» ou no banner quando concluído.

## Cuidados operacionais

- Aplicar em produção a migration **`113_contract_public_view_block_cancelled.sql`**.
- Garantir que perfis com operação de links tenham **`contracts:edit`**; utilizadores só de leitura mantêm **`contracts:view`** e podem ver meta de convite e registar auditoria assistida.
- Após **cancelar** contrato, informar partes de que links antigos deixam de funcionar.

## Próximos passos recomendados (evolução)

- Integração com provedor de e-mail / WhatsApp com templates editáveis no painel.
- Pacote único de exportação (ZIP: PDF + JSON).
- Rate limiting explícito nas rotas públicas de assinatura/visualização.

---

## Checklist de habilitação em produção

- [ ] Migration 113 aplicada na base de dados
- [ ] Variáveis de expiração de tokens revistas (`CONTRACT_PUBLIC_VIEW_TOKEN_EXPIRY_DAYS`, `CONTRACT_SIGNATURE_INVITE_EXPIRY_DAYS`)
- [ ] Perfis de utilizador com `contracts:view` e `contracts:edit` alinhados à operação real
- [ ] Teste manual: emitir → assinar → PDF → evidências
- [ ] Teste manual: cancelar contrato e confirmar que link público deixa de abrir

## Checklist de testes manuais (rápido)

- [ ] Contrato cancelado: não emite novo link de visualização; link antigo não mostra documento (pós-113)
- [ ] Regenerar link de visualização com utilizador só `view` → deve falhar (403)
- [ ] Utilizador só `view`: consegue ver meta de convite e signatários, não emite convite
- [ ] Dois cliques rápidos em «Regenerar» convite → eventual `409 CONFLICT` sem 500
- [ ] Copiar link de assinatura gera evento `CONTRACT_OPERATIONS_AUDIT` na timeline
- [ ] Evidências: lista resumida visível; JSON em detalhes
