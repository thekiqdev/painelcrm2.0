# Automação de Mensagens e Notificações - Guia de Implementação

## 📋 Visão Geral

Este documento apresenta a estratégia para automatizar a entrega de mensagens e notificações do sistema usando as capacidades da API UazAPI. Foram investigadas duas abordagens principais:

1. **Webhooks** - Recebimento passivo de eventos via HTTP POST
2. **SSE (Server-Sent Events)** - Conexão persistente para recebimento em tempo real

## 🔍 Análise das Opções

### Webhooks (Recomendado para Produção)

**Vantagens:**
- ✅ Mais confiável para produção (não depende de conexão persistente)
- ✅ Suporta múltiplos webhooks por instância
- ✅ Filtros avançados de mensagens
- ✅ URLs dinâmicas com parâmetros de evento/tipo
- ✅ Suporte a secret para segurança
- ✅ Não consome recursos do servidor mantendo conexões abertas

**Desvantagens:**
- ⚠️ Requer endpoint público acessível
- ⚠️ Depende de infraestrutura externa estar disponível

### SSE (Server-Sent Events)

**Vantagens:**
- ✅ Conexão persistente em tempo real
- ✅ Útil para desenvolvimento e testes
- ✅ Não requer endpoint público

**Desvantagens:**
- ⚠️ Consome recursos mantendo conexões abertas
- ⚠️ Pode ter problemas com proxies/firewalls
- ⚠️ Reconexão automática pode ser complexa
- ⚠️ Menos escalável que webhooks

## 🎯 Recomendação Final

**Usar Webhooks como solução principal** para automação de mensagens e notificações, com SSE como alternativa para desenvolvimento/testes.

---

## 📝 Plano de Implementação - Passo a Passo

### OK Etapa 1: Configuração do Endpoint de Webhook no Backend

**Objetivo:** Criar endpoint seguro para receber eventos da UazAPI

**Tarefas:**
1. Verificar se o endpoint `/webhooks/uazapi` já existe em `packages/backend/src/routes/`
2. Implementar validação de secret (header `x-uazapi-secret`)
3. Implementar parsing do payload de eventos
4. Adicionar logging para debug
5. Implementar tratamento de erros robusto
6. Adicionar resposta rápida (200 OK) para evitar timeouts

**Arquivos a modificar:**
- `packages/backend/src/routes/uazapiWebhookRoutes.ts` (já existe, verificar implementação)
- `packages/backend/src/controllers/chatController.ts` (função `handleWebhook`)

**Critérios de sucesso:**
- Endpoint responde 200 OK para requisições válidas
- Logs mostram eventos recebidos
- Secret é validado corretamente

---

### OK Etapa 2: Configuração de Webhook na UazAPI

**Objetivo:** Registrar webhook nas instâncias WhatsApp para receber eventos

**Tarefas:**
1. Criar função para configurar webhook via API UazAPI
2. Configurar URL do webhook (usar `PUBLIC_API_URL` ou `UAZAPI_WEBHOOK_URL`)
3. Selecionar eventos relevantes:
   - `messages` - Novas mensagens recebidas
   - `messages_update` - Atualizações de status (entregue, lida, etc)
   - `connection` - Mudanças no estado da conexão
   - `chats` - Atualizações de conversas
   - `leads` - Atualizações de leads
4. Configurar filtros importantes:
   - `excludeMessages: ["wasSentByApi"]` - **CRÍTICO** para evitar loops
5. Salvar configuração no banco de dados (tabela `chat_instances.metadata`)

**Arquivos a modificar:**
- `packages/backend/src/controllers/chatController.ts` (função `configureInstanceWebhook`)
- `packages/backend/src/services/uazapi.ts` (método `configureWebhook`)

**Critérios de sucesso:**
- Webhook configurado com sucesso na UazAPI
- Configuração salva no banco de dados
- Filtro `wasSentByApi` ativo para evitar loops

---

### OK Etapa 3: Processamento de Eventos de Mensagens

**Objetivo:** Processar eventos de mensagens recebidos via webhook

**Tarefas:**
1. Identificar tipo de evento (`messages`, `messages_update`, etc)
2. Extrair dados da mensagem do payload
3. Identificar instância (via `instance` ou `instanceName` no payload)
4. Buscar ou criar conversa no banco de dados
5. Salvar mensagem na tabela `chat_messages`
6. Atualizar contadores de não lidas
7. Atualizar última mensagem da conversa

**Arquivos a modificar:**
- `packages/backend/src/controllers/chatController.ts` (função `handleWebhook`)
- Funções auxiliares: `upsertConversation`, `saveMessage`

**Critérios de sucesso:**
- Mensagens recebidas são salvas no banco
- Conversas são criadas/atualizadas corretamente
- Status de mensagens é atualizado

---

### OK Etapa 4: Sistema de Notificações Internas

**Objetivo:** Criar sistema para notificar usuários sobre eventos importantes

**Tarefas:**
1. Definir tipos de notificações:
   - Nova mensagem recebida
   - Mensagem entregue/lida
   - Nova conversa iniciada
   - Conexão perdida/restaurada
   - Lead atualizado
2. Criar tabela `notifications` no banco de dados:
   ```sql
   CREATE TABLE notifications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id),
     type VARCHAR(50) NOT NULL,
     title VARCHAR(255) NOT NULL,
     message TEXT,
     data JSONB,
     read BOOLEAN DEFAULT false,
     created_at TIMESTAMP DEFAULT now()
   );
   ```
3. Criar função para inserir notificações
4. Integrar notificações no processamento de webhooks

**Arquivos a criar/modificar:**
- `database/init/16_create_notifications_table.sql` (novo)
- `packages/backend/src/services/notifications.ts` (novo)
- `packages/backend/src/controllers/chatController.ts` (integrar notificações)

**Critérios de sucesso:**
- Tabela de notificações criada
- Notificações são criadas quando eventos ocorrem
- Notificações podem ser consultadas por usuário

---

### OK Etapa 5: API de Notificações para Frontend

**Objetivo:** Criar endpoints para o frontend consultar notificações

**Tarefas:**
1. Endpoint `GET /api/notifications` - Listar notificações do usuário
2. Endpoint `GET /api/notifications/unread-count` - Contador de não lidas
3. Endpoint `PATCH /api/notifications/:id/read` - Marcar como lida
4. Endpoint `PATCH /api/notifications/read-all` - Marcar todas como lidas
5. Implementar paginação
6. Implementar filtros (tipo, lida/não lida)

**Arquivos a criar:**
- `packages/backend/src/controllers/notificationsController.ts` (novo)
- `packages/backend/src/routes/notificationsRoutes.ts` (novo)

**Critérios de sucesso:**
- Endpoints retornam notificações corretamente
- Paginação funciona
- Marcação de lida funciona

---

### OK Etapa 6: WebSocket para Notificações em Tempo Real (Frontend)

**Objetivo:** Notificar frontend em tempo real quando novas notificações são criadas

**Tarefas:**
1. Avaliar biblioteca WebSocket (Socket.io ou ws)
2. Criar servidor WebSocket no backend
3. Emitir eventos quando notificações são criadas
4. Conectar frontend ao WebSocket
5. Atualizar UI quando notificação chega
6. Implementar reconexão automática

**Arquivos a criar/modificar:**
- `packages/backend/src/services/websocketService.ts` (novo)
- `packages/backend/src/index.ts` (integrar WebSocket)
- `src/hooks/useNotifications.ts` (novo hook React)
- `src/components/Notifications.tsx` (componente de notificações)

**Critérios de sucesso:**
- WebSocket conecta corretamente
- Notificações aparecem em tempo real no frontend
- Reconexão funciona após desconexão

---

### OK Etapa 7: Automação de Respostas (Opcional - Fase 2)

**Objetivo:** Criar sistema de respostas automáticas baseadas em regras

**Tarefas:**
1. Criar tabela `automation_rules`:
   ```sql
   CREATE TABLE automation_rules (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id),
     instance_id UUID REFERENCES chat_instances(id),
     name VARCHAR(255) NOT NULL,
     trigger_type VARCHAR(50) NOT NULL, -- 'keyword', 'time', 'event'
     trigger_config JSONB NOT NULL,
     action_type VARCHAR(50) NOT NULL, -- 'send_message', 'assign_lead', 'create_ticket'
     action_config JSONB NOT NULL,
     enabled BOOLEAN DEFAULT true,
     created_at TIMESTAMP DEFAULT now()
   );
   ```
2. Criar engine de processamento de regras
3. Integrar com processamento de webhooks
4. Implementar delay entre mensagens automáticas
5. Adicionar logs de automações executadas

**Arquivos a criar:**
- `database/init/17_create_automation_rules_table.sql` (novo)
- `packages/backend/src/services/automationService.ts` (novo)
- `packages/backend/src/controllers/automationController.ts` (novo)

**Critérios de sucesso:**
- Regras são criadas e salvas
- Regras são executadas quando triggers ocorrem
- Logs mostram execuções

---

### OK Etapa 8: Testes e Validação

**Objetivo:** Garantir que todo o sistema funciona corretamente

**Tarefas:**
1. Testar recebimento de webhooks usando https://webhook.cool/
2. Verificar que mensagens são processadas corretamente
3. Testar criação de notificações
4. Testar WebSocket no frontenda
5. Testar automações (se implementadas)
6. Verificar que filtro `wasSentByApi` previne loops
7. Testar reconexão após falhas
8. Testar com múltiplas instâncias

**Critérios de sucesso:**
- Todos os testes passam
- Sem loops de mensagens
- Notificações funcionam em tempo real
- Sistema é estável

---

### OK Etapa 9: Monitoramento e Logs

**Objetivo:** Implementar monitoramento para produção

**Tarefas:**
1. Adicionar métricas:
   - Quantidade de webhooks recebidos
   - Taxa de erro no processamento
   - Tempo de processamento
   - Notificações criadas
2. Criar dashboard de monitoramento (opcional)
3. Implementar alertas para falhas críticas
4. Adicionar logs estruturados

**Arquivos a modificar:**
- Adicionar logging em todos os pontos críticos
- Criar serviço de métricas (opcional)

**Critérios de sucesso:**
- Logs mostram informações úteis
- Métricas são coletadas
- Alertas funcionam

---

### OK Etapa 10: Documentação e Deploy

**Objetivo:** Documentar e fazer deploy do sistema

**Tarefas:**
1. Documentar endpoints de notificações
2. Documentar estrutura de webhooks
3. Criar guia de uso para desenvolvedores
4. Atualizar README com informações de automação
5. Fazer deploy em ambiente de staging
6. Testar em staging
7. Fazer deploy em produção

**Critérios de sucesso:**
- Documentação completa
- Sistema funcionando em produção
- Equipe treinada no uso

---

## 🔧 Configurações Necessárias

### Variáveis de Ambiente

```env
# URL pública da API (para webhooks)
PUBLIC_API_URL=https://api.painelcrm.com

# Ou URL específica para webhooks
UAZAPI_WEBHOOK_URL=https://api.painelcrm.com/webhooks/uazapi

# Secret para validar webhooks (opcional mas recomendado)
UAZAPI_WEBHOOK_SECRET=seu_secret_aqui
```

### Eventos UazAPI Disponíveis

- `connection` - Alterações no estado da conexão
- `history` - Recebimento de histórico de mensagens
- `messages` - Novas mensagens recebidas ⭐
- `messages_update` - Atualizações em mensagens existentes ⭐
- `call` - Eventos de chamadas VoIP
- `contacts` - Atualizações na agenda de contatos
- `presence` - Alterações no status de presença
- `groups` - Modificações em grupos
- `labels` - Gerenciamento de etiquetas
- `chats` - Eventos de conversas ⭐
- `chat_labels` - Alterações em etiquetas de conversas
- `blocks` - Bloqueios/desbloqueios
- `leads` - Atualizações de leads ⭐
- `sender` - Atualizações de campanhas

⭐ = Eventos mais importantes para automação

---

## ⚠️ Considerações Importantes

### Prevenção de Loops

**SEMPRE** configure `excludeMessages: ["wasSentByApi"]` no webhook para evitar que mensagens enviadas pela API gerem novos eventos e loops infinitos.

### Segurança

1. Use secret para validar webhooks
2. Valide origem das requisições (IP whitelist se possível)
3. Implemente rate limiting no endpoint de webhook
4. Use HTTPS para todas as comunicações

### Performance

1. Responda webhooks rapidamente (200 OK) e processe assincronamente
2. Use filas (Redis/Bull) para processamento pesado
3. Implemente retry para falhas temporárias
4. Monitore latência do processamento

### Escalabilidade

1. Webhooks são mais escaláveis que SSE
2. Considere usar múltiplos workers para processamento
3. Use cache para dados frequentemente acessados
4. Implemente debounce para eventos muito frequentes

---

## 📚 Referências

- Documentação UazAPI: `docs/uazapi-openapi-spec.yaml`
- Endpoint Webhook: `/webhook` (GET/POST)
- Endpoint SSE: `/sse` (GET)
- Sites para testes: https://webhook.cool/ (recomendado)

---

## 🎯 Próximos Passos

1. Iniciar com **Etapa 1** - Configuração do Endpoint de Webhook
2. Testar cada etapa antes de prosseguir
3. Documentar problemas encontrados
4. Ajustar plano conforme necessário

**Lembre-se:** Cada etapa deve ser testada individualmente antes de prosseguir para a próxima!

