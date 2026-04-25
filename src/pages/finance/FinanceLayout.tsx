import React, { Suspense } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Landmark,
  Receipt,
  CreditCard,
  PieChart,
  FileStack,
  ArrowLeftRight,
  Tags,
  Repeat,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/finance", label: "Resumo geral", icon: LayoutDashboard, end: true },
  { to: "/finance/accounts", label: "Bancos e contas", icon: Landmark },
  { to: "/finance/transactions", label: "Entradas e saídas", icon: ArrowLeftRight },
  { to: "/finance/expenses", label: "Despesas", icon: Receipt },
  { to: "/finance/categories", label: "Categorias", icon: Tags },
  { to: "/finance/recurring-expenses", label: "Despesas recorrentes", icon: Repeat },
  { to: "/finance/credit-cards", label: "Cartões de crédito", icon: CreditCard },
  { to: "/finance/relatorios", label: "Relatórios", icon: PieChart },
] as const;

const FinanceLayout = () => {
  const location = useLocation();

  const isNavActive = (to: string, end?: boolean) => {
    const p = location.pathname;
    if (end) return p === to || p === `${to}/`;
    if (p === to) return true;
    if (to === "/finance/accounts" && p.startsWith("/finance/accounts")) return true;
    if (to === "/finance/transactions" && p.startsWith("/finance/transactions")) return true;
    if (to === "/finance/expenses" && p.startsWith("/finance/expenses")) return true;
    if (to === "/finance/categories" && p.startsWith("/finance/categories")) return true;
    if (to === "/finance/recurring-expenses" && p.startsWith("/finance/recurring-expenses")) return true;
    if (to === "/finance/contas" && p.startsWith("/finance/contas")) return true;
    if (to === "/finance/credit-cards" && p.startsWith("/finance/credit-cards")) return true;
    if (to === "/finance/relatorios" && p.startsWith("/finance/relatorios")) return true;
    return false;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Visão consolidada da empresa: contas, movimentos e indicadores. As{" "}
          <strong className="font-medium text-foreground">Faturas</strong> (cobranças a clientes) continuam em{" "}
          <NavLink to="/customer-invoices" className="text-primary font-medium underline-offset-2 hover:underline">
            Faturas
          </NavLink>
          .
        </p>
      </div>

      <nav
        className="flex flex-wrap gap-1 rounded-lg border bg-card/80 p-1 shadow-sm"
        aria-label="Seções do financeiro"
      >
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={() =>
              cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "hover:bg-muted/80",
                isNavActive(to, end)
                  ? "bg-crm-primary/12 text-crm-primary shadow-[inset_0_0_0_1px_hsl(221_83%_53%/0.2)]"
                  : "text-muted-foreground"
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0 opacity-80" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <Suspense
        fallback={<div className="py-12 text-center text-sm text-muted-foreground">Carregando seção…</div>}
      >
        <Outlet />
      </Suspense>

      <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="flex items-center gap-2">
          <FileStack className="h-3.5 w-3.5 shrink-0" />
          <span>
            Relatório combinado (legado):{" "}
            <NavLink to="/finance/resumo" className="text-primary font-medium underline-offset-2 hover:underline">
              resumo avançado
            </NavLink>
            {" · "}
            <NavLink to="/finance/contas" className="text-primary font-medium underline-offset-2 hover:underline">
              contas antigas
            </NavLink>
            {" · "}
            <NavLink to="/finance/notas-internas" className="text-primary font-medium underline-offset-2 hover:underline">
              notas internas
            </NavLink>
          </span>
        </span>
      </div>
    </div>
  );
};

export default FinanceLayout;
