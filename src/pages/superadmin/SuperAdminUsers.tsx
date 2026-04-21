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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';

interface SuperAdminUser {
  id: string;
  email: string;
  is_super_admin: boolean;
  created_at: string;
}

export default function SuperAdminUsers() {
  const [list, setList] = useState<SuperAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await apiClient.get<SuperAdminUser[]>('/api/superadmin/users');
    if (res.data) setList(res.data);
    if (res.error) toast.error(res.error);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!email.trim()) {
      toast.error('E-mail é obrigatório');
      return;
    }
    if (!password || password.length < 6) {
      toast.error('Senha deve ter no mínimo 6 caracteres');
      return;
    }
    setSaving(true);
    const res = await apiClient.post<SuperAdminUser>('/api/superadmin/users', { email: email.trim().toLowerCase(), password });
    if (res.error) {
      toast.error(res.error);
      setSaving(false);
      return;
    }
    toast.success('Super Admin adicionado');
    setDialogOpen(false);
    setEmail('');
    setPassword('');
    setSaving(false);
    load();
  };

  const remove = async (user: SuperAdminUser) => {
    if (list.length <= 1) {
      toast.error('Não é permitido remover o último Super Admin.');
      return;
    }
    if (!confirm(`Remover "${user.email}" como Super Admin? O usuário continuará existindo, mas perderá acesso ao painel Super Admin.`)) return;
    const res = await apiClient.delete(`/api/superadmin/users/${user.id}`);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Super Admin removido');
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Super Admins</h1>
          <p className="text-muted-foreground">Usuários com acesso ao painel Super Admin.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Super Admin
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista</CardTitle>
          <CardDescription>Não remova o último Super Admin.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : list.length === 0 ? (
            <p className="text-muted-foreground">Nenhum Super Admin.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(u)}
                        disabled={list.length <= 1}
                        title={list.length <= 1 ? 'Não é permitido remover o último' : 'Remover Super Admin'}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Super Admin</DialogTitle>
            <DialogDescription>
              Informe o e-mail e a senha. Se o usuário já existir, ele será promovido a Super Admin.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@empresa.com"
              />
            </div>
            <div className="grid gap-2">
              <Label>Senha (mín. 6 caracteres)</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={add} disabled={saving}>{saving ? 'Salvando...' : 'Adicionar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
