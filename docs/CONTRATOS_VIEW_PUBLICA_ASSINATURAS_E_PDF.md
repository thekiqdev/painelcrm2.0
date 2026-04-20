# Contratos — visualização pública: assinaturas e PDF

Implementação incremental sobre o link público **somente leitura** (`/contract-view/:token`). Não altera o fluxo de assinatura por convite nem o snapshot como fonte da verdade.

## Como ficou a view pública

- **Cabeçalho:** título, número, tenant, estado do contrato (badge), botão **Baixar contrato (PDF)**.
- **Alerta:** texto único e profissional (sem “funcionalidade indisponível”): explica visualização read-only, que assinaturas concluídas aparecem no fim e que a assinatura usa **outro** link.
- **Documento:** HTML do mesmo snapshot usado hoje (`COALESCE(snapshot, content_html)` na função SQL), apresentado em área tipo folha A4 (`ContractA4Document`).
- **Secção “Assinaturas do contrato”:** por signatário — nome, e-mail, estado (Assinado / Pendente), data/hora quando assinado, imagem PNG da assinatura manuscrita quando existir em `signature_data.signature_image_png_base64` (tamanho limitado na API).

## Dados de assinatura expostos na API pública

`GET /api/public/contracts/view/:token` passa a incluir `signers[]`:

| Campo | Descrição |
|--------|-----------|
| `name` | Nome do signatário |
| `email` | E-mail (identificação usual em contratos) |
| `signed` | Se já assinou |
| `signed_at` | ISO 8601 ou `null` |
| `signature_image_png_base64` | Só o PNG em base64, quando existir e abaixo do limite (~520k caracteres); **não** são enviados IP, user-agent, versão de termos nem outros metadados de evidência |

## PDF público

- **Rota:** `GET /api/public/contracts/view/:token/pdf`
- **Regras:** o mesmo critério de elegibilidade do JSON (`resolveContractIdForPublicViewToken` / `get_contract_public_view_by_token_hash`): token válido, não revogado, não expirado, contrato não cancelado.
- **Conteúdo:** `buildContractPdfBufferForPublicView` reutiliza `buildPdfBufferFromContractSnapshot` — o **mesmo** snapshot e a **mesma** lógica de corpo + signatários que o PDF autenticado (`contractPdfService`), sem duplicar layout divergente.

## Texto que substituiu a mensagem antiga

Removido do rodapé: *“Assinatura eletrônica por este link não está disponível nesta versão.”*

Substituído pelo `disclaimer` no JSON (e exibido no alerta da página), com orientação clara: link de **visualização** read-only; assinaturas já feitas visíveis ao final; assinatura por **outro** fluxo/link.

## Migração SQL

`117_contract_public_view_contract_id.sql` acrescenta `contract_id` ao retorno de `get_contract_public_view_by_token_hash`, necessário para carregar signatários e PDF sem segunda heurística. **É preciso correr as migrações** para o payload completo e o PDF público funcionarem com a nova assinatura da função.

## Riscos remanescentes

- Ambiente sem migração 117: falha ao pedir colunas da função atualizada até `npm run migrate` (ou equivalente).
- Assinaturas com imagem extremamente grande podem omitir o preview na API pública (limite de tamanho da string base64).

## Limitações

- A view pública não mostra método, IP, UA nem versão de termos (propositadamente).
- PDF público continua a incluir no anexo de signatários os campos de evidência que o PDF do painel já incluía (IP/UA etc.) na **segunda página** — comportamento alinhado ao PDF interno; a **página web** pública permanece minimalista.

---

## Checklist

- [x] Assinatura aparece na visualização pública após conclusão (imagem + data quando disponíveis)
- [x] Nome e data/hora na view pública
- [x] Botão de baixar PDF na view pública
- [x] Mensagem “Assinatura eletrônica por este link não está disponível nesta versão” removida
- [x] Página claramente somente leitura, sem CTA de assinatura
