
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, ChartBarIcon, FileTextIcon, PlusIcon, Receipt } from "lucide-react";
import { InvoiceForm } from "@/components/finance/InvoiceForm";
import { ExpenseForm } from "@/components/finance/ExpenseForm";
import { FinancialSummary } from "@/components/finance/FinancialSummary";
import { Invoice, Expense } from "@/components/finance/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";

const Finance = () => {
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  
  const handleCreateInvoice = (formData: FormData) => {
    const clientName = formData.get('clientName') as string;
    const invoiceNumber = formData.get('invoiceNumber') as string;
    const issueDate = formData.get('issueDate') as string;
    const dueDate = formData.get('dueDate') as string;
    const status = formData.get('status') as "draft" | "pending" | "paid" | "overdue";
    const items = JSON.parse(formData.get('items') as string);
    const total = parseFloat(formData.get('total') as string);
    
    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      clientName,
      invoiceNumber,
      issueDate,
      dueDate,
      status,
      items,
      total
    };
    
    setInvoices([...invoices, newInvoice]);
    setInvoiceFormOpen(false);
    toast.success("Fatura criada com sucesso");
  };
  
  const handleCreateExpense = (formData: FormData) => {
    const description = formData.get('description') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const date = formData.get('date') as string;
    const category = formData.get('category') as string;
    const isPaid = formData.get('isPaid') === 'true';
    const notes = formData.get('notes') as string;
    
    const newExpense: Expense = {
      id: `exp-${Date.now()}`,
      description,
      amount,
      date,
      category,
      isPaid,
      notes
    };
    
    setExpenses([...expenses, newExpense]);
    setExpenseFormOpen(false);
    toast.success("Despesa registrada com sucesso");
  };
  
  const getStatusBadge = (status: Invoice["status"]) => {
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
  
  const getExpenseStatusBadge = (isPaid: boolean) => {
    return isPaid 
      ? <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Paga</Badge>
      : <Badge variant="secondary">Pendente</Badge>;
  };

  // Financial data for the summary component
  const financialData = {
    invoices: invoices.map(inv => ({
      id: inv.id,
      clientName: inv.clientName,
      amount: inv.total,
      date: inv.issueDate,
      status: inv.status
    })),
    expenses: expenses.map(exp => ({
      id: exp.id,
      description: exp.description,
      amount: exp.amount,
      date: exp.date,
      category: exp.category,
      isPaid: exp.isPaid
    }))
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <div className="flex space-x-2">
          <Button onClick={() => setExpenseFormOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Nova Despesa
          </Button>
          <Button onClick={() => setInvoiceFormOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Nova Fatura
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">
            <ChartBarIcon className="h-4 w-4 mr-2" />
            Resumo
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <Receipt className="h-4 w-4 mr-2" />
            Faturas
          </TabsTrigger>
          <TabsTrigger value="expenses">
            <FileTextIcon className="h-4 w-4 mr-2" />
            Despesas
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="summary" className="space-y-4">
          <FinancialSummary data={financialData} />
        </TabsContent>
        
        <TabsContent value="invoices" className="space-y-4">
          {invoices.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {invoices.map(invoice => (
                <Card key={invoice.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between">
                      <CardTitle>{invoice.invoiceNumber}</CardTitle>
                      {getStatusBadge(invoice.status)}
                    </div>
                    <CardDescription>{invoice.clientName}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Emissão:</span>
                        <span>{format(new Date(invoice.issueDate), "dd/MM/yyyy")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vencimento:</span>
                        <span>{format(new Date(invoice.dueDate), "dd/MM/yyyy")}</span>
                      </div>
                      <div className="flex justify-between font-medium mt-2">
                        <span>Total:</span>
                        <span>R$ {invoice.total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
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
                  Você ainda não tem nenhuma fatura registrada. Crie sua primeira fatura para começar a gerenciar suas receitas.
                </p>
                <Button onClick={() => setInvoiceFormOpen(true)}>Criar Fatura</Button>
              </div>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="expenses" className="space-y-4">
          {expenses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {expenses.map(expense => (
                <Card key={expense.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between">
                      <CardTitle className="text-base">{expense.description}</CardTitle>
                      {getExpenseStatusBadge(expense.isPaid)}
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
                      {expense.isPaid ? "Marcar como não paga" : "Marcar como paga"}
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
                  Você ainda não tem nenhuma despesa registrada. Registre sua primeira despesa para começar a controlar seus gastos.
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
};

export default Finance;
