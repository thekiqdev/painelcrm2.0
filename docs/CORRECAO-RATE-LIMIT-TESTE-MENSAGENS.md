# 🔧 Correção: Rate Limit no Endpoint de Teste de Mensagens

## 🔍 Problema Identificado

Erro **429 (Too Many Requests)** ao tentar enviar mensagem de teste via endpoint `/api/message-templates/:id/test`.

### Causa:
- O rate limiter geral estava aplicado a todas as rotas `/api/`
- O endpoint de teste estava sendo limitado pelo mesmo rate limiter das outras APIs
- Em desenvolvimento, isso pode causar problemas mesmo com poucas requisições

## ✅ Soluções Implementadas

### 1. Rate Limiter Específico para Testes

Criado rate limiter mais generoso especificamente para endpoints de teste:
- **Limite**: 20 requisições por minuto (suficiente para testes)
- **Em desenvolvimento**: Rate limit desabilitado automaticamente
- **Aplicado antes** do rate limiter geral

### 2. Ajuste no Rate Limiter Geral

O rate limiter geral agora **pula** endpoints de teste:
```typescript
skip: (req) => {
  return req.path.includes('/test') || req.path.startsWith('/webhooks/');
}
```

### 3. Ordem de Aplicação dos Rate Limiters

**Ordem correta** (mais específico → mais genérico):
1. Webhooks (mais específico)
2. Testes (específico)
3. API geral (genérico)

### 4. Melhor Tratamento de Erros da UazAPI

Adicionado tratamento específico para:
- **Erro 429 da UazAPI**: Rate limit da própria API UazAPI
- **Erro 404**: Instância não encontrada
- **Outros erros**: Mensagens mais claras

### 5. Logs Melhorados

Adicionados logs detalhados para debug:
- Log antes de enviar mensagem
- Log da resposta da UazAPI
- Logs de erro com mais detalhes

## 📊 Configuração de Rate Limiting

### Endpoint de Teste:
- **Limite**: 20 requisições/minuto
- **Em dev**: Desabilitado
- **Mensagem**: "Muitos testes enviados. Aguarde um momento..."

### API Geral:
- **Limite**: 100 requisições/15 minutos
- **Exceções**: Testes e webhooks são pulados

### Webhooks:
- **Limite**: 200 requisições/minuto
- **Motivo**: Podem receber muitos eventos

## 🧪 Como Testar

1. **Teste Normal:**
   - Envie mensagem de teste
   - Deve funcionar sem erro 429

2. **Teste Múltiplo:**
   - Envie várias mensagens de teste rapidamente
   - Após 20 em 1 minuto, deve mostrar mensagem de rate limit
   - Em desenvolvimento, não deve ter limite

3. **Teste com Instância Desconectada:**
   - Tente enviar teste sem instância conectada
   - Deve mostrar erro claro

4. **Teste com Erro da UazAPI:**
   - Se UazAPI retornar erro, deve mostrar mensagem clara
   - Logs devem aparecer no console do backend

## 🔄 Próximos Passos (Opcional)

1. Adicionar retry automático em caso de rate limit da UazAPI
2. Adicionar fila de mensagens para evitar rate limits
3. Adicionar métricas de uso de rate limit
4. Adicionar notificação quando rate limit é atingido


