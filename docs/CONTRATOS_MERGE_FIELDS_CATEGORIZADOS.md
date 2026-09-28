# Contratos — merge fields categorizados

## Arquitetura

- **Catálogo (metadados + UI):** `packages/backend/src/utils/contractMergeFieldCatalog.ts`  
  - Lista categorias, chaves canónicas, rótulos, descrições e origem dos dados.  
  - Exposto ao frontend via `GET /api/contracts/merge-field-catalog` (autenticado, tenant CRM).

- **Resolução (valores):** `packages/backend/src/utils/contractMergeFields.ts`  
  - `buildContractMergeContext(input)` monta o mapa chave → string.  
  - `applyContractMergeFieldsToHtml(html, input)` usa `renderMessageTemplate` (placeholders `{{chave}}`; chaves desconhecidas permanecem literais).

- **Carga de dados relacionados:** `packages/backend/src/services/contractMergeContextLoader.ts`  
  - `loadContractMergeEnrichment(contractId, db)` obtém tenant (via criador do contrato), cliente (`client_id`), operador (`responsible_id` + `profiles`), primeiro signatário (`signing_order` NULLS LAST, depois `created_at`).

- **Pontos de uso (congelamento / re-merge):**  
  - `packages/backend/src/controllers/contractsController.ts` — ao passar de rascunho para estado que congela o documento.  
  - `packages/backend/src/services/contractSnapshotMergeService.ts` — re-merge na ativação após assinaturas (vigência automática).

- **Frontend:**  
  - `src/utils/contractMergeFields.ts` — mesma lógica de resolução para **pré-visualização** (dados de exemplo); manter alinhado ao backend.  
  - `src/components/contracts/ContractMergeFieldsPanel.tsx` — lista agrupada + inserir placeholder.  
  - `src/services/contracts.ts` — `getContractMergeFieldCatalog()`.

## Categorias

| ID | Título |
|----|--------|
| `system` | Sistema / tenant / data atual |
| `contract` | Dados do contrato |
| `client` | Cliente CRM (`clients`) |
| `operator` | Responsável (`responsible_id` → `users` + `profiles`) |
| `signer` | Primeiro signatário apenas (ver limitações) |

## Placeholders canónicos suportados

### Sistema

| Placeholder | Origem |
|-------------|--------|
| `{{system.name}}` | `APP_PUBLIC_NAME` ou padrão `PainelCRM` |
| `{{system.url}}` | `FRONTEND_URL` |
| `{{system.date}}` | Data UTC atual (AAAA-MM-DD) |
| `{{system.date_formatted}}` | dd/mm/aaaa (UTC) |
| `{{system.year}}` | Ano UTC |
| `{{system.month}}` | Mês 01–12 UTC |
| `{{system.month_name}}` | Nome do mês pt-BR UTC |
| `{{system.tenant_name}}` | `tenants.name` |
| `{{system.tenant_domain}}` | `tenants.domain` |
| `{{system.tenant_slug}}` | `tenants.slug` |

### Contrato

| Placeholder | Origem |
|-------------|--------|
| `{{contract.title}}` | `contracts.title` |
| `{{contract.number}}` | `contracts.contract_number` |
| `{{contract.status}}` | `contracts.status` |
| `{{contract.status_label}}` | Mapa PT no código |
| `{{contract.created_at}}` | ISO |
| `{{contract.created_at_formatted}}` | pt-BR data/hora (servidor) |
| `{{contract.updated_at}}` | ISO |
| `{{contract.updated_at_formatted}}` | pt-BR data/hora (servidor) |
| `{{contract.start_date}}` | `contracts.start_date` (dd/mm/aaaa) |
| `{{contract.end_date}}` | `contracts.end_date` (dd/mm/aaaa) |
| `{{contract.value}}` | `total_value` numérico |
| `{{contract.value_formatted}}` | Moeda pt-BR |

### Cliente (tabela `clients`)

Campos reais disponíveis: `name`, `email`, `phone`, `company`, `cpf_cnpj`, `status`, `source`, `funnel_stage`, `notes`. **Não há** endereço, cidade, CEP ou país estruturados na base atual.

| Placeholder | Origem |
|-------------|--------|
| `{{client.name}}` | `clients.name` |
| `{{client.company}}` | `clients.company` |
| `{{client.email}}` | `clients.email` |
| `{{client.phone}}` | `clients.phone` |
| `{{client.whatsapp}}` | Igual a `phone` (sem coluna dedicada) |
| `{{client.document}}` | `clients.cpf_cnpj` |
| `{{client.status}}` | `clients.status` |
| `{{client.source}}` | `clients.source` |
| `{{client.funnel_stage}}` | `clients.funnel_stage` |
| `{{client.notes}}` | `clients.notes` |

### Operador / responsável

| Placeholder | Origem |
|-------------|--------|
| `{{operator.name}}` | `profiles.first_name` + `last_name`, senão `users.email` |
| `{{operator.email}}` | `users.email` |
| `{{operator.phone}}` | `profiles.whatsapp_number` ou `users.whatsapp_number` |
| `{{operator.company}}` | `profiles.company_name` |

**Não disponível:** cargo, departamento ou assinatura institucional dedicada no modelo de dados atual.

### Signatário (primeiro)

| Placeholder | Origem |
|-------------|--------|
| `{{signer.name}}` | Primeiro registo em `contract_signers` (ordem acima) |
| `{{signer.status}}` | `signed` ou `pending` |
| `{{signer.status_label}}` | Assinado / Pendente |
| `{{signer.signed_at}}` | ISO ou vazio |
| `{{signer.signed_at_formatted}}` | pt-BR ou vazio |

## Variáveis personalizadas

Chaves **sem ponto** em `contracts.variables` (schema do modelo) substituem placeholders com o mesmo nome. São aplicadas **depois** dos aliases legados, portanto **prevalecem** sobre estes se o nome coincidir.

## Aliases legados

Definidos em `CONTRACT_MERGE_LEGACY_ALIASES` (backend) e espelhados no frontend. Exemplos:

| Alias | Canónico |
|-------|----------|
| `contract.startDate` | `contract.start_date` |
| `contract.endDate` | `contract.end_date` |
| `company.name` | `client.company` (empresa do **cliente**) |
| `nome_cliente`, `cliente_nome` | `client.name` |
| `email_cliente`, `cliente_email` | `client.email` |
| `cpf`, `cnpj`, `cpf_cnpj` | `client.document` |
| `contract_title` | `contract.title` |
| `contract_num`, `contract_number` | `contract.number` |

Aliases **não** sobrepõem chaves já preenchidas por variáveis personalizadas (mapa antes do merge de `variables`).

## Fallbacks

- Campo ausente ou NULL → string vazia `''` no contexto (placeholder substituído por vazio).
- Chave totalmente desconhecida para `renderMessageTemplate` → texto `{{...}}` mantido (comportamento histórico).
- Snapshot continua a ser a fonte da verdade após o congelamento; o merge corre **no momento do congelamento** (e no re-merge da ativação quando aplicável).

## Limitações e riscos

1. **`{{signer.*}}`:** apenas o **primeiro** signatário da ordenação; com vários signatários o texto não distingue os restantes — usar variáveis personalizadas ou texto fixo para outros.
2. **`{{company.name}}`:** refere-se à empresa do **cliente**, não ao tenant.
3. **`{{client.whatsapp}}`:** duplica `phone`; não há validação de WhatsApp separada.
4. **Endereço do cliente:** não existe no schema atual — não há `{{client.address}}`, cidade, etc.
5. **Fuso horário:** `system.*` usa UTC; `created_at_formatted` / `updated_at_formatted` usam o fuso do servidor Node.
6. **Pré-visualização no browser:** usa dados fictícios; valores reais apenas após congelamento no backend.

## Compatibilidade

- Placeholders `contract.*` e chaves planas em `variables` mantêm comportamento anterior.
- Novos namespaces (`system.*`, `client.*`, `operator.*`, `signer.*`) são aditivos.
- Modelos que já usam `{{contract.startDate}}` ou `{{nome_cliente}}` continuam resolvidos via aliases.

## Checklist de entrega

- [x] Merge fields organizados por categoria
- [x] Campos do sistema incluídos
- [x] Campos do contrato incluídos
- [x] Campos do cliente incluídos (conforme modelo real)
- [x] Campos do operador incluídos (conforme modelo real)
- [x] UI do editor/modelos mostra lista organizada (`ContractMergeFieldsPanel` + API)
- [x] Placeholders antigos compatíveis (aliases + ordem com `variables`)
- [x] Resolução centralizada no backend (`contractMergeFields` + loader)
