# Investigação Técnica — Cartão na Tela Pública da Fatura

**Escopo:** fluxo de cartão na página pública de pagamento (`CustomerInvoicePay`), integração **Asaas**, Fase 3 (embed vs checkout hospedado vs API).  
**Base:** código atual do repositório e documentação oficial Asaas (acesso em março/2025).  
**Não inclui:** implementação de código; decisão final de produto fica com o time após esta análise.

---

## 1. Estado atual

### 1.1 Como o cartão é exibido hoje

- Na UI pública (`src/pages/CustomerInvoicePay.tsx`), quando o método ativo é **Cartão** e existe URL de cobrança hospedada:
  - `hostedCheckoutUrl` = `data.payment_urls.invoiceUrl` (string vinda da API pública).
  - A tela renderiza um **`<iframe src={hostedCheckoutUrl}>`** na coluna direita, com altura responsiva (`min-h-[420px]`, `h-[min(70vh,640px)]`), `referrerPolicy="strict-origin-when-cross-origin"`, **sem** atributo `sandbox` restritivo (o checkout do provedor precisa de scripts/formulários).
  - Existe **fallback explícito**: bloco explicando bloqueio de iframe + botão **“Abrir checkout em nova aba”** (`<a href={hostedCheckoutUrl} target="_blank" rel="noopener noreferrer">`).

### 1.2 Origem do `invoiceUrl`

- No gateway Asaas, após `POST /v3/payments`, a resposta pode incluir **`invoiceUrl`** (fatura/checkout hospedado no domínio Asaas).
- O serviço mapeia isso para o contrato interno (`CreateChargeResult.invoiceUrl`) em `packages/backend/src/modules/gateways/asaas/services/asaasService.ts` (resposta de `createPayment`).
- O valor é persistido no **metadata da cobrança** (fluxo de billing / tentativa ativa) e exposto ao front no GET público como `payment_urls.invoiceUrl` em `packages/backend/src/controllers/publicCustomerInvoicesController.ts` (a partir de `activeMetadata.invoiceUrl`).

### 1.3 Onde o iframe é tentado

- Único ponto: `CustomerInvoicePay.tsx`, bloco `isCardSelected && allowCard && showCardHostedSection`, elemento `<iframe key={hostedCheckoutUrl} src={hostedCheckoutUrl} ... />`.

### 1.4 Resumo

O fluxo atual segue a **primeira opção** descrita na documentação oficial de cartão: criar cobrança com `billingType` cartão e **encaminhar o cliente para a URL da fatura** (`invoiceUrl`) para digitar o cartão na interface Asaas — só que, na implementação, essa URL foi colocada **dentro de um iframe** na nossa página, em vez de redirecionar ou abrir só em nova aba.

---

## 2. Causa da falha do iframe

### 2.1 Sintoma relatado

Mensagens do navegador no sentido de **“recusou conectar”** / área em branco no iframe são típicas quando:

1. O **servidor de destino** envia cabeçalhos que **proíbem** incorporar a página em outro site (por exemplo `X-Frame-Options: DENY` ou `SAMEORIGIN`, ou `Content-Security-Policy` com `frame-ancestors` restritivo).
2. Em alguns casos, políticas de **rede/CORS** não se aplicam ao iframe da mesma forma; o bloqueio relevante aqui é **framing**, não CORS de API.

### 2.2 O que *não* é a causa principal (no código atual)

- **Sandbox do iframe:** a implementação atual **não** usa `sandbox` com flags que desabilitassem scripts — portanto o bloqueio observado no sandbox Asaas **não** se explica por sandbox excessivo no nosso markup.
- **CSP do nosso front:** ausência de `frame-src` permissivo no app pode impedir *alguns* destinos; se o iframe nem tentasse carregar, o sintoma poderia ser diferente. Na prática, o erro “recusou conectar” costuma apontar para **política do site embutido (Asaas)**, não só para CSP do pai.

### 2.3 Conclusão técnica (causa provável)

É **provável** que o Asaas (ou a página de fatura/checkout) **não permita** ser exibida como documento filho de outro origin — padrão de segurança para reduzir *clickjacking* e uso indevido de checkout em páginas de terceiros.  
A documentação oficial descreve o fluxo de cartão com **redirecionamento para `invoiceUrl`**, não com embed em iframe, o que é **compatível** com essa hipótese.

**Validação recomendada (sem implementar produto):** inspecionar no DevTools → rede/cabeçalhos da resposta de `invoiceUrl` (abaixo do domínio Asaas) e confirmar `X-Frame-Options` / `Content-Security-Policy` (`frame-ancestors`).

---

## 3. O que a documentação oficial do Asaas permite

Fontes principais consultadas:

- [Credit Card Charges / Payments via credit card](https://docs.asaas.com/docs/payments-via-credit-card)
- [Credit card tokenization](https://docs.asaas.com/reference/credit-card-tokenization)

### 3.1 Fluxo hospedado: `invoiceUrl`

- Ao criar cobrança com cartão (`billingType` cartão), a documentação indica **redirecionar o cliente para `invoiceUrl`** para que informe os dados **pela interface Asaas**.
- Isto é o fluxo **checkout hospedado** no provedor — alinhado ao que já temos como dado (`invoiceUrl`), mas **não** afirma suporte a **iframe** na mesma página.

### 3.2 Cobrança criada e paga na mesma ação — `POST /v3/payments` com dados do cartão

- Documentação descreve envio de `creditCard`, `creditCardHolderInfo` e **`remoteIp`** no **mesmo** `POST` de criação da cobrança, com captura imediata.
- Avisos explícitos:
  - Uso de **SSL (HTTPS)** é obrigatório se os dados forem capturados na interface do integrador; caso contrário a conta pode ser **bloqueada** para transações com cartão.
  - Recomendação de timeout mínimo (~60s) para evitar duplicidade.

### 3.3 Pagar cobrança já existente com cartão

- A API pública do Asaas inclui operação do tipo **`POST /v3/payments/{id}/payWithCreditCard`** (referência: *Pay a charge with a credit card* na documentação de referência), para processar pagamento de uma cobrança **já criada** com os dados de cartão na chamada.  
- Implica: integração **server-to-server** com chave de API e corpo contendo dados sensíveis ou token — **não** é “colar no front” sem camada segura.

### 3.4 Tokenização

- Endpoint de tokenização (ex.: `POST` em path de crédito / `tokenizeCreditCard` conforme referência) exige:
  - Permissão **`CREDIT_CARD:WRITE`**.
  - Payload com `customer`, `creditCard`, `creditCardHolderInfo`, **`remoteIp`** (documentação enfatiza que **não** deve ser o IP do servidor do integrador, e sim o IP de onde o cliente realiza a compra).
- Em produção, habilitação pode depender de **análise** junto ao gerente de contas.
- Fluxo típico: dados do cartão chegam a um **backend** que chama a API Asaas — **não** há, na documentação analisada, equivalente a “Elements” 100% no browser sem passar por servidor do merchant com política PCI adequada.

### 3.5 Débito

- Envio de dados de **débito** pela API não é possível da mesma forma; a orientação é usar `invoiceUrl` para habilitar débito na fatura quando aplicável.

### 3.6 Recomendação implícita hospedado vs “própria tela”

- A documentação apresenta claramente **duas linhas**: (1) **hospedado** via `invoiceUrl`; (2) **API** com dados do cartão no servidor, HTTPS e obrigações de compliance.
- Não há promessa de **checkout embutido em iframe** como padrão suportado para a URL de fatura.

---

## 4. Viabilidade de cartão “inline” na nossa tela

| Abordagem | Viável como “sem sair da página”? | Observação |
|-----------|-----------------------------------|------------|
| **iframe com `invoiceUrl`** | **Baixa** | Compatível com bloqueio de framing do provedor; sintoma atual sugere inviabilidade prática. |
| **Nova aba / mesmo navegador em top-level** | **Alta** | Compatível com doc (“redirecionar para `invoiceUrl`”) e com políticas anti-iframe. |
| **Redirecionamento total (substituir a página)** | **Alta** | Mesma origem de URL; usuário “sai” do domínio do PainelCRM para o Asaas. |
| **Formulário no nosso front + API Asaas** | **Condicional** | Tecnicamente possível **somente** com desenho seguro (HTTPS, backend, escopo PCI, `remoteIp` real, etc.). **Não** é “só chamar API no front” (chave secreta). |
| **Tokenização + cobrança** | **Condicional** | Exige backend e compliance; mesmo assim dados sensíveis trafegam até o nosso backend se não houver componente certificado hosted-only. |

### 4.1 iframe deve ser descartado como solução final?

**Como caminho principal:** sim, **até prova em contrário** por teste de cabeçalhos HTTP reais e eventual posicionamento oficial do Asaas. O comportamento atual do sandbox e o padrão da indústria sustentam tratar **embed como não suportado ou não confiável**.

**Como fallback opcional:** pode permaneccer como “tentativa”, desde que a experiência principal não dependa dele (evitar frustração).

### 4.2 Checkout hospedado continua sendo a melhor opção?

Para **baixo risco, sem mudar escopo PCI e sem dados sensíveis no nosso backend**, **sim**: manter **checkout hospedado** via `invoiceUrl` (nova aba ou redirecionamento) é o caminho **mais alinhado** à documentação e ao que já está integrado (`createCharge` → `invoiceUrl`).

### 4.3 Caminho seguro para cartão “na nossa tela” sem redirecionar?

- **Sem passar dados sensíveis pelo nosso servidor:** na prática, **não** há solução mágica só com iframe da `invoiceUrl` se o provedor bloquear embed.
- **Com API (`payWithCreditCard` / criar com cartão):** implica **captura** em interface sob controle do merchant (ou tokenização server-side) e **obrigações PCI**; não é “apenas mais um endpoint” na API pública do link da fatura sem análise formal.

---

## 5. Impacto em segurança e compliance

### 5.1 Checkout hospedado (`invoiceUrl` em nova aba ou redirect)

- Dados de cartão **não** passam pelo PainelCRM.
- Escopo PCI do merchant tende a ser **menor** (depende de contrato/adquirente; em geral comparado a captura direta).

### 5.2 Captura na nossa UI + envio à API Asaas

- A documentação exige **HTTPS** e alerta para bloqueio da conta se a integração for inadequada.
- O backend precisaria:
  - receber dados sensíveis ou um token gerado em ambiente **compatível com PCI** (não improvisado);
  - encaminhar **`remoteIp`** do cliente final (não IP do servidor);
  - timeouts e idempotência para evitar cobranças duplicadas.
- **SAQ / nível de compliance:** captura de PAN no sistema do comerciante normalmente empurra para **escopos mais pesados** (ex. **SAQ D** ou equivalente), salvo uso de soluções validadas (hosted fields, redirect, etc.). **Não** substitui análise com QSA/DPO.

### 5.3 Tokenização Asaas

- Ainda envolve envio de dados do cartão **para a API** (via backend seguro), com as mesmas classes de cuidado; produção pode exigir **habilitação** e análise de risco.

---

## 6. Melhor abordagem recomendada (A vs B vs C)

### Opção A — Manter cartão via **checkout hospedado** (fallback externo / nova aba / redirect)

- **Recomendação:** **principal** para o estágio atual e para alinhamento com a documentação Asaas.
- **Prós:** menor risco, sem alterar contrato de captura, compatível com `customer_invoices` / tentativas / webhooks existentes.
- **Contras:** usuário utiliza outra aba ou outro host (experiência “fora” do iframe).

### Opção B — **iframe/modal** embutido

- **Recomendação:** **não** como solução definitiva; **só** se testes formais comprovarem que o Asaas **permite** `frame-ancestors` incluindo o domínio do PainelCRM (improvável sem parceria/documentação explícita).
- **Prós:** UX contínua se funcionasse.
- **Contras:** evidência atual de falha; política anti-framing é comum.

### Opção C — **Pagamento inline real** via API / tokenização

- **Recomendação:** **projeto à parte**, com:
  - revisão legal/PCI;
  - desenho de backend (nunca expor chave Asaas no browser);
  - mapeamento de `payWithCreditCard` vs recriar cobrança;
  - testes de idempotência e de `remoteIp`.
- **Prós:** UX potencialmente “na mesma página” (formulário próprio ou fluxo híbrido).
- **Contras:** maior risco, maior escopo, mudanças mais profundas no fluxo público e possivelmente em tentativas/gateway.

**Síntese:** **A** como base; **B** apenas como tentativa secundária ou removida; **C** só após decisão explícita de produto e compliance.

---

## 7. O que pode ser implementado agora (baixo risco, sem reinventar arquitetura)

Sugestões **incrementais** (quando houver decisão de implementar — este documento não prescreve código):

1. **Tornar o checkout hospedado o caminho principal** para cartão: botão destacado **“Pagar com cartão”** abrindo `invoiceUrl` em **nova aba** ou **redirect** controlado, com cópia curta de segurança.
2. **Remover ou rebaixar o iframe** a um “teste” opcional / oculto por padrão, para não sugerir fluxo que o sandbox já invalida.
3. **Manter** polling e `payment_urls` como hoje — **sem** mudar `customer_invoice_payment_attempts`, webhooks ou `payment_events`.
4. **Documentar** para QA: validar cabeçalhos de `invoiceUrl` em sandbox e produção.

---

## 8. O que deve ficar para depois

1. **Captura de cartão** no front próprio ou envio de PAN ao backend **sem** programa PCI formal.
2. **Integração completa** com `payWithCreditCard` ou criação com cartão no mesmo `POST`, até haver:
   - parecer de compliance;
   - desenho de API pública segura (sem vazar chave Asaas);
   - estratégia de `remoteIp` e anti-fraude.
3. **Dependência de iframe** como única experiência de cartão.
4. **Refatoração ampla** multi-gateway além do necessário para expor URLs já existentes.

---

## Referências rápidas (documentação Asaas)

- [Credit Card Charges](https://docs.asaas.com/docs/payments-via-credit-card) — `invoiceUrl`, criação com cartão no `POST`, tokenização.
- [Credit card tokenization](https://docs.asaas.com/reference/credit-card-tokenization) — endpoint, permissões, campos obrigatórios, `remoteIp`.
- Referência de API *Pay a charge with a credit card* — `POST /v3/payments/{id}/payWithCreditCard` (consultar versão atual da referência no portal Asaas).

---

## Arquivos do repositório citados nesta investigação

- `src/pages/CustomerInvoicePay.tsx` — iframe, `hostedCheckoutUrl`, fallback em nova aba.
- `packages/backend/src/modules/gateways/asaas/services/asaasService.ts` — `invoiceUrl` na resposta de `createPayment`.
- `packages/backend/src/controllers/publicCustomerInvoicesController.ts` — `payment_urls.invoiceUrl` no GET público.
