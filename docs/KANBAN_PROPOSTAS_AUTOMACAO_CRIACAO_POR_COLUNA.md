# Kanban do chat — modelo de proposta por coluna: criação automática vs assistida

## 1. O que a Etapa 3 implementou de fato

Conforme `docs/ETAPA_3_KANBAN_CHAT_PROPOSTAS_MODELO_POR_COLUNA.md`:

- Cada coluna pode ter **`default_proposal_model_id`** (modelo em `proposal_templates`) e/ou legado **`default_proposal_template_id`** (rascunho em `proposals`).
- O fluxo é **assistido**: o utilizador **revisa e confirma** no formulário; **não há criação nem envio automáticos** ao apenas mudar de coluna.
- Gatilho explícito:
  1. **Drawer do cartão** → «Criar proposta no Chat» grava contexto em `sessionStorage` (`kanbanProposalColumnContext`) e navega para `/chat`.
  2. **Chat** → botão «Criar proposta» com o mesmo contexto consome a coluna e aplica modelo via `resolveKanbanProposalPrefillFromColumn` → `ProposalCreateForm` (`initialProposalModelId` / `initialTemplateProposalId`).

Não foi especificado nem implementado, na Etapa 3, **criar linha em `proposals` no `PATCH` do cartão** ao entrar na coluna.

## 2. Investigação no código (comportamento atual)

| Área | Resultado |
|------|-----------|
| `patchCard` / `chatKanbanController.ts` | Atualiza `column_id`, posição, efeitos de coluna (CRM, tarefas, mensagens phase2, etc.). **Nenhuma** chamada a criação de proposta. |
| `proposalKanbanAcceptAutomationService.ts` | Automatiza **movimento do cartão** quando a proposta passa a **`accepted`** (Etapa 2), não cria proposta. |
| `kanbanProposalColumnContext.ts` | Só transporta `conversationId`, `boardId`, `columnId`, `autoOpenProposal`. |
| `Chat.tsx` | Aplica modelo quando abre o painel de criação (efeito + `handleCreateProposal`), não ao receber evento de DnD. |
| `ChatKanbanColumnSettingsSheet.tsx` | Já mencionava «sem envio automático»; a confusão vinha sobretudo da comparação com outras automações **ao entrar na coluna** (ex.: tarefa). |

**Conclusão:** o sistema **não** deveria criar proposta automaticamente ao mover o cartão, segundo o desenho da Etapa 3. O comportamento observado (nada ao mover) é **o esperado**, não um bug de implementação daquela etapa.

## 3. Regra de produto final (explicitada)

**Opção A — Automação assistida (regra adotada e mantida)**

| Momento | Comportamento |
|---------|----------------|
| **Mover cartão** para coluna com modelo | **Não** cria proposta. |
| **Clicar** «Criar proposta no Chat» (drawer) ou fluxo equivalente no Chat | Abre criação com **modelo da coluna aplicado** (se válido e ativo), com **XOR** `client_id` / `lead_id` e revisão humana antes de gravar/enviar. |

**Opção B — Criação automática ao entrar na coluna** não está implementada. Se no futuro for desejada, deve ser um **novo** requisito com:

- chave explícita na metadata (ex.: `auto_create_proposal_on_enter`);
- idempotência e regras no **backend** (fonte de verdade);
- registro em timeline / log operacional.

## 4. Idempotência e duplicidade (estado atual)

- **Sem** auto-create ao mover: não há risco de duplicar propostas por reentrada na coluna por esse caminho.
- A automação **ao aceitar** (Etapa 2) usa idempotência própria (`timelineAlreadyHasCardMove`, etc.).

## 5. Cliente e lead

Inalterado: o modelo só influencia o **pré-preenchimento**; o vínculo continua o da conversa (`client_id` ou `lead_id`, mutuamente exclusivo na criação). Faturamento continua sujeito às regras já existentes (cliente válido quando aplicável).

## 6. Ajustes de UX (pós-investigação)

Para reduzir a expectativa errada de «automação total ao arrastar»:

- Textos reforçados na **folha de definições da coluna** (bloco Propostas) e no **drawer** quando a coluna tem modelo configurado.
- Distinção explícita face a automações que **sim** rodam ao entrar na coluna (ex.: criar tarefa).

## 7. Riscos remanescentes

- Utilizadores que não leiam a configuração podem continuar a assumir criação ao mover; a documentação e os textos da UI mitigam, não eliminam.
- `sessionStorage` pode ser limpo antes do Chat: comportamento já documentado na Etapa 3.

## 8. Checklist

- [x] Comportamento atual foi investigado no código e na Etapa 3.
- [x] Definido: coluna **aplica modelo na criação assistida**, não cria proposta ao mover.
- [x] Fluxo assistido mantido; UX alinhada à regra.
- [x] Cliente e lead preservados (mesmo fluxo de criação).
- [x] Sem duplicação por movimento (não há auto-create).
- [x] Documentação atualizada (este ficheiro).
