import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerChargesService } from "@/services/customerCharges";
import { clientsService } from "@/services/clients";
import type { CustomerChargeWithSummary } from "@/services/customerCharges";
import type { Client } from "@/services/clients";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, CreditCard, Filter } from "lucide-react";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";

const PAGE_SIZE = 50;
const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Aberta" },
  { value: "partial", label: "Parcial" },
  { value: "paid", label: "Quitada" },
];

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    open: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    partial: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    paid: "bg-green-500/15 text-green-700 dark:text-green-400",
  };
  const labels: Record<string, string> = {
    open: "Aberta",
    partial: "Parcial",
    paid: "Quitada",
  };
  return (
    <Badge className={variants[status] ?? "bg-muted"} variant="secondary">
      {labels[status] ?? status}
    </Badge>
  );
}

const CustomerCharges = () => {
  const navigate = useNavigate();
  const [charges, setCharges] = useState<CustomerChargeWithSummary[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createDescription, setCreateDescription] = useState("");
  const [createClientId, setCreateClientId] = useState<string>("");

  const loadCharges = useCallback(async () => {
    try {
      setLoading(true);
      const data = await customerChargesService.list({
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setCharges(data);
    } catch (err) {
      console.error("Erro ao carregar cobranças:", err);
      toast.error("Erro ao carregar cobranças");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, offset]);

  useEffect(() => {
    loadCharges();
  }, [loadCharges]);

  useEffect(() => {
    clientsService.getClients().then(setClients).catch(() => setClients([]));
  }, []);

  const clientMap = React.useMemo(() => {
    const m: Record<string, string> = {};
    clients.forEach((c) => { m[c.id] = c.name || c.company || c.id; });
    return m;
  }, [clients]);

  const handleCreate = async () => {
    try {
      setCreateLoading(true);
      await customerChargesService.create({
        description: createDescription.trim() || null,
        client_id: createClientId || null,
      });
      toast.success("Cobrança criada");
      setCreateOpen(false);
      setCreateDescription("");
      setCreateClientId("");
      loadCharges();
    } catch (err) {
      console.error("Erro ao criar cobrança:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao criar cobrança");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Cobranças</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Cobrança
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
              <TableHead>Descrição</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Faturas</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : charges.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhuma cobrança encontrada. Crie uma cobrança e vincule faturas ao criá-las.
                </TableCell>
              </TableRow>
            ) : (
              charges.map((ch) => (
                <TableRow key={ch.id}>
                  <TableCell className="max-w-[200px] truncate">
                    {ch.description || "—"}
                  </TableCell>
                  <TableCell>
                    {ch.client_id ? (clientMap[ch.client_id] ?? ch.client_id.slice(0, 8)) : "—"}
                  </TableCell>
                  <TableCell>{ch.invoice_count}</TableCell>
                  <TableCell>{formatAmount(ch.total_cents)}</TableCell>
                  <TableCell>{formatAmount(ch.paid_cents)}</TableCell>
                  <TableCell>
                    <StatusBadge status={ch.status} />
                  </TableCell>
                  <TableCell>{format(new Date(ch.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/customer-charges/${ch.id}`)}
                    >
                      <CreditCard className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova cobrança</DialogTitle>
            <DialogDescription>
              Agrupe faturas em uma cobrança. Ao criar faturas, você poderá vinculá-las a esta cobrança.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="charge-desc">Descrição (opcional)</Label>
              <Input
                id="charge-desc"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Ex: Cobrança Janeiro 2025"
              />
            </div>
            <div className="grid gap-2">
              <ClientSearchCombobox
                id="charge-create-client"
                label="Cliente (opcional)"
                placeholderTrigger="Nenhum — busque para vincular"
                remoteSearch
                value={createClientId || null}
                onChange={(id) => setCreateClientId(id ?? "")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createLoading}>
              {createLoading ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerCharges;
