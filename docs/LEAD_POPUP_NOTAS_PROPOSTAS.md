# Lead: popup — notas autoadesivas e propostas

## Objetivo

Padronizar o painel do lead com o restante do produto: **mesmo bloco de notas** usado em clientes (`StickyNote` + JSON em `notes`) e **Propostas** reais no lugar de “Oportunidades” mockadas, com **criação via `ProposalCreateForm` embutido** (mesmo componente do chat).

## 1. Bloco de notas reaproveitado

- **Componentes:** `StickyNote` e tipo `StickyNoteData` em `src/components/clients/StickyNote.tsx`.
- **UI:** aba “Anotações” no `LeadDetailsDialog` renderiza `LeadStickyNotesTab`, alinhado ao padrão da lista de clientes (`Clients.tsx` — “Notas Autoadesivas” no grid).
- **Utilitário:** `src/utils/stickyNotesField.ts` — `parseStickyNotesFromStored` aceita:
  - JSON array de post-its (formato oficial);
  - **legado:** texto livre vira um único post-it (preserva histórico sem migração manual de BD).

## 2. Persistência e migração lead → cliente

- Campo **`leads.notes`** passa a ser tratado como **string JSON** de `StickyNoteData[]`, igual a **`clients.notes`**.
- Na conversão (`handleConvertToClient` em `src/pages/Leads.tsx`), `addClient({ notes: selectedLead.notes })` copia o **mesmo valor** para o cliente criado — não há segunda fonte de verdade nem notas órfãs.
- Clientes já interpretam texto legado ou JSON no carregamento (ex.: `ClientProfile.tsx`); leads usam o mesmo critério via `parseStickyNotesFromStored`.
- **Formulários de adicionar/editar lead** não expõem mais campo “Observações” em texto solto, para não sobrescrever JSON sem querer; edição rica fica na visualização do lead (aba Anotações).

## 3. Oportunidades → Propostas

- Removidos `LeadOpportunitiesTab` e a aba “Oportunidades”.
- Nova aba **“Propostas”** (`LeadProposalsTab`): lista via `proposalsService.getProposals({ client_id })` com React Query (`queryKey`: `["proposals", "lead-popup", clientId]`).

## 4. Ligação ao contexto do lead

- O módulo de propostas relaciona por **`client_id`** (sem `lead_id` na API atual).
- Se o lead tiver **`migrated_client_id`**, a lista mostra propostas desse cliente.
- Se ainda não houver cliente vinculado, a lista fica vazia com mensagem explicando que o vínculo é pelo cliente após conversão; ainda é possível **criar proposta** em rascunho **sem** cliente (como no chat).

## 5. Botão “Criar proposta” e fluxo lateral

- Em `Leads.tsx`, um **`Sheet`** lateral abre o **`ProposalCreateForm`** com `embedded`, `onBack` fechando o sheet e `onCreated` invalidando queries de propostas.
- **Pré-preenchimento:** `initialTitle` = `Proposta — {nome do lead}`; `initialClientId` = `migrated_client_id` **somente** quando existir UUID de cliente real — **nunca** o ID do lead como cliente.

## 6. Riscos remanescentes

- **Volume de toasts:** cada gravação de notas dispara toast de sucesso (alinhado ao fluxo atual de clientes); pode ser suavizado depois.
- **Propostas só por cliente:** leads sem conversão não veem propostas “do lead” na lista até existir `client_id` — coerente com o modelo de dados atual.
- **Lista “convertidos”:** leads convertidos aparecem na lista de convertidos; ao reabrir, `GET /api/leads/:id` deve trazer `migrated_client_id` para listar propostas.

## Checklist de aceite

- [x] Anotações do lead substituídas pelo bloco de notas padrão (`StickyNote`).
- [x] Notas preservadas ao migrar lead → cliente (cópia do campo `notes` para o novo cliente).
- [x] Oportunidades substituídas por Propostas.
- [x] Propostas reais listadas quando há `migrated_client_id`.
- [x] “Criar proposta” abre o sheet com `ProposalCreateForm` embutido (mesmo fluxo do chat).
- [x] Não foi criado fluxo paralelo de criação de proposta (reuso de `ProposalCreateForm`).
- [x] UX do popup alinhada ao padrão de notas do sistema.
