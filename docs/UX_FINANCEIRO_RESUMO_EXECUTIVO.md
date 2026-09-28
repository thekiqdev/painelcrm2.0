# UX Financeiro - Resumo Executivo

## Problema anterior

A aba `Financeiro > Resumo geral` apresentava muitos cards com conceitos próximos (despesas pagas, planejadas, previstas, saldo previsto e cartões), o que gerava dúvida sobre qual indicador era o principal para decisão do dono da empresa.

## Nova estrutura dos cards

### Linha 1 (visão principal)

1. **Receita recebida**
   - Entradas concluídas + faturas/cobranças pagas.
2. **Receita futura**
   - Valores esperados de assinaturas, recorrências e cobranças abertas.
3. **Despesas**
   - Total consolidado de despesas pagas + despesas futuras.
   - Exibe subtítulo com:
     - `Pagas: R$ X`
     - `Futuras: R$ Y`
4. **Resultado previsto** (destaque visual)
   - Fórmula:
     - `resultado_previsto = receita_recebida + receita_futura - despesas_pagas - despesas_futuras`
   - Com estado visual positivo/alerta conforme o sinal.

### Linha 2 (indicadores de apoio)

1. **Caixa disponível**
   - Soma atual dos saldos das contas cadastradas.
2. **Receita pendente**
   - Cobranças em aberto aguardando pagamento.
3. **Compromissos futuros**
   - Despesas recorrentes, parcelas de cartão e demais despesas futuras previstas.

## Fórmulas e mapeamento usado

- **Receita recebida**
  - `general.received_income` (fallback para `summary.total_income`)
- **Receita futura**
  - `general.projected_subscription_income`
- **Despesas pagas**
  - `general.expense_paid` (fallback para `summary.total_expense`)
- **Despesas futuras**
  - `general.expense_projected` (fallback calculado por `projected_total_expense - total_expense`)
- **Despesas totais**
  - `despesas_pagas + despesas_futuras`
- **Resultado previsto**
  - `general.projected_result` (fallback para a fórmula executiva acima)
- **Caixa disponível**
  - soma de `summary.accounts[].balance`
- **Receita pendente**
  - `subscriptions_projection.pending_subscription_revenue` (subgrupo da receita futura)
- **Compromissos futuros**
  - mesmo valor de `despesas_futuras`

## O que foi removido/fundido na visão principal

Removidos como cards isolados na área principal:

- Despesas planejadas (recorrentes)
- Despesas previstas (realizadas + planejadas)
- Saldo previsto
- Cartão - parcelas previstas
- Faturas de cartão em aberto

Esses conceitos passam a aparecer consolidados em:

- card **Despesas**
- card **Compromissos futuros**
- gráficos e tooltip detalhado
- páginas específicas de Cartões/Recorrências/Relatórios

## Regras de copy

- `Ganhos previstos` -> **Receita futura**
- `Despesas previstas` -> **Despesas futuras** (em gráfico/tooltip)
- `Despesa potencial total` -> **Despesas totais** (tooltip)

Textos aplicados:

- Receita recebida: "Valores já recebidos no período."
- Receita futura: "Valores esperados de assinaturas, recorrências e cobranças abertas."
- Despesas: "Total de despesas pagas e compromissos futuros."
- Resultado previsto: "Receita recebida + receita futura menos despesas do período."
- Caixa disponível: "Soma atual das contas cadastradas."
- Receita pendente: "Cobranças em aberto aguardando pagamento."
- Compromissos futuros: "Despesas recorrentes, parcelas de cartão e contas previstas."

## Alerta de risco

- Se `resultado_previsto < 0`:
  - "Atenção: suas despesas previstas superam sua receita esperada para este período."
- Se `resultado_previsto >= 0`:
  - "Resultado previsto positivo para o período."

## Critérios de aceite atendidos

- Redução de poluição visual e eliminação de cards duplicados.
- Substituição de "Ganhos previstos" por "Receita futura".
- Consolidação de despesas pagas + futuras em um único card principal.
- Remoção de "Saldo previsto" da visão principal.
- Consolidação de cartão/recorrências em "Compromissos futuros".
- Inclusão de "Caixa disponível".
- Destaque do card "Resultado previsto" com estado visual.
- Gráficos mantidos em padrão realizado + previsto, com labels alinhadas aos cards.
- Tooltip com totais e resultado previsto.
