import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { customerInvoicesService } from "@/services/customerInvoices";
import { clientsService } from "@/services/clients";
import type { CustomerInvoice } from "@/services/customerInvoices";
import type { Client } from "@/services/clients";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, FileText, Filter, ExternalLink, AlertTriangle, Repeat2 } from "lucide-react";
import { CustomerInvoiceStatusBadge } from "@/lib/customerInvoiceStatusUi";

const PAGE_SIZE = 50;
const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "waiting_payment", label: "Aguardando pagamento" },
  { value: "processing", label: "Processando" },
  { value: "paid", label: "Pago" },
  { value: "overdue", label: "Vencido" },
  { value: "cancelled", label: "Cancelado" },
  { value: "failed", label: "Falhou" },
  { value: "refunded", label: "Reembolsado" },
];

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

const CustomerInvoices = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [crmGatewayActive, setCrmGatewayActive] = useState<boolean | null>(null);

  useEffect(() => {
    customerInvoicesService
      .getGatewayStatus()
      .then((s) => setCrmGatewayActive(s.gatewayConfigured))
      .catch(() => setCrmGatewayActive(null));
  }, []);

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const data = await customerInvoicesService.list({
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setInvoices(data);
    } catch (err) {
      console.error("Erro ao carregar faturas:", err);
      toast.error("Erro ao carregar faturas");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, offset]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    setOffset(0);
  }, [statusFilter]);

  useEffect(() => {
    clientsService.getClients().then(setClients).catch(() => setClients([]));
  }, []);

  const clientMap = React.useMemo(() => {
    const m: Record<string, string> = {};
    clients.forEach((c) => { m[c.id] = c.name || c.company || c.id; });
    return m;
  }, [clients]);

  return (
    <div className="space-y-6">
      {crmGatewayActive === false && (
        <Alert className="border-orange-500/60 bg-orange-50 text-orange-950 dark:bg-orange-950/30 dark:text-orange-100 dark:border-orange-500/50">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <AlertDescription>
            Para emitir faturas com cobrança, configure o <strong>provedor de pagamentos</strong> (CRM) com status{" "}
            <strong>ativo</strong> em Configurações.{" "}
            <Link to="/settings/payments" className="font-medium text-primary underline hover:no-underline">
              Configurar pagamentos <ExternalLink className="inline h-3 w-3 ml-0.5" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Faturas de clientes</h1>
        <Button asChild>
          <Link to="/customer-invoices/new">
            <Plus className="mr-2 h-4 w-4" />
            Nova Fatura
          </Link>
        </Button>
      </div>

      <div className="bg-card rounded-lg border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="h-4 w-4" />
          <span className="font-medium">Filtros</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setOffset(0)}>
            Primeira página
          </Button>
          {offset >= PAGE_SIZE && (
            <Button variant="outline" size="sm" onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
              Anterior
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setOffset((o) => o + PAGE_SIZE)}>
            Próxima
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº Fatura</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[110px]">Recorrência</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <span className="block font-medium text-foreground mb-1">Nenhuma fatura encontrada</span>
                  Crie uma nova fatura ou ajuste o filtro de status.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm">
                    {inv.invoice_number ?? inv.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>{inv.client_id ? (clientMap[inv.client_id] ?? inv.client_id.slice(0, 8)) : "Sem cliente"}</TableCell>
                  <TableCell>{formatAmount(inv.amount_cents)}</TableCell>
                  <TableCell>
                    <CustomerInvoiceStatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell>
                    {inv.subscription_id ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary"
                        title="Fatura recorrente — cobrança automática conforme o plano"
                      >
                        <Repeat2 className="h-3 w-3 shrink-0" aria-hidden />
                        Recorrente
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{format(new Date(inv.due_date), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/customer-invoices/${inv.id}`)}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CustomerInvoices;
