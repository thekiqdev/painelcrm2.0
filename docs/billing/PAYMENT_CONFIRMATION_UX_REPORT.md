# Payment Confirmation UX — Sprint 4.1M

## Antes

1. Usuário clicava **Confirmar pagamento** no histórico/calendário.
2. `ConfirmPaymentDialog` era apenas revisão visual.
3. `openInvoiceRegisterPayment` abria nova aba com `?action=register_payment`.
4. Confirmação real só na tela da fatura.

## Depois

1. Mesmo botão **Confirmar pagamento** (ícone banknote).
2. Dialog completo na assinatura.
3. API chamada no lugar.
4. `load()` atualiza toda a experiência financeira.

## Critérios atendidos

- [x] Confirmação sem sair da assinatura
- [x] Banco recebedor no dialog
- [x] Sincronização imediata pós-confirmação
- [x] Fuso da conta nas datas do dialog e no “hoje” do store

## Testes

- `src/lib/billingSafeDate.test.ts` — fuso SP vs UTC
- Fluxo manual: confirmar → histórico mostra **Pago** sem reload
