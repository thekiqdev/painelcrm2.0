# Contratos — exclusão e permissões por módulo

## Status reais investigados

Fonte: backend (`contractLifecycle.ts`, `contractsController.ts`) e frontend (`src/types/contracts.ts`).

- `DRAFT`
- `PENDING_SIGNATURE`
- `PARTIALLY_SIGNED`
- `ACTIVE`
- `INACTIVE`
- `EXPIRED`
- `CANCELLED`

## Status que permitem exclusão

Regra implementada:

- `CANCELLED`
- `INACTIVE`

Todos os demais estados continuam bloqueados para exclusão.

## Estratégia adotada: hard delete controlado

### Decisão

Foi mantido **hard delete**, com validação rigorosa no backend, porque:

1. O módulo já operava com `DELETE` definitivo.
2. As relações principais já usam `ON DELETE CASCADE` (signatários, eventos, tokens públicos), evitando lixo órfão.
3. É a mudança de menor risco incremental para produção, sem exigir migrações amplas de `soft delete` + filtros globais em todas as queries.

### Impacto da decisão

- Contrato excluído deixa de existir no tenant.
- Links públicos de visualização e convites de assinatura deixam de resolver (dados removidos por cascade).
- PDF/evidências também deixam de estar acessíveis porque dependem do contrato.

## Validação no backend

Arquivo: `packages/backend/src/controllers/contractsController.ts`

Validações aplicadas antes do `DELETE`:

1. Contrato existe e pertence ao tenant do usuário.
2. Permissão por módulo `contracts.delete` (`assertModulePermission`).
3. Status elegível (`CANCELLED`/`INACTIVE`) via `canDeleteContractStatus`.

Quando status não é elegível:

- HTTP `409`
- `code: CONTRACT_DELETE_STATUS_NOT_ALLOWED`
- retorno com `allowed_statuses` e `current_status`.

## Integração com permissões por módulo

### Backend

- `assertModulePermission(userId, 'contracts', 'delete', ...)` permanece obrigatório.
- Se perfil não tiver permissão de exclusão, API bloqueia (403/erro de permissão), mesmo com chamada direta.

### Frontend

- `ContractDetails.tsx`:
  - ação “Excluir contrato” só aparece quando:
    - usuário pode `delete` no módulo (`canDeleteRecord("contracts", ...)`);
    - contrato está em `CANCELLED` ou `INACTIVE`.
  - confirmação via dialog com status atual.

- `ClientProfile.tsx` (lista de contratos do cliente):
  - opção “Excluir” só aparece com mesma regra de status + permissão.

## Links, assinaturas, timeline e evidências

Com hard delete e cascades:

- **Link público de visualização:** removido junto com `contract_public_view_tokens`.
- **Convites de assinatura:** removidos junto com `contract_signer_signature_invites` (via signatários).
- **Signatários:** removidos.
- **Timeline/eventos/evidências:** removidos com o contrato.
- **PDF:** endpoint passa a retornar não encontrado.

Comportamento é consistente com “exclusão definitiva”.

## Auditoria / histórico

Como a exclusão é hard delete, o histórico do próprio contrato é removido junto (incluindo `contract_events`).

Estado atual:

- não foi introduzida nova trilha de auditoria persistente cross-entidade nesta etapa incremental.

Risco remanescente:

- ausência de histórico pós-exclusão para investigação futura do item removido.

## Multi-tenant

Preservado:

- busca e `DELETE` sempre filtrados por tenant do usuário autenticado.
- impedida exclusão cross-tenant.

## Checklist

- [x] exclusão disponível somente para contratos cancelados ou inativos
- [x] backend bloqueia exclusão fora dos status permitidos
- [x] backend bloqueia exclusão sem permissão
- [x] UI respeita permissões do módulo
- [x] UI respeita status elegíveis
- [x] comportamento de links e evidências ficou consistente
- [x] multi-tenant preservado
- [x] decisão entre soft/hard delete documentada
