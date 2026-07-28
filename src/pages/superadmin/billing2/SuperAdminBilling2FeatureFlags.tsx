import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Flag } from "lucide-react";
import { apiClient } from "@/integrations/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FlagRow = {
  key: string;
  label: string;
  defaultEnabled: boolean;
  enabled: boolean;
  destructive: boolean;
  introducedInSprint: number;
  source: string;
  resolvedFrom: 'db' | 'env' | 'default';
  platform_key?: string;
};

type FlagsResponse = {
  resolution_order?: string[];
  consumed_by_billing_runtime: boolean;
  destructive_defaults_off: boolean;
  flags: FlagRow[];
};

/**
 * Inventário read-only das Feature Flags Billing 2.0 (Sprint 0).
 * Não permite alterar flags — apenas inspeção.
 */
export default function SuperAdminBilling2FeatureFlags() {
  const [data, setData] = useState<FlagsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<FlagsResponse>("/api/superadmin/billing/feature-flags");
        if (cancelled) return;
        if (res.error) {
          setError(res.error);
          setData(null);
          return;
        }
        setData(res.data ?? null);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Falha ao carregar flags");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/superadmin/financeiro">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Financeiro
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-muted">
            <Flag className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle>Billing 2.0 — Feature Flags</CardTitle>
          <CardDescription>
            Inventário Billing 2.0 (somente leitura). Resolução: Super Admin (DB) →{" "}
            <code className="text-xs">BILLING2_FLAG_*</code> (.env) → default PRD. Controle operacional em{" "}
            <Link className="text-primary underline" to="/superadmin/avancado/feature-flags">
              Avançado → Feature Flags
            </Link>{" "}
            (namespace <code className="text-xs">billing2</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {data && (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">
                  Ordem: {(data.resolution_order ?? ['db', 'env', 'default']).join(' → ')}
                </Badge>
                <Badge variant={data.consumed_by_billing_runtime ? 'outline' : 'secondary'}>
                  Runtime: {data.consumed_by_billing_runtime ? 'consulta flags' : 'não'}
                </Badge>
                <Badge variant={data.destructive_defaults_off ? 'outline' : 'destructive'}>
                  Destrutivas default OFF: {data.destructive_defaults_off ? 'ok' : 'falha'}
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Flag</TableHead>
                    <TableHead>Efetivo</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Platform key</TableHead>
                    <TableHead>Sprint</TableHead>
                    <TableHead>Risco</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.flags.map((f) => (
                    <TableRow key={f.key}>
                      <TableCell>
                        <div className="font-medium">{f.label}</div>
                        <div className="text-xs text-muted-foreground">{f.key}</div>
                      </TableCell>
                      <TableCell>{f.enabled ? 'ON' : 'OFF'}</TableCell>
                      <TableCell>{f.defaultEnabled ? 'ON' : 'OFF'}</TableCell>
                      <TableCell>{f.resolvedFrom}</TableCell>
                      <TableCell className="font-mono text-xs">{f.platform_key ?? `billing2.${f.key}`}</TableCell>
                      <TableCell>{f.introducedInSprint}</TableCell>
                      <TableCell>{f.destructive ? 'destrutiva' : 'segura'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
