import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Label } from '@/components/ui/label';
import { useTenantDetail } from '@/contexts/TenantDetailContext';
import { apiClient } from '@/integrations/api/client';
import { toast } from 'sonner';
import { CreditCard, Plus } from 'lucide-react';

interface IntervalPrice {
  billing_interval: string;
  price_per_user_cents: number;
}

interface BillingPlan {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  billing_interval: string;
  plan_type?: 'standard' | 'custom';
  interval_prices?: IntervalPrice[];
  contracted_users?: number;
}

interface NextCharge {
  id: string;
  due_date: string;
  amount_cents: number;
  status: string;
  invoice_number: string | null;
  created_at: string;
}

interface BillingHistoryItem {
  id: string;
  due_date: string;
  amount_cents: number;
  status: string;
  paid_at: string | null;
  invoice_number: string | null;
  created_at: string;
  plan_name: string | null;
}

interface BillingResponse {
  plan: BillingPlan;
  next_charge: NextCharge | null;
  history: BillingHistoryItem[];
}

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
};

const intervalLabels: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semi_annual: 'Semestral',
  yearly: 'Anual',
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function SuperAdminClientFaturamento() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenantDetail();
  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [chargeBillingInterval, setChargeBillingInterval] = useState<string>('');

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await apiClient.get<BillingResponse>(`/api/superadmin/tenants/${id}/billing`);
    if (res.data) setData(res.data);
    if (res.error) toast.error(res.error);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGerarCobranca = async () => {
    if (!id) return;
    const isCustom = data?.plan?.plan_type === 'custom';
    if (isCustom && data?.plan?.interval_prices?.length) {
      const interval = chargeBillingInterval || data.plan.interval_prices[0]?.billing_interval;
      if (!interval) {
        toast.error('Selecione o intervalo de cobrança para plano personalizado.');
        return;
      }
      const hasPrice = data.plan.interval_prices.some((ip) => ip.billing_interval === interval);
      if (!hasPrice) {
        toast.error('Este plano não tem preço configurado para o intervalo selecionado.');
        return;
      }
    }
    setCreating(true);
    const body: { billing_interval?: string } = {};
    if (data?.plan?.plan_type === 'custom' && data?.plan?.interval_prices?.length) {
      body.billing_interval = chargeBillingInterval || data.plan.interval_prices[0]?.billing_interval;
    }
    const res = await apiClient.post<NextCharge>(`/api/superadmin/tenants/${id}/billing/charge`, body);
    setCreating(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Cobrança gerada. Vencimento em 1 mês.');
    load();
  };

  if (!tenant) return null;

  if (loading) {
    return <p className="text-muted-foreground">Carregando faturamento...</p>;
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">Erro ao carregar dados de faturamento.</p>
        <Button variant="outline" onClick={load}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const { plan, next_charge, history } = data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Faturamento</h2>
        <p className="text-sm text-muted-foreground">Plano atual, cobranças e histórico.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Plano atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{plan.name}</p>
            {plan.plan_type === 'custom' && plan.interval_prices?.length ? (
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p>Preço por usuário por periodicidade:</p>
                {plan.interval_prices.map((ip) => (
                  <p key={ip.billing_interval}>
                    {intervalLabels[ip.billing_interval] || ip.billing_interval}: {formatCurrency(ip.price_per_user_cents)}/usuário
                  </p>
                ))}
                {plan.contracted_users != null && (
                  <p className="pt-1 font-medium text-foreground">Usuários contratados: {plan.contracted_users}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {formatCurrency(plan.price_cents)} / {intervalLabels[plan.billing_interval] || plan.billing_interval}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Próxima cobrança</CardTitle>
          </CardHeader>
          <CardContent>
            {next_charge ? (
              <>
                <p className="font-medium">{formatCurrency(next_charge.amount_cents)}</p>
                <p className="text-sm text-muted-foreground">Vencimento: {formatDate(next_charge.due_date)}</p>
                <Badge variant={next_charge.status === 'paid' ? 'default' : next_charge.status === 'overdue' ? 'destructive' : 'secondary'} className="mt-1">
                  {statusLabels[next_charge.status] || next_charge.status}
                </Badge>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhuma cobrança pendente</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status do pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            {next_charge ? (
              <p className="font-medium">{statusLabels[next_charge.status] || next_charge.status}</p>
            ) : (
              <p className="text-muted-foreground">Sem cobranças pendentes</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Histórico de cobranças</CardTitle>
              <CardDescription>Últimas cobranças desta empresa.</CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              {plan.plan_type === 'custom' && plan.interval_prices?.length && plan.contracted_users != null && (
                <div className="space-y-2">
                  <Label>Intervalo da cobrança (plano personalizado)</Label>
                  <Select
                    value={chargeBillingInterval || plan.interval_prices[0]?.billing_interval || ''}
                    onValueChange={setChargeBillingInterval}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {plan.interval_prices.map((ip) => {
                        const total = ip.price_per_user_cents * plan.contracted_users!;
                        return (
                          <SelectItem key={ip.billing_interval} value={ip.billing_interval}>
                            {intervalLabels[ip.billing_interval] || ip.billing_interval}: {plan.contracted_users} × {formatCurrency(ip.price_per_user_cents)} = {formatCurrency(total)}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={handleGerarCobranca} disabled={creating}>
                  <Plus className="mr-2 h-4 w-4" />
                  {creating ? 'Gerando...' : 'Gerar cobrança'}
                </Button>
                <Button variant="outline" onClick={() => navigate(`/superadmin/clients/${id}/configuracoes`)}>
                  Trocar plano
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma cobrança registrada. Clique em &quot;Gerar cobrança&quot; para criar a primeira.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº / Referência</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pago em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">{row.invoice_number || row.id.slice(0, 8)}</TableCell>
                    <TableCell>{formatDate(row.due_date)}</TableCell>
                    <TableCell>{formatCurrency(row.amount_cents)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === 'paid' ? 'default' : row.status === 'overdue' ? 'destructive' : 'secondary'
                        }
                      >
                        {statusLabels[row.status] || row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.paid_at ? formatDate(row.paid_at) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
