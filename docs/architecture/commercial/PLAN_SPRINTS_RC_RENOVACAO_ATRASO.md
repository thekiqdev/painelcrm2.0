# Plano de sprints — Renovação em atraso (RC)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-14 |
| **Tipo** | Plano de implantação (antes do código) |
| **Nome** | **RC — Renovação em atraso a partir do pagamento** |
| **Status** | **S1–S4 feitos** |
| **Pedido** | Cliente com dois meses sem pagar deve pagar **um** ciclo do que vai usar, a partir da data do pagamento — não quitar competências já vencidas |

---

## 1. Meta

1. Pagamento em atraso com backlog compra **um** intervalo para a frente (`paid_at` → próximo ciclo).
2. As outras `plan_renewal` abertas desse atraso são canceladas (banco e gateway) e deixam de ser cobráveis.
3. Quem paga em dia, ou com uma única fatura ainda cobrindo período futuro, **não muda** de dia de vencimento nem de período.

Exemplo de aceite do produto (mensal, dia de ciclo 29, pagamento em 14/10/2026):

| Antes | Depois de um pagamento de R$ 147 |
|-------|----------------------------------|
| Fatura 29/08–29/09 vencida | Cancelada |
| Fatura 29/09–29/10 vencida | Cancelada |
| `plan_period_end` no passado (acesso 402) | Vigência **14/10–14/11** |
| Próxima cobrança no dia 29 | Próxima cobrança **14/11** (`billing_anchor_day` = 14) |

---

## 2. Como está hoje

A baixa de `plan_renewal` copia o período já gravado na fatura. Não usa a data do pagamento.

| Peça | Comportamento |
|------|----------------|
| Job `executeSaasRenewal` | Cria a fatura do ciclo quando `next_billing_date` chega, **mesmo com a anterior sem pagamento**, e já avança `next_billing_date` |
| `confirmSaasRenewalFromAsaasPayment` | Na baixa: `current_period_*`, `next_billing_date` e `tenants.plan_period_end` = `period_start` / `period_end` da fatura |
| Acesso | `requireActivePlanPeriod` olha só `tenants.plan_period_end`. Período da subscription andar na geração da fatura **não** libera o CRM |
| Irmãs | Pagar uma renovação **não** cancela as outras. Cancelamento de `plan_renewal` abertas existe só após mudança contratual (`cancelOpenPlanRenewalBillingsForTenant`) |
| Meu Plano | Cada fatura aberta/vencida tem **Abrir** / **Pagar** (`goOpenSaasBillingPay`) |
| 1ª contratação | `activatePlanFromBilling` já começa o período em `new Date()` + intervalo. **Fora** deste plano |
| Snapshot / comissão | `plan_renewal` não regrava contrato. Manter assim |

Efeito se o cliente da tela pagar em 14/10 **sem** esta mudança:

- Fatura 29/09–29/10 → vigência só até 29/10; a de agosto continua vencida; no dia 29 o job emite outra cobrança.
- Fatura 29/08–29/09 → `plan_period_end` = 29/09 (já passou) → 402 no mesmo dia.
- Pagar as duas → R$ 294 e a vigência fica a do último webhook, ainda no dia 29.

A contratação paga com “Vencimento 05/08” não tem `period_start`/`period_end`; a referência da tela cai no vencimento da fatura. O ciclo no dia 29 vem de `subscriptions.next_billing_date`, não dessa data.

---

## 3. Decisões

| ID | Decisão |
|----|---------|
| **D-RC.1** | Um pagamento em atraso = **um** ciclo para a frente. Não cobra os meses pulados |
| **D-RC.2** | Gatilho estreito: `plan_period_end` **já passou** e existe **pelo menos outra** `plan_renewal` aberta cujo `period_end` também já passou. É o backlog de mais de um ciclo |
| **D-RC.3** | Fora do gatilho, a baixa continua copiando o período da fatura. Cobre: pagamento no vencimento; atraso curto com **uma** fatura cujo `period_end` ainda é futuro; 1ª contratação |
| **D-RC.4** | No caso elegível, `period_start` = data do pagamento (calendário local da baixa), `period_end` = `calculateNextBillingDate(period_start, interval)`. `next_billing_date` e `billing_anchor_day` acompanham esse fim (o dia fixo **muda** — de 29 para 14 no exemplo). Isso é desejado só neste gatilho |
| **D-RC.5** | Cancelar as outras `plan_renewal` abertas **antes** do checkout, com `cancelPayment` best-effort no gateway. A baixa antiga não pode continuar pagável em paralelo |
| **D-RC.6** | A fatura que o cliente paga (ou a nova criada no restart) grava o período novo. O histórico não pode dizer que ele pagou 29/08–29/09 |
| **D-RC.7** | Trava na baixa: se uma fatura velha for paga mesmo assim, reancorar **uma** vez e não somar outro mês se uma segunda baixa chegar em seguida |
| **D-RC.8** | Assinatura com `asaas_subscription_id` (cartão gerenciado no Asaas) **não** entra neste restart. O vencimento de lá é outro cérebro. PIX/boleto avulso entra |
| **D-RC.9** | Não alterar o scheduler nem `executeSaasRenewal` do ciclo em dia. O restart só move `next_billing_date` para o job não emitir o dia antigo |
| **D-RC.10** | CRM `customer_invoices`, snapshot contratual, comissão de parceiro e `seat_addon` / `instance_addon` ficam de fora |

---

## 4. Fora de escopo

- Perdão parcial, desconto ou pró-rata dos meses atrasados (o valor continua o do ciclo cheio contratado).
- Mudar o dia de vencimento de quem está adimplente.
- Sincronizar `nextDueDate` de Assinatura Asaas (D-RC.8).
- Reescrever `plan_period_end` de quem já está vigente.
- Cobranças de cliente final do tenant.

---

## 5. Sprints

| Sprint | Escopo | Status |
|--------|--------|--------|
| **S1** | Função pura de elegibilidade + testes do gatilho (D-RC.2 / D-RC.3). Sem side effect | **Feito** |
| **S2** | Operação de restart: cancelar irmãs (banco + gateway), uma `plan_renewal` com período para a frente, `next_billing_date` alinhado | **Feito** |
| **S3** | Trava na baixa se a fatura velha for paga mesmo assim (D-RC.7). Não empilhar segundo mês | **Feito** |
| **S4** | Meu Plano: uma ação de renovar agora; Abrir/Pagar some das vencidas do backlog; histórico coerente | **Feito** |

S2 não liga na UI. S3 não muda a lista. S4 não mexe na regra.

---

## 6. Aceite S1

Arquivo novo de regra (sem SQL de escrita), coberto por teste. Entrada mínima: `plan_period_end`, intervalo, data do pagamento, lista de `plan_renewal` abertas (`period_start`, `period_end`, status), flag `asaas_subscription_id`.

- [x] Caso da tela (vigência vencida + faturas 29/08–29/09 e 29/09–29/10, pagamento 14/10, mensal) → elegível; período resultante 14/10–14/11
- [x] Pagamento no vencimento, uma fatura com `period_end` futuro, `plan_period_end` ainda vigente ou igual ao início do ciclo → **não** elegível
- [x] Uma única fatura em atraso cujo `period_end` ainda é futuro (atraso curto, sem segunda fatura encerrada) → **não** elegível
- [x] `asaas_subscription_id` preenchido → **não** elegível, mesmo com backlog
- [x] Intervalo anual usa o mesmo cálculo de `calculateNextBillingDate` (não hardcode de +1 mês)
- [x] S2/S3/S4 não misturados

---

## 6.1 Aceite S2

Serviço chamado por endpoint autenticado do tenant (quem já gerencia o plano). Ainda sem trocar os botões da lista.

- [x] Cancela todas as `plan_renewal` em `pending` / `waiting_payment` / `processing` / `overdue` do tenant via `cancelOpenPlanRenewalBillingsForTenant`
- [x] `cancelPayment` best-effort nas refs de gateway das canceladas (mesmo padrão do reconcile CS S2). Falha de gateway não desfaz o cancelamento local; fica logado
- [x] Cria **uma** `plan_renewal` com `due_date` = hoje, `period_start` / `period_end` da regra S1, valor = ciclo contratado atual (não soma os meses atrasados)
- [x] Atualiza `subscriptions.next_billing_date` (e, pelo caminho já existente, `billing_anchor_day`) para `period_end`, para o job não gerar a competência do dia 29
- [x] Não mexe em `contracted_*`, `activated_billing_id` nem em faturas `paid`
- [x] Idempotente: segundo clique não cria segunda fatura aberta nem cancela a que acabou de nascer
- [x] Recusa se S1 disser não elegível (resposta clara, sem cancelar nada)
- [x] Recusa assinatura Asaas (D-RC.8)
- [x] S3/S4 não misturados

---

## 6.2 Aceite S3

Dentro de `confirmSaasRenewalFromAsaasPayment` (todo `plan_renewal` pago passa por aqui, inclusive PIX).

- [x] Fatura paga **fora** do gatilho: período continua o da fatura. Teste atual de “avança 28/09–28/10” permanece verde
- [x] Fatura velha paga **dentro** do gatilho: vigência e subscription passam a ser pagamento → próximo ciclo, não o `period_*` histórico
- [x] A própria fatura paga é atualizada para o período novo (recibo / Meu Plano)
- [x] Irmãs abertas são canceladas (banco + gateway), inclusive a outra vencida
- [x] Segunda baixa de outra fatura do mesmo backlog, depois da reancoragem, **não** soma mais um mês (`renewal_confirmed_at` / marcador de restart)
- [x] `billing_cycle_count` sobe 1, não 2
- [x] Past_due / suspensão por inadimplência limpam como a baixa já faz hoje
- [x] `plan_renewal` pago **não** dispara o reconcile de mudança contratual (CS) e **não** regrava snapshot
- [x] S4 não misturado

---

## 6.3 Aceite S4

`MeuPlano` (desktop e mobile), bloco Cobranças.

- [x] Com backlog elegível, as linhas vencidas **não** abrem checkout individual (`Abrir` / `Pagar`)
- [x] Uma ação **Renovar agora** chama o endpoint da S2 e segue para o pagamento da fatura nova
- [x] Depois do restart, a referência visível é o período novo (14/10 — 14/11), não 29/08 — 29/09
- [x] Linhas canceladas aparecem como canceladas, sem ação de pagar
- [x] Conta adimplente (uma renovação futura) continua com Abrir/Pagar naquela fatura
- [x] Quem não pode gerenciar plano não vê a ação

---

## 7. Verificação

- Testes de S1–S3 no backend (elegibilidade, restart idempotente, baixa antiga vs baixa em dia, segunda baixa não empilha).
- S4: fluxo em Meu Plano — conta com duas vencidas gera uma cobrança e as antigas somem da ação; conta com uma renovação futura continua pagando aquela fatura. Conferir desktop e mobile.
- Não há suíte que precise do job de renovação em dia alterado. Se algum teste de `executeSaasRenewal` quebrar, a sprint passou do escopo.

---

## 8. Kickoff

- **`ok sprint 1`** — regra pura
- **`ok sprint 2`** — restart no backend
- **`ok sprint 3`** — trava na baixa
- **`ok sprint 4`** — Meu Plano
