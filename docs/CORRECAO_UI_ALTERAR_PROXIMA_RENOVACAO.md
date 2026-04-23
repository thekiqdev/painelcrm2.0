# Correção de UI — «Alterar próxima renovação» vs editar fatura

## Causa raiz

### 1) Flash do formulário da fatura (fluxo errado)

Em `CustomerInvoiceNew.tsx`, ao entrar em modo edição o `useEffect` fazia `setEditFlow(null)` **sem** repor `editReady` para `false`.

Se o utilizador já tinha editado outra fatura na mesma sessão (ou reentrava na rota), `editReady` podia continuar **`true`** com `editFlow === null` até o `getRecurrenceInsight` terminar. A condição que mostra o wizard da fatura era:

```tsx
(!isEditMode || !editReady || editFlow !== "renewal")
```

Com `editReady === true` e `editFlow === null`, a expressão era **verdadeira** — apareciam **Data de vencimento**, itens, etc., bindados à **invoice atual**, e não o cartão de renovação.

### 2) Próxima cobrança «antiga» no detalhe após gravar

Em `CustomerInvoiceDetail.tsx`, o `useEffect` que carrega o **recurrence insight** dependia apenas de `[id, invoice?.subscription_id]`.

Ao voltar de `/edit?flow=renewal` para o detalhe da **mesma** fatura, esses valores **não mudavam**, logo o insight **não era refetchado** e o bloco de recorrência podia mostrar a data antiga mesmo com `subscriptions.next_billing_date` já atualizada no backend.

## Como o botão e a URL passaram a funcionar

- **Detalhe** — «Alterar próxima renovação» navega para  
  `/customer-invoices/:id/edit?flow=renewal`.

- **Edição** — ao detetar fatura **paga** com `origin === subscription` e **sem** `flow=renewal` na URL, o efeito faz **replace** para `?flow=renewal` (URL canónica do fluxo de ciclo).

- **Bootstrap** — no início do efeito: `setEditReady(false)` e, se `flow=renewal`, `setEditFlow('renewal')` de imediato, para não haver janela com `editFlow` nulo enquanto `editReady` ainda está true.

## Separação invoice vs renewal

| Fluxo | URL / condição | UI principal | Fonte de verdade ao gravar |
|-------|----------------|--------------|----------------------------|
| **Renewal** | `?flow=renewal` + fatura paga de assinatura | Só data «Próxima cobrança (assinatura)» + texto explicativo | `PATCH .../recurrence/next-billing` → `subscriptions.next_billing_date` |
| **Invoice** | `flow` ≠ renewal (ex.: editar cobrança em aberto) | Formulário completo (vencimento, itens, …) | `PATCH /api/customer-invoices/:id` → `customer_invoices` |

O campo de data no renewal continua a ser preenchido a partir de **`getRecurrenceInsight`** (`subscription.next_billing_date` / `next_charge_date`), **não** a partir de `invoice.due_date`.

## Atualização do detalhe após salvar

O insight passa a depender também de **`location.key`** (React Router). Cada navegação para o detalhe obtém uma chave nova, pelo que o insight é **voltado a carregar** e o bloco de recorrência reflete a nova `next_billing_date`.

## UX

- Cartão de renovação: mensagem explícita de que se altera **só a recorrência futura** nesta tela, não a fatura paga.
- Fluxo de edição da cobrança atual (assinatura em aberto): reforço de que **não** altera a próxima renovação automática.

## Riscos remanescentes

- Utilizadores com URLs antigas sem `?flow=renewal` são redirecionados com `replace: true` — comportamento desejado para faturas pagas de assinatura.
- `location.key` em cenários muito específicos de histórico pode colidir com expectativas; em geral o Router gera chave nova por entrada na pilha.

## Ficheiros alterados (esta correção)

| Ficheiro | Alteração |
|----------|-----------|
| `src/pages/CustomerInvoiceNew.tsx` | Bootstrap `editReady`/`editFlow`; redirect canónico `?flow=renewal`; UX renewal + texto invoice |
| `src/pages/CustomerInvoiceDetail.tsx` | `location.key` nas deps do insight de recorrência |
| `docs/CORRECAO_UI_ALTERAR_PROXIMA_RENOVACAO.md` | Este documento |
