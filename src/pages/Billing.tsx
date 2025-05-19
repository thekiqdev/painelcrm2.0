
import React from "react";
import { Button } from "@/components/ui/button";

const Billing = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Faturamento</h1>
        <Button>Nova Fatura</Button>
      </div>
      <div className="bg-white rounded-lg border shadow-md flex items-center justify-center p-10">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-3">Sistema de Faturamento</h2>
          <p className="text-muted-foreground mb-6">
            Emita faturas, realize cobranças, controle pagamentos e gerencie todo o seu fluxo financeiro.
            Esta funcionalidade estará disponível em breve.
          </p>
          <Button>Começar a Usar</Button>
        </div>
      </div>
    </div>
  );
};

export default Billing;
