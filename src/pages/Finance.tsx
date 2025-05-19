
import React from "react";
import { Button } from "@/components/ui/button";

const Finance = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <Button>Exportar Relatórios</Button>
      </div>
      <div className="bg-white rounded-lg border shadow-md flex items-center justify-center p-10">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-3">Gestão Financeira</h2>
          <p className="text-muted-foreground mb-6">
            Acompanhe receitas, despesas, gere relatórios e tenha uma visão clara da saúde financeira da sua empresa.
            Esta funcionalidade estará disponível em breve.
          </p>
          <Button>Começar a Usar</Button>
        </div>
      </div>
    </div>
  );
};

export default Finance;
