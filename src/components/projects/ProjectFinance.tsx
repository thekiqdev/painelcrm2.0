
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { PlusIcon, Receipt, FileTextIcon } from "lucide-react";
import { Project, ProjectFinanceItem } from "@/components/projects/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceForm } from "@/components/finance/InvoiceForm";
import { ExpenseForm } from "@/components/finance/ExpenseForm";
import { FinancialSummary } from "@/components/finance/FinancialSummary";
import { toast } from "sonner";

interface ProjectFinanceProps {
  project: Project;
  onUpdateProject: (updatedProject: Project) => void;
}

export function ProjectFinance({ project, onUpdateProject }: ProjectFinanceProps) {
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);

  // Process project finance data to match format needed by FinancialSummary
  const getFinancialData = () => {
    const invoices = project.financeItems
      .filter(item => item.type === "invoice")
      .map(item => ({
        id: item.id,
        clientName: item.description,
        amount: item.amount,
        date: item.date,
        status: item.status
      }));
      
    const expenses = project.financeItems
      .filter(item => item.type === "expense")
      .map(item => ({
        id: item.id,
        description: item.description,
        amount: item.amount,
        date: item.date,
        category: item.category || "other",
        isPaid: item.status === "paid"
      }));
      
    return { invoices, expenses };
  };
  
  const handleCreateInvoice = (formData: FormData) => {
    const clientName = formData.get('clientName') as string;
    const invoiceNumber = formData.get('invoiceNumber') as string;
    const issueDate = formData.get('issueDate') as string;
    const dueDate = formData.get('dueDate') as string;
    const status = formData.get('status') as "draft" | "pending" | "paid" | "overdue";
    const items = JSON.parse(formData.get('items') as string);
    const total = parseFloat(formData.get('total') as string);
    
    const newInvoice: ProjectFinanceItem = {
      id: `inv-${Date.now()}`,
      type: "invoice",
      description: clientName,
      amount: total,
      date: issueDate,
      dueDate,
      status,
      invoiceNumber,
      items
    };
    
    const updatedProject = {
      ...project,
      financeItems: [...project.financeItems, newInvoice]
    };
    
    onUpdateProject(updatedProject);
    setInvoiceFormOpen(false);
    toast.success("Fatura adicionada ao projeto");
  };
  
  const handleCreateExpense = (formData: FormData) => {
    const description = formData.get('description') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const date = formData.get('date') as string;
    const category = formData.get('category') as string;
    const isPaid = formData.get('isPaid') === 'true';
    const notes = formData.get('notes') as string;
    
    const newExpense: ProjectFinanceItem = {
      id: `exp-${Date.now()}`,
      type: "expense",
      description,
      amount,
      date,
      category,
      status: isPaid ? "paid" : "pending",
      notes
    };
    
    const updatedProject = {
      ...project,
      financeItems: [...project.financeItems, newExpense]
    };
    
    onUpdateProject(updatedProject);
    setExpenseFormOpen(false);
    toast.success("Despesa adicionada ao projeto");
  };
  
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'draft':
        return <Badge variant="outline">Rascunho</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pendente</Badge>;
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Paga</Badge>;
      case 'overdue':
        return <Badge variant="destructive">Vencida</Badge>;
      default:
        return null;
    }
  };
  
  const invoices = project.financeItems.filter(item => item.type === "invoice");
  const expenses = project.financeItems.filter(item => item.type === "expense");
  const financialData = getFinancialData();
  
  return (
    <div className="space-y-4">
      <div className="flex justify-end space-x-2">
        <Button onClick={() => setExpenseFormOpen(true)}>
          <PlusIcon className="h-4 w-4 mr-2" />
          Nova Despesa
        </Button>
        <Button onClick={() => setInvoiceFormOpen(true)}>
          <PlusIcon className="h-4 w-4 mr-2" />
          Nova Fatura
        </Button>
      </div>
      
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Resumo</TabsTrigger>
          <TabsTrigger value="invoices">Faturas</TabsTrigger>
          <TabsTrigger value="expenses">Despesas</TabsTrigger>
        </TabsList>
        
        <TabsContent value="summary">
          {project.financeItems.length > 0 ? (
            <FinancialSummary data={financialData} />
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">
                  Nenhum item financeiro registrado para este projeto. 
                  Adicione faturas ou despesas para visualizar o resumo financeiro.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="invoices">
          {invoices.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {invoices.map(invoice => (
                <Card key={invoice.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between">
                      <CardTitle>{invoice.invoiceNumber}</CardTitle>
                      {getStatusBadge(invoice.status)}
                    </div>
                    <CardDescription>{invoice.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Emissão:</span>
                        <span>{format(new Date(invoice.date), "dd/MM/yyyy")}</span>
                      </div>
                      {invoice.dueDate && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Vencimento:</span>
                          <span>{format(new Date(invoice.dueDate), "dd/MM/yyyy")}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium mt-2">
                        <span>Total:</span>
                        <span>R$ {invoice.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline" size="sm" className="w-full">
                      Ver detalhes
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border shadow-md flex items-center justify-center p-10">
              <div className="text-center max-w-md">
                <Receipt className="mx-auto h-12 w-12 text-muted-foreground" />
                <h2 className="text-xl font-semibold mb-3 mt-4">Nenhuma fatura</h2>
                <p className="text-muted-foreground mb-6">
                  Este projeto ainda não tem nenhuma fatura registrada.
                </p>
                <Button onClick={() => setInvoiceFormOpen(true)}>Criar Fatura</Button>
              </div>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="expenses">
          {expenses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {expenses.map(expense => (
                <Card key={expense.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between">
                      <CardTitle className="text-base">{expense.description}</CardTitle>
                      {getStatusBadge(expense.status)}
                    </div>
                    <CardDescription>{expense.category}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Data:</span>
                        <span>{format(new Date(expense.date), "dd/MM/yyyy")}</span>
                      </div>
                      <div className="flex justify-between font-medium mt-2">
                        <span>Valor:</span>
                        <span>R$ {expense.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                      </div>
                      {expense.notes && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <p className="font-medium">Observações:</p>
                          <p>{expense.notes}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline" size="sm" className="w-full">
                      {expense.status === "paid" ? "Marcar como não paga" : "Marcar como paga"}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border shadow-md flex items-center justify-center p-10">
              <div className="text-center max-w-md">
                <FileTextIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                <h2 className="text-xl font-semibold mb-3 mt-4">Nenhuma despesa</h2>
                <p className="text-muted-foreground mb-6">
                  Este projeto ainda não tem nenhuma despesa registrada.
                </p>
                <Button onClick={() => setExpenseFormOpen(true)}>Registrar Despesa</Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      <InvoiceForm 
        open={invoiceFormOpen} 
        onOpenChange={setInvoiceFormOpen}
        onSave={handleCreateInvoice}
      />
      
      <ExpenseForm
        open={expenseFormOpen}
        onOpenChange={setExpenseFormOpen}
        onSave={handleCreateExpense}
      />
    </div>
  );
}
