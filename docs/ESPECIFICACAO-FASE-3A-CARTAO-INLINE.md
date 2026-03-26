# Especificação Técnica — Fase 3A Cartão Inline

**Versão:** 1.0 (somente especificação — **sem** código, **sem** novo endpoint implementado).  
**Base:** `docs/PLANO-CARTAO-INLINE-FATURA.md`.  
**Escopo Fase 3A:** fechar desenho executável (contrato, regras, estados, segurança, escopo seguinte).

---

## 1. Objetivo

Documentar de forma **única e implementável** como será o fluxo **cartão digitado na página pública da fatura**, com:

- **Desenho de integração** escolhido (A ou B) e justificativa.
- **Contrato HTTP** do futuro endpoint público (método, rota, payloads, erros, idempotência).
- **Regras de backend** (tentativa ativa, bloqueios, Asaas, `remoteIp`, timeout, falha parcial, anti-duplicidade).
- **Matriz de estados** (tentativa + fatura + papel do webhook).
- **Regras de segurança** objetivas (log, persistência, validações front vs back).
- **Riscos** e **escopo** das fases 3B / 3C e exclusões explícitas.

**Fora do escopo da Fase 3A:** implementação, alteração de webhook, `payment_events`, refator multi-gateway, ou qualquer commit de código.

---

## 2. Desenho escolhido

### 2.1 Comparação

| Critério | **Desenho A** — Tentativa já criada + `payWithCreditCard` | **Desenho B** — Criação + captura no mesmo submit (`POST /v3/payments` com cartão) |
|----------|------------------------------------------------------------|-------------------------------------------------------------------------------------|
| Alinhamento com **hoje** | `switch-method` já cria cobrança e `customer_invoice_payment_attempts` com `gateway_reference_id`. | Exige **não** criar cobrança no switch para cartão (ou cancelar/reconciliar), ou criar tentativa **só após** submit — maior mudança no fluxo atual. |
| **Idempotência** | Submit amarra ao **mesmo** `paymentId` Asaas; reenvio com mesma chave pode short-circuit ou consultar status. | Uma única operação atômica no gateway; duplicidade se o cliente repetir submit sem chave forte — exige contrato de idempotência **por fatura + chave cliente** muito rigoroso. |
| **Duplicidade no Asaas** | Menor risco de “duas cobranças” por double-click se o backend sempre usa **pay** sobre id existente. | Risco maior se o primeiro request completar com timeout HTTP e o cliente repetir. |
| **Complexidade 3C** | Cliente HTTP + `payWithCreditCard` + validação de estado da cobrança. | Mapper de `POST /v3/payments` completo + reordenação de quando grava tentativa. |

### 2.2 Recomendação final

**Adotar primeiro o Desenho A** (tentativa ativa com cobrança `CREDIT_CARD` já criada no Asaas + **`POST /v3/payments/{id}/payWithCreditCard`** no submit).

**Por quê:**

1. **Compatibilidade com produção:** preserva o modelo já usado — ao selecionar Cartão, o sistema continua tendo **uma tentativa ativa** e um **`gateway_reference_id`** antes do usuário preencher o cartão (como hoje para `invoiceUrl`).
2. **Menor mudança estrutural:** não exige reescrever `switchPaymentMethodByToken` para “cartão sem cobrança até o submit”; apenas acrescenta o passo de **captura** via API no novo endpoint.
3. **Anti-duplicidade:** o segundo clique ou retry deve operar sobre o **mesmo** ID de pagamento no Asaas, facilitando política de idempotência e reconciliação.
4. **Multi-gateway:** o contrato público pode permanecer genérico (“capturar pagamento da tentativa ativa com dados de cartão”); só o adaptador Asaas implementa `payWithCreditCard`.

**Pré-condição de implementação (Fase 3C):** validar no **sandbox Asaas** que uma cobrança criada com `billingType` cartão **sem** dados de cartão no `POST` inicial permanece em estado **pagável** e aceita **`payWithCreditCard`** com o `id` retornado.  
**Se** o sandbox indicar que a criação atual exige fluxo diferente, a implementação **pivota para o Desenho B** mantendo **o mesmo contrato HTTP** descrito na §3 (o backend passa a orquestrar um único `POST /v3/payments` com cartão em vez de `payWithCreditCard`), sem reabrir a especificação do payload público.

**Desenho B** fica como **plano B técnico** explícito, não como escolha paralela no mesmo produto na v1.

---

## 3. Contrato do endpoint

> **Nota:** nomes de rota e códigos de erro são a especificação alvo; a implementação deve espelhar isto salvo ajuste mínimo de roteamento.

### 3.1 Visão geral

| Item | Valor |
|------|--------|
| **Método** | `POST` |
| **Rota** | `/api/public/customer-invoices/pay/:token/pay-with-card` |
| **Autenticação** | O segmento `:token` é o segredo compartilhado do link público (mesmo modelo do `GET` e do `switch-method`). |
| **Content-Type** | `application/json` |
| **TLS** | Obrigatório (HTTPS) em qualquer ambiente que aceite o payload. |

`:token` = token opaco já utilizado nas rotas existentes (`/api/public/customer-invoices/pay/:token`).

### 3.2 Payload de entrada (JSON)

Campos alinhados semanticamente ao Asaas; o backend valida e mapeia para o cliente gateway.

**Obrigatórios (MVP crédito à vista, 1x):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `idempotency_key` | `string` | Chave única por tentativa de submissão lógica (ex.: UUID). Reutilizar a mesma chave em retry de rede deve retornar a **mesma** resposta de negócio quando possível. |
| `credit_card` | `object` | Ver tabela abaixo. |
| `cardholder` | `object` | Dados do portador / endereço exigidos pelo Asaas (`creditCardHolderInfo`). |

**`credit_card` (obrigatórios no front para submeter):**

| Campo | Tipo | Notas |
|-------|------|--------|
| `holder_name` | `string` | Nome impresso no cartão. |
| `number` | `string` | Apenas dígitos ou com máscara — backend normaliza para dígitos. |
| `expiry_month` | `string` | Dois dígitos (ex.: `"05"`). |
| `expiry_year` | `string` | Quatro dígitos (ex.: `"2026"`). |
| `cvv` | `string` | Código de segurança; nunca persistir. |

**`cardholder` (obrigatórios — podem ser pré-preenchidos a partir do cliente da fatura quando disponível):**

| Campo | Tipo |
|-------|------|
| `name` | `string` |
| `email` | `string` |
| `cpf_cnpj` | `string` (somente dígitos no backend) |
| `postal_code` | `string` |
| `address_number` | `string` |
| `phone` | `string` |
| `address_complement` | `string \| null` (opcional) |
| `mobile_phone` | `string \| null` (opcional) |

**Parcelamento (`installment_count` > 1):** **fora do escopo v1** da especificação pública (ver §8). Se enviado, o backend pode rejeitar com `400` até haver produto.

**O cliente não envia `remoteIp`:** obtido exclusivamente no servidor (§4.4).

### 3.3 Resposta de sucesso (`200 OK`)

Corpo JSON mínimo (valores exemplificativos):

```json
{
  "ok": true,
  "invoice_status": "paid",
  "attempt": {
    "id": "<uuid>",
    "payment_method": "CREDIT_CARD",
    "status": "paid",
    "gateway_status": "CONFIRMED",
    "gateway_reference_id": "pay_xxx"
  },
  "payment_options_summary": "pix_and_hosted"
}
```

- `invoice_status` e `attempt.status` refletem o **estado interno** já usado na API pública após normalização (nomes exatos devem coincidir com `getPayByToken` / enums atuais).
- `gateway_status` = string bruta ou normalizada conforme padrão já exposto hoje.
- Incluir apenas dados **não sensíveis**. Nunca retornar PAN/CVV.

Se o Asaas retornar sucesso mas a fatura ainda estiver **processando** internamente, usar estados coerentes com a matriz (§5) e documentar no código na 3C.

### 3.4 Respostas de erro

| HTTP | Código interno (campo opcional `code`) | Quando |
|------|------------------------------------------|--------|
| `400` | `validation_error` | JSON inválido, campo obrigatório ausente, formato de cartão inválido (backend). |
| `400` | `invalid_card` | Gateway recusou dados (genérico ao usuário; detalhe não expor PAN). |
| `403` | `forbidden` | Token inválido ou fatura não permite pagamento. |
| `404` | `not_found` | Fatura/token inexistente. |
| `409` | `conflict` | Tentativa não é cartão ativa, fatura já paga, método não permitido, ou idempotência conflitante. |
| `422` | `unprocessable` | Estado da cobrança no Asaas não permite captura (ex.: já liquidada). |
| `429` | `rate_limited` | Limite por IP ou por token. |
| `502` | `gateway_error` | Resposta inválida ou erro não classificado do Asaas. |
| `504` | `gateway_timeout` | Timeout na chamada ao Asaas (§4.5). |

Corpo sugerido:

```json
{
  "ok": false,
  "error": "Mensagem segura para o usuário",
  "code": "validation_error"
}
```

Mensagens **não** devem conter dados de cartão nem detalhes internos do gateway em produção.

### 3.5 Idempotência

1. **Chave primária lógica:** par (`token`, `idempotency_key`) armazenado de forma **efêmera ou em tabela dedicada** (hash do resultado), **sem** armazenar dados sensíveis.
2. **Comportamento:** segundo `POST` idêntico (mesmo token + mesma `idempotency_key`) enquanto a operação já **completou** com sucesso → retornar **200** com o mesmo corpo de sucesso (ou consultar status no Asaas e reconciliar).
3. **Mesma chave, operação ainda em voo:** retornar `409` ou `429` conforme política escolhida na implementação (documentar uma opção única na 3C).
4. **Mesma chave após falha:** permitir novo submit apenas se a política de negócio permitir nova tentativa de captura no **mesmo** `gateway_reference_id` (caso recusa de cartão); se não, exigir nova `idempotency_key` — detalhar na 3C conforme resposta Asaas.

---

## 4. Regras de backend

### 4.1 Localizar a tentativa ativa

1. Resolver `token` → `customer_invoice` (como no fluxo atual).
2. Garantir: `client_id` presente, status da fatura **pagável**, método **Cartão** permitido no metadata.
3. Carregar **`customer_invoice_payment_attempts`** onde `is_active = true` e `payment_method = 'CREDIT_CARD'` para essa fatura.
4. Se não houver tentativa ativa de cartão → **`409`** (cliente deve chamar `switch-method` para Cartão primeiro).
5. Obter `gateway_reference_id` = ID do pagamento no Asaas para essa tentativa.

### 4.2 Quando bloquear o submit

- Token inválido / fatura não encontrada → `404`.
- Fatura já **paga** → `409`.
- Status da fatura não pagável → `409`.
- Tentativa ativa não é `CREDIT_CARD` ou não existe → `409`.
- Validação de payload → `400`.
- Rate limit → `429`.

### 4.3 Quando chamar o Asaas

Somente após todas as validações acima e **imediatamente** antes de atualizar estado local: uma chamada **`payWithCreditCard`** (Desenho A) para o `gateway_reference_id` da tentativa ativa, com corpo mapeado do payload + `remoteIp`.

Se no futuro o **Desenho B** for necessário, a mesma rota pública chama `POST /v3/payments` com captura única, mantendo as mesmas validações de fatura.

### 4.4 Montagem de `remoteIp`

1. Usar **primeiro IP de cliente** de cabeçalhos confiáveis na ordem: `CF-Connecting-IP` (se Cloudflare), `True-Client-IP`, `X-Real-IP`, **primeiro** hop de `X-Forwarded-For` **apenas se** a infraestrutura for confiável (proxy reverso conhecido).
2. **Não** aceitar IP enviado no JSON do cliente como fonte única (fraude).
3. Se impossível determinar IP, usar regra documentada na 3C (rejeitar `400` ou valor fallback explícito **apenas** se o Asaas permitir — validar na integração).

### 4.5 Timeout

- Cliente HTTP ao Asaas: **mínimo 60s** de timeout de leitura (alinhado à documentação Asaas para cartão).
- Resposta HTTP ao cliente público: pode ser ligeiramente superior ao timeout interno para evitar cortes duplicados; em caso de timeout → **`504`** + mensagem genérica; **webhook** e **reconciliação** assumem a verdade final (§5).

### 4.6 Falha parcial

- **Timeout ou erro de rede** após o Asaas possivelmente ter capturado: não marcar pagamento como falho definitivo no cliente sem consultar `getPayment` no Asaas (na 3C) ou confiar no webhook.
- **Resposta 4xx do Asaas** com corpo de recusa: atualizar tentativa/fatura para estado **recusado** conforme normalização existente; não criar segunda cobrança.

### 4.7 Evitar duplicidade

1. Um **único** `gateway_reference_id` por tentativa ativa de cartão.
2. `payWithCreditCard` **idempotente** no sentido de negócio: se o pagamento já estiver confirmado, o Asaas deve retornar estado final — o backend alinha DB sem segunda captura.
3. **Idempotency-Key** de cliente (§3.5) para evitar duplo submit do mesmo browser.
4. **Não** criar nova cobrança no submit no Desenho A.

---

## 5. Matriz de estados

| Momento | `customer_invoice` (agregado) | Tentativa ativa `CREDIT_CARD` | Asaas (referência) | Polling UI |
|---------|-------------------------------|-------------------------------|---------------------|------------|
| **Antes do submit** | `pending` / `waiting_payment` / `overdue` (conforme regra atual) | `is_active=true`, `gateway_reference_id` definido, status **aguardando pagamento** | Cobrança criada, **não** capturada | Mostra formulário |
| **Após submit sucesso síncrono** | Transição para **pago** ou **processando** conforme normalização já usada | `status` **pago** / confirmado, `gateway_status` atualizado | Pagamento confirmado / em processamento | Pode parar ou continuar até `paid` estável |
| **Tentativa recusada** | Permanece pagável se produto permitir nova tentativa | `gateway_status` recusado; **não** apagar linha; pode haver nova tentativa por regra de produto | Recusa | Mensagem + nova tentativa ou troca de método |
| **Tentativa pendente** (timeout HTTP) | **Não** forçar `paid` | Manter pendente até webhook ou consulta | Incerto | Continuar polling; mensagem “processando” |
| **Invoice consolidada** | `paid` quando regra de negócio + webhook / conciliação | Tentativa correspondente como sucesso | `CONFIRMED` / equivalente | Tela de sucesso |
| **Webhook depois do submit** | **Fonte de verdade** para divergência síncrona | Atualiza se síncrono estiver defasado | Evento do provedor | Alinha UI no próximo GET |

**Papel do webhook:** continua obrigatório para **confirmar** e **corrigir** estado; o retorno síncrono do `payWithCreditCard` é **otimização de UX**, não substitui o pipeline já existente de webhook / normalização.

---

## 6. Regras de segurança

### 6.1 Logs

| Permitido | Proibido |
|-----------|----------|
| `invoice_id`, `attempt_id`, `gateway_reference_id` (IDs) | PAN, CVV, trilha magnética, corpo JSON bruto do submit |
| Código de erro **genérico** do gateway | Mensagens que vazem dados reais do cartão |
| Duração da chamada ao Asaas | `console.log(req.body)` em qualquer ambiente |

### 6.2 Persistência

| Permitido | Proibido |
|-----------|----------|
| Últimos 4 dígitos / bandeira **se** retornados pelo Asaas e já previstos no modelo | PAN, CVV em colunas, JSONB, logs de aplicação, backups não criptografados de payload |
| Flags não sensíveis em `gateway_metadata` (ex.: `capture_channel: 'inline'`) | Armazenar `idempotency_key` junto com dados de cartão |

### 6.3 Validações — frontend (mínimo)

- Presença visual de campos obrigatórios (não submeter vazio).
- Formato superficial: email, quantidade de dígitos do CPF/CNPJ, CEP, mês/ano.
- Opcional: algoritmo de Luhn no número do cartão **apenas** para UX (não bloquear edge cases que o backend/gateway aceitem).

### 6.4 Validações — apenas backend

- Token válido e autorização de contexto (fatura + tenant).
- Estado da fatura e da tentativa.
- Normalização de dígitos, limites de tamanho, enum de método.
- **Decisão final** de aceitar ou recusar antes do Asaas e interpretação **completa** da resposta do Asaas.
- Rate limiting e idempotência.

---

## 7. Riscos

| Risco | Mitigação especificada |
|-------|-------------------------|
| Desenho A inviável no sandbox (cobrança não aceita `payWithCreditCard` no estado atual) | Pré-validação na 3C; pivot para Desenho B **sem** mudar contrato público §3. |
| Escopo PCI / SAQ com tráfego pelo backend | Parecer formal antes de produção; monitoração e acesso restrito a logs. |
| Dupla cobrança por retry | Idempotência §3.5 + uma cobrança por tentativa ativa §4.7. |
| Divergência síncrono vs webhook | Matriz §5; polling + webhook como correção. |
| `remoteIp` incorreto | §4.4 + testes atrás do proxy de produção. |
| v1 sem parcelas | Escopo explícito §8 — evitar payload ambíguo. |

---

## 8. Escopo da próxima implementação

### 8.1 Fase 3B (frontend)

- Formulário na coluna direita (método Cartão), máscaras, mensagens de segurança.
- Chamada `POST` ao contrato §3; tratamento de erros §3.4.
- Desativação de duplo submit; geração de `idempotency_key` por submissão.
- **Remoção** do iframe como fluxo principal de cartão (substituição pela UI do formulário).
- **Não** incluir: parcelamento, salvar cartão, tokenização de longo prazo.

### 8.2 Fase 3C (backend + Asaas)

- Rota §3, validações §4, integração **Asaas** `payWithCreditCard` (ou pivot B).
- Cliente HTTP com timeout §4.5; mapeamento de erros; testes sandbox.
- Opcional: após submit, `getPayment` para conciliar em caso de dúvida (sem mudar webhook).
- Ajustes **mínimos** em `switch-method` / metadata se necessário para não depender de `invoiceUrl` na UX (sem quebrar multi-gateway).

### 8.3 Explicitamente fora (até nova fase)

- Alteração de esquema de webhook ou de `payment_events` **salvo** eventuais novos códigos de auditoria acordados.
- Refatoração ampla multi-gateway além do adaptador Asaas.
- Tokenização recorrente / “salvar cartão” para próximas faturas.
- Débito online via API (limitação documentada Asaas — usar outro fluxo).
- Parcelamento na fatura pública.

---

## 9. Recomendação final

1. **Congelar** o **Desenho A** como referência de implementação: **tentativa ativa + `payWithCreditCard`**, com **pré-checagem** obrigatória no sandbox na Fase 3C.
2. **Congelar** o contrato **`POST /api/public/customer-invoices/pay/:token/pay-with-card`** conforme §3, com idempotência §3.5 e erros §3.4.
3. Tratar **webhook + polling** como **continuidade** da verdade de negócio; resposta síncrona apenas para UX rápida.
4. Executar **3B** (UI + chamada) e **3C** (rota + gateway) em sequência após **go** de compliance; **não** antecipar tokenização ou parcelas.

Este documento é a **especificação executável da Fase 3A**; desvios devem atualizar este arquivo antes do merge.
