
import React from "react";
import { Button } from "@/components/ui/button";

const Contracts = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Contratos</h1>
        <Button>Novo Contrato</Button>
      </div>
      <div className="bg-white rounded-lg border shadow-md flex items-center justify-center p-10">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-3">Gerenciamento de Contratos</h2>
          <p className="text-muted-foreground mb-6">
            Gerencie contratos, prazos, renovações e todas as informações relacionadas aos seus acordos comerciais.
            Esta funcionalidade estará disponível em breve.
          </p>
          <Button>Começar a Usar</Button>
        </div>
      </div>
    </div>
  );
};

export default Contracts;
