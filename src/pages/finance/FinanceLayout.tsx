import React, { Suspense } from "react";

import { NavLink, Outlet, useLocation } from "react-router-dom";

import { FinanceMobileChromeProvider } from "@/contexts/FinanceMobileChromeContext";

import {

  LayoutDashboard,

  Landmark,

  CreditCard,

  PieChart,

  FileStack,

  ArrowLeftRight,

  Tags,

  ClipboardList,

} from "lucide-react";

import { cn } from "@/lib/utils";



const nav = [

  { to: "/finance", label: "Resumo geral", icon: LayoutDashboard, end: true },

  { to: "/finance/accounts", label: "Bancos e contas", icon: Landmark },

  { to: "/finance/transactions", label: "Entradas e saídas", icon: ArrowLeftRight },

  { to: "/finance/accounts-payable", label: "Contas a pagar", icon: ClipboardList },

  { to: "/finance/credit-cards", label: "Cartões de crédito", icon: CreditCard },

  { to: "/finance/categories", label: "Categorias", icon: Tags },

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

    if (to === "/finance/accounts-payable" && p.startsWith("/finance/accounts-payable")) return true;

    if (to === "/finance/categories" && p.startsWith("/finance/categories")) return true;

    if (to === "/finance/contas" && p.startsWith("/finance/contas")) return true;

    if (to === "/finance/credit-cards" && p.startsWith("/finance/credit-cards")) return true;

    if (to === "/finance/relatorios" && p.startsWith("/finance/relatorios")) return true;

    return false;

  };



  return (

    <div className="space-y-4 md:space-y-6">

      {/* Cabeçalho: compacto no mobile, completo no desktop */}

      <div className="flex flex-col gap-2 md:gap-0">

        <div className="flex items-start justify-between gap-3 md:block">

          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Financeiro</h1>

          <NavLink

            to="/customer-invoices"

            className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline md:hidden"

          >

            Faturas

          </NavLink>

        </div>

        <p className="hidden text-sm text-muted-foreground md:block md:mt-1 md:max-w-3xl">

          Visão consolidada da empresa: contas, movimentos e indicadores. Em{" "}

          <strong className="font-medium text-foreground">Contas a pagar</strong> concentra avulsas e recorrentes num único

          ecrã. As{" "}

          <strong className="font-medium text-foreground">Faturas</strong> (cobranças a clientes) continuam em{" "}

          <NavLink to="/customer-invoices" className="text-primary font-medium underline-offset-2 hover:underline">

            Faturas

          </NavLink>

          .

        </p>

      </div>



      <nav

        className={cn(

          "flex gap-1 rounded-lg border bg-card/80 p-1 shadow-sm",

          "max-md:flex-nowrap max-md:overflow-x-auto max-md:overflow-y-hidden max-md:[-webkit-overflow-scrolling:touch]",

          "max-md:scrollbar-none max-md:[scrollbar-width:none] [&::-webkit-scrollbar]:max-md:hidden"

        )}

        aria-label="Seções do financeiro"

      >

        {nav.map(({ to, label, icon: Icon, end }) => (

          <NavLink

            key={to}

            to={to}

            end={end}

            className={() =>

              cn(

                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors md:gap-2 md:px-3 md:text-sm",

                "hover:bg-muted/80",

                isNavActive(to, end)

                  ? "bg-crm-primary/12 text-crm-primary shadow-[inset_0_0_0_1px_hsl(221_83%_53%/0.2)]"

                  : "text-muted-foreground"

              )

            }

          >

            <Icon className="h-3.5 w-3.5 shrink-0 opacity-80 md:h-4 md:w-4" />

            <span>{label}</span>

          </NavLink>

        ))}

      </nav>



      <FinanceMobileChromeProvider>

        <Suspense

          fallback={<div className="py-12 text-center text-sm text-muted-foreground">Carregando seção…</div>}

        >

          <Outlet />

        </Suspense>

      </FinanceMobileChromeProvider>



      <div className="hidden rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground md:flex md:flex-row md:flex-wrap md:items-center">

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

