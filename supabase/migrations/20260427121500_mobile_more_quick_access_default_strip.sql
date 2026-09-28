-- Padrão inicial do "Acesso rápido" no menu mobile "Mais".
-- A ordem fixa (Leads → Propostas → Contratos → Tickets → Clientes → Faturas) e o fallback
-- para novos utilizadores sem preferências estão em:
--   src/lib/mobileMoreQuickAccess.ts  (DEFAULT_MOBILE_QUICK_ACCESS_STRIP_IDS, defaultVisiblePriorityOrder).
-- Preferências personalizadas persistem apenas no browser: localStorage
--   painelcrm.mobileMoreQuickAccess.v1:<userId>
-- Não há tabelas ou colunas a alterar nesta migração.

SELECT 1;
