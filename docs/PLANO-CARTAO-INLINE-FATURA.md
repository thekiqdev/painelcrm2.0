# Plano Técnico — Cartão Inline na Página da Fatura

**Status:** planejamento (sem implementação neste documento).  
**Relacionado:** `docs/INVESTIGACAO-CARTAO-FATURA-ASAAS.md`, decisão de produto de **não** depender do checkout hospedado (`invoiceUrl`) como experiência principal para cartão.

---

## 1. Objetivo

Definir uma **nova trilha técnica** em que o pagador **digita os dados do cartão diretamente na página pública da fatura** (coluna direita, método Cartão ativo), com:

- **Backend** como único ponto que chama a API do Asaas usando credenciais do tenant (chave **nunca** exposta ao browser).
- **Sem iframe** como solução principal para cartão.
- **Sem** alterar de forma desnecessária a arquitetura de faturas, tentativas, webhooks e multi-gateway — apenas **estendendo** contratos e fluxos onde for inevitável.
- **Segurança, rastreabilidade e compatibilidade com produção** como critérios de aceite do desenho.

O `invoiceUrl` deixa de ser o eixo da UX de cartão; pode permanecer como dado opcional do gateway para outros cenários ou fallback documentado, **sem** assumir que o fluxo atual de “criar cobrança + abrir fatura hospedada” é suficiente para o novo requisito.

---

## 2. Estado atual que deve ser preservado

| Área | O que preservar |
|------|-----------------|
| **`customer_invoices`** | Modelo de fatura, vínculo com cliente, valores, status agregado; evolução só via regras já usadas (gateway_metadata, status após pagamento). |
| **`customer_invoice_payment_attempts`** | Uma linha por tentativa de cobrança no gateway, com `gateway_reference_id`, `gateway_status`, `gateway_metadata`, `idempotency_key`, `is_active`, política de reuso/supersedência já acordada. |
| **Webhook** | Continua sendo fonte de verdade para confirmação/cancelamento no provedor; **não** duplicar lógica de negócio crítica só no retorno síncrono da API de cartão. |
| **`payment_events`** | Continuidade do registro de eventos já existente; novos eventos só se o desenho atual exigir (avaliar na Fase 3A). |
| **Multi-gateway** | Interface `createCharge` / futuros métodos específicos por gateway; implementação Asaas isolada em módulo gateway, sem hardcode de Asaas na rota pública genérica. |
| **Polling atual** | A página pública continua podendo consultar status periodicamente até `paid` (ou estado terminal definido). |

---

## 3. O que a documentação do Asaas permite

Referências oficiais (consultar versão atual no portal Asaas):

- [Credit Card Charges / Payments via credit card](https://docs.asaas.com/docs/payments-via-credit-card)
- [Credit card tokenization](https://docs.asaas.com/reference/credit-card-tokenization)
- Referência de API: criar cobrança com cartão; **pagar cobrança existente com cartão** (`POST /v3/payments/{id}/payWithCreditCard` — nome exato conforme documentação vigente).

### 3.1 Criar cobrança com cartão e pagar no mesmo request

- `POST /v3/payments` com `billingType` adequado a cartão, mais objetos **`creditCard`**, **`creditCardHolderInfo`** e **`remoteIp`**.
- Captura ocorre na criação; a documentação alerta para **timeout** mínimo (~60s) para evitar duplicidade.

### 3.2 `payWithCreditCard` (cobrança já existente)

- Permite enviar dados de cartão (ou token, conforme regras do endpoint) para **liquidar** uma cobrança **já criada** no Asaas, identificada por `id`.
- Encaixa no modelo atual em que `createCharge` já gera um **`gateway_reference_id`** (payment id) antes do usuário pagar no hospedado.

### 3.3 Tokenização

- Endpoints de tokenização (ex.: `tokenizeCreditCard` / paths sob `/v3/creditCard/...`) permitem obter **`creditCardToken`** para cobranças futuras no **mesmo** cliente Asaas.
- Requer permissão **`CREDIT_CARD:WRITE`**; em produção pode exigir **habilitação** após análise com o Asaas.
- **Não** elimina por si só a necessidade de tratar dados sensíveis no primeiro uso: a tokenização tradicional da API recebe dados do cartão no **servidor** que chama a API (com implicações de compliance).

### 3.4 `remoteIp`

- Documentação exige **`remoteIp`** coerente com o **cliente final** (não o IP interno do servidor de aplicação isolado).
- Em produção, o backend deve derivar IP de cabeçalhos confiáveis (`X-Forwarded-For`, etc.) com **cuidado** (proxy/CDN, spoofing).

### 3.5 HTTPS e restrições

- Uso de **SSL/HTTPS** é obrigatório quando os dados são capturados na interface do integrador; a documentação menciona risco de **bloqueio da conta** se a integração for inadequada.

### 3.6 Segurança e compliance (resumo)

- Qualquer fluxo em que PAN/CVV trafeguem até o **backend do merchant** ou sejam digitados em **formulário próprio** implica **obrigações PCI** (escopo típico mais amplo, frequentemente alinhado a **SAQ D** ou equivalente, sujeito a validação com QSA/adquirente — **não** substituir parecer formal).
- A API do Asaas **não** remove** por si só a responsabilidade do merchant sobre a captura na própria página.

---

## 4. Melhor arquitetura recomendada

### 4.1 Princípios

1. **Chave de API do Asaas** só no **backend** (tenant-scoped), carregada como hoje para outras operações de gateway.
2. **Frontend** nunca envia a chave; envia apenas o necessário para **uma** operação de pagamento (e dados não sensíveis para UX).
3. **Trânsito sensível:** HTTPS ponta a ponta; corpo com dados de cartão só em **POST** dedicado, com CSRF/token de sessão do link público já existente (`token` da URL) e rate limiting.
4. **Dois desenhos possíveis** (escolher um na Fase 3A — não implementar ambos sem decisão):

| Desenho | Ideia | Vantagem | Desvantagem |
|--------|--------|----------|-------------|
| **A — Cobrança pendente + `payWithCreditCard`** | Manter `createCharge` ao selecionar cartão (cobrança `CREDIT_CARD` pendente, sem pagamento ainda, se a API permitir nesse estado) ou ajustar criação para não exigir `invoiceUrl` na UX; usuário submete o formulário; backend chama **`payWithCreditCard`** com `paymentId` da tentativa ativa. | Alinha com `gateway_reference_id` já criado e política de tentativas. | Depende do comportamento exato do Asaas para cobrança criada sem captura (validar na 3C). |
| **B — Um único `POST /v3/payments` no submit** | Ao enviar o formulário, backend cria e captura **em uma chamada** (e então grava tentativa / atualiza fatura). | Menos round-trips no gateway. | Exige reordenar quando a tentativa é criada vs. hoje (switch já cria cobrança); impacto maior em `switchPaymentMethod` e idempotência. |

**Recomendação de planejamento:** favorecer **Desenho A** se o Asaas mantiver cobrança pendente com `CREDIT_CARD` sem captura e expuser `payWithCreditCard` estável — **preserva** o modelo “tentativa = cobrança no gateway” já usado. Caso contrário, **Desenho B** com contrato de idempotência muito explícito.

### 4.2 O que fica no frontend

- Campos de **titular**, **endereço** e **contato** exigidos pelo Asaas (`creditCardHolderInfo`), quando não pré-preenchidos pelo cliente da fatura.
- Campos de **cartão**: número, validade, CVV (e nome no cartão), **somente** em memória no browser; **não** `localStorage` / `sessionStorage` / query string.
- Opcional: indicadores de bandeira, máscaras, validação superficial (Luhn, formato) — sem substituir validação do provedor.

### 4.3 O que vai para o backend

- Payload **HTTPS** JSON (ou formato definido) contendo:
  - identificador do **link público** (`token`) e/ou `attempt_id` / `invoice_id` conforme contrato;
  - dados do portador e cartão **no corpo da requisição** (se Desenho A/B sem iframe);
  - metadados para **`remoteIp`** (ou o backend só lê headers da requisição).
- **Não** persistir PAN/CVV em banco; **não** logar corpo bruto de pagamento.

### 4.4 PAN/CVV vs token

- **Curto prazo (MVP inline):** o backend recebe **dados de cartão na requisição** e repassa **imediatamente** ao Asaas (`payWithCreditCard` ou `POST /v3/payments` com cartão), **sem armazenar** PAN/CVV após a chamada.
- **Token-only no backend:** só é realista se o **primeiro** contato com PAN for em componente **certificado** (ex.: hosted fields de terceiro) que emite token — **não** é o que a API “pura” do Asaas descreve para um formulário 100% próprio sem passar pelo merchant.
- **Tokenização Asaas** pós-primeira transação: opcional para **próximas** cobranças do **mesmo** cliente no Asaas; **não** resolve sozinha o escopo PCI da **primeira** captura na página da fatura.

### 4.5 Compatibilidade com tentativas por método

- Cada **troca para cartão** pode continuar gerando (ou reutilizando, conforme política atual) uma cobrança com `payment_method = CREDIT_CARD`.
- O **submit** do formulário não deve criar uma segunda cobrança **sem idempotência**; deve amarrar ao `gateway_reference_id` da tentativa ativa (Desenho A) ou substituir o fluxo de criação no switch (Desenho B) com regras claras.

---

## 5. Fluxo técnico proposto (alto nível)

Fluxo alvo com **Desenho A** (ajustar nomes de endpoints na implementação):

1. Cliente conclui dados do cliente (se necessário) e vê métodos à **esquerda**.
2. Cliente escolhe **Cartão** → `switch-method` (ou equivalente) cria/respeita tentativa com cobrança **pendente** no Asaas e retorna identificadores necessários ao front (**sem** depender de `invoiceUrl` para concluir o pagamento).
3. Na **direita**, exibe-se formulário de cartão + texto de segurança + consentimento se exigido.
4. Cliente submete → **POST público autenticado pelo token** (novo endpoint, ex.: `.../pay/:token/charge-card` — nome final na 3A) com corpo seguro.
5. Backend valida token, tenant, fatura, tentativa ativa, valor, método permitido; monta **`remoteIp`**; chama Asaas (`payWithCreditCard` ou criação única, conforme desenho).
6. Resposta síncrona: status do pagamento; atualiza **`customer_invoice_payment_attempts`** e **`customer_invoices`** (gateway_status / status interno) conforme regras atuais + normalização já usada em webhook.
7. **Webhook** confirma ou corrige estado assíncrono; **polling** na página continua coerente com estados `pending` / `paid` / falha.

**Coerência:** o mesmo `gateway_reference_id` deve refletir o pagamento autorizado ou recusado; erros genéricos ao usuário final, detalhes só em logs **mascarados** e ferramentas seguras.

---

## 6. Regras de segurança

| Tema | Regra |
|------|--------|
| **HTTPS** | Obrigatório em todos os ambientes que aceitem cartão; HSTS e TLS modernos em produção. |
| **Dados sensíveis** | PAN e CVV **nunca** em logs, métricas, URLs, query params ou mensagens de erro retornadas ao cliente. |
| **Logs** | Proibido logar corpo de requisição de pagamento; IDs de cobrança e últimos 4 dígitos apenas se o gateway retornar de forma segura. |
| **Mascaramento** | Qualquer exibição pós-pagamento: apenas últimos 4 dígitos / bandeira, se aplicável. |
| **Retenção** | Não armazenar PAN/CVV em DB, arquivos ou cache; memória de processo apenas pelo tempo mínimo da chamada HTTP ao Asaas. |
| **Rate limiting** | Por IP + por token de fatura no endpoint de submit; proteção contra força bruta e abuso. |
| **PCI / compliance** | Tratar o formulário próprio como **entrada em escopo PCI**; obter **parecer** (SAQ, política da adquirente, DPO) antes de produção em escala. |
| **Risco de tráfego no sistema** | Mesmo sem armazenar, o **trânsito** pelo backend do PainelCRM aumenta responsabilidade operacional (hardening, auditoria, acesso restrito). |

---

## 7. Impacto na arquitetura atual

### 7.1 `customer_invoice_payment_attempts`

- **Possível:** novos campos **não sensíveis** (ex.: indicador `capture_channel: 'inline_api'`), ou uso apenas de `gateway_metadata` para flags.
- **Evolução de status** após submit: de “aguardando pagamento” para autorizado/recusado, alinhado ao retorno Asaas + webhook.

### 7.2 `createCharge` / `switchPaymentMethod`

- **Asaas:** estender implementação para suportar criação de cobrança cartão **sem** UX dependente de `invoiceUrl`, ou fluxo único no submit (Desenho B).
- **Contrato interno:** possível extensão de `CreateChargeInput` / resultado com flags `awaitingCardCapture` / omitir `invoiceUrl` para UI.
- **Multi-gateway:** outros gateways podem continuar retornando apenas hosted URL até terem equivalente API — **feature flag** por gateway ou por tenant.

### 7.3 Backend público

- Novo endpoint (ou extensão controlada) sob rotas públicas já existentes, com validação forte do **token** da fatura.
- **Não** expor chaves; **não** reutilizar o mesmo handler de GET para receber POST de cartão.

### 7.4 O que não deve mudar sem necessidade forte

- Esquema de **webhook** e normalização de status já validada em produção.
- Modelo mental de **uma tentativa ativa** e política de **não apagar** tentativas ao trocar método (apenas supersede/invalidação conforme regras já definidas).
- **PIX** e **boleto** inline já entregues — isolamento para não regressar.

---

## 8. Fases de implementação

### Fase 3A — Design de backend e contrato

- Decisão **Desenho A vs B** com validação em sandbox Asaas (comportamento de cobrança pendente + `payWithCreditCard`).
- Especificação OpenAPI/contrato do novo POST público (campos, erros, idempotência).
- Matriz de estados da tentativa e da fatura pós-submit síncrono vs webhook.
- Parecer prévio de **compliance/PCI** (go/no-go).

### Fase 3B — Formulário de cartão (frontend)

- UI na coluna direita apenas com método Cartão ativo; máscaras; mensagens de segurança; sem iframe como principal.
- Integração com endpoint da 3A; tratamento de erro amigável; loading e desativação duplo submit.

### Fase 3C — Integração Asaas

- Implementação no módulo Asaas: cliente HTTP para `payWithCreditCard` e/ou `POST /v3/payments` completo; testes em sandbox com cartões de teste oficiais.
- `remoteIp` confiável; timeouts ≥ recomendação; idempotency keys alinhadas às tentativas.

### Fase 3D — Telemetria, auditoria e rollout piloto

- Métricas agregadas (taxa de sucesso, latência), **sem** dados de cartão.
- Auditoria de acessos a endpoints sensíveis; feature flag para piloto por tenant; rollback simples (voltar a hosted/nova aba apenas como contingência, se ainda existir).

---

## 9. Riscos e decisões pendentes

**Antes de qualquer código em produção, deve estar explícito:**

1. **Parecer PCI / jurídico** sobre formulário próprio + trânsito pelo backend PainelCRM.
2. **Aprovação Asaas** para tokenização ou volumes, se necessário (produção).
3. **Desenho A vs B** validado em sandbox (estados da cobrança, idempotência, erros de antifraude).
4. **Comportamento em falha de rede** após autorização no provedor (reconciliação via webhook).
5. **Debit card:** documentação indica limitações para débito via API — definir se o fluxo inline cobre só crédito na v1.
6. **Parcelamento:** se aplicável à fatura pública, definir regras e payload Asaas (`installmentCount`, etc.).
7. **Fallback:** se `invoiceUrl` permanece só para contingência operacional ou é removido da UX por completo.
8. **LGPD** — base legal e retenção de dados do titular enviados junto ao portador.

---

*Documento gerado para alinhamento de engenharia e produto; revisar após feedback jurídico e testes de sandbox.*
