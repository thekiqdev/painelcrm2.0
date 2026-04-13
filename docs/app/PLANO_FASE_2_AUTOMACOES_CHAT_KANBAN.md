# Plano técnico — Fase 2: automações comerciais, produtividade e comunicação (`/chat/kanbam`)

**Estado:** plano de investigação e arquitetura — **sem implementação** neste documento.  
**Compatibilidade:** respeitar Fase 1 (regras operacionais em `metadata.kanban_column_rules`, política P1 onde aplicável), UI em accordion, `/chat` intocado.  
**Referência cruzada:** `docs/app/PLANO_MODULO_CHAT_KANBAM.md` (modelo de boards/cards, funil CRM, políticas).

---

## 1. Diagnóstico técnico do estado atual

### 1.1 Kanban de chat (implementado)

| Área | Detalhe |
|------|---------|
| **Dados** | `chat_kanban_boards` (incl. `linked_sales_funnel_id` reservado), `chat_kanban_columns` (`metadata` JSONB, `funnel_stage_id` opcional), `chat_kanban_cards` ↔ `chat_conversations`. |
| **Regras Fase 1** | `metadata.kanban_column_rules` + `kanban_column_ui`; parsing em `packages/backend/src/utils/kanbanColumnRules.ts`; aplicação no **`patchCard`** ao mudar coluna (transação: atendimento + organização em `chat_conversations.metadata`). |
| **Disparo** | Sempre **no backend** no movimento do cartão (não só no frontend). |
| **Auditoria** | `chat_conversation_assignment_history` para mutações de atendimento; organização (tags/prioridade) sem linha dedicada hoje — gap a considerar na Fase 2 para ações CRM. |
| **Frontend** | Painel lateral `ChatKanbanColumnSettingsSheet` (accordion: Geral, Atendimento, Organização + placeholders “Em breve”). |
| **Tempo real** | Resposta enriquecida no `PATCH` do cartão + WebSocket `conversation_attendance_updated` (+ ping mínimo pós-regras de organização) para refrescar lista. |

### 1.2 CRM / funil (existente no projeto)

| Entidade | Uso relevante |
|----------|----------------|
| `sales_funnels` / `funnel_stages` | Funil multi-utilizador; estágios ordenados. |
| `clients` | `funnel_stage` tipicamente UUID de estágio na UI de funil de clientes. |
| `leads` | `funnel_stage` em texto no init — integração com estágios menos homogénea que clientes. |
| `chat_conversations` | `client_id`, `lead_id` — ponto natural para “já vinculado ao CRM”. |
| `proposals` | Liga `funnel_id` / `stage_id` — modelo de negócio distinto do Kanban de conversas. |

**Conclusão:** qualquer automação comercial deve **validar tenant**, **idempotência** (evitar duplicar lead ao mover duas vezes) e **opção explícita** por coluna — alinhado à política de não sincronizar funil por defeito (P1 no Kanban de conversas).

### 1.3 Produtividade (existente)

| Recurso | Observação |
|---------|------------|
| `tasks` | Tarefas “standalone” (`user_id`, `title`, `due_date`, `client_id`, etc.) — candidato a **criar tarefa** ligada ao utilizador/tenant. |
| `lead_tasks` / `client_tasks` | Tarefas por lead/cliente — candidato se a automação for “no contexto CRM”. |
| Lembretes / follow-up dedicados | **Não** há módulo único óbvio além de `tasks` + notificações; “agendar lembrete” pode exigir **nova** entidade ou reutilizar `tasks` + `due_date` + notificação. |

### 1.4 Comunicação (existente)

| Recurso | Observação |
|---------|------------|
| `notifications` + `/api/notifications` | Notificações internas por `user_id` — candidato forte a **notificar operador/equipe** (com payload JSON). |
| WhatsApp (UazAPI) | Envio via serviços de instância; **templates** dependem de `message_templates` / fluxos já existentes — integração **médio risco** (permissões, instância, anti-spam). |
| Webhooks | Existem webhooks **entrada** (UazAPI, Asaas pagamentos). **Webhook outbound genérico** por coluna **não** existe como produto — seria **novo** (URL, assinatura, retry, segredo). |

---

## 2. Princípios de arquitetura (Fase 2)

1. **Extensão gradual de `metadata`:** manter `kanban_column_rules` para flags simples; para blocos grandes (CRM, webhooks), preferir **chaves namespaced** (`kanban_automation_v2.commercial`, etc.) ou **tabela auxiliar** se o volume/auditoria exigir.
2. **Motor em camadas:** (A) parse/validação → (B) plano de efeitos → (C) execução transacional onde possível → (D) efeitos assíncronos com registo de estado.
3. **Nada de automação “silenciosa”:** toda ação com efeito externo deve ter **log estruturado** (e, quando aplicável, linha em tabela de auditoria).
4. **CRM opcional:** flags do tipo `require_existing_crm_link` / `allow_create_lead` por coluna; predefinições conservadoras.
5. **Falhas:** distinguir **rollback** (mesma transação DB) vs **compensação** (reverter efeito já cometido) vs **fila retry** (chamadas HTTP).

---

## 3. Classificação por risco — Fase 2A / 2B / 2C

### 3.1 Fase 2A — baixo risco / base direta no código atual

| Automação | Motivo |
|-----------|--------|
| **Notificar operador** (utilizador alvo configurável) | Reutilizar `notifications`; sem canal externo; transação curta. |
| **Notificar equipe** (todos os membros ou subset) | Idem, com query a `team_members` + loop controlado ou notificação agregada. |
| **Atualizar estágio do funil** *só se* conversa já tiver `client_id`/`lead_id` e mapeamento explícito | UPDATE em entidade CRM já existente; sem criar entidade nova. |
| **Webhook outbound simples** (POST JSON com payload fixo + assinatura HMAC opcional) | Isolável em serviço; falha pode ser “log + não bloquear movimento” **se** assim for definido por produto. |

*Nota:* “Atualizar estágio” entra em 2A apenas com **regras estritas** (só cliente/lead já ligado, estágio válido do tenant).

### 3.2 Fase 2B — médio risco / integrações e regras de negócio

| Automação | Motivo |
|-----------|--------|
| **Adicionar como lead** / **criar lead automaticamente** | Criação de `leads`; deduplicação por telefone/email; permissões; possível duplicação se o cartão mover várias vezes. |
| **Converter para cliente** | Pode implicar fluxo de conversão já existente ou novo; efeitos colaterais em dados. |
| **Criar oportunidade** | Se “oportunidade” = `proposal` ou entidade específica — alinhar modelo de dados. |
| **Vincular ao funil existente** | Uso de `linked_sales_funnel_id` / `funnel_stage_id` em colunas; consistência com board. |
| **Marcar ganho / perdido** | Depende de onde o produto guarda esse estado (cliente, proposta, estágio terminal). |
| **Criar tarefa** (`tasks` ou `client_tasks`) | Relação com `conversation_id` pode exigir FK nova ou `metadata` na tarefa. |
| **Enviar mensagem automática** (texto) | UazAPI + instância + consentimento; risco de spam e custo. |
| **Template WhatsApp** | Dependência de templates aprovados e APIs. |

### 3.3 Fase 2C — alto risco / melhor adiar ou desenho separado

| Automação | Motivo |
|-----------|--------|
| **Cadeias longas** (lead → cliente → oportunidade → funil na mesma entrada) | Falha parcial difícil de explicar ao utilizador. |
| **Webhook com retry distribuído + SLA** | Infra de fila (Bull, PG boss, etc.) ainda não é padrão no fluxo Kanban. |
| **Notificar supervisor** sem modelo claro de “quem é supervisor” | RBAC + papéis por tenant. |
| **Agendar lembrete / follow-up** como produto de calendário | Sem modelo único hoje; pode exigir tabela `scheduled_actions` ou similar. |
| **Sincronização bidirecional funil ↔ Kanban** | Conflitos com `clients.funnel_stage` atualizados noutros ecrãs. |

---

## 4. Proposta: o que entra na Fase 2 “real” (MVP sugerido)

### 4.1 Incluir no primeiro incremento (2A + parte de 2B)

1. **Notificações internas** (operador e/ou equipe) com payload `{ source: 'kanban_column', board_id, column_id, card_id, conversation_id }`.
2. **Registo de auditoria** unificado para automações Fase 2 (nova tabela ou extensão de histórico) — mesmo que algumas ações ainda não existam, o **schema** prepara-se cedo.
3. **Webhook outbound opcional** (uma URL por coluna, método POST, corpo JSON padronizado, opt-in “não bloquear movimento em falha”).
4. **Atualização de estágio CRM** apenas quando **já** existir vínculo `client_id` ou `lead_id` e estágio escolhido na UI — sem criação automática de lead neste incremento.

### 4.2 Segundo incremento (2B)

5. **Criar lead** ou **vincular lead existente** com dedupe e flag “executar uma vez por conversa”.
6. **Criar tarefa** (`tasks`) com título template + `client_id` resolvido a partir da conversa.
7. **Mensagem automática** texto curto (com confirmação obrigatória na UI e rate limit).

### 4.3 Deixar para fase posterior (2C ou “Fase 3”)

- Conversão lead → cliente automática.
- Criação de oportunidade/proposta a partir do cartão.
- Templates WhatsApp meta-approved em cadeia.
- Lembretes/follow-up com agendamento robusto.
- Supervisor automático sem definição de papel.

---

## 5. Onde modelar cada tipo de automação

| Tipo | Recomendação inicial |
|------|----------------------|
| Flags booleanas / IDs simples | `metadata.kanban_column_rules` **ou** `metadata.kanban_phase2` (objeto versionado) para não misturar com Fase 1. |
| Payload de webhook (URL, headers) | Sub-objeto em metadata **ou** tabela `chat_kanban_column_automations` se precisar de histórico por versão. |
| Auditoria | Nova tabela sugerida: `chat_kanban_automation_runs` (card_id, column_id, rule_version, status, payload, error, created_at) — **não** obrigatório no primeiro PR, mas recomendado antes de CRM pesado. |
| Filas | Apenas quando houver HTTP externo com retry — `jobs` table + worker ou serviço existente se for introduzido. |

---

## 6. Execução: síncrona vs assíncrona

| Cenário | Modo | Rollback |
|---------|------|----------|
| UPDATE `clients.funnel_stage` / `leads` na mesma transação do movimento do card | Síncrono | `ROLLBACK` do `patchCard` se falhar. |
| Inserir notificação | Síncrono | Preferir mesma transação ou “best effort” após COMMIT com log se falhar. |
| HTTP webhook | Preferência: **assíncrono** após COMMIT (fila) ou síncrono com **timeout curto** e falha não bloqueante (política explícita). |
| Envio WhatsApp | Assíncrono + retry; nunca bloquear transação principal do cartão. |

**Regra de ouro:** o **movimento do cartão** (`chat_kanban_cards`) não deve ficar inconsistente por falha de integração externa — salvo decisão explícita “movimento só confirma se webhook OK” (geralmente má UX).

---

## 7. Painel lateral (accordion) — o que fica “real” vs “Em breve”

| Secção | Fase 2 sugerida |
|--------|-----------------|
| **Geral** | Sem mudança estrutural; eventual campo “nível de automação” opcional. |
| **Atendimento / Organização** | Mantêm Fase 1; não misturar CRM aqui. |
| **Comercial** | Ativar sub-form **apenas** para: vínculo opcional a estágio (se lead/cliente existir) + “criar lead” (incremento 2B). Resto “Em breve”. |
| **Produtividade** | “Criar tarefa” (2B); lembrete/follow-up → “Em breve”. |
| **Comunicação** | Notificações (2A); webhook (2A); mensagem/template → “Em breve” ou 2B parcial. |
| **SLA / Validações** | “Em breve”. |
| **Integração com funil** | Documentar uso de `linked_sales_funnel_id` / `funnel_stage_id` + UI quando 2B estiver pronta. |

**Anti-poluição:** sub-accordions ou **“modo avançado”** colapsado por defeito para URL de webhook e mapeamentos CRM.

---

## 8. Impacto backend (planeado)

| Componente | Alteração esperada |
|--------------|-------------------|
| `chatKanbanController.patchCard` | Orquestrar novo pipeline `applyPhase2ColumnRules` **após** regras Fase 1, ou serviço dedicado. |
| Novo serviço | `kanbanColumnAutomationService.ts` — interpreta metadata Fase 2, chama CRM/notifications/webhook. |
| CRM | Reutilizar controllers/serviços existentes de leads/clients/funnels com **funções internas** (não expor tudo ao público sem permissão). |
| `notifications` | Inserção em batch para equipe. |
| WebSocket | Opcional: evento `kanban_automation_failed` para toast no cliente. |

---

## 9. Impacto frontend (planeado)

| Componente | Alteração esperada |
|------------|-------------------|
| `ChatKanbanColumnSettingsSheet` | Forms por secção; validação; toggles “avançado”. |
| Feedback | Toasts + possível badge “última automação falhou” no cartão (futuro). |
| Confirmação | Para ações destrutivas ou envio de mensagem — reutilizar padrão `require_confirmation` / modal. |

**`/chat`:** sem alteração obrigatória; reutilizar apenas padrões de serviço se partilhados.

---

## 10. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Duplicação de leads | Idempotência por `(conversation_id, automation_key)` na execução ou flag em `chat_conversations.metadata`. |
| Funil dessincronizado com outros ecrãs | Documentar “fonte de verdade”; evitar sync bidirecional na Fase 2. |
| Webhook lento | Assíncrono; não bloquear PATCH. |
| Spam WhatsApp | Rate limit por tenant/conversa; confirmação obrigatória. |
| RLS / tenant | Todas as queries com `tenant_id` coerente com políticas existentes. |

---

## 11. Plano de implantação em etapas pequenas

| Etapa | Entrega | Critério de saída |
|-------|---------|-------------------|
| **E0** | Documento de contrato JSON para `metadata.kanban_phase2` (versão 1) | Review aprovado |
| **E1** | Auditoria mínima (`automation_runs` ou extensão de log) | Inserção em movimento de teste |
| **E2** | Notificação a operador fixo + a equipa | E2E manual |
| **E3** | Webhook outbound opcional, não bloqueante | Teste com httpbin |
| **E4** | Atualizar estágio CRM se vínculo existente | Teste com cliente ligado |
| **E5** | Criar lead com dedupe | Teste com conversa sem lead |
| **E6** | Criar `tasks` a partir da coluna | Teste com cliente |
| **E7** | Mensagem automática (texto) + limites | Teste em staging |

*(Ordem pode ajustar-se após spike de 1–2 dias em CRM existente.)*

---

## 12. Checklist de homologação (Fase 2)

- [ ] Movimento de cartão sem automação Fase 2 comporta-se como hoje (Fase 1 intacta).
- [ ] Tenant A não vê dados de tenant B em notificações/CRM/webhook.
- [ ] Falha de webhook não corrompe posição do cartão (se política não bloqueante).
- [ ] Duplo movimento para a mesma coluna não cria duplicados indevidos (lead/tarefa), conforme regra.
- [ ] Logs/auditoria permitem rastrear “quem, quando, que coluna, que conversa”.
- [ ] Painel lateral continua legível; secções futuras permanecem colapsadas.
- [ ] `/chat` e rotas existentes sem regressão.

---

## 13. Critérios de aceite do plano (documento)

- [x] Fase 2 separada em **2A / 2B / 2C** com exemplos.
- [x] MVP proposto (secção 4) sem comprometer P1 do Kanban.
- [x] Modelagem, execução, UI, backend e riscos cobertos.
- [x] Etapas pequenas e checklist de homologação.
- [x] Compatibilidade com Fase 1 e com `PLANO_MODULO_CHAT_KANBAM.md`.

---

*Documento gerado para suportar decisão de produto antes de qualquer implementação. Atualizar após spikes técnicos em leads/clients e em notificações.*
