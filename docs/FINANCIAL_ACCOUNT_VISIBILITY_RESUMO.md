# Visibilidade de contas financeiras — nota sobre resumo (`GET /api/financial/summary`)

Os totais agregados (`total_income`, `total_expense`, `monthly`, etc.) continuam calculados ao nível do **tenant**, porque envolvem movimentos globais e outras fontes (ex.: faturas pagas).

A lista **`accounts`** na mesma resposta é **filtrada** conforme `visibility_mode` e `financial_account_permissions`: o utilizador só vê saldos de contas que tem permissão para visualizar.

Para um resumo financeiro totalmente restrito por conta seria necessário refactor adicional nas consultas agregadas.
