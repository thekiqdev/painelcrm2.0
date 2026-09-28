# Plano Estruturado — Evolução da Área de Faturas

**Tipo:** documento oficial de planejamento (produto + técnico)  
**Escopo:** organizar, priorizar e estudar caminhos — **sem implementação neste documento**  
**Contexto:** sistema em produção; preservar `customer_invoices`, integrações de pagamento, configurações de gateway, arquitetura multi-gateway, webhook, `payment_events` e status internos.

---

## 1) Visão geral

O objetivo é evoluir a experiência de **criação de faturas**, **recorrência**, **cobrança programada**, **tela pública de pagamento** e, em etapas posteriores, **pagamento embutido** — sempre com **compatibilidade retroativa** e **baixo impacto** nas integrações já ativas.

Este plano:

- Agrupa ideias em **blocos funcionais**;
- Classifica cada frente por **risco** e **tipo de trabalho** (ajuste, fluxo, estrutura);
- Separa o que pode ir **logo na primeira fase** do que exige **estudo** ou **decisão de negócio**;
- Propõe **fases seguras** de implementação;
- Lista **decisões pendentes** para o produto.

**Princípios:**

- Não refatorar a arquitetura de pagamento/webhook sem necessidade clara.
- Novas funcionalidades devem ser **aditivas** (colunas opcionais, novos endpoints, UI incremental) sempre que possível.
- Qualquer mudança em contrato de gateway ou webhook deve ser tratada como **alto risco** até validação com documentação e testes.

---

## 2) Blocos funcionais

### A) Ajustes rápidos (UI/UX pontuais)

| ID | Ideia (resumo) |
|----|----------------|
| A1 | Aviso de gateway: mais destacado (ex.: fundo laranja, ícone de alerta) e **só quando o gateway não estiver configurado/testado** |
| A2 | Botão **“Fatura por link”** com maior destaque na criação |
| A3 | **Link de pagamento** na tela de detalhe da fatura: posicionar no **início**, em área destacada |
| A4 | Exibir **data de criação** ao lado da data de vencimento (apoio a “modo programada” na percepção do usuário) |
| A5 | **Máscaras** em valores monetários nos itens da fatura |
| A6 | Desconto: suportar **%** e **valor fixo** (além do que já existir) |
| A7 | Forma de pagamento: **PIX primeiro** na ordem da lista |
| A8 | Tela pública: corrigir **“Vencimento: Invalid Date”** |
| A9 | Tela pública: **máscaras** em CPF/CNPJ e telefone |
| A10 | Tela pública: campo **Empresa** no formulário de dados do cliente |

### B) Componentes reutilizáveis

| ID | Ideia (resumo) |
|----|----------------|
| B1 | **Busca de cliente** na criação de fatura: nome, telefone, CPF — não só dropdown |
| B2 | Ao digitar nome inexistente: opção **cadastrar cliente** (espelhar comportamento da criação de **projetos**) |
| B3 | **Padronizar** busca de clientes no produto e extrair **componente/recurso único** reutilizável |
| B4 | **Vincular à cobrança**: além de select, incluir **busca** (por descrição, cliente, etc., conforme regra definida) |

### C) Melhorias de criação de fatura (fluxo)

| ID | Ideia (resumo) |
|----|----------------|
| C1 | Forma de pagamento **opcional** com evolução: seleção de **gateway** quando houver mais de um contexto relevante |
| C2 | **Múltiplas formas de pagamento** “existentes no gateway” na criação — depende de capacidade real da API por gateway |
| C3 | **Opções avançadas por item**: ícone de engrenagem → sanfona com recursos extras (recorrência por item, futuro vencimento por item, etc.) |

### D) Recorrência e vínculos

| ID | Ideia (resumo) |
|----|----------------|
| D1 | Recorrência na fatura: **histórico** da fatura “pai” com faturas geradas |
| D2 | Estudar reutilizar **customer_charges** com “tag” ou tipo **recorrência** para agrupar ciclos |
| D3 | Recorrência **robusta**: por **item** (período por item) + opção **avulsa** para fatura inteira recorrente |
| D4 | Períodos de recorrência até **diário**; padrão **desmarcado** |
| D5 | Regra híbrida (item 11): fatura toda recorrente **exceto** itens marcados como **não recorrente** nas opções avançadas — não entram na próxima geração |

### E) Cobrança programada / vencimento por item (conceito avançado)

| ID | Ideia (resumo) |
|----|----------------|
| E1 | Estudar **vencimento por item** |
| E2 | Estudar **“cobrar em outra data”**: fatura inicial só com itens “normais”; em cada data de item, **nova fatura** automática com vínculo **pai ↔ filha** e atalhos nas duas telas |

### F) Tela pública (link de pagamento)

| ID | Ideia (resumo) |
|----|----------------|
| F1 | Melhorar layout: uso da tela, visual mais profissional |
| F2 | **Logo da empresa** e **detalhes comerciais** no header (tenant branding) |
| F3 | Manter melhorias A8–A10 neste bloco |

### G) Pagamento embutido (checkout na própria tela)

| ID | Ideia (resumo) |
|----|----------------|
| G1 | Cliente paga **na tela**, sem botão que só redireciona ao Asaas (ou equivalente) |
| G2 | Exibir **PIX** (QR / copia e cola) e/ou **cartão** conforme método — **inline** |
| G3 | Se **mais de um gateway** ou **mais de uma forma** aplicável: **cards** de escolha antes do fluxo de pagamento |

### H) Estudos técnicos transversais

| ID | Ideia (resumo) |
|----|----------------|
| H1 | Mapear o que cada **gateway** suporta para checkout embutido vs. redirect |
| H2 | Impacto em **segurança/PCI** se cartão for digitado na aplicação |
| H3 | Compatibilidade com **webhook** e atualização de status quando o pagamento for concluído “na tela” |
| H4 | Modelagem de **recorrência por item** vs. **subscription** atual (type=customer) e worker existente |

---

## 3) Itens de baixo risco

*(Implementação direta, sem mudar modelo de dados crítico ou contrato de webhook — sujeito a validação visual e testes de regressão na tela.)*

| Ref. | Classificação adicional |
|------|-------------------------|
| A1 | Ajuste de UI + uso do estado já existente de “gateway configurado” (pré-condições / config) — validar critério exato de “não configurado” |
| A2, A3 | Apenas layout/ordem de componentes |
| A4 | Exibir campo `created_at` já persistido — sem alterar lógica de cobrança |
| A5, A6, A7 | Front-end e validação de formulário; desconto % pode exigir regra clara de arredondamento |
| A8 | Correção de parsing de data (timezone/string) — baixo risco se isolado |
| A9, A10 | Formulário público — sem impacto em gateway se só persistir dados do cliente |
| B1–B3 | **Médio** se envolver novo endpoint de busca; **baixo** se reutilizar listagem paginada/filtro já existente em clients API |
| F1 (parcial) | Melhorias de CSS/layout sem mudar contrato da API pública |

---

## 4) Itens que exigem regra de negócio

*(Precisam de decisão de produto antes ou durante a especificação.)*

| Ref. | Por quê |
|------|---------|
| D2 | Usar **customer_charges** para recorrência: semântica, nomenclatura e se toda recorrência gera cobrança automática |
| D3, D4, D5 | Como compor **total** da fatura recorrente quando itens têm periodicidades diferentes; o que entra na “primeira” fatura vs. próximas |
| E1, E2 | Se vencimento por item gera **N faturas** ou **uma fatura com múltiplas datas**; quem é “pai” quando há várias gerações |
| C2 | Quais combinações de método são válidas na **mesma** fatura (uma cobrança no gateway vs. várias) |
| G1–G3 | Política de **experiência única** vs. **múltiplas opções**; responsabilidade do tenant em configurar gateway “correto” |
| B4 | Critérios de busca de cobrança (texto livre? só abertas?) |
| A1 | Definição exata: “não configurado” = sem credencial, sem teste de conexão, ou ambos? |

---

## 5) Itens que exigem estudo técnico

*(Alto risco ou estrutural até concluir análise de API, modelo de dados e impacto no worker/webhook.)*

| Ref. | Motivo |
|------|--------|
| D1 | Histórico pai/filhas: pode exigir **FK opcional** `parent_invoice_id` ou uso de `subscription_id` + convenções de listagem |
| D3, D5, E2 | Recorrência por item e “cobrar outra data”: provável **novo modelo** ou extensão de `customer_invoice_items` + motor de geração (job) |
| D2 | Integração conceitual charges × subscriptions × invoices |
| C2 | Depende das capacidades de **cada gateway** (múltiplos métodos na mesma cobrança) |
| G1, G2 | **Pagamento embutido**: APIs de PIX/cartão **hosted fields** vs. redirect; diferença entre gateways |
| G3 | **Múltiplos gateways** na mesma fatura pode conflitar com `gateway` único na linha da fatura — decisão de modelo |
| H2 | Cartão na página própria: escopo PCI, tokenização, 3DS |
| H3 | Garantir que fluxo embutido continue alimentando **webhook** / `payment_events` como hoje |
| H4 | Alinhar worker de **subscriptions** com recorrência “por item” sem duplicar lógica |

**Classificação resumida (estrutural / alto risco):** D1, D3, D5, E1, E2, G1–G3 (modelagem e integração), H1–H4.

---

## 6) Fases recomendadas

Ordem pensada para **maximizar valor com mínimo risco** e **não bloquear produção**.

### Fase 0 — Alinhamento (sem código obrigatório) ✅ **Concluída**

- ~~Resolver itens da seção **7) Decisões pendentes** prioritários para recorrência e pagamento embutido.~~ → Ver **§ 7.1**.
- ~~Registrar critério oficial de “gateway configurado” para o aviso A1.~~ → Ver **§ 7.2**.

### Fase 1 — Quick wins (baixo risco)

- A1, A2, A3, A4, A7, A8, A9, A10  
- Início de F1 (layout público sem depender de branding dinâmico, se preferir dividir)

### Fase 2 — Formulário e máscaras (criação de fatura)

- A5, A6 (com regra de arredondamento documentada)  
- B1 + B2 + B3: busca reutilizável (primeiro consumir API existente; depois extrair componente compartilhado com projetos)

### Fase 3 — Cobrança e forma de pagamento (médio risco)

- B4 (busca em cobranças)  
- C1 (gateway na criação, se aplicável ao multi-gateway já existente)  
- C2 só após **H1** e decisão de negócio sobre múltiplos métodos

### Fase 4 — Recorrência “versão 1” (médio/alto risco)

- D1: histórico pai/filhas com **modelo mínimo** (ex.: vínculo explícito ou uso documentado de subscription)  
- D5 + D3 em **escopo reduzido** se produto aprovar (ex.: recorrência homogênea primeiro; por item na sequência)  
- D2 após decisão 7.x sobre charges

### Fase 5 — Recorrência avançada e programação por item (estrutural)

- E1, E2, D3 completo (per-item, diário), C3 (engrenagem + sanfona)  
- Depende de jobs, testes de carga e migrações incrementais

### Fase 6 — Pagamento embutido na tela pública (alto risco)

- G1, G2 após estudo H1–H3 e escolha de gateways suportados na V1  
- G3 por último, quando modelo de “múltiplas opções” estiver fechado

### Fase 7 — Polimento e padronização

- F1, F2 (logo e header comercial — requer origem dos dados: tenant, settings, etc.)  
- Revisão de acessibilidade e textos

**Nota:** Fases 4–6 podem ser **parcialmente paralelizadas** apenas onde não haja dependência de schema (ex.: UI da engrenagem C3 pode ser esqueleto antes da lógica).

---

## 7) Decisões pendentes

Formato: **pergunta → opções / impacto** (a serem respondidas pelo produto).

1. **Recorrência e cobrança (D2)**  
   - Toda recorrência gera/atualiza um `customer_charges`?  
   - Ou charges permanecem opcionais e recorrência liga só a `subscriptions`?

2. **Recorrência por item vs. fatura pai (D3, D5, E2)**  
   - Cada ciclo gera **nova** `customer_invoice` sempre?  
   - Quando “cobrar outra data”, a filha substitui conceito de “parcela” ou é fatura independente com FK?

3. **Pagamento embutido (G1–G2)**  
   - Suportar **todos** os gateways ou apenas um subconjunto na V1 (ex.: só PIX onde a API permitir QR estático/dinâmico na resposta)?

4. **Múltiplos gateways na mesma fatura (G3, C2)**  
   - Uma fatura continua com **um** `gateway` e **uma** cobrança ativa, ou o produto aceita “escolha do cliente” gerando **várias** cobranças pendentes?

5. **Cartão na tela (G2)**  
   - Usar apenas **redirect/checkout hospedado** do gateway (menor PCI) vs. **elementos embutidos** — decisão de compliance.

6. **Branding na tela pública (F2)**  
   - Fonte da logo e textos comerciais: `tenants`, settings existentes ou novo cadastro “página de pagamento”?

7. **Busca de cliente (B1)**  
   - Autocomplete com debounce + endpoint dedicado vs. filtro em lista já carregada — impacto em tenants com muitos clientes.

8. **Desconto % (A6)**  
   - Arredondamento por item vs. por fatura; compatibilidade com total enviado ao gateway.

### 7.1 Registro Fase 0 — decisões adotadas (alinhamento)

**Data de registro:** 2025-02-25  
**Natureza:** decisões de produto/arquitetura **provisórias vigentes** para o roadmap; podem ser revistas por escrito sem alterar código legado já compatível.

| # | Tema | Decisão adotada |
|---|------|-----------------|
| 1 | **Recorrência × `customer_charges` (D2)** | Recorrência **primária** permanece em **`subscriptions` (type=customer)** + worker existente. **`customer_charges`** continua **opcional** (agrupamento manual). **Não** exigir criação automática de cobrança para cada ciclo de recorrência na V1. Reavaliar vínculo “cobrança = recorrência” na Fase 4 se o produto solicitar. |
| 2 | **Ciclos e fatura pai/filha (D3, D5, E2)** | Cada ciclo da assinatura gera **nova** `customer_invoice` (alinhado ao motor atual). Conceito **“cobrar em outra data”** / **fatura filha** com FK explícita: **fora do escopo imediato**; especificação de modelo na **Fase 5+**, antes de qualquer migration. |
| 3 | **Pagamento embutido (G1–G2)** | **V1** em **subconjunto** de cenários/gateways: priorizar **PIX** usando dados **já** retornados pela API (QR / copia e cola em `gateway_metadata` ou equivalente), sem comprometer “todos os gateways” de uma vez. |
| 4 | **Múltiplos gateways / métodos (G3, C2)** | Uma `customer_invoice` mantém **um** `gateway` e **uma** cobrança ativa (`gateway_reference_id`). **Várias formas de pagamento** na mesma fatura **somente** se a **API do gateway** permitir em **uma** cobrança. **Não** permitir múltiplos gateways distintos na mesma fatura na V1. |
| 5 | **Cartão na tela (G2)** | Priorizar **redirect / checkout hospedado** do provedor (menor escopo PCI). **Campos de cartão embutidos** no PainelCRM apenas após estudo **H2** e aprovação explícita. |
| 6 | **Branding tela pública (F2)** | **Primeira entrega:** usar dados já existentes do **tenant** (nome, e eventualmente logo se o modelo já expuser). **Cadastro dedicado “página de pagamento”** fica como **evolução opcional** (sem obrigatoriedade de nova tabela na Fase 1). |
| 7 | **Busca de cliente (B1)** | **Fase 2:** busca com **debounce** + **API** (parâmetro de filtro / endpoint de busca), **não** depender de carregar todos os clientes no browser para tenants grandes. |
| 8 | **Desconto % (A6)** | Calcular desconto percentual **por linha**, arredondar **cada linha em centavos** (inteiro), depois **somar** linhas para o total da fatura; total enviado ao gateway = soma já arredondada (compatível com valor único de cobrança). **Implementado (Fase 2):** na UI de nova fatura, `lineDiscountCents` aplica `min(subtotal_cents, round(subtotal × pct/100))`; desconto em R$ continua como `min(subtotal, round(valor_reais × 100))`. |

### 7.2 Critério oficial — “gateway configurado” (A1 e backend)

**Fonte de verdade hoje (produção):**

- Serviço `validateInvoicePreconditions` (`packages/backend/src/services/customerInvoicePreconditions.ts`):  
  **`gatewayConfigured = true`** quando `getActiveConfig('crm', tenantId)` retorna **configuração ativa** (registro existente para o contexto CRM do tenant).  
- **Não** exige, neste critério atual, que o último teste de conexão tenha sido `success` (embora `payment_gateway_configs` possua `last_connection_status` / `last_connection_test_at`).

**Para a Fase 1 (A1 — aviso visual reforçado):**

- **Comportamento mínimo:** exibir aviso destacado quando `gatewayConfigured === false` (igual ao retorno de pré-condições / mesma regra do backend).  
- **Evolução opcional (sem quebrar compatibilidade):** estender endpoint de pré-condições ou criar GET leve para expor `last_connection_status` e, **em paralelo**, tratar “config existe mas último teste falhou” como aviso **diferente** (ex.: amarelo “teste pendente”) — documentar antes de implementar.

**Referência cruzada:** `docs/ANALISE-IMPLANTACAO-SEGURA-EVOLUCAO-FINANCEIRO.md` (preservação de gateway e webhook).

---

## 8) Recomendação final

1. **Não** iniciar recorrência por item nem pagamento embutido completo **sem** fechar as decisões da seção 7 e os estudos H1–H4.  
2. **Iniciar** por **Fase 1** e **Fase 2**: ganho perceptível ao usuário, baixo risco para produção e reforço de qualidade na tela pública (incluindo correção de data).  
3. **Tratar** busca de cliente (B1–B3) como **componente de plataforma**: reduz duplicação e alinha UX com projetos — bom investimento médio prazo.  
4. **Recorrência**: primeiro entregar **histórico e vínculo claro** (D1) com o modelo atual (`subscription` / worker) antes de expandir para **per-item** e **multi-datas** (E2).  
5. **Pagamento na tela**: caminhar por **PIX e links já retornados pela API** (exibir inline QR/copia-e-cola **sem** novo fluxo de cobrança) como passo intermediário de menor risco; **depois** avaliar captura de cartão conforme gateway.  
6. Manter **compatibilidade**: toda nova coluna ou tabela deve ser **opcional**; fluxos atuais (webhook, status, cancelamento com sync quando existir) permanecem válidos sem migração forçada de dados antigos.

---

*Documento gerado para orientação de roadmap. Revisões futuras devem atualizar este arquivo após decisões de produto e spikes técnicos.*

---

## 9) Histórico de fases do plano

| Fase | Status | Notas |
|------|--------|--------|
| **0** — Alinhamento | ✅ Concluída (2025-02-25) | Decisões em § 7.1; critério gateway em § 7.2 |
| **1** — Quick wins | ✅ Concluída (2025-02-25) | A1–A4, A7–A10 + início F1 (layout `/pay`): `GET /api/customer-invoices/gateway-status`, aviso laranja condicional, destaque “fatura por link”, detalhe (link no topo, vencimento+criação), select PIX/Boleto/Cartão + sentinela `__default__`, data segura na pública, máscaras + empresa persistida em `clients.company` |
| **2** — Formulário e máscaras | ✅ Concluída (2025-02-25) | **A5:** `parseBrl` / `formatBrlDisplay` (`src/lib/brlCurrencyInput.ts`), blur em valor unitário, desconto R$ e valor único. **A6:** desconto por linha em **R$** ou **%**; `discount_cents = min(subtotal_cents, round(subtotal_cents × pct/100))` com pct ∈ [0,100], alinhado a §7.1 #8. **B1–B3:** `GET /api/clients?q=` (ILIKE, limite 50), `ClientSearchCombobox` (`src/components/clients/ClientSearchCombobox.tsx`), modo local no wizard (`Step2BasicConfig`) e remoto na nova fatura; criar cliente via `AddClientDialog`. |
| **3** — Cobrança e gateway na criação | ✅ Concluída (2026-03-19) | **B4 (parcial):** busca/filtragem local da lista de `charge_id` na tela de nova fatura (`src/pages/CustomerInvoiceNew.tsx`), por descrição/ID. **C1:** backend já usa gateway ativo via `getActiveConfig('crm', tenantId)` + `getActiveGateway` ao criar fatura (sem UI extra nesta fase). |
| **4** — Recorrência v1 (histórico) | ✅ Concluída (2026-03-19) | **D1 implementado com modelo mínimo** sem migração: endpoint `GET /api/customer-invoices/:id/recurrence-history` (baseado em `subscription_id`) e exibição no detalhe da fatura (`src/pages/CustomerInvoiceDetail.tsx`) com lista cronológica das faturas do ciclo recorrente e destaque da fatura atual. **D3/D5 reduzido**: mantido fora deste passo, sem recorrência por item. |
| **5** — Recorrência avançada / programação por item | ✅ Concluída (2025-02-25) | Migrações **80** + **81**; worker renovação + `processChildItemDueInvoices` (E2); UI engrenagem/sanfona por item. |
| **6** — Pagamento embutido na tela pública | ✅ Concluída (2025-02-25) | **G1/G2 (V1 subset)** em `src/pages/CustomerInvoicePay.tsx`: PIX **primário** (QR + copia e cola) na própria tela; links de cobrança/boleto do gateway como **fallback** (“Outras formas”). **Polling** leve (~5s) em `GET /api/public/customer-invoices/pay/:token` enquanto status ∈ {pending, waiting_payment, processing, overdue} para refletir webhook (confirmação sem F5); botão **Atualizar status**; `aria-live` no status. Sem captura de cartão na app (§7.1 #5). Ver `docs/H1-FASE6-PAGAMENTO-PUBLICO.md`. |
| **7** — Polimento e padronização | ✅ Concluída (2026-03-19) | **F1/F2 + acessibilidade/textos** na tela pública: header com branding do tenant (nome, logo opcional, contato) via `tenant_branding` no `GET /api/public/customer-invoices/pay/:token`; fallback visual quando sem logo; melhorias de hierarquia visual e textos de pagamento seguro. |
| **8** — Consolidação (B4 + risco + docs) | ✅ Concluída (2025-02-25) | **B4:** `listCharges` com `q` (ILIKE) já existente; acrescentado **telefone** do cliente; UI `CustomerInvoiceNew` com texto explicando busca server-side, limite **100**, `id` no campo de busca. **Docs:** `docs/H2-H3-H4-FASE8-STUBS.md`; checklist migração **81** em `PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md` §9. |
| **9** — Recorrência por item controlada | ✅ Concluída (2025-02-25) | **Regras** formalizadas em `docs/FASE9-RECORRENCIA-POR-ITEM.md` (D3/D5/E1/E2). **Flags:** `billingEnv.ts` — `BILLING_CHILD_ITEM_INVOICES_ENABLED`, `BILLING_CHILD_BATCH_LIMIT`. **Observabilidade:** `child_batch_summary` + log quando E2 desligado. **Env:** `docs/ENV-BILLING.md`. |
| **10** — Pagamento público avançado | ✅ Concluída (2025-02-25) | **Sem G3:** `has_payment_payload` + `payment_options_summary` no GET/POST públicos (`publicPayPayloadMeta.ts`); telemetria opcional `PUBLIC_PAY_TELEMETRY_LOG`; UI com polling adaptativo e alerta “cobrança em preparação”. Ver `docs/FASE10-PAGAMENTO-PUBLICO-AVANCADO.md`. |
| **11** — Operação e qualidade | ✅ Concluída (2025-02-25) | Matriz de rollout + critérios de aceite + backlog (`docs/FASE11-OPERACAO-E-QUALIDADE.md`); testes Vitest `publicPayPayloadMeta.test.ts` (contrato payload público). |
