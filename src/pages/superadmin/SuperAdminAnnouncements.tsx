import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { announcementsAdminService, type AnnouncementRow } from '@/services/announcementsAdmin';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Megaphone, Plus, Users, History, Trash2 } from 'lucide-react';

const typeLabel: Record<string, string> = {
  whatsapp_only: 'Só WhatsApp',
  whatsapp_and_updates_page: 'WhatsApp + página',
};

const statusVariant = (s: string) => (s === 'published' ? 'default' : s === 'draft' ? 'secondary' : 'outline');

export default function SuperAdminAnnouncements() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<AnnouncementRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let ok = true;
    announcementsAdminService
      .list()
      .then((r) => {
        if (ok) setRows(r);
      })
      .catch((e) => toast({ title: 'Erro', description: String(e.message), variant: 'destructive' }))
      .finally(() => {
        if (ok) setLoading(false);
      });
    return () => {
      ok = false;
    };
  }, []);

  const quickPublish = async (id: string) => {
    try {
      await announcementsAdminService.publish(id);
      toast({ title: 'Publicado' });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'published' as const } : r)));
    } catch (e) {
      toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' });
    }
  };

  const quickUnpublish = async (id: string) => {
    try {
      await announcementsAdminService.unpublish(id);
      toast({ title: 'Despublicado' });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'unpublished' as const } : r)));
    } catch (e) {
      toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setDeletingId(id);
    try {
      await announcementsAdminService.remove(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast({ title: 'Anúncio excluído' });
      setPendingDelete(null);
    } catch (e) {
      toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const canDelete = (r: AnnouncementRow) => r.status === 'draft' || r.status === 'unpublished';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Anúncios</h1>
          <p className="text-sm text-muted-foreground">Comunicados para clientes via WhatsApp e página de atualizações.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/superadmin/announcements/groups">
              <Users className="mr-2 h-4 w-4" />
              Grupos
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/superadmin/announcements/sends">
              <History className="mr-2 h-4 w-4" />
              Histórico
            </Link>
          </Button>
          <Button onClick={() => navigate('/superadmin/announcements/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Novo anúncio
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Megaphone className="h-5 w-5" />
            Lista
          </CardTitle>
          <CardDescription>Rascunhos e publicados</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum anúncio ainda.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Publicado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium max-w-[220px] truncate">{r.title}</TableCell>
                      <TableCell className="text-sm">{typeLabel[r.type] ?? r.type}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{r.category ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {r.published_at ? new Date(r.published_at).toLocaleString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/superadmin/announcements/${r.id}/edit`)}>
                            Editar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/superadmin/announcements/${r.id}/send`)}>
                            Enviar
                          </Button>
                          {r.status !== 'published' ? (
                            <Button variant="outline" size="sm" onClick={() => quickPublish(r.id)}>
                              Publicar
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => quickUnpublish(r.id)}>
                              Despublicar
                            </Button>
                          )}
                          {canDelete(r) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setPendingDelete(r)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Excluir
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anúncio?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este anúncio? Esta ação não poderá ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingId !== null}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deletingId ? 'A excluir…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
