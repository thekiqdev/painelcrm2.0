# Contratos — UX A4, modelos em página dedicada, vigência e valor

Documento de implementação do pacote incremental (sem alterar a arquitetura de snapshot, assinatura pública, link de visualização, PDF a partir do snapshot nem e-sign).

## Página pública de assinatura

- Ficheiro: `src/pages/PublicContractSign.tsx`
- **Bloco 1 — Cabeçalho:** título, número do contrato, tenant, signatário e estado discreto (“Pendente de assinatura”).
- **Bloco 2 — Documento:** o HTML congelado é renderizado dentro de `ContractA4Document` (folha com largura ~210 mm, altura mínima ~297 mm, sombra suave, margens tipo impressão, tipografia serifada). O fundo cinza e o “quadro” externo substituem a antiga caixa com `max-h` e scroll interno; o scroll passa a ser o da página.
- **Bloco 3 — Ação:** cartão separado com nome, pad de assinatura, checkbox e botão (sem formulário dentro da folha).

Componente reutilizável: `src/components/contracts/ContractA4Document.tsx` (sanitização HTML incluída).

## Modelos — páginas exclusivas

- Lista: `src/pages/ContractTemplates.tsx` (sem diálogo de edição; apenas navegação).
- Formulário completo: `src/pages/ContractTemplateFormPage.tsx`
  - Rotas: `/contracts/templates/new` e `/contracts/templates/:templateId/edit` (registadas em `src/App.tsx`).
  - Layout em duas colunas (formulário + **preview A4** com dados de exemplo e destaque de placeholders não resolvidos).
- API GET um modelo: `GET /api/contract-templates/:id` — `packages/backend/src/controllers/contractTemplatesController.ts` + `contractTemplatesRoutes.ts`.

## Novos campos no modelo (`contract_templates`)

Migração: `database/init/116_contract_templates_value_tenancy.sql`

| Campo | Descrição |
|--------|-----------|
| `default_title` | Título sugerido ao criar contrato a partir do modelo |
| `default_total_value` | Valor monetário sugerido |
| `default_currency` | Moeda ISO (default `BRL`) |
| `tenancy_rules` | JSON com regras de vigência (ver abaixo) |

No contrato (`contracts`):

| Campo | Descrição |
|--------|-----------|
| `tenancy_rules` | **Cópia** das regras do modelo no momento da criação (o modelo deixa de influenciar este contrato) |

## Regra de vigência automática

Estrutura em `tenancy_rules` (modelo e cópia no contrato):

- `date_base_type`: `creation_date` | `signature_date`
- `start_rule_type`: `same_day` | `plus_days`
- `start_offset_days`: inteiro ≥ 0 (usado quando `start_rule_type` é `plus_days`)
- `duration_days`: inteiro ≥ 1 (duração em dias a partir da **data de início** calculada)

Lógica backend: `packages/backend/src/services/contractTenancyService.ts`

- **Base = criação:** ao criar o contrato (`createContract`), se **nenhuma** data (`start_date` / `end_date`) vier no pedido, calculam-se e persistem-se início e fim.
- **Base = assinatura:** as datas **não** são preenchidas na criação; quando o último signatário conclui e o status passa a `ACTIVE`, `applySignatureTenancyOnActivationInTx` em `contractSnapshotMergeService.ts`:
  - só preenche datas se **ambas** estiverem vazias (respeita datas manuais);
  - calcula início/fim com âncora no instante da conclusão;
  - **reexecuta o merge** no `content_snapshot_html` para materializar `{{contract.start_date}}`, `{{contract.end_date}}`, etc.

### Prioridade: manual vs automático

1. Se, **na criação**, o cliente enviar `start_date` ou `end_date`, **não** se aplica o cálculo por `creation_date` (qualquer uma das datas preenchidas impede o auto na criação).
2. Na **ativação** por assinatura, só se aplicam datas automáticas se **ambas** `start_date` e `end_date` forem nulas.
3. O modelo **não** volta a alterar contratos já criados; só a cópia em `contracts.tenancy_rules` é relevante.

## Valor do contrato e merge fields

- Modelo: `default_total_value` + `default_currency`.
- Contrato: `total_value` + `currency` (editáveis até o congelamento).
- Na criação a partir de modelo: se `total_value` não for enviado, usa-se o default do modelo (ver `createContract`).

Merge de placeholders (frontend e backend): `{{contract.value}}`, `{{contract.value_formatted}}`, `{{contract.title}}`, `{{contract.start_date}}`, `{{contract.end_date}}` — regex atualizada para chaves com ponto em `renderMessageTemplate` (app e backend).

Congelamento: `packages/backend/src/controllers/contractsController.ts` grava em `content_snapshot_html` o HTML já com merge aplicado (`applyContractMergeFieldsToHtml`).

## Persistência no contrato real

- Título, HTML, valor e moeda: como já existia, mais herança do modelo na criação.
- `tenancy_rules`: copiados na `INSERT` do contrato.
- Datas: calculadas na criação (base criação) ou na ativação (base assinatura), conforme regras e prioridade manual.
- Snapshot após última assinatura: atualizado com merge final quando aplicável.

## Riscos remanescentes

- Duração interpretada como “início + N dias” em calendário UTC; contratos muito sensíveis a fuso podem exigir política explícita de timezone.
- Re-merge do snapshot na ativação altera o HTML armazenado apenas substituindo placeholders; o texto jurídico base permanece o do congelamento inicial.

## Limitações

- Ordem de assinatura e âncora “data de assinatura” usam o momento em que o contrato fica **ACTIVE** (última assinatura), não a primeira.
- Não há UI dedicada no detalhe do contrato para “rever” regras copiadas além dos campos de data/valor já existentes.

---

## Checklist de aceite

- [x] Contrato público de assinatura exibe o documento em padrão A4
- [x] Documento não fica mais preso numa caixa pequena com scroll interno agressivo
- [x] Modelo é criado/editado em página exclusiva
- [x] Modelo suporta título (padrão), texto, valor e vigência
- [x] Data inicial/final pode ser calculada automaticamente (criação ou assinatura)
- [x] Valor padrão do modelo pode ir para o contrato (com override no formulário)
- [x] Preview do modelo usa padrão A4
- [x] Compatibilidade: colunas novas opcionais; contratos antigos sem `tenancy_rules` continuam válidos
