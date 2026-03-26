# Plano de Correção — Troca de Método de Pagamento da Fatura

Documento de **auditoria + plano** (sem implementação nesta etapa). Baseado na leitura do código atual em `customerBillingService`, `publicCustomerInvoicesController`, integração Asaas (`asaasMapper`, `asaasService`), `CustomerInvoicePay.tsx` e serviços de tentativas (`customerInvoicePaymentAttemptsService`).

---

## 1. Estado atual

### 1.1 Backend — troca de método

- **Endpoint:** `POST /api/public/customer-invoices/pay/:token/switch-method` → `switchPaymentMethodByToken` em `customerBillingService.ts`.
- **Fluxo resumido:**
  1. Valida fatura, cliente preenchido, status pagável, método permitido (`allowed_payment_methods` no `gateway_metadata` da fatura).
  2. **Idempotência opcional:** se vier `idempotency_key` e existir tentativa com mesma chave + método → reativa essa tentativa e atualiza `customer_invoices` com os metadados dela (sem nova cobrança).
  3. **Reuso por método:** `findReusableInvoicePaymentAttempt(invoice_id, método)` busca tentativa em status “pendente” com `gateway_reference_id` preenchido; valida no gateway com `getPayment` + `normalizeGatewayStatus` (`isAttemptChargeStillUsable`). Se válida → ativa tentativa e atualiza fatura (sem nova cobrança).
  4. Se existir reuso mas a cobrança **não** for mais utilizável → `deleteGatewayChargeIfSafe` + `markAttemptCancelledSuperseded` e segue.
  5. Caso contrário → **nova** `createCharge` com `idempotencyKey` (estável se veio do front; senão random) e `externalReference` com sufixo variando no tempo → **nova cobrança no Asaas** + nova linha em `customer_invoice_payment_attempts` + atualização agregada na fatura.

### 1.2 Frontend — página pública (`CustomerInvoicePay.tsx`)

- **GET** inicial carrega itens, `payment_urls`, `active_attempt`, `allowed_payment_methods`.
- **Chave de idempotência** ao trocar método: `ui_switch_${token}_${method}` (estável por link + método).
- **Layout:** grid `lg:grid-cols-2` — coluna esquerda: itens e total; coluna direita: bloco de pagamento (métodos + PIX / “outras formas”).
- **Comportamento de exibição:**
  - PIX: QR + copia e cola quando há payload.
  - Boleto/cartão: usa `bankSlipUrl` e/ou `invoiceUrl` com links `<a target="_blank">` — **abre em nova aba** (comportamento explícito no JSX).
- **Default de método na UI:** se PIX está em `allowed_payment_methods`, o estado local prefere PIX (`preferredDefaultMethod`).

### 1.3 Integração Asaas (evidência técnica)

- `toAsaasPayment` define **um** `billingType` por cobrança: `PIX` | `BOLETO` | `CREDIT_CARD` — mapeamento 1:1 com o método escolhido no `createCharge`.
- O retorno de `createCharge` exposto ao domínio (`CreateChargeResult`) inclui hoje: `paymentId`, `status`, `invoiceUrl`, `bankSlipUrl`, `pixQrCode`, `pixCopyPaste`. **Não há** campo de linha digitável no contrato atual.
- Para PIX, o serviço chama `getPixQrCode` após criar o pagamento.

### 1.4 Primeira cobrança (link sem cliente)

- `completePaymentByToken` cria **uma** cobrança após vincular cliente; método resolvido por `resolveChargePaymentMethod` (com preferência alinhada a PIX quando permitido — ver função no mesmo arquivo).

### 1.5 Consolidação ao pagar

- Em `paymentDomainService.applyPaymentAttemptEvent`, quando uma tentativa vai a `paid`, há lógica de **supersedência** (`supersedeOtherPendingAttemptsAfterPaid`): remove cobranças pendentes no gateway quando seguro e marca tentativas como canceladas/superseded no banco (histórico preservado).

---

## 2. Problemas encontrados (relacionados ao produto)

| Problema de produto | Causa provável no código / modelo |
|---------------------|-----------------------------------|
| Nova cobrança a cada clique / troca | Trocar **PIX ↔ BOLETO ↔ CARTÃO** implica **sempre** outro `billingType` no Asaas → **cobrança distinta** por design da API. Reuso só aplica **no mesmo método** (ex.: voltar ao PIX reutiliza o **mesmo** `paymentId` se ainda válido). |
| “Voltar ao PIX gera outro PIX” | Se o reuso falhar (`getPayment` indisponível, status não mapeado como pendente, tentativa invalidada e deletada no passo 4), o fluxo cai em **nova** `createCharge`. |
| Boleto “redireciona” | UI usa `bankSlipUrl` / `invoiceUrl` como links externos — não há linha digitável na tela nem no DTO atual. |
| Cartão “vai para o Asaas” | `invoiceUrl` do Asaas é página hospedada do checkout; não há fluxo de cartão embutido na SPA nem tokenização no repositório atual. |
| Métodos não ficam “à esquerda abaixo dos itens” | Layout atual coloca métodos na **coluna direita** do grid em telas grandes. |
| Risco de duplicidade | Mitigado em parte por reuso + idempotência + supersede ao pagar; ainda assim **múltiplas cobranças abertas** podem existir ao alternar métodos (uma por método), até uma ser paga. |

---

## 3. O que pode ser reaproveitado

- **Tabela `customer_invoice_payment_attempts`** e flags `is_active` — já suportam histórico e tentativa ativa.
- **`findReusableInvoicePaymentAttempt` + `isAttemptChargeStillUsable`** — base correta para reuso **por método**.
- **Idempotência** (`getInvoicePaymentAttemptByIdempotency` + chave estável no front) — evita duplicar ao repetir o mesmo clique.
- **`deleteGatewayChargeIfSafe` + supersede após `paid`** — alinhado à política de limpar outras cobranças quando um método confirma pagamento.
- **`billingLog`** — rastreabilidade para operações de switch/reuso.
- **GET público** já expõe `active_attempt`, `attempts_summary`, `allowed_payment_methods` — útil para refletir método “selecionado” vs “trocas” sem adivinhar só pelo cliente.

---

## 4. Regras corretas de comportamento (alvo de produto)

1. **Default inicial:** PIX como método principal quando constar em `allowed_payment_methods` (já alinhado na UI; validar consistência com `completePaymentByToken` / primeira cobrança).
2. **Uma tentativa ativa por fatura** ao exibir — já garantido ao criar nova tentativa ativa; revisar se UI/backend sempre refletem o mesmo após GET.
3. **Reuso:** ao selecionar um método M:
   - Se existir tentativa **pendente** para M com cobrança **ainda válida** no gateway → reutilizar (sem `createCharge`).
   - Senão → criar nova cobrança para M (inevitável se não há cobrança válida).
4. **Troca entre métodos diferentes:** esperar **múltiplas cobranças no Asaas** (uma por método), até uma ser paga — **não** é bug se o gateway não permite um único pagamento com dois métodos simultâneos.
5. **Ao pagar uma:** encerrar outras no gateway + marcar tentativas como superseded (já previsto no domínio de webhook para tentativas).
6. **UX:** não obrigar abrir nova aba para boleto/cartão se o produto exigir inline — ver estratégias abaixo (podem exigir novos dados da API).

---

## 5. PIX e boleto: mesma cobrança ou não

**Conclusão técnica (Asaas, código atual):**

- Cada chamada a `createCharge` com `paymentMethod` define `billingType` único (`asaasMapper.toAsaasPayment`).
- **Não é possível** ter uma única cobrança Asaas que seja simultaneamente PIX e boleto com o mesmo `paymentId` nesse modelo.
- **Reuso “voltar ao PIX”** significa reutilizar o **mesmo** registro de pagamento PIX anterior (mesma tentativa / mesmo `gateway_reference_id`), não “converter” boleto em PIX na mesma cobrança.

**Implicação de produto:** comunicar internamente que “troca de método” = **nova cobrança por método**, exceto quando o usuário **volta** a um método que já tinha cobrança válida (reuso).

---

## 6. Estratégia para boleto inline

**Estado atual:** só `bankSlipUrl` (PDF) e opcionalmente `invoiceUrl` — sem linha digitável no modelo.

**Caminhos possíveis (sem assumir API além do que documentar):**

1. **Curto prazo (mínimo):**  
   - Exibir na tela: **link para PDF** (não é “linha digitável”, mas fica na própria página como botão).  
   - Opcional: texto explicando que a linha digitável pode ser obtida no PDF.

2. **Médio prazo (produto):**  
   - Estender **cliente Asaas** (`getPayment` ou resposta de `createPayment`) para mapear campos oficiais de **linha digitável** (ex.: `identificationField` / `nossoNumero` conforme documentação Asaas) para `gateway_metadata` e expor no GET público.  
   - Atualizar `CreateChargeResult` / metadata apenas se a API confirmar o campo.

3. **Não fazer:** inventar linha digitável sem fonte na API.

---

## 7. Estratégia para cartão inline

**Estado atual:** só `invoiceUrl` (checkout hospedado Asaas). Não há componente de captura de cartão na SPA nem PCI/tokenização no backend.

**Opções reais:**

1. **Manter checkout hospedado** mas **embutir** em `<iframe>` na mesma página (ainda “Asaas”, mas sem navegação da aba do usuário). Limitações: CSP, UX mobile, políticas do Asaas.
2. **Tokenização / Elements:** exige integração explícita (API Asaas para cartão/token) e mudança de escopo — **não** é correção cirúrgica só de UI.
3. **Documentar limitação:** “cartão seguro na página do provedor” vs “cartão digitado na fatura” são níveis distintos de compliance.

**Recomendação de plano:** separar **Fase A** (UX: iframe ou botão “pagar sem sair” com mesmo `invoiceUrl`) de **Fase B** (cartão verdadeiramente inline com tokenização).

---

## 8. Estratégia para evitar duplicidade

1. **Manter** reuso por método + idempotência por `(invoice, método, chave)` — já implementado.
2. **Evitar** `externalReference`/`idempotencyKey` instáveis em caminhos que deveriam ser idempotentes (revisar fallback quando não há `idempotency_key` no body).
3. **Política ao trocar de método A → B:**  
   - Opção A (conservadora): não deletar cobrança A ao trocar (permite reuso ao voltar para A).  
   - Opção B (agressiva): deletar A ao ativar B (reduz cobranças abertas, mas **impede** reuso de A sem nova cobrança).  
   **Produto precisa escolher** — o código atual deleta quando o reuso de **A** é inválido, não necessariamente ao trocar para B.
4. **Ao pagar:** manter supersede das outras tentativas no gateway + marcar localmente (já alinhado ao objetivo 5 do produto).

---

## 9. Fases de implementação (sugeridas)

### Fase 0 — Alinhamento (produto + gateway)

- Confirmar com documentação Asaas quais campos estão disponíveis para **linha digitável** e para **checkout embutido** (iframe).
- Decidir política A vs B ao trocar método (reuso vs limpeza).

### Fase 1 — UX / layout (baixo risco)

- Mover bloco “Métodos de pagamento” para **coluna esquerda**, abaixo dos itens (apenas HTML/CSS).
- Sincronizar **método selecionado** com `active_attempt.payment_method` no primeiro load (evitar divergência entre estado local e backend).

### Fase 2 — Dados para boleto “sem sair”

- Se API suportar: persistir linha digitável em `gateway_metadata` e retornar no GET público.
- Senão: limitar expectativa a botão PDF + copy na própria página.

### Fase 3 — Cartão sem redirecionar aba

- Implementar iframe (ou drawer) com `invoiceUrl` com avisos de segurança.
- Cartão digitado nativamente na fatura só se houver decisão de integração tokenizada.

### Fase 4 — Endurecer reuso e telemetria

- Logs/métricas: contagem de `createCharge` por sessão de token; alerta se > N por método sem motivo.
- Revisar invalidação de reuso (timeouts, status Asaas) para reduzir “novo PIX” indevido.

---

## 10. Riscos e cuidados

- **Alterar webhook / payment_events / domínio de status** sem necessidade pode quebrar fluxos já estáveis — manter mudanças restritas a `customerBillingService`, metadata público e UI.
- **Deletar cobranças** ao trocar método pode melhorar “higiene” no Asaas mas **piorar** reuso de PIX — decisão de produto obrigatória.
- **PCI / LGPD:** cartão inline real não é só front-end.
- **Compatibilidade multi-gateway:** novos campos devem ser genéricos em `gateway_metadata` ou no contrato `PaymentGateway`, não só Asaas.

---

## Próximo passo recomendado

1. Aprovar a **política de limpeza** (reuso vs delete ao trocar método) e o **escopo** de boleto (só PDF vs linha digitável via API).  
2. Só então implementar **Fase 1** (layout + seleção inicial) + **Fase 2** condicionada à disponibilidade de campo na API Asaas.  
3. Tratar iframe de cartão como **Fase 3** incremental, sem tocar no núcleo de webhook.
