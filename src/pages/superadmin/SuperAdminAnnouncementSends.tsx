import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { announcementsAdminService, type AnnouncementSendListRow } from '@/services/announcementsAdmin';
import { toast } from '@/hooks/use-toast';

export default function SuperAdminAnnouncementSends() {
  const [rows, setRows] = useState<AnnouncementSendListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    announcementsAdminService
      .listSends()
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Histórico de envios</h1>
          <p className="text-sm text-muted-foreground">Filas de WhatsApp por anúncio e grupo.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/superadmin/announcements">Anúncios</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Envios</CardTitle>
          <CardDescription>Últimos 200</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem envios.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anúncio</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Delay</TableHead>
                    <TableHead>Criado</TableHead>
                    <TableHead className="text-right">Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{r.announcement_title}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {r.audience === 'lead_group' ? 'Leads' : 'Tenants'}
                      </TableCell>
                      <TableCell>{r.group_name}</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell>{r.delay_seconds}s</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/superadmin/announcements/sends/${r.id}`}>Ver</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
