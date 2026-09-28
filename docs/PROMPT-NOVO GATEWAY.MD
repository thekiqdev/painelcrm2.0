Quero que você faça um PLANO TÉCNICO DE INTEGRAÇÃO de um novo gateway de pagamento no sistema financeiro já existente.

IMPORTANTE:
- Não implementar nada ainda.
- Não refatorar a arquitetura atual sem necessidade.
- Considerar que o sistema já está em produção.
- Preservar compatibilidade total com o gateway atual (Asaas).
- Priorizar arquitetura segura, escalável e incremental.
- Evitar mudanças que quebrem webhook, billing, cobrança ou reconciliação já existentes.

CONTEXTO DO SISTEMA

O sistema já possui arquitetura multi-gateway implantada.

Estrutura existente:
- customer_invoices
- tenant_billing
- payment_events

Campos já existentes:
- gateway
- gateway_reference_id
- gateway_metadata
- gateway_status
- idempotency_key

A arquitetura atual já possui:
- gatewayRegistry
- gatewayResolver
- PaymentGateway interface
- webhook em 3 camadas:
  - gatewayParser
  - webhookCore
  - paymentDomainService
- idempotência via payment_events
- normalização de status
- anti-regressão de status
- status interno alinhado ao banco

Status internos disponíveis:
- pending
- waiting_payment
- processing
- paid
- overdue
- cancelled
- failed
- refunded

GATEWAY A SER ANALISADO

Gateway alvo:
[NOME_DO_GATEWAY]

OBJETIVO

Quero que você analise como integrar esse gateway à arquitetura atual sem quebrar o que já funciona com Asaas.

A resposta deve focar em:
- impacto real
- pontos de compatibilidade
- mudanças mínimas necessárias
- plano seguro de implementação

ANÁLISE NECESSÁRIA

1) ADERÊNCIA DO GATEWAY
Mapear:
- como o gateway cria cobrança
- como identifica pagamento/cobrança
- quais status externos existem
- como funciona webhook
- como funciona idempotência
- se há customer/payment intent/charge/preference/etc.
- quais dados devem virar:
  - gateway_reference_id
  - gateway_status
  - gateway_metadata

2) IMPACTO NA ARQUITETURA ATUAL
Confirmar se a arquitetura existente já suporta esse gateway com pequenas extensões ou se existe algum ponto de atenção.

Validar especialmente:
- PaymentGateway interface
- gatewayRegistry
- gatewayResolver
- parser de webhook
- normalizeGatewayStatus
- paymentDomainService
- criação de cobrança
- consulta de status
- reconciliação

3) COMPATIBILIDADE COM PRODUÇÃO
Responder:
- o que pode ser aproveitado sem alteração
- o que precisa ser implementado
- o que NÃO deve ser alterado
- quais riscos existem ao introduzir esse gateway sem quebrar o Asaas

4) PLANO MÍNIMO DE IMPLEMENTAÇÃO
Montar um plano por etapas contendo:
- etapa 1: adapter/service do gateway
- etapa 2: registro no registry
- etapa 3: parser de webhook
- etapa 4: normalização de status
- etapa 5: rota de webhook
- etapa 6: testes e validação
- etapa 7: rollout seguro

5) MAPA DE STATUS
Quero uma tabela clara com:

status externo do gateway → status interno do sistema

Usar apenas estes status internos:
- pending
- waiting_payment
- processing
- paid
- overdue
- cancelled
- failed
- refunded

6) RISCOS E CUIDADOS
Explicar:
- riscos de idempotência
- riscos de regressão de status
- riscos de divergência entre webhook e polling
- riscos de usar identificador errado como gateway_reference_id
- riscos de incompatibilidade com cobrança já existente

FORMATO OBRIGATÓRIO DA RESPOSTA

# Plano Técnico de Integração — [NOME_DO_GATEWAY]

## 1) Visão geral do gateway
## 2) Aderência à arquitetura atual
## 3) Impacto no sistema existente
## 4) Mapeamento de status
## 5) Plano mínimo de implementação
## 6) Riscos e cuidados
## 7) Recomendação final

REGRAS
- Não implementar ainda.
- Não sugerir refatoração ampla sem necessidade.
- Não mexer no que já está estável sem justificativa técnica forte.
- Sempre priorizar compatibilidade com produção.