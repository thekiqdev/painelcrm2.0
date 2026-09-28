import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import {
  ChevronDown,
  ExternalLink,
  Package,
  Search,
  Filter,
  AlertTriangle,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { Order } from "@/types/products";
import { cartService } from "@/services/cart";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-500",
    processing: "bg-blue-500",
    completed: "bg-green-500",
    cancelled: "bg-red-500",
  };
  return colors[status] || "bg-gray-500";
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendente",
    processing: "Em processamento",
    completed: "Concluído",
    cancelled: "Cancelado",
  };
  return labels[status] || status;
}

function getPaymentLabel(ps: string) {
  if (ps === "paid") return "Pago";
  if (ps === "failed") return "Falhou / cancelado";
  return "Pendente";
}

function canDeleteOrder(order: Order): boolean {
  return order.payment_status !== "paid";
}

/** Conteúdo expandido: itens, contato completo, obs — reutilizado na tabela e no mobile. */
function OrderDetailPanel({ order, className }: { order: Order; className?: string }) {
  return (
    <div className={cn("space-y-4 text-sm", className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contato</p>
          <p className="font-medium text-foreground">{order.customer_name}</p>
          <p className="break-all text-muted-foreground">{order.customer_email}</p>
          {order.customer_phone ? <p className="text-muted-foreground">{order.customer_phone}</p> : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fatura CRM</p>
          {order.customer_invoice_id ? (
            <Button variant="outline" size="sm" asChild className="h-8">
              <Link to={`/customer-invoices/${order.customer_invoice_id}`}>
                Abrir fatura
                <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" />
              </Link>
            </Button>
          ) : (
            <div
              className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100"
              role="status"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Sem fatura vinculada (inconsistente). Checkout público deve sempre gerar fatura.
              </span>
            </div>
          )}
        </div>
      </div>
      {order.notes ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Obs.:</span> {order.notes}
        </p>
      ) : null}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Itens</p>
        <ul className="divide-y rounded-md border text-sm">
          {(order.order_items || []).length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">Nenhum item.</li>
          ) : (
            (order.order_items || []).map((it) => (
              <li key={it.id} className="flex justify-between gap-2 px-3 py-1.5">
                <span className="min-w-0">
                  {it.product_name} <span className="text-muted-foreground">× {it.quantity}</span>
                </span>
                <span className="shrink-0 tabular-nums">R$ {Number(it.total_price).toFixed(2)}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

const Orders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const { toast } = useToast();

  const loadOrders = useCallback(async () => {
    if (!user?.id) {
      setOrders([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await cartService.getOrders({
        status: statusFilter === "all" ? undefined : statusFilter,
        paymentStatus: paymentStatusFilter === "all" ? undefined : paymentStatusFilter,
      });
      setOrders(data);
    } catch (error) {
      console.error("Erro ao carregar pedidos:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os pedidos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, statusFilter, paymentStatusFilter, toast]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const filteredOrders = orders.filter((order) => {
    const q = searchTerm.toLowerCase();
    return (
      order.order_number.toLowerCase().includes(q) ||
      order.customer_name.toLowerCase().includes(q) ||
      order.customer_email.toLowerCase().includes(q)
    );
  });

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const confirmDelete = async () => {
    if (!orderToDelete) return;
    setDeletingId(orderToDelete.id);
    try {
      await cartService.deleteOrder(orderToDelete.id);
      toast({ title: "Pedido excluído" });
      setOrderToDelete(null);
      setOpenIds((prev) => {
        const next = { ...prev };
        delete next[orderToDelete.id];
        return next;
      });
      await loadOrders();
    } catch (e) {
      console.error(e);
      toast({
        title: "Não foi possível excluir",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (!user?.id) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5">
        <p className="text-muted-foreground">Faça login para ver pedidos.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5">
        <div className="flex h-32 items-center justify-center text-muted-foreground">Carregando pedidos…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 md:px-5 md:py-6">
      <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && !deletingId && setOrderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                O pedido <strong className="font-mono text-foreground">#{orderToDelete?.order_number}</strong> será
                removido permanentemente.
              </span>
              {orderToDelete?.customer_invoice_id ? (
                <span className="block text-sm">
                  Se existir fatura em aberto vinculada, ela será marcada como cancelada.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!!deletingId}
              onClick={() => void confirmDelete()}
            >
              {deletingId ? "Excluindo…" : "Excluir pedido"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 md:hidden"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Busca e filtros</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">
            <div className="relative min-w-0">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar número, cliente ou e-mail…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 w-full">
                <Filter className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                <SelectValue placeholder="Status pedido" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos (pedido)</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="processing">Em processamento</SelectItem>
                <SelectItem value="completed">Concluído</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos (pagamento)</SelectItem>
                <SelectItem value="pending">Pagamento pendente</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="failed">Falhou / cancelado</SelectItem>
              </SelectContent>
            </Select>
            <SheetClose asChild>
              <Button type="button" className="w-full">
                Concluir
              </Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>

      <div className="md:hidden sticky top-0 z-30 -mx-0.5 border-b border-border/70 bg-background/95 px-0.5 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <MobilePageHeader
          title="Pedidos"
          secondaryActions={[
            {
              icon: <Filter className="h-4 w-4" aria-hidden />,
              ariaLabel: "Busca e filtros",
              onClick: () => setMobileFiltersOpen(true),
            },
          ]}
        />
      </div>

      <div className="mb-4 hidden md:block md:mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <Package className="h-7 w-7 shrink-0 md:h-8 md:w-8" />
          Pedidos da loja
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground md:text-[15px]">
          Checkout público e carrinho. Pagamento do{" "}
          <span className="font-medium text-foreground">cliente da loja</span> via fatura vinculada.
        </p>
      </div>

      <Card className="mb-4 hidden border shadow-sm md:block">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar número, cliente ou e-mail…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-full sm:w-[min(100%,11rem)]">
                  <Filter className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                  <SelectValue placeholder="Status pedido" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos (pedido)</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="processing">Em processamento</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="h-9 w-full sm:w-[min(100%,11rem)]">
                  <SelectValue placeholder="Pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos (pagamento)</SelectItem>
                  <SelectItem value="pending">Pagamento pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="failed">Falhou / cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredOrders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="mb-3 h-12 w-12 text-muted-foreground opacity-60" />
            <p className="text-center text-muted-foreground">
              {orders.length === 0 ? "Nenhum pedido na loja ainda." : "Nenhum pedido corresponde à busca."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop: tabela compacta */}
          <div className="hidden md:block">
            <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 w-10 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" />
                    <TableHead className="h-9 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Nº pedido
                    </TableHead>
                    <TableHead className="h-9 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Cliente
                    </TableHead>
                    <TableHead className="h-9 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Data
                    </TableHead>
                    <TableHead className="h-9 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total
                    </TableHead>
                    <TableHead className="h-9 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Situação
                    </TableHead>
                    <TableHead className="h-9 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Pagamento
                    </TableHead>
                    <TableHead className="h-9 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Fatura
                    </TableHead>
                    <TableHead className="h-9 min-w-[120px] px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ações
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const open = !!openIds[order.id];
                    return (
                      <React.Fragment key={order.id}>
                        <TableRow
                          className={cn("group", open && "bg-muted/40")}
                          data-state={open ? "open" : "closed"}
                        >
                          <TableCell className="w-10 p-1.5 px-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => toggleOpen(order.id)}
                              aria-expanded={open}
                              aria-label={open ? "Recolher detalhes" : "Expandir detalhes"}
                            >
                              {open ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="max-w-[140px] p-1.5 px-2 font-mono text-xs font-medium">
                            #{order.order_number}
                          </TableCell>
                          <TableCell className="max-w-[min(28vw,220px)] p-1.5 px-2">
                            <span className="line-clamp-2 font-medium leading-snug" title={order.customer_name}>
                              {order.customer_name}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap p-1.5 px-2 text-xs tabular-nums text-muted-foreground">
                            {order.created_at
                              ? format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                              : "—"}
                          </TableCell>
                          <TableCell className="p-1.5 px-2 text-right text-sm font-semibold tabular-nums">
                            R$ {order.total_amount.toFixed(2)}
                          </TableCell>
                          <TableCell className="p-1.5 px-2">
                            <Badge
                              className={cn(
                                "whitespace-nowrap px-1.5 py-0 text-[10px] font-normal leading-tight",
                                getStatusColor(order.status)
                              )}
                            >
                              {getStatusLabel(order.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="p-1.5 px-2">
                            <Badge variant="outline" className="whitespace-nowrap px-1.5 py-0 text-[10px] font-normal">
                              {getPaymentLabel(order.payment_status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="p-1.5 px-2">
                            {order.customer_invoice_id ? (
                              <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                                <Link to={`/customer-invoices/${order.customer_invoice_id}`}>
                                  Ver
                                  <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
                                </Link>
                              </Button>
                            ) : (
                              <span className="text-xs text-amber-600 dark:text-amber-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="p-1.5 px-2 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => toggleOpen(order.id)}
                              >
                                {open ? "Ocultar" : "Detalhes"}
                              </Button>
                              {canDeleteOrder(order) ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  title="Excluir pedido"
                                  aria-label="Excluir pedido"
                                  onClick={() => setOrderToDelete(order)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow className="border-b bg-muted/20 hover:bg-muted/25">
                            <TableCell colSpan={9} className="p-3 px-4">
                              <OrderDetailPanel order={order} />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile: cards compactos + accordion */}
          <div className="space-y-3 md:hidden">
            {filteredOrders.map((order) => {
              const open = !!openIds[order.id];
              return (
                <Card key={order.id} className="overflow-hidden border shadow-sm">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm font-semibold text-foreground">#{order.order_number}</p>
                        <p className="mt-0.5 truncate font-medium leading-tight">{order.customer_name}</p>
                        <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
                          R$ {order.total_amount.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Badge className={cn("text-[10px]", getStatusColor(order.status))}>
                          {getStatusLabel(order.status)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {getPaymentLabel(order.payment_status)}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {order.created_at
                        ? format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                        : "—"}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {order.customer_invoice_id ? (
                        <Button variant="outline" size="sm" className="h-8" asChild>
                          <Link to={`/customer-invoices/${order.customer_invoice_id}`}>
                            Fatura
                            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Sem fatura
                        </span>
                      )}
                      {canDeleteOrder(order) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => setOrderToDelete(order)}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Excluir
                        </Button>
                      ) : null}
                    </div>
                    <Collapsible
                      open={open}
                      onOpenChange={(next) => setOpenIds((prev) => ({ ...prev, [order.id]: next }))}
                    >
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="mt-2 h-9 w-full justify-between px-2 text-muted-foreground">
                          <span>{open ? "Ocultar detalhes" : "Ver detalhes"}</span>
                          <ChevronDown
                            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t pt-3">
                          <OrderDetailPanel order={order} />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Orders;
