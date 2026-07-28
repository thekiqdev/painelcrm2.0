import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { apiClient } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';

type ListItem = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_status: string;
  plan_name: string | null;
  amount_cents: number;
  contracted_amount_cents: number | null;
  billing_interval: string;
  status: string;
  next_billing_date: string;
  default_payment_method: string | null;
  overdue_invoices_count: number;
};

type Detail = ListItem & {
  users_count: number | null;
  gateway: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  grace_period_days: number | null;
  pix_automatic_auth_status?: string | null;
  pix_automatic_authorized_at?: string | null;
  recent_invoices: Array<{
    id: string;
    status: string;
    amount_cents: number;
    due_date: string;
    invoice_number: string | null;
    payment_method: string | null;
  }>;
  recent_audit: Array<{
    id: string;
    action: string;
    actor: string;
    reason: string | null;
    created_at: string;
  }>;
};

function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'past_due') return 'destructive';
  if (status === 'active') return 'default';
  if (status === 'cancelled') return 'secondary';
  return 'outline';
}

/**
 * Financeiro → Assinaturas SaaS (Billing 2.0 Sprint 5).
 * Read-only útil mesmo com engine/writer OFF.
 */
export default function SuperAdminBilling2SubscriptionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');

  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});

  const loadList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
    if (q.trim()) params.set('q', q.trim());
    params.set('limit', '100');
    const res = await apiClient.get<{
      subscriptions: ListItem[];
      total: number;
      labels?: Record<string, string>;
    }>(`/api/superadmin/billing/subscriptions?${params.toString()}`);
    setLoading(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Falha ao listar assinaturas');
      return;
    }
    setRows(res.data.subscriptions);
    setTotal(res.data.total);
    if (res.data.labels) setLabels(res.data.labels);
  }, [statusFilter, q]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    const res = await apiClient.get<{
      subscription: Detail;
      labels?: Record<string, string>;
      links?: { platform_billings?: string };
    }>(`/api/superadmin/billing/subscriptions/${id}`);
    setDetailLoading(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Assinatura não encontrada');
      setDetail(null);
      return;
    }
    setDetail(res.data.subscription);
    if (res.data.labels) setLabels((prev) => ({ ...prev, ...res.data!.labels }));
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const openDetail = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('id', id);
    if (statusFilter !== 'all') next.set('status', statusFilter);
    if (q.trim()) next.set('q', q.trim());
    setSearchParams(next);
  };

  const closeDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next);
  };

  const hint = useMemo(() => {
    return (
      labels.tenant_status ||
      'tenant.status = acesso; subscription.status = contrato; invoice.status = cobrança'
    );
  }, [labels]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/superadmin/financeiro">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Financeiro
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Assinaturas</h1>
        <p className="mt-1 text-muted-foreground">
          Contratos SaaS da plataforma (<code className="text-xs">subscriptions.type=saas</code>).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>

      {selectedId ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Detalhe da assinatura</CardTitle>
              <CardDescription className="font-mono text-xs">{selectedId}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={closeDetail}>
              Voltar à lista
            </Button>
          </CardHeader>
          <CardContent>
            {detailLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!detailLoading && detail && (
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                  <Info label="Tenant" value={`${detail.tenant_name}`} />
                  <Info
                    label="Status do contrato"
                    value={
                      <Badge variant={statusBadgeVariant(detail.status)}>{detail.status}</Badge>
                    }
                  />
                  <Info
                    label="Status do tenant (acesso)"
                    value={<Badge variant="outline">{detail.tenant_status}</Badge>}
                  />
                  <Info label="Plano" value={detail.plan_name ?? '—'} />
                  <Info
                    label="Valor contratado"
                    value={formatBrl(detail.contracted_amount_cents ?? detail.amount_cents)}
                  />
                  <Info label="Intervalo" value={detail.billing_interval} />
                  <Info label="Próxima cobrança" value={detail.next_billing_date || '—'} />
                  <Info label="Método" value={detail.default_payment_method ?? '—'} />
                  <Info label="Grace (dias)" value={String(detail.grace_period_days ?? '—')} />
                  <Info label="Faturas overdue" value={String(detail.overdue_invoices_count)} />
                  <Info
                    label="Pix Automático"
                    value={
                      detail.pix_automatic_auth_status ? (
                        <Badge
                          variant={
                            detail.pix_automatic_auth_status === 'active'
                              ? 'default'
                              : detail.pix_automatic_auth_status === 'pending'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {detail.pix_automatic_auth_status}
                        </Badge>
                      ) : (
                        '—'
                      )
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/superadmin/platform-billings?tenant_id=${detail.tenant_id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Cobranças do tenant
                    </Link>
                  </Button>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Últimas faturas (tenant_billing)</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fatura</TableHead>
                        <TableHead>Status cobrança</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Método</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.recent_invoices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-muted-foreground">
                            Nenhuma fatura vinculada a esta assinatura.
                          </TableCell>
                        </TableRow>
                      )}
                      {detail.recent_invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs">
                            {inv.invoice_number ?? inv.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{inv.status}</Badge>
                          </TableCell>
                          <TableCell>{inv.due_date}</TableCell>
                          <TableCell>{formatBrl(inv.amount_cents)}</TableCell>
                          <TableCell>{inv.payment_method ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {detail.recent_audit.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Audit recente</h3>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {detail.recent_audit.map((a) => (
                        <li key={a.id}>
                          <span className="font-medium text-foreground">{a.action}</span> · {a.actor}
                          {a.reason ? ` · ${a.reason}` : ''} ·{' '}
                          {new Date(a.created_at).toLocaleString('pt-BR')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Lista</CardTitle>
            <CardDescription>
              {total} contrato(s). Writer <code className="text-xs">past_due</code> só grava com
              Feature Flag ON (default OFF).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Buscar tenant, plano ou id…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void loadList();
                  }}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="past_due">past_due</SelectItem>
                  <SelectItem value="paused">paused</SelectItem>
                  <SelectItem value="trialing">trialing</SelectItem>
                  <SelectItem value="cancelled">cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void loadList()} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Tenant acesso</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Próx. cobrança</TableHead>
                    <TableHead>Overdue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-muted-foreground">
                        Nenhuma assinatura encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => openDetail(row.id)}
                    >
                      <TableCell>
                        <div className="font-medium">{row.tenant_name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {row.tenant_id.slice(0, 8)}…
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.tenant_status}</Badge>
                      </TableCell>
                      <TableCell>{row.plan_name ?? '—'}</TableCell>
                      <TableCell>
                        {formatBrl(row.contracted_amount_cents ?? row.amount_cents)}
                      </TableCell>
                      <TableCell>{row.default_payment_method ?? '—'}</TableCell>
                      <TableCell>{row.next_billing_date}</TableCell>
                      <TableCell>{row.overdue_invoices_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Info(props: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-0.5 font-medium text-foreground">{props.value}</div>
    </div>
  );
}
