# Plano de correção — UX de Faturas e pagamento (produto)

**Versão:** 2.0 (refino pré-execução)  
**Status:** planejamento — **não** inclui implementação de código neste documento.  
**Base:** `docs/AUDITORIA-FUNCIONAL-FATURAS-UX.md`, `docs/H1-FASE6-PAGAMENTO-PUBLICO.md`.

---

## 0. Propósito e princípios de produto

### 0.1 Objetivo deste plano

Elevar a experiência de **faturas de clientes** e **pagamento público** ao nível esperado de um **SaaS B2B profissional**: previsível, transparente, com hierarquia visual clara e **sem mensagens que contradizam o comportamento real** — mesmo quando a integração com o gateway impõe limites (ex.: cartão apenas em checkout hospedado).

### 0.2 Princípios orientadores

| Princípio | Significado para o usuário |
|-----------|----------------------------|
| **Transparência de canal** | O usuário entende *onde* paga (nesta página vs portal do provedor) e *por quê*. |
| **Consistência semântica** | Os mesmos conceitos (status, recorrência, “link de pagamento”) usam a mesma linguagem em listagem, detalhe e página pública. |
| **Hierarquia de ação** | Na página de pagamento, o método **principal da cobrança** tem destaque; alternativas e fallbacks são secundários, mas visíveis. |
| **Produto dono da jornada** | O PainelCRM é o **quadro de controle** da cobrança (marca, resumo, instruções, confirmação); o gateway é **meio**, não “o produto”. |
| **Estados honestos** | Carregamento, erro e “aguardando gateway” comunicam *o que está acontecendo*, não culpam o usuário. |

### 0.3 Públicos

- **Emissor da fatura (tenant):** precisa confiança ao copiar link, explicar ao cliente e acompanhar status.  
- **Pagador (cliente final):** precisa concluir pagamento com mínima dúvida e sem sensação de “site quebrado”.  
- **Operação interna (CS/suporte):** precisa de vocabulário único para não contradizer a UI.

---

## 1. Reanálise do plano anterior e lacunas identificadas

O plano v1 focava corretamente em **copy** e **badge de recorrência**, mas deixava lacunas para um produto maduro:

| Lacuna | Descrição |
|--------|-----------|
| **L1 — Modelo mental dos métodos** | Não havia especificação de *como* apresentar PIX vs boleto vs cartão como **três experiências distintas** (não só três botões). |
| **L2 — Hierarquia visual** | Faltava definir ordem, peso (primário/secundário) e quando esconder vs mostrar cada bloco. |
| **L3 — Sistema de status** | Faltava mapa único status → cor → label → próxima ação, para listagem e detalhe. |
| **L4 — Voz do produto** | Faltava glossário e anti-padrões (“gateway” genérico vs “provedor de pagamento”, “pagar aqui” vs “continuar no site seguro”). |
| **L5 — Recorrência como produto** | Faltava narrativa: não é só um badge — é *compreensão* (o que acontece no próximo ciclo, onde ver histórico). |
| **L6 — “Não parecer intermediário”** | Faltava checklist de reforços de marca, confiança e conclusão de jornada além do link externo. |

Este documento incorpora essas lacunas nas seções **A–E** e no **backlog estruturado**.

---

## A) Experiência de pagamento (página pública e mensagens associadas)

### A.1 Diferença clara entre PIX, boleto e cartão

**Realidade técnica (H1):** PIX pode ser exibido **na própria página**; boleto e cartão dependem de **URL/checkout do provedor** — o usuário **sai** para concluir (PDF ou portal).

**Diretrizes de produto:**

1. **Três “modos de experiência”, não três botões iguais**

   | Método | Experiência-alvo | Mensagem-chave (conceito, não copy final) |
   |--------|-------------------|-------------------------------------------|
   | **PIX** | Conclusão **nesta tela** (QR + copia e cola) | “Pague aqui; use o app do seu banco para escanear ou colar o código.” |
   | **Boleto** | **Download/visualização** fora da app (PDF/link) | “Abra o boleto em nova aba; o pagamento é registrado pelo banco e confirmado automaticamente.” |
   | **Cartão** | **Checkout seguro do provedor** | “Você será direcionado ao ambiente seguro do provedor para digitar os dados do cartão.” |

2. **Evitar colapsar tudo em “outras formas”** sem contexto: o bloco secundário deve deixar explícito **que** será aberto (PDF, portal de cobrança, etc.) quando a API permitir inferir.

3. **Ordem e destaque visual (recomendação)**

   - **Primeiro:** sempre o que a cobrança **prioriza** na prática — em geral **PIX** quando `hasPix` (bloco já existente com borda/destaque).  
   - **Segundo:** “Outras formas” ou “Boleto e link da cobrança” com peso visual **menor** (outline, tipografia secundária).  
   - **Consistência:** mesma ordem em estados “carregando payload”, “payload pronto” e “só link genérico”.

4. **Comportamento consistente**

   - Links externos: sempre `target="_blank"` + ícone “abre fora” + texto curto de acessibilidade.  
   - Após voltar da aba externa: manter **“Atualizar status”** e polling visíveis (já existe — reforçar na copy que a confirmação pode levar minutos no boleto).  
   - Quando **só** existir `invoiceUrl` (sem PIX): o CTA principal deve explicar **checkout hospedado**, não parecer “botão genérico”.

### A.2 Detalhe da fatura (emissor) — alinhado à página pública

- O bloco **Link de pagamento** deve usar a **mesma lógica de três modos** (resumo curto): ex. “Seu cliente abre uma página **do [nome do produto]**; **PIX** na própria página; **boleto e cartão** podem abrir o **provedor de pagamentos**.”  
- Remover frases que implicam **sempre** “pagar no gateway”.

### A.3 Estados especiais

- **Cobrança em preparação:** explicar **causa** (processamento no provedor), **o que fazer** (aguardar / atualizar), **quando se preocupar** (após X minutos → contato ao emissor).  
- **Fatura já paga / cancelada na página pública:** mensagem inequívoca + opcional “guarde este comprovante” (tom SaaS).

---

## B) Consistência de UX (textos, vocabulário e anti-contradições)

### B.1 Glossário mínimo (uso interno + UI)

| Termo | Uso recomendado | Evitar |
|-------|-----------------|--------|
| Provedor de pagamentos / parceiro de pagamentos | Quando o usuário sai para outro site | “Gateway” em texto para cliente final (muito técnico) |
| Página de pagamento / link de pagamento | URL pública `/pay/...` | “Link do Asaas” como sinônimo do link do produto |
| Checkout seguro | Cartão fora da app | “Pagamento no sistema” para cartão quando é redirect |
| Confirmado / Pendente / Vencido | Status operacional | Misturar “status do gateway” e “status da fatura” sem rótulo |

### B.2 Padronização por superfície

| Superfície | Regras |
|------------|--------|
| **Listagem de faturas** | Uma linha: número, cliente, valor, **vencimento**, **status** (chip), opcional **recorrente**. |
| **Detalhe** | Mesmos rótulos de status que na listagem; gateway como linha secundária (“Situação no provedor”). |
| **Página pública** | Status amigável + ação principal; menos jargão interno (`waiting_payment` traduzido). |

### B.3 Anti-padrões a eliminar

- Dizer **“pagar no gateway”** quando o fluxo é **PIX nesta tela**.  
- Usar **“site do gateway”** sem alternativa amigável para o pagador leigo.  
- Mostrar **código técnico de status** sem legenda.

### B.4 Inventário de strings (entregável de implementação futura)

- Consolidar textos sensíveis em um único lugar (ex.: constantes ou arquivo de copy) para **listagem, detalhe, pay, toasts** — reduz contradições em evoluções futuras.

---

## C) Estados da fatura (indicadores e leitura do status)

### C.1 Mapa de status (produto)

Definir para cada `status` interno:

- **Label** em PT-BR (único em todo o app).  
- **Cor/variante** do chip (sucesso, alerta, neutro, erro).  
- **Descrição curta** (tooltip ou texto auxiliar no detalhe): o que significa para o emissor e o que o pagador vê.

Incluir distinção clara entre:

- **Status da fatura** (negócio: pendente, pago, vencido, cancelado…).  
- **Status no provedor** (linha separada, tipografia menor).

### C.2 Indicadores visuais na listagem

- Chips **sempre** na mesma coluna.  
- Opcional: ícone de **vencimento próximo** ou **atraso** (cor diferente do chip de status, para não duplicar semântica).

### C.3 Página pública

- Status em destaque no cabeçalho (já existe) — garantir **contraste** e **aria-live** quando mudar para Pago após polling.

### C.4 Empty e error

- Lista vazia: mensagem acionável (“Criar primeira fatura”) em tom de produto, não técnico.  
- Erro ao carregar fatura pública: distinguir **link inválido** vs **erro de rede**.

---

## D) Recorrência (visível, compreensível, acionável)

### D.1 Problema atual

Recorrência está **clara na criação**, mas pode **sumir no detalhe** se não houver linhas no histórico — o usuário perde o modelo mental de “assinatura / próximas cobranças”.

### D.2 Diretrizes

1. **Sempre que houver assinatura vinculada** (`subscription_id`):

   - **Card ou banner** fixo: “Fatura recorrente” + **próximo ciclo** ou periodicidade, se disponível na API.  
   - Link “Ver histórico de faturas desta assinatura” (âncora para a tabela existente ou estado vazio explicado).

2. **Listagem:** coluna ou ícone **Recorrente** + tooltip “Cobranças automáticas conforme periodicidade”.

3. **Criação (refino opcional):** texto de ajuda curto sob o checkbox explicando **em uma frase** o que o worker fará (sem juridiquês).

4. **Alinhamento com “fatura por link”:** onde recorrência não se aplica, deixar explícito **por que** o checkbox some (evita “bug” percebido).

### D.3 Métrica de sucesso (qualitativa)

- Utilizador consegue responder **sem suporte**: “Esta fatura vai se repetir?” e “Quando é a próxima?”.

---

## E) Experiência final — produto completo, não só intermediário

### E.1 O que significa “completo” neste contexto

O produto **não** precisa processar cartão dentro do iframe para parecer completo; precisa:

- **Marca do tenant** na página pública (já existe — manter qualidade).  
- **Jornada fechada:** emissão → link → pagamento → confirmação visível → (opcional) e-mail — com linguagem do produto.  
- **Confiança:** selos de “pagamento seguro”, explicação do redirect quando houver, sem parecer “página de redirecionamento barata”.

### E.2 Reforços recomendados (backlog UX)

| Reforço | Objetivo |
|---------|----------|
| Rodapé curto na página pública | Contato do emissor + “Dúvidas? Fale com …” |
| Pós-pagamento | Estado “Pago” com data/hora e mensagem de conclusão clara |
| Emissor: pós-criação | Toast ou passo seguinte: “Copie o link e envie ao cliente” com CTA |
| Coerência nome do produto | “PainelCRM” ou white-label futuro — evitar misturar marcas no mesmo fluxo |

### E.3 O que continua fora deste plano (estructural)

- Captura de cartão na app (PCI).  
- Boleto HTML renderizado inline.  
- Multi-gateway escolhível na mesma fatura (G3).  
→ Documentar em roadmap à parte; **não** misturar expectativa com quick wins de copy/UI.

---

## 2. Problemas consolidados (matriz)

| ID | Área | Severidade | Descrição |
|----|------|------------|-----------|
| P1 | A + B | Alta | Copy genérica “gateway” vs comportamento real PIX/boleto/cartão. |
| P2 | A | Alta | Hierarquia visual e explicação por método não formalizada. |
| P3 | D | Alta | Recorrência invisível no detalhe sem histórico. |
| P4 | C | Média | Status e “status no provedor” podem confundir. |
| P5 | A | Média | Estado “em preparação” parece falha sem SLA de expectativa. |
| P6 | E | Média | Sensação de “intermediário” se redirect não for contextualizado. |
| P7 | B | Baixa | Strings espalhadas — risco de nova contradição em PRs futuros. |

---

## 3. Entregas recomendadas (fases) — produto + UX

| Fase | Nome | Entregas principais | Tipo |
|------|------|---------------------|------|
| **F0** | Fundação de copy | Glossário + revisão do bloco “Link de pagamento” + alinhamento listagem/detalhe/público | Rápido |
| **F1** | Pagamento por método | Hierarquia PIX primário; bloco secundário contextualizado para boleto/cartão; rodapé de confiança na página pública | Rápido |
| **F2** | Estados honestos | Microcopy “preparação”; empty/error; tooltips de status | Rápido |
| **F3** | Recorrência | Banner/card no detalhe; indicador na lista; empty state do histórico | Rápido |
| **F4** | Consistência | Mapa visual de status; opcional inventário centralizado de strings | Médio |
| **F5** | Pós-jornada emissor | Reforço pós-criação (copiar link); opcional “criado em” na página pública | Médio |
| **F6** | Estrutural | Fora deste plano: PCI, boleto inline, G3 — roadmap próprio | Projeto |

---

## 4. Rápido vs estrutural (atualizado)

| Rápido (dias úteis) | Estrutural (semanas+) |
|---------------------|------------------------|
| Copy, badges, chips, tooltips, ordem de blocos na pay page | Cartão embutido, boleto HTML, múltiplos gateways na mesma fatura |
| Indicadores recorrência + status | Recorrência diária global (worker) |
| Centralização de strings (preparação i18n) | Integrações adicionais de gateway |

---

## 5. Riscos e mitigações (ampliado)

| Risco | Mitigação |
|-------|-----------|
| Marketing prometer “100% na app” | Uma página interna “Como funciona o pagamento” para CS e materiais. |
| Usuário confundir aba do provedor com phishing | Copy: nome do parceiro + “você saiu do [produto] para concluir com segurança”. |
| Muitas mudanças de copy sem QA | Checklist de aceite por fase + screenshot baseline. |
| API não expõe periodicidade da subscription | Badge genérico “Recorrente” + link para documentação/suporte até API enriquecida. |

---

## 6. Critérios de aceite (expandidos)

### 6.1 Pagamento público

- [ ] Com PIX disponível: bloco primário deixa claro **pagar nesta página**.  
- [ ] Com boleto: usuário entende que **abrirá** PDF/link externo **antes** de clicar.  
- [ ] Com cartão: usuário entende **redirect** para checkout seguro.  
- [ ] Sem payload ainda: mensagem não parece erro fatal; indica próximo passo.

### 6.2 Emissor

- [ ] Detalhe da fatura **não** contradiz a experiência PIX na página pública.  
- [ ] Recorrência visível sempre que aplicável.  
- [ ] Status legível em lista e detalhe com **mesma** nomenclatura.

### 6.3 Qualidade SaaS

- [ ] Fluxo completo em staging: criar → link → pagar (PIX sandbox) → “Pago” sem suporte.  
- [ ] Revisão de **contraste** e **foco** na página pública (acessibilidade básica).

---

## 7. Métricas de sucesso sugeridas (pós-implementação)

| Métrica | Como medir |
|---------|------------|
| Taxa de conclusão percebida | Tempo até status Pago na página pública (sandbox) |
| Redução de dúvidas | Tickets CS sobre “link quebrado” / “tive que ir pro Asaas” (baseline vs depois) |
| Compreensão de recorrência | Teste com 3–5 usuários: perguntas D1–D3 da seção D |

---

## 8. Referências

- `docs/AUDITORIA-FUNCIONAL-FATURAS-UX.md`  
- `docs/H1-FASE6-PAGAMENTO-PUBLICO.md`  
- `docs/PLANO-ANALISE-IMPLANTACAO-FATURAS-STATUS-E-BACKLOG.md`

---

*Documento vivo: incrementar versão ao concluir cada fase F0–F5; não alterar escopo estrutural (F6) sem nova decisão de produto.*
