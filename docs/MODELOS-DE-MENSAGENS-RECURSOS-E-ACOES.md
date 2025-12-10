# 📋 Documentação: Recursos e Ações para Modelos de Mensagens

Esta documentação lista todos os recursos do sistema e suas ações possíveis para criação de modelos de mensagens/notificações.

## 📊 Estrutura

Cada modelo de mensagem será composto por:
- **TIPO (Resource)**: O recurso do sistema (ex: contratos, faturas, tarefas)
- **AÇÃO (Action)**: A ação específica dentro desse recurso (ex: criação, conclusão, vencimento)

---

## 1. 💰 FATURAS (Invoices)

**Recurso**: `invoices`

### Ações Disponíveis:
- `created` - Nova fatura criada
- `sent` - Fatura enviada ao cliente
- `paid` - Fatura paga
- `overdue` - Fatura vencida
- `reminder_due_soon` - Lembrete de vencimento próximo (ex: 3 dias antes)
- `reminder_overdue` - Lembrete de fatura atrasada
- `cancelled` - Fatura cancelada
- `updated` - Fatura atualizada

### Variáveis Disponíveis:
- `{{invoice_number}}` - Número da fatura
- `{{invoice_total}}` - Valor total
- `{{issue_date}}` - Data de emissão
- `{{due_date}}` - Data de vencimento
- `{{client_name}}` - Nome do cliente
- `{{client_email}}` - Email do cliente
- `{{client_phone}}` - Telefone do cliente
- `{{invoice_link}}` - Link para visualizar a fatura
- `{{payment_link}}` - Link para pagamento (se disponível)
- `{{status}}` - Status da fatura

---

## 2. 📄 CONTRATOS (Contracts)

**Recurso**: `contracts`

### Ações Disponíveis:
- `created` - Novo contrato criado
- `sent_for_signature` - Contrato enviado para assinatura
- `signature_requested` - Solicitação de assinatura enviada
- `partially_signed` - Contrato parcialmente assinado
- `fully_signed` - Contrato totalmente assinado
- `signed_by_client` - Assinado pelo cliente
- `signed_by_internal` - Assinado por membro interno
- `rejected` - Contrato rejeitado
- `expired` - Contrato expirado
- `renewed` - Contrato renovado
- `cancelled` - Contrato cancelado
- `updated` - Contrato atualizado

### Variáveis Disponíveis:
- `{{contract_number}}` - Número do contrato
- `{{contract_title}}` - Título do contrato
- `{{client_name}}` - Nome do cliente
- `{{client_email}}` - Email do cliente
- `{{signer_name}}` - Nome do signatário
- `{{signer_email}}` - Email do signatário
- `{{contract_link}}` - Link para visualizar/assinar
- `{{start_date}}` - Data de início
- `{{end_date}}` - Data de término
- `{{total_value}}` - Valor total do contrato
- `{{status}}` - Status do contrato

---

## 3. ✅ TAREFAS (Tasks)

**Recurso**: `tasks`

### Ações Disponíveis:
- `created` - Nova tarefa criada
- `assigned` - Tarefa atribuída a alguém
- `updated` - Tarefa atualizada
- `completed` - Tarefa concluída
- `reopened` - Tarefa reaberta
- `due_soon` - Tarefa com vencimento próximo
- `overdue` - Tarefa vencida
- `commented` - Comentário adicionado na tarefa
- `status_changed` - Status da tarefa alterado
- `priority_changed` - Prioridade alterada
- `cancelled` - Tarefa cancelada

### Variáveis Disponíveis:
- `{{task_title}}` - Título da tarefa
- `{{task_description}}` - Descrição da tarefa
- `{{task_status}}` - Status da tarefa
- `{{task_priority}}` - Prioridade da tarefa
- `{{assignee_name}}` - Nome do responsável
- `{{assignee_email}}` - Email do responsável
- `{{creator_name}}` - Nome do criador
- `{{due_date}}` - Data de vencimento
- `{{task_link}}` - Link para visualizar a tarefa
- `{{client_name}}` - Nome do cliente (se vinculado)

---

## 4. 🎫 TICKETS (Support Tickets)

**Recurso**: `tickets`

### Ações Disponíveis:
- `created` - Novo ticket criado
- `assigned` - Ticket atribuído a um atendente
- `status_changed` - Status do ticket alterado
- `priority_changed` - Prioridade alterada
- `new_message` - Nova mensagem no ticket
- `first_response` - Primeira resposta do atendente
- `resolved` - Ticket resolvido
- `closed` - Ticket fechado
- `reopened` - Ticket reaberto
- `sla_warning` - Aviso de SLA próximo do limite
- `sla_breached` - SLA violado
- `escalated` - Ticket escalado
- `merged` - Tickets mesclados

### Variáveis Disponíveis:
- `{{ticket_number}}` - Número do ticket
- `{{ticket_subject}}` - Assunto do ticket
- `{{ticket_description}}` - Descrição do ticket
- `{{ticket_status}}` - Status do ticket
- `{{ticket_priority}}` - Prioridade do ticket
- `{{contact_name}}` - Nome do contato
- `{{contact_email}}` - Email do contato
- `{{contact_phone}}` - Telefone do contato
- `{{assignee_name}}` - Nome do atendente responsável
- `{{assignee_email}}` - Email do atendente
- `{{ticket_link}}` - Link para visualizar o ticket
- `{{category}}` - Categoria do ticket
- `{{first_response_time}}` - Tempo de primeira resposta

---

## 5. 📁 PROJETOS (Projects)

**Recurso**: `projects`

### Ações Disponíveis:
- `created` - Novo projeto criado
- `started` - Projeto iniciado
- `updated` - Projeto atualizado
- `completed` - Projeto concluído
- `paused` - Projeto pausado
- `resumed` - Projeto retomado
- `cancelled` - Projeto cancelado
- `status_changed` - Status do projeto alterado
- `member_added` - Membro adicionado ao projeto
- `member_removed` - Membro removido do projeto
- `milestone_reached` - Marco alcançado
- `deadline_approaching` - Prazo se aproximando
- `deadline_passed` - Prazo ultrapassado

### Variáveis Disponíveis:
- `{{project_name}}` - Nome do projeto
- `{{project_description}}` - Descrição do projeto
- `{{project_status}}` - Status do projeto
- `{{client_name}}` - Nome do cliente
- `{{due_date}}` - Data de entrega
- `{{project_link}}` - Link para visualizar o projeto
- `{{member_name}}` - Nome do membro (quando aplicável)
- `{{milestone_name}}` - Nome do marco (quando aplicável)

---

## 6. 📋 TAREFAS DE PROJETO (Project Tasks)

**Recurso**: `project_tasks`

### Ações Disponíveis:
- `created` - Nova tarefa de projeto criada
- `assigned` - Tarefa atribuída
- `updated` - Tarefa atualizada
- `completed` - Tarefa concluída
- `moved` - Tarefa movida entre listas/colunas
- `due_soon` - Tarefa com vencimento próximo
- `overdue` - Tarefa vencida
- `commented` - Comentário adicionado
- `attachment_added` - Anexo adicionado
- `status_changed` - Status alterado
- `priority_changed` - Prioridade alterada

### Variáveis Disponíveis:
- `{{task_title}}` - Título da tarefa
- `{{task_description}}` - Descrição da tarefa
- `{{project_name}}` - Nome do projeto
- `{{list_name}}` - Nome da lista/coluna
- `{{assignee_name}}` - Nome do responsável
- `{{assignee_email}}` - Email do responsável
- `{{due_date}}` - Data de vencimento
- `{{task_link}}` - Link para visualizar a tarefa
- `{{task_status}}` - Status da tarefa
- `{{task_priority}}` - Prioridade da tarefa

---

## 7. 🎯 LEADS

**Recurso**: `leads`

### Ações Disponíveis:
- `created` - Novo lead criado
- `converted` - Lead convertido em cliente
- `status_changed` - Status do lead alterado
- `assigned` - Lead atribuído a um vendedor
- `updated` - Lead atualizado
- `contacted` - Lead contactado
- `qualified` - Lead qualificado
- `lost` - Lead perdido
- `reopened` - Lead reaberto
- `note_added` - Nota adicionada ao lead

### Variáveis Disponíveis:
- `{{lead_name}}` - Nome do lead
- `{{lead_email}}` - Email do lead
- `{{lead_phone}}` - Telefone do lead
- `{{lead_status}}` - Status do lead
- `{{funnel_name}}` - Nome do funil
- `{{stage_name}}` - Nome do estágio
- `{{assignee_name}}` - Nome do responsável
- `{{assignee_email}}` - Email do responsável
- `{{lead_link}}` - Link para visualizar o lead
- `{{source}}` - Origem do lead

---

## 8. 👥 CLIENTES (Clients)

**Recurso**: `clients`

### Ações Disponíveis:
- `created` - Novo cliente criado
- `updated` - Cliente atualizado
- `status_changed` - Status do cliente alterado
- `assigned` - Cliente atribuído a um vendedor
- `note_added` - Nota adicionada
- `document_added` - Documento adicionado
- `contact_added` - Contato adicionado
- `archived` - Cliente arquivado
- `reactivated` - Cliente reativado

### Variáveis Disponíveis:
- `{{client_name}}` - Nome do cliente
- `{{client_email}}` - Email do cliente
- `{{client_phone}}` - Telefone do cliente
- `{{client_status}}` - Status do cliente
- `{{assignee_name}}` - Nome do responsável
- `{{client_link}}` - Link para visualizar o cliente
- `{{company_name}}` - Nome da empresa (se aplicável)

---

## 9. 💼 PROPOSTAS (Proposals)

**Recurso**: `proposals`

### Ações Disponíveis:
- `created` - Nova proposta criada
- `sent` - Proposta enviada ao cliente
- `viewed` - Proposta visualizada pelo cliente
- `accepted` - Proposta aceita
- `rejected` - Proposta rejeitada
- `expired` - Proposta expirada
- `updated` - Proposta atualizada
- `reminder_sent` - Lembrete enviado
- `converted_to_contract` - Convertida em contrato
- `converted_to_invoice` - Convertida em fatura

### Variáveis Disponíveis:
- `{{proposal_number}}` - Número da proposta
- `{{proposal_title}}` - Título da proposta
- `{{proposal_total}}` - Valor total
- `{{client_name}}` - Nome do cliente
- `{{client_email}}` - Email do cliente
- `{{proposal_link}}` - Link para visualizar a proposta
- `{{expiry_date}}` - Data de expiração
- `{{status}}` - Status da proposta
- `{{valid_until}}` - Válido até

---

## 10. 💸 DESPESAS (Expenses)

**Recurso**: `expenses`

### Ações Disponíveis:
- `created` - Nova despesa criada
- `updated` - Despesa atualizada
- `paid` - Despesa paga
- `approved` - Despesa aprovada
- `rejected` - Despesa rejeitada
- `reimbursed` - Despesa reembolsada
- `cancelled` - Despesa cancelada

### Variáveis Disponíveis:
- `{{expense_description}}` - Descrição da despesa
- `{{expense_amount}}` - Valor da despesa
- `{{expense_date}}` - Data da despesa
- `{{expense_category}}` - Categoria da despesa
- `{{project_name}}` - Nome do projeto (se vinculado)
- `{{expense_link}}` - Link para visualizar a despesa
- `{{status}}` - Status da despesa

---

## 11. 📊 FUNIS DE VENDAS (Funnels)

**Recurso**: `funnels`

### Ações Disponíveis:
- `created` - Novo funil criado
- `updated` - Funil atualizado
- `stage_added` - Estágio adicionado
- `stage_updated` - Estágio atualizado
- `lead_moved` - Lead movido entre estágios
- `conversion` - Conversão registrada
- `goal_reached` - Meta alcançada

### Variáveis Disponíveis:
- `{{funnel_name}}` - Nome do funil
- `{{stage_name}}` - Nome do estágio
- `{{lead_name}}` - Nome do lead
- `{{conversion_rate}}` - Taxa de conversão
- `{{funnel_link}}` - Link para visualizar o funil

---

## 12. 🔔 NOTIFICAÇÕES DO SISTEMA

**Recurso**: `system`

### Ações Disponíveis:
- `user_registered` - Novo usuário registrado
- `password_reset` - Redefinição de senha solicitada
- `password_changed` - Senha alterada
- `email_verified` - Email verificado
- `account_activated` - Conta ativada
- `account_deactivated` - Conta desativada
- `backup_completed` - Backup concluído
- `system_maintenance` - Manutenção do sistema
- `security_alert` - Alerta de segurança

### Variáveis Disponíveis:
- `{{user_name}}` - Nome do usuário
- `{{user_email}}` - Email do usuário
- `{{reset_link}}` - Link para redefinição de senha
- `{{verification_link}}` - Link de verificação
- `{{system_name}}` - Nome do sistema
- `{{alert_message}}` - Mensagem de alerta

---

## 📝 Notas de Implementação

### Estrutura de Dados

A tabela `message_templates` deve ser atualizada para incluir:
- `resource_type` (TEXT) - Tipo de recurso (invoices, contracts, tasks, etc.)
- `action` (TEXT) - Ação específica (created, sent, paid, etc.)

### Ordem de Seleção no Frontend

1. **Primeiro**: Selecionar o TIPO (recurso)
2. **Segundo**: Selecionar a AÇÃO (baseado no tipo selecionado)

### Variáveis Dinâmicas

Todas as variáveis devem ser documentadas e validadas no momento da criação do template. O sistema deve:
- Listar variáveis disponíveis baseado no tipo e ação selecionados
- Validar se todas as variáveis usadas no template estão disponíveis
- Mostrar preview com dados de exemplo

### Modelos Pré-definidos

Criar modelos pré-definidos para as ações mais comuns:
- Nova fatura criada
- Fatura vencida
- Novo ticket criado
- Ticket resolvido
- Nova tarefa atribuída
- Tarefa concluída
- Contrato enviado para assinatura
- Contrato assinado
- Novo projeto criado
- Lead convertido

---

## 🔄 Próximos Passos

1. Atualizar estrutura do banco de dados
2. Atualizar backend para suportar resource_type e action
3. Atualizar frontend com seleção em duas etapas
4. Criar validação de variáveis
5. Implementar sistema de preview
6. Criar modelos pré-definidos para cada recurso/ação

