import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '@/integrations/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { formatInvoiceDueDatePtBr } from '@/lib/formatInvoiceDates';
import { Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type PlatformBillingRow = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  plan_id: string;
  plan_name: string | null;
  amount_cents: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  invoice_number: string | null;
  gateway: string | null;
  payment_method: string | null;
  gateway_reference_id: string | null;
  billing_reason: string | null;
  created_at: string;
  has_public_pay_link: boolean;
  has_gateway_fallback_link: boolean;
  platform_invoice_url: string | null;
  gateway_fallback_url: string | null;
};

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
  waiting_payment: 'Aguardando',
  processing: 'Processando',
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export default function SuperAdminPlatformBillings() {
  const [rows, setRows] = useState<PlatformBillingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('all');
  const [tenantId, setTenantId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detail, setDetail] = useState<PlatformBillingRow | null>(null);
  const [ensuringLink, setEnsuringLink] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (status !== 'all') q.set('status', status);
    if (tenantId.trim()) q.set('tenant_id', tenantId.trim());
    if (from.trim()) q.set('from', from.trim());
    if (to.trim()) q.set('to', to.trim());
    q.set('limit', '80');
    q.set('offset', '0');
    const res = await apiClient.get<{ billings: PlatformBillingRow[]; total: number }>(
      `/api/superadmin/platform-billings?${q.toString()}`
    );
    if (res.error) {
      toast.error(res.error);
      setRows([]);
    } else {
      setRows(res.data?.billings ?? []);
      setTotal(res.data?.total ?? 0);
    }
    setLoading(false);
  }, [status, tenantId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    const res = await apiClient.get<{ billing: PlatformBillingRow }>(`/api/superadmin/platform-billings/${id}`);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data?.billing) setDetail(res.data.billing);
  };

  const ensurePublicLink = async (id: string) => {
    setEnsuringLink(true);
    const res = await apiClient.post<{ platform_invoice_url: string }>(
      `/api/superadmin/platform-billings/${id}/public-link`,
      {}
    );
    setEnsuringLink(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data?.platform_invoice_url) {
      toast.success('Link público garantido.');
      await load();
      if (detail?.id === id) {
        await openDetail(id);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cobranças da plataforma</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Listagem global de <code className="text-xs">tenant_billing</code> (SaaS). Somente leitura; link público é
          idempotente.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>Status, tenant (UUID), período de criação.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="overdue">Vencido</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
                <SelectItem value="waiting_payment">Aguardando pagamento</SelectItem>
                <SelectItem value="processing">Processando</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tenant (UUID)</Label>
            <Input
              className="w-[280px]"
              placeholder="Opcional"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Criada a partir de</Label>
            <Input type="date" className="w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Até</Label>
            <Input type="date" className="w-[160px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Atualizar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resultados ({total})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cobrança encontrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fatura</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Venc.</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Link plataforma</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.invoice_number ?? r.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <span className="text-sm">{r.tenant_name}</span>
                      <Button variant="link" className="h-auto p-0 ml-1 text-xs" asChild>
                        <Link to={`/superadmin/clients/${r.tenant_id}/faturamento`}>Ficha</Link>
                      </Button>
                    </TableCell>
                    <TableCell>{formatCurrency(r.amount_cents)}</TableCell>
                    <TableCell className="text-sm">{formatInvoiceDueDatePtBr(r.due_date ?? '')}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{statusLabels[r.status] ?? r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.platform_invoice_url ? (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={r.platform_invoice_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="outline" size="sm" onClick={() => void openDetail(r.id)}>
                        Detalhe
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cobrança</DialogTitle>
            <DialogDescription>
              {detail?.invoice_number} · {detail?.tenant_name}
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Valor:</span> {formatCurrency(detail.amount_cents)}
              </p>
              <p>
                <span className="text-muted-foreground">Plano:</span> {detail.plan_name ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Gateway:</span> {detail.gateway ?? '—'} /{' '}
                {detail.gateway_reference_id ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Motivo:</span> {detail.billing_reason ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Vencimento:</span>{' '}
                {formatInvoiceDueDatePtBr(detail.due_date ?? '')}
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <span className="font-medium">Link público (plataforma)</span>
                {detail.platform_invoice_url ? (
                  <div className="flex flex-wrap gap-2 items-center">
                    <code className="text-xs break-all bg-muted px-2 py-1 rounded flex-1 min-w-0">
                      {detail.platform_invoice_url}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(detail.platform_invoice_url!);
                        toast.success('Copiado');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={ensuringLink}
                    onClick={() => void ensurePublicLink(detail.id)}
                  >
                    Gerar / garantir link público
                  </Button>
                )}
                {detail.gateway_fallback_url ? (
                  <div className="pt-2">
                    <span className="text-muted-foreground text-xs">Fallback gateway: </span>
                    <Button variant="link" className="h-auto p-0 text-xs" asChild>
                      <a href={detail.gateway_fallback_url} target="_blank" rel="noreferrer">
                        Abrir
                      </a>
                    </Button>
                  </div>
                ) : null}
              </div>
              <Button variant="outline" className="w-full mt-2" asChild>
                <Link to={`/superadmin/clients/${detail.tenant_id}/faturamento`}>Abrir faturamento do tenant</Link>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
