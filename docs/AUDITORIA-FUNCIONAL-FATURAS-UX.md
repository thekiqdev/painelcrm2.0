# Auditoria funcional — Faturas e pagamento (visão do usuário final)

**Tipo:** auditoria comportamental com base na **experiência implementada** nas telas e na documentação de produto (H1/Fase 6), **não** checklist de existência de endpoints.  
**Limite:** não foi executado teste manual em browser com gateway real nesta revisão; recomenda-se **smoke test em staging** (Asaas sandbox) para assinatura final.

**Data:** 2025-02-25

---

## 1. Simulação do fluxo (como o sistema se comporta hoje)

| Etapa | Comportamento observado (UI) |
|-------|------------------------------|
| 1. Criar fatura | Wizard em duas etapas: escolha de cliente (ou fatura por link) → formulário com itens, vencimento, forma de pagamento, recorrência opcional, etc. |
| 2. Gerar / copiar link | No detalhe da fatura (`CustomerInvoiceDetail`), bloco **Link de pagamento** com URL `{origem}/pay/{token}`. |
| 3. Abrir link | A rota **`/pay/:token`** carrega a **aplicação PainelCRM** (página pública `CustomerInvoicePay`), **não** redireciona automaticamente para o domínio Asaas ao abrir o link. |
| 4. Pagar | Depende da **forma de pagamento** e do que o **gateway** devolveu na API (ver §2). |

### Pergunta objetiva: o usuário paga sem sair do sistema?

**Resposta parcial:**

- **PIX:** quando a API pública expõe `pixQrCode` e/ou `pixCopyPaste`, a tela mostra **QR e copia e cola na própria página** (“Pagar com PIX **nesta tela**”). Nesse caso, o usuário **não precisa** abrir o Asaas para pagar — paga no app / no mesmo domínio da fatura pública.
- **Boleto / link genérico de cobrança:** a UI oferece botões **“Boleto (PDF)”** e **“Abrir cobrança no gateway”** com `target="_blank"` → o usuário **vai ao site do gateway** (ou PDF externo). **Não** há boleto renderizado integralmente “dentro” do PainelCRM.
- **Cartão:** **não há** formulário de cartão na página pública. O fluxo é **checkout hospedado** (link externo), conforme `docs/H1-FASE6-PAGAMENTO-PUBLICO.md`.

**Conclusão:** o sistema **não** garante que “todo pagamento seja dentro do PainelCRM”. Garante **PIX inline** quando o payload existe; **boleto e cartão** seguem o desenho **G1 = fallback externo**, explícito na documentação técnica.

---

## 2. Pagamento “inline” por método

| Método | QR na tela? | Copia e cola? | Sem redirecionar? | Observação |
|--------|-------------|---------------|-------------------|------------|
| **PIX** | Sim, se `pixQrCode` for retornado (imagem URL/base64/data URL). | Sim, se `pixCopyPaste` existir; há botão **Copiar**. | Sim para o ato de pagar (usuário usa app do banco). | Pode haver estado **“Cobrança em preparação”** enquanto o gateway não devolve payload (polling na própria página). |
| **Boleto** | Não (não há visualização embutida do boleto na página). | N/A | **Não** — link externo `bankSlipUrl`. | Rótulo: “Outras formas (**site do gateway**)”. |
| **Cartão** | N/A | N/A | **Não** — apenas link `invoiceUrl` para checkout hospedado. | Alinhado ao stub H1: sem PCI na app. |

---

## 3. Itens específicos de validação

### 3.1 Link de pagamento — abre Asaas ou processa no sistema?

- **Abrir o link** `/pay/:token` → permanece no **sistema (PainelCRM)** com branding do tenant.
- **Processar pagamento** → **PIX** pode ser totalmente vivido na página; **boleto/cartão** empurram para o **gateway** (comportamento documentado, não bug por si só).

**Desalinhamento com expectativa “tudo dentro do sistema”:** existe para **boleto e cartão** por decisão de escopo (H1).

### 3.2 Data de criação

- Na **tela interna** de detalhe da fatura há **“Criado em”** com data/hora (`CustomerInvoiceDetail`).
- Na **página pública** de pagamento, o foco é vencimento e total; **não** há destaque explícito de “criado em” (aceitável para o pagador, pode ser lacuna se o plano pedia espelho completo da NF).

### 3.3 Recorrência

- **Na criação:** existe checkbox **“Fatura recorrente (próximas cobranças geradas automaticamente)”** + seletor de periodicidade quando marcado; **oculto** para “fatura por link” (`invoiceByLink`).
- **No detalhe após criar:** o bloco **“Histórico da recorrência”** só aparece se `subscription_id` **e** `recurrenceHistory.length > 0`. Se houver assinatura mas ainda **sem histórico retornado**, o usuário **pode não ver** nenhuma indicação visual forte de “esta fatura é recorrente” além dos dados técnicos implícitos.

### 3.4 Experiência geral

- Fluxo de criação é **denso** (pré-requisitos, itens, opções avançadas por linha, cobrança vinculada, gateway opcional).
- Texto no detalhe do link: *“preencher dados e pagar **no gateway**”* — para quem paga com **PIX na própria tela**, a mensagem é **tendenciosa / incorreta** (ver problemas abaixo).

---

## 4. Lista de problemas reais

### Problemas críticos (impacto forte vs promessa de “pagamento no sistema”)

| ID | Problema |
|----|----------|
| C1 | **Expectativa de negócio:** “tudo dentro do sistema” **não** é verdade para boleto/cartão; só PIX tem experiência nativa na página. Sem comunicação clara para stakeholders, parece falha. |
| C2 | **Cartão:** não há pagamento embutido; dependência total de redirect — esperado pelo H1, **surpresa** para usuário de negócio que não leu o escopo. |

### Problemas de UX

| ID | Problema |
|----|----------|
| U1 | **Copy no detalhe da fatura** diz “pagar **no gateway**”, mas o fluxo PIX é **na própria página** — texto contraditório para quem escolheu PIX. |
| U2 | **Recorrência no detalhe:** ausência de selo/card “Fatura recorrente” quando `subscription_id` existe mas histórico ainda vazio; usuário pode não entender o que marcou na criação. |
| U3 | **Boleto:** só link externo; usuário pode esperar boleto “embutido” como o PIX. |
| U4 | Estado **“Cobrança em preparação”** (sem PIX/link ainda) pode parecer “sistema quebrado” sem copy explicando SLA do gateway. |

### Ajustes menores

| ID | Problema |
|----|----------|
| M1 | Página pública não mostra “criado em” (pode ser opcional). |
| M2 | Periodicidade da recorrência na criação não inclui “diária” no seletor da fatura inteira (já documentado em plano de continuidade como lacuna). |

---

## 5. Relação com o plano estratégico

O plano pedia link único com escolha de forma e experiência coerente. Tecnicamente há:

- Link único **no domínio do produto** — **OK**.
- Escolha de forma — **parcial**: a cobrança no gateway muitas vezes é **uma** forma por cobrança; a UI oferece PIX inline + links para outras — **OK para modelo atual**, não é “checkout com três métodos equivalentes” na mesma tela.
- “Sincronizar Asaas” / notificações — tratado no backend; **fora do escopo desta auditoria UX**.

---

## 6. Recomendação

1. Tratar esta auditoria como **baseline**; validar em **staging** com três faturas de teste: PIX, BOLETO, CARTÃO.  
2. Implementar correções de UX priorizadas em **`docs/PLANO-CORRECAO-UX-FATURAS.md`**.  
3. Alinhar **comunicação interna**: “pagamento integralmente na app” aplica-se a **PIX**; demais métodos usam **site do gateway** por desenho atual.
