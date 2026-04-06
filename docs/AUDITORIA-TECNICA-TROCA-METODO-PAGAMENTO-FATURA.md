# Auditoria Técnica — Troca de Método de Pagamento na Fatura

## 1. Estado atual relevante

### Persistência principal

- `customer_invoices` hoje concentra:
  - identificação da cobrança no gateway: `gateway_reference_id`;
  - método efetivo: `payment_method`;
  - status interno: `status`, `paid_at`;
  - status bruto: `gateway_status`;
  - metadados de pagamento: `gateway_metadata` (já usado para `pixQrCode`, `pixCopyPaste`, `invoiceUrl`, `bankSlipUrl`, `allowed_payment_methods`);
  - idempotência de criação: `idempotency_key`.
- Existe índice único por `(gateway, gateway_reference_id)` em `customer_invoices`.
- Não existe tabela dedicada para múltiplas tentativas de pagamento por uma mesma fatura.

### Eventos e webhook

- `payment_events` é a trilha de idempotência e decisão do webhook (por `gateway + event_id`), com `reference_id` para localizar entidade.
- `payment_webhook_events` e `asaas_webhook_events` são focados em observabilidade/debug operacional.
- Webhook resolve entidade por `gateway_reference_id` (lookup em `tenant_billing` e depois `customer_invoices`).

### Backend de cobrança e consulta pública

- Criação de cobrança de fatura usa `createManualInvoice` / `completePaymentByToken` -> `gateway.createCharge` -> persiste em `customer_invoices` (campos gateway).
- Endpoint público `/api/public/customer-invoices/pay/:token` lê a fatura e payload de pagamento a partir de `gateway_metadata`.
- Já existe fallback de sincronização no GET público para refletir pagamento quando webhook atrasa/falha.

### Frontend público

- Tela `/pay/:token` já suporta render condicional de PIX/boleto/cartão com base em:
  - `payment_urls` (QR, copia e cola, links);
  - `allowed_payment_methods` (com fallback para todos quando ausente).
- Polling (5s) e botão manual de atualização já existem.
- Não existe ainda ação de “trocar método” persistindo nova cobrança.

## 2. O que já existe e pode ser reaproveitado

- **Modelo de gateway genérico** já pronto:
  - `gatewayResolver`, `gatewayRegistry`, `PaymentGateway` (multi-gateway).
- **Campos genéricos de pagamento** já existentes em `customer_invoices`:
  - permitem armazenar payload de métodos e metadados.
- **Controle de métodos permitidos** já introduzido:
  - `allowed_payment_methods` em `gateway_metadata` + retorno no endpoint público.
- **Pipeline de status robusto** já implantado:
  - webhook -> `payment_events` (idempotência) -> normalização (`normalizeGatewayStatus`) -> atualização de status.
- **Fluxo público com polling + refresh manual** já operacional.
- **Cliente do gateway por tenant/client** (`payment_customers`) já evita recriação desnecessária de customer no provedor.

Conclusão desta seção: existe base sólida para evolução incremental sem refatoração estrutural ampla.

## 3. Riscos de criar múltiplas cobranças por fatura

- **Risco de rastreabilidade** no modelo atual:
  - `customer_invoices` guarda apenas um `gateway_reference_id`; nova cobrança tende a sobrescrever referência anterior.
- **Risco de webhook ambíguo no histórico**:
  - eventos antigos continuam chegando, mas sem uma entidade de tentativa fica difícil distinguir cobrança “ativa” vs “antiga”.
- **Risco de concorrência de pagamento**:
  - cliente pode pagar tentativa antiga após trocar método; sem política clara, pode haver atualização inesperada.
- **Risco de perda de auditoria funcional**:
  - não há hoje trilha de negócio “tentativa de pagamento por método” (só eventos técnicos de webhook).
- **Risco operacional/financeiro**:
  - múltiplas cobranças ativas para mesma fatura sem estratégia de cancelamento/encerramento.

## 4. Impacto na arquitetura multi-gateway

- A arquitetura atual está pronta para múltiplos gateways em nível de abstração, mas o domínio de fatura ainda assume **uma referência principal por invoice**.
- O webhook e os serviços de status operam por `gateway_reference_id` único da entidade.
- Para suportar troca de método com múltiplas cobranças por fatura sem perda de consistência, é necessário modelar explicitamente o conceito de tentativa (ou equivalente).
- Ponto positivo: a camada de gateway (`createCharge/getPayment`) já é genérica e reaproveitável para tentativas.

## 5. Melhor modelagem recomendada

### Recomendação principal (após auditoria): entidade de tentativas por fatura

Criar entidade dedicada (ex.: `customer_invoice_payment_attempts`) é a opção mais segura para produção, porque:

- preserva `customer_invoices` como agregado estável (status final da fatura);
- evita sobrescrita destrutiva de referência de gateway;
- melhora auditoria por método/tempo;
- permite webhook atualizar tentativa e refletir no agregado com regra de consolidação;
- mantém compatibilidade com multi-gateway (tentativa pode registrar `gateway` específico).

### Observação importante

Essa recomendação **não parte de suposição**; ela deriva do estado real: hoje não há estrutura de tentativa e um único `gateway_reference_id` na invoice é insuficiente para múltiplas cobranças concorrentes com rastreabilidade.

## 6. Alternativas possíveis

### A) Sem tabela nova: sobrescrever em `customer_invoices`

- **Pró**: menor esforço inicial.
- **Contra**:
  - perde histórico de tentativas;
  - aumenta risco de conflito com webhooks tardios;
  - reduz capacidade de auditoria e suporte;
  - fragiliza evolução futura multi-gateway.
- **Conclusão**: viável apenas como solução temporária e de alto risco operacional.

### B) Histórico em JSON dentro de `gateway_metadata`

- **Pró**: evita migration imediata.
- **Contra**:
  - consulta e integridade fracas;
  - webhook e reconciliação ficam mais complexos;
  - pior observabilidade e manutenção.
- **Conclusão**: não recomendado para produção em fluxo crítico de pagamento.

### C) Entidade de tentativas + manter `customer_invoices` agregada (recomendada)

- **Pró**:
  - melhor rastreabilidade;
  - menor ambiguidade de webhook;
  - evolução segura da UX de troca;
  - alinhada à arquitetura multi-gateway.
- **Contra**: exige rollout em fases (schema + serviços + webhook + API pública).

## 7. Recomendação final

Evoluir com abordagem incremental e compatível:

1. manter `customer_invoices` como agregado de estado final;
2. introduzir conceito de tentativa por fatura (persistido);
3. adaptar webhook para atualizar tentativa e consolidar invoice;
4. expor na API pública método ativo + troca de método;
5. manter fallback atual de polling/refresh.

Essa é a forma mais segura de atender a UX de troca sem quebrar o que já está em produção.

## 8. Próximo passo mais seguro

Antes de qualquer implementação/migration, executar um **design checkpoint técnico curto** com artefatos de contrato:

1. definir contrato de API para:
   - listar métodos e tentativa ativa;
   - trocar método (idempotente);
   - retornar payload por método;
2. definir regras de consolidação:
   - primeira tentativa paga encerra fatura;
   - comportamento para tentativas antigas pagas tardiamente;
3. definir política operacional:
   - reuso vs criação de nova cobrança por método;
   - cancelamento/expiração de tentativas antigas quando possível no gateway;
4. definir rollout por feature flag (tenant piloto), com métricas:
   - taxa de troca de método,
   - taxa de erro por método,
   - divergência webhook x polling.

Com esse checkpoint aprovado, a implementação pode seguir com baixo risco e sem ruptura da arquitetura atual.
