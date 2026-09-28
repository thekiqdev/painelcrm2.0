# 📋 Plano de Integração: UazAPI com Sistema de Notificações

## 🎯 Objetivo

Integrar o sistema de modelos de mensagens/notificações com a API UazAPI para permitir envio de mensagens WhatsApp através dos templates criados.

## 📊 Situação Atual

### ✅ O que já existe:
- Serviço `messageService.ts` com função `sendWhatsAppMessage` que usa UazAPI
- Integração básica com UazAPI via `uazapiService.sendTextMessage`
- Sistema de templates de mensagens funcionando
- Logs de mensagens enviadas na tabela `message_logs`

### ⚠️ O que precisa ser melhorado:
- Endpoint de teste para validar templates antes de usar em produção
- Interface no frontend para testar envio de mensagens
- Melhor tratamento de erros e validação de números
- Suporte a variáveis de teste no envio

## 🔧 Implementação

### 1. Backend - Endpoint de Teste

**Rota**: `POST /api/message-templates/:id/test`

**Funcionalidades**:
- Receber template ID
- Receber número de telefone para teste
- Receber variáveis de exemplo (opcional)
- Substituir variáveis no template
- Enviar mensagem via UazAPI
- Retornar resultado do envio
- Não criar log de mensagem (apenas teste)

**Validações**:
- Verificar se template existe e pertence ao usuário
- Validar formato do número de telefone
- Verificar se há instância WhatsApp conectada
- Validar se todas as variáveis necessárias foram fornecidas

### 2. Frontend - Botão de Teste

**Localização**: Componente `MessageTemplatesSection.tsx`

**Funcionalidades**:
- Botão "Testar" em cada modelo (pré-definido e personalizado)
- Dialog de teste com:
  - Campo para número de telefone (com máscara)
  - Campo para variáveis (JSON ou formulário dinâmico)
  - Preview da mensagem com variáveis substituídas
  - Botão "Enviar Teste"
  - Feedback visual do resultado

**Validações**:
- Formato do número (ex: 5511999999999)
- Variáveis obrigatórias preenchidas
- Feedback de sucesso/erro

### 3. Melhorias no Serviço de Mensagens

**Atualizações**:
- Melhorar validação de número de telefone
- Adicionar suporte a formatação de número
- Melhorar tratamento de erros da UazAPI
- Adicionar retry em caso de falha temporária
- Melhorar logs para debug

## 📝 Estrutura de Dados

### Request de Teste:
```typescript
{
  phoneNumber: string; // Formato: 5511999999999
  variables?: Record<string, string>; // Variáveis para substituir no template
}
```

### Response de Teste:
```typescript
{
  success: boolean;
  message?: string;
  error?: string;
  preview?: string; // Mensagem com variáveis substituídas
}
```

## 🔄 Fluxo de Teste

1. Usuário clica em "Testar" no modelo
2. Dialog abre com campos de teste
3. Usuário preenche número e variáveis (opcional)
4. Sistema mostra preview da mensagem
5. Usuário confirma envio
6. Backend valida dados
7. Backend substitui variáveis no template
8. Backend envia via UazAPI
9. Frontend mostra resultado (sucesso/erro)

## ✅ Checklist de Implementação

### Backend
- [ ] Criar endpoint `POST /api/message-templates/:id/test`
- [ ] Adicionar validação de número de telefone
- [ ] Melhorar função de substituição de variáveis
- [ ] Adicionar função de preview (sem enviar)
- [ ] Melhorar tratamento de erros UazAPI
- [ ] Adicionar logs detalhados

### Frontend
- [ ] Adicionar botão "Testar" na tabela de modelos
- [ ] Criar Dialog de teste
- [ ] Adicionar campo de número com máscara
- [ ] Adicionar campo de variáveis (JSON editor ou formulário)
- [ ] Mostrar preview da mensagem
- [ ] Adicionar feedback visual
- [ ] Tratar erros e mostrar mensagens amigáveis

### Testes
- [ ] Testar envio com template simples
- [ ] Testar envio com variáveis
- [ ] Testar validação de número inválido
- [ ] Testar sem instância WhatsApp conectada
- [ ] Testar com template inexistente
- [ ] Testar preview sem enviar

## 🚀 Próximos Passos

1. Implementar endpoint de teste no backend
2. Adicionar interface de teste no frontend
3. Testar integração completa
4. Documentar uso para usuários
5. Adicionar métricas de envio (opcional)


