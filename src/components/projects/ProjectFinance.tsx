import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Project } from "@/components/projects/types";
import { projectFinancialService } from "@/services/projectFinancial";
import { financeModuleService, type FinanceExpenseStatus } from "@/services/financeModule";
import { financialService, type FinancialAccountType } from "@/services/financial";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { getProjectUrl } from "@/lib/projectRoutes";

interface ProjectFinanceProps {
  project: Project;
  onUpdateProject: (updatedProject: Project) => void;
}

export function ProjectFinance({ project, onUpdateProject }: ProjectFinanceProps) {
  void onUpdateProject;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { hasPermissionKey, loading: permissionsLoading } = useModulePermissions();
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [expenseDescription, setExpenseDescription] = useState(project.name ? `Despesa - ${project.name}` : "");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseStatus, setExpenseStatus] = useState<FinanceExpenseStatus>("pending");
  const [expenseSupplier, setExpenseSupplier] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");

  const canViewInvoices = hasPermissionKey("billing.view_invoices");
  const canCreateInvoice = hasPermissionKey("billing.create_invoice");
  const canViewExpenses = hasPermissionKey("finance.view_expenses");
  const canCreateExpense = hasPermissionKey("finance.create_expense");
  const canViewFinancialAccounts = hasPermissionKey("finance.view");

  const summaryQuery = useQuery({
    queryKey: ["project-financial-summary", project.id],
    queryFn: () => projectFinancialService.getProjectFinancialSummary(project.id),
    enabled: !permissionsLoading,
    retry: false,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const invoicesQuery = useQuery({
    queryKey: ["project-financial-invoices", project.id],
    queryFn: () => projectFinancialService.getProjectFinancialInvoices(project.id),
    enabled: !permissionsLoading && canViewInvoices,
    retry: false,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const expensesQuery = useQuery({
    queryKey: ["project-financial-expenses", project.id],
    queryFn: () => projectFinancialService.getProjectFinancialExpenses(project.id),
    enabled: !permissionsLoading && canViewExpenses,
    retry: false,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const accountsQuery = useQuery({
    queryKey: ["financial-accounts", "project-expense-form"],
    queryFn: () => financialService.listAccounts(),
    enabled: expenseFormOpen && canCreateExpense && canViewFinancialAccounts,
    staleTime: 60_000,
  });

  const createExpenseMutation = useMutation({
    mutationFn: () => {
      const cents = Math.round(Number(expenseAmount.replace(",", ".")) * 100);
      if (!expenseDescription.trim()) throw new Error("Descrição é obrigatória");
      if (!Number.isFinite(cents) || cents <= 0) throw new Error("Valor inválido");
      if (!expenseAccountId) throw new Error("Selecione a conta de saída (financeiro unificado)");
      return financeModuleService.createExpenseEntry({
        project_id: project.id,
        financial_account_id: expenseAccountId,
        description: expenseDescription.trim(),
        amount_cents: cents,
        expense_date: expenseDate,
        due_date: expenseDate,
        status: expenseStatus,
        supplier_name: expenseSupplier.trim() || null,
      });
    },
    onSuccess: async () => {
      toast.success("Despesa vinculada ao projeto");
      setExpenseFormOpen(false);
      setExpenseAmount("");
      setExpenseAccountId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-financial-summary", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["project-financial-expenses", project.id] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao registrar despesa"),
  });

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pendente</Badge>;
      case "waiting_payment":
        return <Badge variant="secondary">Aguardando</Badge>;
      case "expected":
        return <Badge variant="outline">Prevista</Badge>;
      case "paid":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Paga</Badge>;
      case "overdue":
        return <Badge variant="destructive">Vencida</Badge>;
      case "cancelled":
        return <Badge variant="outline">Cancelada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const summary = summaryQuery.data;
  const invoices = invoicesQuery.data ?? [];
  const expenses = expensesQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const hasNoAccess = summaryQuery.isError && !canViewInvoices && !canViewExpenses;
  const initialFinancialTab =
    searchParams.get("financialTab") === "faturas"
      ? "invoices"
      : searchParams.get("financialTab") === "despesas"
        ? "expenses"
        : "summary";

  if (hasNoAccess) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Seu perfil não tem acesso ao financeiro deste projeto.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle>Resumo financeiro</CardTitle>
          <CardDescription>Faturas e despesas reais vinculadas a este projeto.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Faturado" value={formatCurrency(summary?.invoiced_total ?? 0)} />
            <MetricCard label="Recebido" value={formatCurrency(summary?.paid_total ?? 0)} />
            <MetricCard label="Em aberto" value={formatCurrency(summary?.open_invoice_total ?? 0)} />
            <MetricCard label="Despesas" value={formatCurrency(summary?.expense_total ?? 0)} />
            <MetricCard
              label="Resultado"
              value={summary?.profit_estimate == null ? "Sem acesso" : formatCurrency(summary.profit_estimate)}
              className={(summary?.profit_estimate ?? 0) >= 0 ? "text-emerald-600" : "text-destructive"}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {canCreateExpense ? (
          <Button onClick={() => setExpenseFormOpen(true)}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Nova Despesa
          </Button>
        ) : null}
        {canCreateInvoice ? (
          <Button
            onClick={() => {
              const params = new URLSearchParams({
                projectId: project.id,
                returnTo: getProjectUrl(project.id, { tab: "financeiro", financialTab: "faturas" }),
              });
              if (project.client_id) {
                params.set("client_id", project.client_id);
              } else {
                params.set("mode", "link");
              }
              navigate(`/customer-invoices/new?${params.toString()}`);
            }}
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            Nova Fatura
          </Button>
        ) : null}
      </div>

      <Tabs defaultValue={initialFinancialTab}>
        <TabsList>
          <TabsTrigger value="summary">Resumo</TabsTrigger>
          <TabsTrigger value="invoices">Faturas</TabsTrigger>
          <TabsTrigger value="expenses">Despesas</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          {(summary?.invoice_count ?? 0) + (summary?.expense_count ?? 0) === 0 ? (
            <EmptyFinanceState />
          ) : (
            <Card>
              <CardContent className="grid gap-3 py-5 text-sm md:grid-cols-2">
                <p>{summary?.invoice_count ?? 0} fatura(s) vinculada(s)</p>
                <p>{summary?.expense_count ?? 0} despesa(s) vinculada(s)</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="invoices">
          {!canViewInvoices ? (
            <NoPermission label="faturas" />
          ) : invoices.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {invoices.map((invoice) => (
                <Card key={invoice.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between gap-2">
                      <CardTitle>{invoice.number ?? "Fatura"}</CardTitle>
                      {getStatusBadge(invoice.status)}
                    </div>
                    <CardDescription>{invoice.client_name ?? "Sem cliente"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      {invoice.due_date ? (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Vencimento:</span>
                          <span>{format(new Date(invoice.due_date), "dd/MM/yyyy")}</span>
                        </div>
                      ) : null}
                      <div className="mt-2 flex justify-between font-medium">
                        <span>Total:</span>
                        <span>{formatCurrency(invoice.amount)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyFinanceState label="Nenhuma fatura vinculada a este projeto." />
          )}
        </TabsContent>

        <TabsContent value="expenses">
          {!canViewExpenses ? (
            <NoPermission label="despesas" />
          ) : expenses.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {expenses.map((expense) => (
                <Card key={expense.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between gap-2">
                      <CardTitle>{expense.description}</CardTitle>
                      {getStatusBadge(expense.status)}
                    </div>
                    <CardDescription>{expense.category ?? expense.supplier_name ?? "Despesa"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Data:</span>
                        <span>{format(new Date(expense.date), "dd/MM/yyyy")}</span>
                      </div>
                      <div className="mt-2 flex justify-between font-medium">
                        <span>Valor:</span>
                        <span>{formatCurrency(expense.amount)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Conta:</span>
                        <span className="text-right">{expense.account_name ?? "Não informado"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyFinanceState label="Nenhuma despesa vinculada a este projeto." />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={expenseFormOpen} onOpenChange={setExpenseFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova despesa do projeto</DialogTitle>
            <DialogDescription>
              Registra uma despesa real no módulo financeiro vinculada a este projeto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Input value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Valor</Label>
              <Input
                value={expenseAmount}
                onChange={(event) => setExpenseAmount(event.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="grid gap-2">
              <Label>Data</Label>
              <Input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={expenseStatus} onValueChange={(value) => setExpenseStatus(value as FinanceExpenseStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Paga</SelectItem>
                  <SelectItem value="expected">Prevista</SelectItem>
                  <SelectItem value="overdue">Atrasada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Conta de saída</Label>
              <Select value={expenseAccountId || undefined} onValueChange={setExpenseAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({getFinancialAccountTypeLabel(account.type)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!canViewFinancialAccounts ? (
                <p className="text-xs text-muted-foreground">
                  É necessária permissão para visualizar contas financeiras (módulo financeiro) para escolher a conta de
                  saída.
                </p>
              ) : accountsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Carregando contas...</p>
              ) : accounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma conta em Bancos e contas do financeiro unificado. Cadastre uma conta para registrar despesas.
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>Fornecedor</Label>
              <Input value={expenseSupplier} onChange={(event) => setExpenseSupplier(event.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createExpenseMutation.mutate()} disabled={createExpenseMutation.isPending}>
              Registrar despesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const FINANCIAL_ACCOUNT_TYPE_LABELS: Record<FinancialAccountType, string> = {
  bank: "Banco",
  cash: "Caixa",
  wallet: "Carteira",
};

function getFinancialAccountTypeLabel(type: FinancialAccountType): string {
  return FINANCIAL_ACCOUNT_TYPE_LABELS[type] ?? type;
}

function MetricCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${className ?? ""}`}>{value}</p>
    </div>
  );
}

function EmptyFinanceState({ label = "Este projeto ainda não possui movimentações financeiras." }: { label?: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-10 text-center">
        <FileTextIcon className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 font-medium">{label}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Crie uma fatura ou registre uma despesa para acompanhar o resultado.
        </p>
      </CardContent>
    </Card>
  );
}

function NoPermission({ label }: { label: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        Sem permissão para visualizar {label}.
      </CardContent>
    </Card>
  );
}
