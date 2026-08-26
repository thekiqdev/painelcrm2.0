import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/integrations/api/client';
import { BarChart3, Download } from 'lucide-react';

interface ReportsData {
  adoption: Array< { id: string; name: string; slug: string; tenants_count: number }>;
  revenue: Array<{ id: string; name: string; slug: string; price_cents: number; billing_interval: string; active_tenants: number; revenue_cents: number }>;
  churn: Record<string, number>;
  totals: { tenants_active: number; tenants_suspended: number; tenants_trial: number };
}

export default function SuperAdminReports() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const res = await apiClient.get<ReportsData>('/api/superadmin/reports');
      if (res.data) setData(res.data);
      setLoading(false);
    };
    load();
  }, []);

  const downloadExport = async (path: string, filename: string) => {
    setExporting(path);
    try {
      const token = apiClient.getToken();
      const r = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Falha no download');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
    setExporting(null);
  };

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">
            Venda direta (Platform). Canal Partner não entra nestes totais nem nos CSVs de planos/uso.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => downloadExport('/export/clients', 'empresas.csv')}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting === '/export/clients' ? '...' : 'Empresas CSV'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => downloadExport('/export/plans', 'planos.csv')}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting === '/export/plans' ? '...' : 'Planos CSV'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => downloadExport('/export/usage', 'uso.csv')}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting === '/export/usage' ? '...' : 'Uso CSV'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Adoção por plano
            </CardTitle>
            <CardDescription>Empresas Platform ativas por plano</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.adoption.map((row) => (
                <li key={row.id} className="flex justify-between text-sm">
                  <span>{row.name}</span>
                  <span className="font-medium">{row.tenants_count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Receita (estimada)</CardTitle>
            <CardDescription>Por plano (ativos Platform × preço de lista)</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.revenue.map((row) => (
                <li key={row.id} className="flex justify-between text-sm">
                  <span>{row.name}</span>
                  <span>
                    {row.active_tenants} × R$ {(row.price_cents / 100).toFixed(2)} = R$ {(row.revenue_cents / 100).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status das empresas (churn)</CardTitle>
          <CardDescription>Totais por status — só platform_customer</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6">
            <div><span className="text-muted-foreground">Ativos:</span> <strong>{data.totals.tenants_active}</strong></div>
            <div><span className="text-muted-foreground">Trial:</span> <strong>{data.totals.tenants_trial}</strong></div>
            <div><span className="text-muted-foreground">Suspensos:</span> <strong>{data.totals.tenants_suspended}</strong></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
