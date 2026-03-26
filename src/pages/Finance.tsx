
import React, { useState, useEffect } from "react";
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
import { financeService, Invoice as ApiInvoice, Expense as ApiExpense, BillingReceipt } from "@/services/finance";
import { projectsService } from "@/services/projects";
import { clientsService } from "@/services/clients";

const Finance = () => {
  const [loading, setLoading] = useState(true);
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [billingReceipts, setBillingReceipts] = useState<BillingReceipt[]>([]);
  const [availableProjects, setAvailableProjects] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [invoicesData, expensesData, billingReceiptsData, projectsData, clientsData] = await Promise.all([
          financeService.getInvoices(),
          financeService.getExpenses(),
          financeService.getBillingReceipts(),
          projectsService.getProjects(),
          clientsService.getClients(),
        ]);

        // Converter invoices da API para o formato do componente
        const convertedInvoices = invoicesData.map((inv: ApiInvoice) => {
          const client = inv.client_id ? clientsData.find(c => c.id === inv.client_id) : null;
          return {
            id: inv.id,
            clientName: client?.name || 'Cliente não encontrado',
            invoiceNumber: inv.invoice_number,
            issueDate: inv.issue_date,
            dueDate: inv.due_date,
            status: inv.status,
            items: inv.items.map((item: any) => ({
              id: item.id?.toString() || Math.random().toString(),
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
            total: inv.total,
            projectId: inv.project_id || undefined,
          };
        });

        // Converter expenses da API para o formato do componente
        const convertedExpenses = expensesData.map((exp: ApiExpense) => ({
          id: exp.id,
          description: exp.description,
          amount: exp.amount,
          date: exp.date,
          category: exp.category || '',
          isPaid: exp.is_paid,
          notes: exp.notes || undefined,
          projectId: exp.project_id || undefined,
        }));

        setInvoices(convertedInvoices);
        setExpenses(convertedExpenses);
        setBillingReceipts(billingReceiptsData);
        setAvailableProjects(projectsData.map(p => ({ id: p.id, name: p.name })));
        setClients(clientsData.map(c => ({ id: c.id, name: c.name })));
      } catch (error) {
        console.error("Erro ao carregar dados financeiros:", error);
        toast.error("Erro ao carregar dados financeiros");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);
  
  const handleCreateInvoice = async (formData: FormData) => {
    try {
    const clientName = formData.get('clientName') as string;
    const invoiceNumber = formData.get('invoiceNumber') as string;
    const issueDate = formData.get('issueDate') as string;
    const dueDate = formData.get('dueDate') as string;
    const status = formData.get('status') as "draft" | "pending" | "paid" | "overdue";
    const items = JSON.parse(formData.get('items') as string);
    const total = parseFloat(formData.get('total') as string);
    const projectId = formData.get('projectId') as string;
    
      // Encontrar client_id pelo nome
      const client = clients.find(c => c.name === clientName);
      
      const newInvoice = await financeService.createInvoice({
        client_id: client?.id || null,
        project_id: projectId || null,
        invoice_number: invoiceNumber,
        issue_date: issueDate.split('T')[0],
        due_date: dueDate.split('T')[0],
      status,
        items: items.map((item: any) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      total,
        notes: null,
      });

      // Converter para o formato do componente
      const convertedInvoice: Invoice = {
        id: newInvoice.id,
        clientName: client?.name || clientName,
        invoiceNumber: newInvoice.invoice_number,
        issueDate: newInvoice.issue_date,
        dueDate: newInvoice.due_date,
        status: newInvoice.status,
        items: newInvoice.items.map((item: any) => ({
          id: item.id?.toString() || Math.random().toString(),
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
        total: newInvoice.total,
        projectId: newInvoice.project_id || undefined,
      };
      
      setInvoices([...invoices, convertedInvoice]);
    setInvoiceFormOpen(false);
    toast.success("Fatura criada com sucesso");
    } catch (error) {
      console.error("Erro ao criar fatura:", error);
      toast.error("Erro ao criar fatura");
    }
  };
  
  const handleCreateExpense = async (formData: FormData) => {
    try {
    const description = formData.get('description') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const date = formData.get('date') as string;
    const category = formData.get('category') as string;
    const isPaid = formData.get('isPaid') === 'true';
    const notes = formData.get('notes') as string;
    const projectId = formData.get('projectId') as string;
    
      const newExpense = await financeService.createExpense({
        project_id: projectId || null,
      description,
      amount,
        date: date.split('T')[0],
        category: category || null,
        is_paid: isPaid,
        notes: notes || null,
      });

      // Converter para o formato do componente
      const convertedExpense: Expense = {
        id: newExpense.id,
        description: newExpense.description,
        amount: newExpense.amount,
        date: newExpense.date,
        category: newExpense.category || '',
        isPaid: newExpense.is_paid,
        notes: newExpense.notes || undefined,
        projectId: newExpense.project_id || undefined,
      };
      
      setExpenses([...expenses, convertedExpense]);
    setExpenseFormOpen(false);
    toast.success("Despesa registrada com sucesso");
    } catch (error) {
      console.error("Erro ao criar despesa:", error);
      toast.error("Erro ao criar despesa");
    }
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

  // Financial data for the summary component (faturas do finance + receitas de cobrança pagas)
  const financialData = {
    invoices: invoices.map(inv => ({
      id: inv.id,
      clientName: inv.clientName,
      amount: inv.total,
      date: inv.issueDate,
      status: inv.status
    })),
    billingReceipts: billingReceipts.map(r => ({
      id: r.id,
      amount: r.amount_cents / 100,
      date: r.paid_at.slice(0, 10)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="text-center">
          <p className="text-muted-foreground">Carregando dados financeiros...</p>
        </div>
      </div>
    );
  }

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
                      {invoice.projectId && (
                        <div className="mt-2 text-xs">
                          <span className="text-muted-foreground">Projeto: </span>
                          <span className="font-medium">
                            {availableProjects.find(p => p.id === invoice.projectId)?.name}
                          </span>
                        </div>
                      )}
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
                      {expense.projectId && (
                        <div className="mt-2 text-xs">
                          <span className="text-muted-foreground">Projeto: </span>
                          <span className="font-medium">
                            {availableProjects.find(p => p.id === expense.projectId)?.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={async () => {
                        try {
                          const updated = await financeService.updateExpense(expense.id, {
                            is_paid: !expense.isPaid
                          });
                          setExpenses(expenses.map(e => 
                            e.id === expense.id 
                              ? { ...e, isPaid: updated.is_paid }
                              : e
                          ));
                          toast.success(updated.is_paid ? "Despesa marcada como paga" : "Despesa marcada como não paga");
                        } catch (error) {
                          console.error("Erro ao atualizar despesa:", error);
                          toast.error("Erro ao atualizar despesa");
                        }
                      }}
                    >
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
        availableProjects={availableProjects}
      />
      
      <ExpenseForm
        open={expenseFormOpen}
        onOpenChange={setExpenseFormOpen}
        onSave={handleCreateExpense}
        availableProjects={availableProjects}
      />
    </div>
  );
};

export default Finance;
