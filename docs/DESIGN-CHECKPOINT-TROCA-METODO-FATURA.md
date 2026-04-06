# Design Checkpoint — Troca de Método de Pagamento na Fatura

## 1. Objetivo

Definir, antes de implementação, os contratos e regras para permitir troca de método de pagamento na fatura pública sem quebrar a arquitetura atual.

Este checkpoint deve garantir:

- preservação de `customer_invoices` como agregado principal de estado da fatura;
- preservação da arquitetura multi-gateway (`gatewayResolver` / `gatewayRegistry`);
- compatibilidade com webhook atual, `payment_events` e normalização de status;
- rollout seguro em produção com feature flag e tenant piloto.

## 2. Contrato de domínio

### 2.1 `customer_invoices` (agregado principal)

`customer_invoices` continua sendo a entidade de negócio da fatura, responsável por:

- identidade da fatura (`id`, `invoice_number`, `payment_token`);
- estado consolidado da cobrança (`status`, `paid_at`);
- vínculo com cliente/tenant/cobrança (`client_id`, `tenant_id`, `charge_id`);
- visão resumida do método efetivo (`payment_method`) e dados de gateway para compatibilidade.

Regra: mesmo com múltiplas tentativas, a fatura mantém **um estado final consolidado**.

### 2.2 Tentativa de pagamento

Tentativa de pagamento é uma cobrança concreta criada no gateway para uma invoice e um método específico.

Características:

- pertence a uma única invoice;
- possui `gateway_reference_id` próprio;
- possui método (`PIX`, `BOLETO`, `CREDIT_CARD`);
- possui status interno + status bruto do gateway;
- guarda payload de exibição (QR, copia e cola, boleto, checkout URL);
- é auditável e histórica.

### 2.3 Tentativa ativa

Tentativa ativa é a tentativa atualmente selecionada para exibição e monitoramento na tela pública.

Regra:

- no máximo 1 tentativa ativa por invoice;
- troca de método move a atividade para outra tentativa (reuso ou nova criação);
- tentativas antigas permanecem no histórico (ativas ou encerradas conforme política operacional).

### 2.4 Consolidação do estado final da invoice

`customer_invoices.status` é derivado da consolidação das tentativas + regras de domínio:

- primeira tentativa que atingir `paid` consolida a invoice como `paid`;
- após consolidação em `paid`, não permitir regressão;
- eventos tardios de tentativas antigas não podem reabrir invoice paga.

## 3. Contrato de API

> Não implementar agora. Contrato alvo para implementação futura.

### 3.1 Listar contexto de pagamento da fatura

`GET /api/public/customer-invoices/pay/:token`

Resposta (extensão do contrato atual):

- dados da invoice;
- `allowed_payment_methods`;
- `active_attempt` (resumo);
- `attempts_summary` (opcional: ids/status por método para UX);
- `payment_payload` do método ativo (`pix`, `boleto`, `checkout`).

Exemplo lógico:

```json
{
  "invoice": { "id": "...", "status": "pending", "amount_cents": 1000 },
  "allowed_payment_methods": ["PIX", "BOLETO", "CREDIT_CARD"],
  "active_attempt": {
    "id": "...",
    "payment_method": "PIX",
    "status": "pending"
  },
  "payment_payload": {
    "pixQrCode": "data:image/png;base64,...",
    "pixCopyPaste": "000201..."
  }
}
```

### 3.2 Trocar método de pagamento

`POST /api/public/customer-invoices/pay/:token/switch-method`

Request:

```json
{
  "payment_method": "BOLETO",
  "idempotency_key": "client-generated-or-session-key"
}
```

Resposta:

- tentativa ativa resultante (reusada ou criada);
- payload do método selecionado;
- status consolidado da invoice.

### 3.3 Consultar payload do método selecionado

Opção A (preferencial): já retornar no `switch-method` e no `GET`.

Opção B (se necessário): `GET /api/public/customer-invoices/pay/:token/method/:paymentMethod`

### 3.4 Comportamento idempotente

- Trocas repetidas para o mesmo método com a mesma chave devem retornar a mesma tentativa ativa.
- Requisições concorrentes não devem criar tentativas duplicadas indevidas.
- Idempotência deve considerar `invoice_id + payment_method + contexto de sessão/chave`.

## 4. Regras de negócio

### 4.1 Reutilizar tentativa existente

Reutilizar tentativa se:

- método coincide;
- tentativa está em estado reutilizável (`pending`, `waiting_payment`, `processing`, e não expirada);
- payload ainda válido para exibição/pagamento.

### 4.2 Criar nova tentativa

Criar nova tentativa se:

- não existir tentativa reutilizável para o método;
- tentativa anterior estiver encerrada (`cancelled`, `failed`, `refunded`, expirada);
- política operacional exigir nova cobrança por validade.

### 4.3 Desativar tentativa anterior

Ao trocar método:

- tentativa nova/reusada vira `ativa`;
- tentativa anteriormente ativa vira `inativa` (histórica).

### 4.4 Tentativa antiga paga depois

Se tentativa antiga for paga após troca:

- se invoice ainda não paga: consolidar invoice como `paid`;
- se invoice já paga: registrar evento/atualização da tentativa, sem alterar estado final da invoice;
- manter trilha de auditoria.

### 4.5 Condição de invoice paga

- A primeira tentativa que confirmar `paid` encerra a invoice como `paid`.
- `paid_at` da invoice deve refletir a confirmação consolidada.

### 4.6 Evitar múltiplas cobranças ativas desnecessárias

- limite lógico de 1 tentativa ativa por invoice;
- preferir reuso antes de nova criação;
- ao criar nova, aplicar política de encerramento/cancelamento da anterior quando possível.

## 5. Regras de webhook e polling

### 5.1 Webhook: localização da tentativa

- Webhook deve localizar tentativa por `(gateway, gateway_reference_id)`.
- Atualizar status da tentativa primeiro.
- Depois consolidar em `customer_invoices` conforme regra de negócio.

### 5.2 Reflexo em `customer_invoices`

- atualização consolidada deve respeitar anti-regressão de status;
- `gateway_status` consolidado pode refletir tentativa ativa ou última transição relevante (regra a fixar na implementação).

### 5.3 Polling público

- polling consulta estado da invoice + tentativa ativa;
- se status consolidado for `paid`, polling para;
- botão “Atualizar status” usa a mesma regra.

### 5.4 Evitar regressão

- preservar `normalizeGatewayStatus` e `canTransition`;
- não permitir que evento tardio degrade `paid` para estado inferior.

## 6. Política operacional

### 6.1 Cancelamento/expiração de tentativas antigas

- quando gateway suportar cancelamento: solicitar cancelamento da tentativa substituída;
- quando não suportar: marcar internamente como inativa/encerrada e manter rastreio.

### 6.2 Feature flag por tenant

- habilitação progressiva por tenant;
- fallback para fluxo atual quando flag desativada.

### 6.3 Tenant piloto

- iniciar com 1-3 tenants monitorados;
- validar comportamento em cenários reais (PIX, boleto, cartão, troca múltipla).

### 6.4 Métricas mínimas

- taxa de troca de método por invoice;
- taxa de sucesso por método;
- tempo médio até pagamento após troca;
- divergência webhook vs polling;
- taxa de criação de tentativas por invoice (controle de duplicidade).

### 6.5 Logs mínimos

- criação/reuso/desativação de tentativa;
- troca de método solicitada e resultado;
- consolidação da invoice por tentativa;
- falhas de cancelamento no gateway;
- correlação por `invoice_id`, `attempt_id`, `gateway_reference_id`.

## 7. Estratégia de rollout

### Fase 1: schema + service base

- introduzir entidade de tentativas;
- serviço de reuso/criação de tentativa;
- sem mudança de UI.

### Fase 2: webhook/consolidação

- webhook atualiza tentativa;
- consolidar status em `customer_invoices`;
- manter idempotência em `payment_events`.

### Fase 3: API pública

- expor tentativa ativa e troca de método via endpoint público;
- manter compatibilidade com payload atual.

### Fase 4: UI pública

- duas colunas (métodos x conteúdo);
- PIX default quando disponível;
- fallback determinístico quando PIX indisponível.

### Fase 5: rollout piloto

- ativar por feature flag em tenant piloto;
- monitorar métricas/logs;
- expandir gradualmente.

## 8. Riscos e decisões pendentes

### Riscos

- geração excessiva de cobranças por troca repetida;
- pagamento de tentativa antiga após troca;
- ambiguidade na escolha do `gateway_status` consolidado da invoice;
- inconsistência transitória entre webhook e polling.

### Decisões pendentes antes de implementar

1. Política exata de reuso por método (janela de validade).
2. Política de cancelamento obrigatório vs melhor esforço por gateway.
3. Limite de tentativas por invoice em janela temporal.
4. Definição de qual tentativa alimenta campos legados de compatibilidade.
5. Contrato final de resposta pública para UI (campos mínimos e opcionais).
6. Estratégia de auditoria/compliance para cartão via checkout externo.

---

Checkpoint concluído para seguir à etapa de especificação técnica de implementação (sem código) com risco controlado.
