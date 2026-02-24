import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/integrations/api/client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AuditItem {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  user_email: string | null;
}

interface AuditResponse {
  items: AuditItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export default function SuperAdminAudit() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<AuditResponse>(
        `/api/superadmin/audit-log?page=${page}&limit=20`
      );
      if (res.error) {
        setError(res.error);
        setData(null);
      } else if (res.data) {
        setData(res.data);
      }
      setLoading(false);
    };
    load();
  }, [page]);

  const formatDate = (s: string) =>
    new Date(s).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Log de auditoria</h1>
        <p className="text-muted-foreground">Ações realizadas no painel Super Admin.</p>
      </div>

      {error && (
        <p className="text-destructive">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Registros</CardTitle>
          <CardDescription>Histórico de alterações em planos, empresas e recursos.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : data?.items?.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead className="max-w-[200px]">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatDate(row.created_at)}
                      </TableCell>
                      <TableCell>{row.user_email ?? row.user_id}</TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{row.action}</span>
                      </TableCell>
                      <TableCell>{row.entity_type}</TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[120px]">
                        {row.entity_id ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {row.payload
                          ? JSON.stringify(row.payload).slice(0, 80) + (JSON.stringify(row.payload).length > 80 ? '…' : '')
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.pagination.total_pages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Página {data.pagination.page} de {data.pagination.total_pages} ({data.pagination.total} registros)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= data.pagination.total_pages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Nenhum registro de auditoria ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
