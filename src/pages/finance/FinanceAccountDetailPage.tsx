import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { financeModuleService, type FinanceAccount, type LedgerRow } from "@/services/financeModule";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const FinanceAccountDetailPage = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const [account, setAccount] = useState<FinanceAccount | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) return;
    let ok = true;
    (async () => {
      try {
        setLoading(true);
        const [acc, led] = await Promise.all([
          financeModuleService.getAccount(accountId),
          financeModuleService.getLedger(accountId, { limit: 100 }),
        ]);
        if (!ok) return;
        setAccount(acc);
        setLedger(led);
      } catch {
        if (!ok) return;
        toast.error("Erro ao carregar conta");
        setAccount(null);
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [accountId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8">Carregando…</p>;
  }
  if (!account) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Conta não encontrada.{" "}
          <Link to="/finance/contas" className="text-primary underline">
            Voltar
          </Link>
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = format(now, "yyyy-MM-dd");

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/finance/contas">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Contas
        </Link>
      </Button>

      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold">{account.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Saldo atual estimado:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatBrl(account.current_balance_cents ?? account.opening_balance_cents)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/finance/entradas?conta=${account.id}`}>Lançar entrada</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/finance/despesas?conta=${account.id}`}>Lançar despesa</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Extrato recente</CardTitle>
          <CardDescription>
            Últimos lançamentos nesta conta. Para filtrar por período, use as telas de Entradas e Despesas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lançamento ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((row) => (
                  <TableRow key={`${row.kind}-${row.id}`}>
                    <TableCell className="tabular-nums text-sm">
                      {format(new Date(row.occurred_at + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.kind === "income" ? (
                        <span className="text-emerald-600 font-medium">Entrada</span>
                      ) : (
                        <span className="text-orange-600 font-medium">Saída</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{row.description}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {row.kind === "income" ? "+" : "−"}
                      {formatBrl(row.amount_cents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Mês corrente (referência): {monthStart} a {monthEnd}. O saldo considera saldo inicial na data cadastrada,
        entradas e despesas pagas vinculadas a esta conta.
      </p>
    </div>
  );
};

export default FinanceAccountDetailPage;
