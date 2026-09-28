import { Navigate, useLocation } from "react-router-dom";

/**
 * `/finance/expenses` redirecciona para o hub único **Contas a pagar**
 * (preserva query string e âncora, p.ex. `#hub-regras-recorrencia`).
 */
export default function FinancialUnifiedExpensesPage() {
  const location = useLocation();
  return <Navigate to={`/finance/accounts-payable${location.search}${location.hash}`} replace />;
}
