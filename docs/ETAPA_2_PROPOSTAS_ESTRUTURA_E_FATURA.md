# Etapa 2 — Propostas: estrutura comercial, itens e conversão em fatura

Este documento descreve o que foi entregue na **Etapa 2** do módulo Propostas / Orçamentos: detalhe comercial, itens com desconto, status `invoiced`, endpoint de conversão, vínculo com `customer_invoices.proposal_id`, bloqueio de duplicidade, permissões da conversão e auditoria mínima.

## Migração

Arquivo: `database/init/119_proposals_etapa2_invoiced_timeline.sql`

- Tabela `proposal_timeline_events` (eventos por `proposal_id`).
- Coluna `proposals.converted_invoice_id` (FK para `customer_invoices`, `ON DELETE SET NULL`).
- CHECK de `proposals.status` estendido com valor **`invoiced`**.
- Índice único parcial: no máximo **uma** fatura com `proposal_id` não nulo por proposta (`uq_customer_invoices_proposal_id`).

**Pré-requisito:** `118_customer_invoices_proposal_id.sql` (coluna `customer_invoices.proposal_id`).

Rodar migrações: `npm run migrate` no backend (ou pipeline equivalente).

## Estrutura comercial no detalhe (`ProposalDetails.tsx`)

- Cabeçalho com título, cliente, badge de status e ações rápidas.
- Abas: **Resumo**, **Itens e valores**, **Faturamento**, **Histórico** (timeline).
- Exibição de **responsável** (`responsible_email` do criador da proposta).
- Ações: **Marcar enviada** (rascunho → enviada + `sent_date`), **Aceitar** / **Recusar** (quando permitido), **Gerar fatura** (proposta aceita, com cliente, ainda não faturada).
- Aceitar / recusar **permanecem na página** e recarregam os dados (fluxo voltado à conversão em fatura).

## Modelagem de itens

- JSON em `proposals.items` com: `description`, `quantity`, `unitPrice`, **`discount`** (BRL, opcional, padrão 0), `total` (recalculado no backend ao criar/atualizar).
- `id` opcional (`number` ou `string`).
- **Total da proposta (`amount`):** se há itens, o backend **soma os subtotais** das linhas (`qtd × unitário − desconto`) e grava em `amount` ao criar/atualizar (coerência com a tabela de itens).

### Conversão para `customer_invoice_items`

| Campo proposta | Campo fatura |
|----------------|---------------|
| `description` | `description` |
| `quantity` | `quantity` |
| `unitPrice` (BRL) | `unit_price_cents` (= `round(unitPrice * 100)`) |
| `discount` (BRL) | `discount_cents` (= `round(discount * 100)`) |
| (derivado) | `total_cents` (regra já existente no serviço de fatura) |

**Fallback:** se não houver linhas válidas (`quantity > 0` e valores), gera **uma linha** com descrição = título da proposta e valor = `amount` total.

**Campos da proposta que não são copiados como colunas separadas nesta etapa:** `funnel_id`, `stage_id`, `sent_date` (ficam só na proposta; a descrição da fatura inclui título + texto comercial).

## Status comerciais (nesta etapa)

Valores válidos no banco após a migração 119:

| Status | Uso |
|--------|-----|
| `draft` | Rascunho |
| `sent` | Enviada |
| `accepted` | Aceita (elegível a **Gerar fatura**) |
| `rejected` | Recusada |
| `expired` | Expirada |
| `invoiced` | Faturada (após conversão bem-sucedida) |

**`viewed`:** não implementado (sem tracking de visualização do cliente nesta etapa); pode ser tratado em etapa futura.

### Regras aplicadas no backend (`PATCH /api/proposals/:id`)

- **`invoiced` ou `converted_invoice_id` preenchido:** nenhuma alteração (409).
- **`accepted` (sem fatura):** não permite alterar `client_id`, `title`, `amount`, `items`, `status`; permite `description`, `valid_until`, `sent_date`, funil/estágio.
- **`rejected` / `expired`:** apenas `description`, `valid_until`, `sent_date` (demais campos comerciais bloqueados).
- Transições de status restritas (ex.: não alterar status de `accepted` pelo PATCH).
- Status **`invoiced`** não é aceito no body do PATCH (quem define é a conversão).

## Geração de fatura

- **Rota:** `POST /api/proposals/:id/convert-to-invoice`
- **Body (JSON):** `due_date` (YYYY-MM-DD), opcionais `payment_method`, `allowed_payment_methods`, `gateway_key` (mesmo padrão de fatura manual).
- **Permissão:** `proposals` **`edit`** com a mesma regra de dono (`ownerId`) já usada no `PATCH` — **não** foi criada permissão nova `convert_to_invoice` nesta etapa (menor risco e alinhamento com “quem pode editar a proposta”).
- **Pré-condições:** proposta no tenant do usuário; `status === 'accepted'`; `client_id` definido; `converted_invoice_id` nulo; não existe `customer_invoices` com o mesmo `proposal_id`.
- **Fluxo interno:** reutiliza `createManualInvoice` (gateway / pré-condições de cliente como na fatura manual). O INSERT em `customer_invoices` passa a incluir **`proposal_id`**.
- **Pós-processo:** `UPDATE proposals SET status = 'invoiced', converted_invoice_id = :invoiceId` e evento de timeline `invoice_created` (com `invoice_id` e `invoice_number`).

### Duplicidade

- **Banco:** índice único `uq_customer_invoices_proposal_id`.
- **Aplicação:** checagem antes do insert + `converted_invoice_id` na proposta.
- **Erro:** HTTP **409** com `code: PROPOSAL_ALREADY_INVOICED` quando aplicável.

### Campos copiados para a fatura (cabeçalho)

- `tenant_id`, `client_id`, `due_date`, `description` composta (`Proposta: {título}` + descrição comercial), itens como acima, `proposal_id`.
- Comportamento de gateway / `charge_id` / URLs de pagamento: igual ao de fatura manual existente.

## Auditoria / timeline

Tabela `proposal_timeline_events`:

- `proposal_accepted` / `proposal_rejected` ao mudar status via PATCH (quando a tabela existe).
- `invoice_created` ao concluir a conversão (inclui IDs da fatura).

Se a migração da timeline ainda não existir no ambiente, o GET da proposta ignora erro de tabela ausente (`42P01`) para não derrubar a listagem.

## Riscos remanescentes

- **Transação única:** conversão não está em uma transação única com `createManualInvoice`; se o `UPDATE` da proposta falhar após criar a fatura, pode ser necessário reconciliar manualmente (caso raro; há log no backend).
- **Arredondamento:** valores em BRL na proposta viram centavos na fatura (`Math.round`); diferenças de 1 centavo em cenários extremos são possíveis.
- **Dependência do fluxo de billing:** cliente sem CPF/CNPJ segue o ramo sem gateway já existente em `createManualInvoice`; com gateway ativo, valem as mesmas falhas de pré-condição que na UI de faturas.
- **`viewed` e permissão dedicada `convert_to_invoice`:** deixados para evolução.

## Checklist de aceite (Etapa 2)

- [x] Proposta exibe estrutura comercial mais completa (abas, responsável, faturamento, histórico).
- [x] Proposta possui itens/valores consistentes (desconto por linha, total alinhado ao backend).
- [x] Status comerciais mínimos aplicados (`invoiced` + regras de PATCH).
- [x] Botão “Gerar fatura” para proposta elegível (aceita, com cliente, não convertida).
- [x] Backend converte proposta em fatura com vínculo `proposal_id` e atualiza `converted_invoice_id`.
- [x] Cliente e itens são copiados de forma controlada (tabela de mapeamento acima + fallback).
- [x] Duplicidade de conversão bloqueada (índice único + validações + 409).
- [x] Conversão exige `proposals.edit` (mesma trava de dono que edição).
- [x] Base pronta para Etapa 3 (link público / aceite refinado), com rastreio proposta ↔ fatura.
