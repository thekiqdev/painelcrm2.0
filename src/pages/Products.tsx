
import React from "react";
import { Button } from "@/components/ui/button";

const Products = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Produtos / Serviços</h1>
        <Button>Adicionar Produto</Button>
      </div>
      <div className="bg-white rounded-lg border shadow-md flex items-center justify-center p-10">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-3">Gerencie seus Produtos e Serviços</h2>
          <p className="text-muted-foreground mb-6">
            Cadastre, edite, remova e visualize todos os produtos e serviços que sua empresa oferece.
            Esta funcionalidade estará disponível em breve.
          </p>
          <Button>Começar a Usar</Button>
        </div>
      </div>
    </div>
  );
};

export default Products;
