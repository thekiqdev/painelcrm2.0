import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { FileText, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/integrations/api/client';
import { useTenantDetail } from '@/contexts/TenantDetailContext';

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
  tenant_id: string;
  items: AuditItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

const ACTION_LABELS: Record<string, string> = {
  'tenant.created': 'Empresa criada',
  'tenant.updated': 'Empresa atualizada',
  'tenant.deleted': 'Empresa excluída',
  'tenant.primary_user_updated': 'Contato principal atualizado',
  'tenant.billing_created': 'Cobrança gerada',
};

export default function SuperAdminClientLogs() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenantDetail();
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>('_all');

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const actionParam = actionFilter === '_all' ? '' : `&action=${encodeURIComponent(actionFilter)}`;
      const res = await apiClient.get<AuditResponse>(
        `/api/superadmin/tenants/${id}/audit-log?page=${page}&limit=20${actionParam}`
      );
      if (res.error) {
        toast.error(res.error);
        setData(null);
      } else if (res.data) {
        setData(res.data);
      }
      setLoading(false);
    };
    load();
  }, [id, page, actionFilter]);

  const formatDate = (s: string) =>
    new Date(s).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const actionLabel = (action: string) => ACTION_LABELS[action] || action;

  if (!tenant) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Logs e atividades</h2>
          <p className="text-sm text-muted-foreground">
            Alterações de plano, suspensões e eventos desta empresa.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/superadmin/audit')}
          className="shrink-0"
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Ver log global
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Registros
          </CardTitle>
          <CardDescription>
            Ações realizadas por Super Admins sobre esta empresa.
          </CardDescription>
          <div className="pt-2">
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Tipo de evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos os eventos</SelectItem>
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                    <TableHead className="max-w-[240px]">Detalhes</TableHead>
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
                        <span className="font-medium">{actionLabel(row.action)}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                        {row.payload
                          ? JSON.stringify(row.payload).slice(0, 100) +
                            (JSON.stringify(row.payload).length > 100 ? '…' : '')
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
            <p className="text-muted-foreground">Nenhum registro de auditoria para esta empresa.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
