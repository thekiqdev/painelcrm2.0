
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Plus } from "lucide-react";

export const BillingSection: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagamentos e Faturamento</CardTitle>
        <CardDescription>Gerencie métodos de pagamento e faturas</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Métodos de Pagamento</h3>
            <div className="space-y-4">
              <div className="p-4 border rounded-md flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-gray-100 rounded-md">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Cartão de Crédito</p>
                    <p className="text-sm text-muted-foreground">Visa terminando em 1234</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">Remover</Button>
              </div>
              
              <div className="p-4 border rounded-md flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-gray-100 rounded-md">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="1" x2="12" y2="23" />
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Chave PIX</p>
                    <p className="text-sm text-muted-foreground">CPF: 123.456.789-00</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">Editar</Button>
              </div>
              
              <Button variant="outline" className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Método de Pagamento
              </Button>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Histórico de Faturas</h3>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Fatura</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Data</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Valor</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="px-4 py-3 text-sm">#INV-001</td>
                    <td className="px-4 py-3 text-sm">21/05/2023</td>
                    <td className="px-4 py-3 text-sm">R$ 149,90</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                        Pago
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <Button variant="ghost" size="sm">Ver</Button>
                    </td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-4 py-3 text-sm">#INV-002</td>
                    <td className="px-4 py-3 text-sm">21/04/2023</td>
                    <td className="px-4 py-3 text-sm">R$ 149,90</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                        Pago
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <Button variant="ghost" size="sm">Ver</Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
