
import React from "react";
import { Button } from "@/components/ui/button";

const Proposals = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Propostas / Orçamentos</h1>
        <Button>Nova Proposta</Button>
      </div>
      <div className="bg-white rounded-lg border shadow-md flex items-center justify-center p-10">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-3">Sistema de Propostas e Orçamentos</h2>
          <p className="text-muted-foreground mb-6">
            Crie, envie e gerencie todas as suas propostas comerciais e orçamentos através de uma interface simples e eficiente.
            Esta funcionalidade estará disponível em breve.
          </p>
          <Button>Começar a Usar</Button>
        </div>
      </div>
    </div>
  );
};

export default Proposals;
