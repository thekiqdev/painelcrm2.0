# Etapa 1 — Implementação: base interna do módulo de contratos

**Objetivo:** consistência multiusuário/tenant, modelos utilizáveis na UI, correções de estado e vínculo de cliente, e alinhamento da UI ao que o backend suporta hoje (sem links públicos, tokens ou PDF).

---

## O que foi alterado

### Backend

1. **`contractTemplatesController.ts`**  
   - Documentada a regra de negócio no arquivo.  
   - **GET** lista modelos do tenant (sem checagem extra de permissão — alinhado a `getContracts`).  
   - **POST** exige `assertModulePermission(..., 'contracts', 'create')`.  
   - **PATCH** / **DELETE**: resolve o modelo no tenant, depois `edit` / `delete` com `ownerId = template.user_id` (respeita `edit_own_only` / `delete_own_only`).  
   - **DELETE** passa a remover por `id` após validação (não permite mais que qualquer usuário do tenant apague modelo de outro sem passar pela permissão).

2. **`contractSignersController.ts`** e **`contractEventsController.ts`**  
   - Substituída a verificação `contracts.user_id = req.userId` por **`findContractInTenant`** (mesmo critério de `getContractById` / listagem por tenant).  
   - **GET** signers/events: só isolamento por tenant (igual leitura do contrato).  
   - **POST/PATCH/DELETE** signers e **POST** events: `assertModulePermission` com `edit` e `ownerId` / `assigneeId` do contrato (igual `updateContract`).

3. **`utils/contractAccess.ts`** (novo)  
   - `findContractInTenant`, `findSignerInTenant`: consultas reutilizáveis para escopo tenant.

### Frontend

4. **`ContractTemplates.tsx`** (novo)  
   - Listagem, criar/editar em diálogo, ativar/desativar, excluir (com confirmação), `RichTextEditor` para `content_html`.

5. **`App.tsx`** + **`routePreload.ts`**  
   - Rota **`/contracts/templates`** registrada **antes** de `/contracts/:id` para não colidir com `:id = "templates"`.

6. **`Contracts.tsx`**  
   - Botão **Modelos** navega para `/contracts/templates`.  
   - Menu da linha: **Editar e enviar para assinatura** (navega para `/contracts/:id/edit`); **Duplicar** implementado; **Exportar PDF** removido.

7. **`ContractDetails.tsx`**  
   - **Editar e enviar para assinatura** (rascunho → edição).  
   - **Reenviar convites** desabilitado com indicação “Em breve”.  
   - **Exportar PDF** removido.

8. **`NewContract.tsx`**  
   - Carrega **todos** os modelos do tenant (inclui inativos) para não perder referência ao editar contrato com modelo desativado.  
   - No assistente inicial, só modelos **ativos** no `Select`.  
   - **`handleTemplateSelect`** usa `setFormData(prev => ...)` para evitar stale closure.  
   - Ao editar contrato existente, **não** reaplica o HTML do modelo (preserva `content_html` já salvo).

9. **`Chat.tsx`**  
   - **`client_id`** enviado **somente** quando há `currentClient`; **nunca** `lead.id` (comentário no código explica FK `clients`).

---

## Regra adotada para templates

- **Módulo de permissão:** `contracts` (não há módulo separado).  
- **Listagem (GET):** isolamento por tenant, como a listagem de contratos.  
- **Criação:** `contracts.create`; `user_id` do modelo = usuário atual.  
- **Edição / exclusão:** `contracts.edit` / `contracts.delete` com **`ownerId = template.user_id`**. Assim, com `edit_own_only`, só o criador do modelo altera; administradores/perfil sem “só próprios” podem gerir modelos alheios como já ocorre com contratos.

---

## Regra adotada para signers / events

- **Leitura:** contrato acessível no tenant (JOIN como `getContractById`).  
- **Escrita:** mesma regra de **`updateContract`**: `assertModulePermission(..., 'edit', { ownerId: contract.user_id, assigneeId: contract.responsible_id })`.

---

## Seleção de template (`NewContract.tsx`)

- Atualização funcional de estado ao escolher modelo.  
- Ordem de efeito: `loadTemplates` → `loadClients` → `loadContractForEdit` para reduzir corrida na edição.  
- Remoção da reaplicação do modelo na carga do contrato (evita sobrescrever texto já personalizado).

---

## Tratamento de `client_id` (Chat)

- Apenas `currentClient?.id` é enviado como `client_id`.  
- Conversa só com **lead**: contrato é criado **sem** `client_id` (válido no schema); evita FK inválida.

---

## Ações ocultadas / desabilitadas

| Onde | Ação | Comportamento |
|------|------|----------------|
| `ContractDetails` | Exportar PDF | Removida |
| `ContractDetails` | Reenviar convites | `disabled` + “Em breve” |
| `Contracts` (tabela) | Exportar PDF | Removida |
| `Contracts` / `ContractDetails` | “Enviar” genérico sem destino | Substituída por navegação para edição |

**Mantido:** botão **Enviar para assinatura** em `NewContract` continua alterando status e eventos (fluxo interno já existente).

---

## Arquivos impactados

- `packages/backend/src/utils/contractAccess.ts` (novo)  
- `packages/backend/src/controllers/contractTemplatesController.ts`  
- `packages/backend/src/controllers/contractSignersController.ts`  
- `packages/backend/src/controllers/contractEventsController.ts`  
- `src/pages/ContractTemplates.tsx` (novo)  
- `src/App.tsx`  
- `src/routePreload.ts`  
- `src/pages/Contracts.tsx`  
- `src/pages/ContractDetails.tsx`  
- `src/pages/NewContract.tsx`  
- `src/pages/Chat.tsx`  
- `docs/ETAPA_1_CONTRATOS_IMPLEMENTACAO.md` (este arquivo)

**Migrações:** nenhuma (Etapa 1 só código).

---

## Riscos remanescentes

- **Listagem GET** (contratos, modelos, signers, events em leitura) não passa pelo Permission Engine — igual ao estado pré-existente do módulo; endurecer exigiria `view` em todos os GETs de contrato (mudança maior).  
- **Reenvio / assinatura pública / PDF** ainda não existem; UI marca reenvio como “em breve”.  
- **Duplicar** na listagem não copia signatários (igual ao comportimento anterior da ação em massa “duplicar”).

---

## Pendências para Etapa 2+

- Snapshot / congelamento explícito do corpo ao enviar.  
- Tokens e rotas públicas (visualizar / assinar).  
- Notificações com links corretos.  
- PDF e auditoria forte (IP/UA, hash).  
- Opcional: campo formal `lead_id` em contratos se o produto exigir vínculo a lead.

---

## Checklist final (Etapa 1)

- [x] Templates operacionais na UI  
- [x] Botão Modelos funcionando  
- [x] Signers/events coerentes com tenant + permissão em mutações  
- [x] Seleção de template corrigida  
- [x] `client_id` validado corretamente no Chat  
- [x] Ações quebradas removidas ou desabilitadas  

**Base pronta para Etapa 2:** sim — isolamento e permissões de templates/signers/events alinhados; UI de modelos entregue; sem dependência de schema novo para avançar para links/snapshot nas próximas etapas.
