import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { customerChargesService } from "@/services/customerCharges";
import type { CustomerChargeDetail as CustomerChargeDetailType } from "@/services/customerCharges";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, FileText } from "lucide-react";

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    paid: "bg-green-500/15 text-green-700 dark:text-green-400",
    overdue: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    cancelled: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  };
  const labels: Record<string, string> = {
    pending: "Pendente",
    paid: "Pago",
    overdue: "Vencido",
    cancelled: "Cancelado",
  };
  return (
    <Badge className={variants[status] ?? "bg-muted"} variant="secondary">
      {labels[status] ?? status}
    </Badge>
  );
}

const CustomerChargeDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [charge, setCharge] = useState<CustomerChargeDetailType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    customerChargesService
      .getById(id)
      .then(setCharge)
      .catch((err) => {
        console.error("Erro ao carregar cobrança:", err);
        toast.error("Erro ao carregar cobrança");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || !charge) {
    return (
      <div className="flex items-center justify-center py-12">
        {loading ? "Carregando..." : "Cobrança não encontrada."}
      </div>
    );
  }

  const chargeStatusLabel = charge.status === "open" ? "Aberta" : charge.status === "partial" ? "Parcial" : "Quitada";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/customer-charges">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Cobrança</h1>
        <Badge variant="secondary">{chargeStatusLabel}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p><span className="font-medium">Descrição:</span> {charge.description || "—"}</p>
          <p><span className="font-medium">Total:</span> {formatAmount(charge.total_cents)}</p>
          <p><span className="font-medium">Pago:</span> {formatAmount(charge.paid_cents)}</p>
          <p><span className="font-medium">Faturas:</span> {charge.invoice_count}</p>
          <p><span className="font-medium">Criado em:</span> {format(new Date(charge.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Faturas vinculadas</CardTitle>
        </CardHeader>
        <CardContent>
          {charge.invoices.length === 0 ? (
            <p className="text-muted-foreground">
              Nenhuma fatura vinculada. Ao criar uma nova fatura, selecione esta cobrança em &quot;Vincular à cobrança&quot;.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pago em</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charge.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">
                      {inv.invoice_number ?? inv.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{formatAmount(inv.amount_cents)}</TableCell>
                    <TableCell>{format(new Date(inv.due_date), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                    <TableCell>
                      {inv.paid_at
                        ? format(new Date(inv.paid_at), "dd/MM/yyyy", { locale: ptBR })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/customer-invoices/${inv.id}`}>
                          <FileText className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerChargeDetail;
