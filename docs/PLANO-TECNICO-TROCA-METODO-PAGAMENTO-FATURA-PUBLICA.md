# Plano Técnico — Troca de Método de Pagamento na Fatura

## 1. Objetivo

Permitir que o cliente troque o método de pagamento na tela pública da fatura (`/pay/:token`) sem quebrar a arquitetura atual de faturamento, preservando:

- `customer_invoices` como entidade principal da fatura;
- fluxo de webhook atual;
- idempotência e trilha de eventos em `payment_events`;
- compatibilidade com Asaas em ambiente de produção.

O objetivo é evoluir UX e conversão, mantendo rastreabilidade completa de cada tentativa de pagamento por fatura.

## 2. Regra de UX

Diretrizes obrigatórias da tela pública:

- layout em duas colunas:
  - esquerda: lista de métodos disponíveis;
  - direita: conteúdo do método selecionado;
- `PIX` deve ser o padrão inicial sempre que disponível;
- se `PIX` não estiver disponível, usar fallback determinístico entre métodos permitidos;
- ao trocar método na coluna esquerda, a coluna direita atualiza o conteúdo do método ativo;
- renderização por método:
  - PIX: QR Code + código copia e cola + botão copiar;
  - boleto: linha digitável (quando disponível) + botão PDF;
  - cartão: redirecionamento seguro para checkout/`invoiceUrl` do Asaas.

Ordem sugerida de fallback inicial: `PIX` -> `BOLETO` -> `CREDIT_CARD`.

## 3. Melhor modelagem recomendada

### Recomendação: nova entidade de tentativas de pagamento por fatura

**Não sobrescrever** `gateway_reference_id` em `customer_invoices`.

Criar tabela dedicada (exemplo: `customer_invoice_payment_attempts`) para registrar cada tentativa/método:

- `id` (uuid)
- `invoice_id` (fk para `customer_invoices`)
- `tenant_id`
- `gateway` (ex.: `asaas`)
- `payment_method` (`PIX` | `BOLETO` | `CREDIT_CARD`)
- `gateway_reference_id` (ID da cobrança no gateway)
- `gateway_status` (status bruto)
- `status` (normalizado interno)
- `gateway_metadata` (urls, pix payload, linha digitável, etc.)
- `idempotency_key`
- `is_active` (tentativa atualmente exibida/monitorada)
- `created_at`, `updated_at`
- `paid_at` (quando aplicável)

### Por que essa modelagem é melhor

- preserva histórico completo de trocas sem perder trilha;
- evita destruir referência da primeira cobrança;
- simplifica auditoria e suporte;
- mantém `customer_invoices` estável como agregador de estado;
- permite webhook resolver tentativa correta por `gateway_reference_id` sem ambiguidade.

## 4. Impacto na arquitetura atual

Impacto **incremental** e compatível:

- `customer_invoices` continua como fonte principal de exibição/estado da fatura;
- webhook continua no pipeline atual (`webhook` -> `payment_events` -> normalização);
- mudança principal: webhook passa a localizar tentativa primeiro e refletir status na fatura agregada;
- polling público pode consultar tentativa ativa (e, opcionalmente, fallback sob demanda no gateway, como já adotado);
- sem refatorar arquitetura multi-gateway; apenas extensão do domínio de cobrança da fatura.

Compatibilidade retroativa:

- faturas antigas (sem tentativas) continuam funcionando via campos atuais em `customer_invoices`;
- rollout com feature flag permite convivência de ambos os modelos no período de transição.

## 5. Fluxo por método de pagamento

### 5.1 Seleção inicial da tela

1. Backend retorna métodos permitidos (com fallback para todos quando não definido).
2. Front seleciona método inicial:
   - se `PIX` disponível -> seleciona `PIX`;
   - caso contrário -> primeiro método da ordem de fallback.
3. Front renderiza conteúdo da tentativa ativa desse método.

### 5.2 Troca para PIX

1. Cliente clica `PIX` na coluna esquerda.
2. Backend verifica se já existe tentativa ativa reutilizável para PIX.
3. Se não existir, cria nova cobrança PIX no Asaas.
4. Persiste tentativa com payload PIX (`pixQrCode`, `pixCopyPaste`).
5. Coluna direita renderiza QR + copia e cola.

### 5.3 Troca para boleto

1. Cliente clica `Boleto`.
2. Backend reutiliza ou cria tentativa BOLETO.
3. Persiste `bankSlipUrl` e, se disponível no gateway, linha digitável.
4. Coluna direita exibe botão PDF e dados de pagamento.

### 5.4 Troca para cartão

1. Cliente clica `Cartão`.
2. Backend reutiliza ou cria tentativa para checkout.
3. Coluna direita exibe CTA para abrir `invoiceUrl`/checkout seguro do Asaas.
4. Sem captura local de cartão (manter compliance do provedor).

### 5.5 Webhook e consolidação

1. Webhook recebe evento com `gateway_reference_id`.
2. Atualiza tentativa correspondente.
3. Se tentativa ficar `paid`, consolidar `customer_invoices.status = paid` e `paid_at`.
4. Marcar tentativas não pagas anteriores como inativas/encerradas (sem apagar histórico).

### 5.6 Polling público

1. Polling consulta endpoint público da fatura (e tentativa ativa).
2. Se `paid`, interrompe polling.
3. Botão "Atualizar status" força mesma verificação do endpoint.

## 6. Riscos e cuidados

- **Cobrança duplicada no gateway:** trocar método pode criar múltiplas cobranças válidas.
  - Mitigação: regra de reuso por método + janela de validade + controle de tentativa ativa.
- **Conflito webhook entre tentativas:** pagamento de tentativa antiga após nova troca.
  - Mitigação: consolidar por `invoice_id` e tratar primeira confirmação de pagamento como final.
- **Regressão de status:** evento tardio sobrescrevendo estado pago.
  - Mitigação: manter regra anti-regressão (`normalizeGatewayStatus` + transições válidas).
- **Experiência inconsistente na UI:** método selecionado sem payload pronto.
  - Mitigação: estado "preparando pagamento" por método e fallback visual claro.
- **Risco operacional em produção:** alteração de persistência crítica.
  - Mitigação: rollout por fases, feature flag e métricas.

## 7. Plano de implementação em fases

### Fase 0 — Preparação e segurança

- definir feature flag por tenant/ambiente;
- definir contrato de API para tentativas por método;
- criar métricas e logs de troca de método.

### Fase 1 — Dados e backend base

- criar tabela de tentativas (`customer_invoice_payment_attempts`);
- implementar serviço de criação/reuso de tentativa por método;
- manter fallback para modelo antigo.

### Fase 2 — Webhook + consolidação

- ajustar lookup por tentativa (`gateway_reference_id`);
- atualizar tentativa e refletir em `customer_invoices`;
- garantir idempotência e anti-regressão.

### Fase 3 — API pública e polling

- expor métodos disponíveis + tentativa ativa + conteúdo por método;
- endpoint de troca de método seguro;
- manter endpoint atual compatível durante transição.

### Fase 4 — UI pública em duas colunas

- coluna esquerda: seleção de métodos;
- coluna direita: conteúdo do método ativo;
- padrão inicial em PIX com fallback determinístico.

### Fase 5 — Rollout gradual

- habilitar para sandbox e tenants piloto;
- observar métricas de conversão/erro/webhook;
- expandir progressivamente.

### Fase 6 — Consolidação pós-rollout

- revisar dados legados;
- opcionalmente descontinuar caminhos antigos após estabilidade comprovada.

## 8. Recomendação final

Recomenda-se evoluir com **entidade de tentativas por fatura** (sem sobrescrever `gateway_reference_id` em `customer_invoices`), pois essa estratégia oferece melhor rastreabilidade, menor risco operacional e maior aderência ao ambiente de produção.

Com isso, é possível entregar a UX desejada (PIX padrão + troca de método em duas colunas) preservando a arquitetura atual, compatibilidade com Asaas e integridade do fluxo webhook/eventos.

Também é recomendado manter estritamente o princípio: **cartão sempre via checkout/tokenização do gateway**, sem captura local de cartão sem estudo formal de compliance.
