# UX — Faturas: nomenclatura, resumo e filtros por card

## Nomenclatura

- No painel, o módulo passou a ser exibido como **“Faturas”** (antes “Faturas de clientes”).
- Alteração apenas em **textos de UI** (menu lateral, título da listagem).
- **Não** mudam: rota `/customer-invoices`, endpoints existentes (`GET /api/customer-invoices`, etc.), nomes de tabelas ou serviços no sentido de contratos de API.

## Cards de resumo (`/customer-invoices`)

Quatro cards no topo da página, **acima** da tabela:

| Card      | Métricas                         | Clique                                      |
|-----------|----------------------------------|---------------------------------------------|
| **Pagas** | quantidade + soma em R$        | Filtra listagem por status **pago**         |
| **Pendentes** | quantidade + soma em R$    | Filtra por **pendente** e **aguardando pagamento** |
| **Vencidas** | quantidade + soma em R$   | Filtra por **vencido**                      |
| **Total** | quantidade geral + soma geral | **Remove** o filtro de status (todas)     |

- O **card ativo** usa destaque visual (`ring` + fundo suave) alinhado ao tema CRM.
- Não há mais bloco “Filtros” com select de status: o filtro por status é só pelos **cards** (e pelo parâmetro de API quando aplicável).

## Paginação

- A listagem usa **até 20 faturas por página** (`limit` / `offset` no `GET /api/customer-invoices`).
- Barra sob a tabela: **Início**, **Anterior**, **Próxima**, texto com número da página e intervalo de linhas (ex.: “Página 2 · 21–40”).
- **Próxima** fica desabilitada quando a página retorna menos de 20 itens (última página). **Anterior** / **Início** quando `offset` é 0.

## Origem dos dados

- Novo endpoint: **`GET /api/customer-invoices/summary`** (autenticação e tenant iguais às demais rotas de faturas).
- Resposta JSON com totais **do tenant inteiro**, não só da página corrente da listagem:
  - `paid_count`, `paid_amount_cents`
  - `pending_count`, `pending_amount_cents` (status `pending` + `waiting_payment`)
  - `overdue_count`, `overdue_amount_cents`
  - `total_count`, `total_amount_cents`
- Na base, os valores somam apenas faturas com **`invoice_type` distinto de `child`**, para não duplicar montantes de faturas filhas (E2). A **listagem** (`GET /api/customer-invoices`) não foi alterada nesse critério; pode existir pequena diferença de contagem entre card e linhas visíveis se houver filhas na página.

## Listagem com vários status (pendentes)

- O filtro “Pendentes” dos cards usa o parâmetro de query **`status_in=pending,waiting_payment`** no `GET /api/customer-invoices`.
- O backend aceita `status_in` (lista) **ou** `status` (valor único); `status_in` tem precedência.

## Comportamento esperado

1. Abrir **Faturas**: cards carregam resumo global; tabela paginada (20 por página).
2. Clicar em **Pagas** / **Pendentes** / **Vencidas**: aplica o filtro correspondente e destaca o card (volta à página 1).
3. Clicar em **Total**: limpa filtro de status.
4. Após **cancelar** ou **excluir** fatura, o resumo é atualizado de novo.

## Critérios de aceite (checklist)

- [x] Texto “Faturas de clientes” substituído por “Faturas” onde aplicável na UI.
- [x] `/customer-invoices` exibe cards com quantidade e valor (R$).
- [x] Dados dos cards vêm do tenant via `GET /api/customer-invoices/summary`.
- [x] Clique no card aplica o filtro na listagem; card ativo destacado.
- [x] “Total” limpa o filtro de status.
- [x] Listagem paginada (máx. 20 por página); sem seção “Filtros” duplicando os cards.
- [x] Rotas e APIs anteriores preservadas; novo endpoint aditivo.
- [x] Build do projeto validado após as alterações.
