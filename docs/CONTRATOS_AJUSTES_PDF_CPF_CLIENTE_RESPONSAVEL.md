# Contratos — ajustes de PDF, CPF, cliente e responsável

## Resumo dos ajustes aplicados

Pacote incremental aplicado sem mudar a arquitetura principal de:

- snapshot do contrato
- assinatura pública por signatário
- PDF baseado em snapshot
- links públicos
- evidências mínimas

## 1) Limpeza do PDF (remoção de textos técnicos)

Arquivo: `packages/backend/src/services/contractPdfService.ts`

Foram removidos do PDF final:

- `Estado interno: ...`
- `PDF gerado (UTC): ...`
- `Documento congelado (UTC): ...`
- `Texto do contrato (conteúdo congelado)`
- `Estrutura abaixo segue headings, parágrafos e listas do documento original`
- disclaimer técnico final (`snapshot armazenado / aconselhamento jurídico`)

Resultado: o PDF fica com aparência de documento contratual, sem texto interno de sistema.

## 2) Máscara de CPF na inclusão de signatário

Arquivo: `src/pages/NewContract.tsx`

- Campo de documento do signatário passa a aplicar máscara de exibição em tempo real (`formatBrazilTaxIdDisplay`).
- Na persistência, continua normalizando para dígitos (`normalizeBrazilTaxIdInput`) antes de enviar ao backend.

Assim, UX melhora (máscara), sem enfraquecer validação real (backend mantém validação).

## 3) CPF na assinatura/documento e no PDF

### No documento (A4 / área de signatários)

Arquivos:

- `src/components/contracts/ContractA4Document.tsx`
- `src/pages/ContractDetails.tsx`
- `src/pages/PublicContractView.tsx`
- `packages/backend/src/services/contractPublicViewService.ts`
- `packages/backend/src/controllers/publicContractViewController.ts`

A seção de signatários passou a exibir também `CPF/CNPJ` (com máscara), quando disponível.

### No PDF final

Arquivo: `packages/backend/src/services/contractPdfService.ts`

- Query de signatários passou a carregar `tax_id`.
- Seção final imprime `CPF/CNPJ: ...` por signatário, com máscara.
- Se não houver documento, segue fallback seguro (campo não exibido).

## 4) Ações rápidas — incluir “Baixar PDF”

Arquivo: `src/pages/Contracts.tsx`

- Adicionada ação `Baixar PDF` no menu de ações da listagem.
- Reutiliza o fluxo atual (`contractsService.downloadContractPdf`), sem criar endpoint novo.
- A ação só aparece quando há `content_snapshot_html` disponível.

## 5) Correção de colunas Cliente e Responsável

Arquivos:

- `packages/backend/src/controllers/contractsController.ts`
- `src/pages/Contracts.tsx`
- `src/types/contracts.ts`

### Causa raiz

A listagem de contratos:

1. no backend trazia apenas `c.*` (sem joins para cliente e responsável),
2. no frontend renderizava placeholders fixos `-` nas colunas Cliente/Responsável.

### Correção

- Backend passou a fazer join com `clients`, `users` e `profiles` para compor:
  - `client_name`
  - `responsible_display_name` (nome; fallback e-mail)
  - `creator_display_name` (fallback útil para contratos antigos sem responsável)
- Frontend passou a renderizar esses campos nas colunas.

## 6) Selecionar outro responsável no contrato

Arquivo: `src/pages/NewContract.tsx`

- Adicionado campo “Responsável pelo contrato” no formulário (criar/editar).
- Opções carregadas de `/api/me/tenant/users` (`getMyTenantUsers`).
- Persistência mantém `responsible_id` separado de criador (`user_id`).
- Fallback para contratos antigos sem responsável:
  - listagem usa `creator_display_name` quando `responsible_display_name` está vazio.

## 7) Merge fields de cliente/responsável

Não houve quebra de placeholders existentes.
Com a seleção correta de `responsible_id` e exibição correta de `client_id`, os contextos já existentes de merge (`client.*`, `operator.*`) ficam mais consistentes com os dados reais do contrato.

## Riscos remanescentes

1. Contratos antigos sem `client_id`/`responsible_id` continuam a depender de fallback visual.
2. Campo de documento mantém suporte legado CPF/CNPJ; se quiser restringir estritamente a CPF no futuro, precisa regra dedicada.
3. Ação “Baixar PDF” na listagem depende de snapshot; contratos sem snapshot continuam sem opção (comportamento esperado).

## Checklist

- [x] textos internos/técnicos removidos do PDF
- [x] PDF final mais limpo/profissional
- [x] CPF do signatário com máscara na inclusão
- [x] CPF do signatário aparece no documento/PDF
- [x] ação rápida de baixar PDF adicionada
- [x] coluna Cliente mostra o cliente correto
- [x] coluna Responsável mostra o responsável (com fallback)
- [x] criador pode selecionar outro responsável
- [x] compatibilidade com contratos existentes preservada
