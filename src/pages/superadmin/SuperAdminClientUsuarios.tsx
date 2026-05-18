import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
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
import { useTenantDetail } from '@/contexts/TenantDetailContext';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';
import { UserCog, LogIn } from 'lucide-react';
import { useSuperadminImpersonation } from '@/hooks/useSuperadminImpersonation';

interface TenantUser {
  id: string;
  email: string;
  full_name: string | null;
  last_used_at: string | null;
  role: string | null;
  is_super_admin: boolean;
}

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  member: 'Membro',
  viewer: 'Visualizador',
};

function formatLastAccess(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays} dias atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getStatus(last_used_at: string | null): 'active' | 'inactive' {
  if (!last_used_at) return 'inactive';
  const d = new Date(last_used_at);
  const now = new Date();
  const diffDays = (now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000);
  return diffDays <= 30 ? 'active' : 'inactive';
}

export default function SuperAdminClientUsuarios() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useTenantDetail();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const { openAsUser, impersonatingUserId } = useSuperadminImpersonation();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await apiClient.get<TenantUser[]>(`/api/superadmin/tenants/${id}/users`);
    if (res.data) setUsers(res.data);
    if (res.error) toast.error(res.error);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!tenant) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Usuários</h2>
        <p className="text-sm text-muted-foreground">Lista de usuários vinculados à empresa. Use &quot;Acessar como&quot; para abrir o painel no lugar do usuário.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Usuários da empresa
          </CardTitle>
          <CardDescription>Perfil/função, último acesso e status. Super Admin não pode ser acessado como.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground">Nenhum usuário vinculado a esta empresa.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil / Função</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const status = getStatus(u.last_used_at);
                  const canImpersonate = !u.is_super_admin;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.role ? (roleLabels[u.role] || u.role) : '—'}</TableCell>
                      <TableCell>{formatLastAccess(u.last_used_at)}</TableCell>
                      <TableCell>
                        <Badge variant={status === 'active' ? 'default' : 'secondary'}>
                          {status === 'active' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canImpersonate ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAsUser(u.id)}
                            disabled={!!impersonatingUserId}
                          >
                            <LogIn className="mr-2 h-4 w-4" />
                            {impersonatingUserId === u.id ? 'Abrindo...' : 'Acessar como'}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Super Admin</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
