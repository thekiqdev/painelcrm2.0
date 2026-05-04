import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { announcementsAdminService, type AnnouncementSendListRow } from '@/services/announcementsAdmin';
import { toast } from '@/hooks/use-toast';

type Recipient = {
  id: string;
  tenant_id: string | null;
  superadmin_lead_id: string | null;
  lead_name: string | null;
  phone: string | null;
  status: string;
  attempt_count: number;
  error_message: string | null;
  scheduled_at: string;
  sent_at: string | null;
};

export default function SuperAdminAnnouncementSendDetail() {
  const { sendId } = useParams<{ sendId: string }>();
  const [send, setSend] = useState<AnnouncementSendListRow | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sendId) return;
    let ok = true;
    announcementsAdminService
      .getSend(sendId)
      .then((d) => {
        if (!ok) return;
        setSend(d.send as AnnouncementSendListRow);
        setRecipients(d.recipients);
      })
      .catch((e) => toast({ title: 'Erro', description: String(e.message), variant: 'destructive' }))
      .finally(() => {
        if (ok) setLoading(false);
      });
    return () => {
      ok = false;
    };
  }, [sendId]);

  if (loading) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  if (!send) return <p className="text-sm text-muted-foreground">Não encontrado.</p>;

  const isLeadAudience = send.audience === 'lead_group';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Envio</h1>
          <p className="text-sm text-muted-foreground">
            {send.announcement_title} · {send.group_name}
            {isLeadAudience ? ' · leads' : ' · tenants'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/superadmin/announcements/sends">Voltar</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
          <CardDescription>
            Estado: {send.status} · Delay: {send.delay_seconds}s · Início: {send.started_at ?? '—'} · Fim:{' '}
            {send.finished_at ?? '—'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isLeadAudience ? 'Lead' : 'Tenant'}</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Agendado</TableHead>
                  <TableHead>Enviado</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm max-w-[220px]">
                      {isLeadAudience ? (
                        <span className="truncate block" title={r.lead_name ?? r.superadmin_lead_id ?? ''}>
                          {r.lead_name ?? r.superadmin_lead_id ?? '—'}
                        </span>
                      ) : (
                        <span className="font-mono text-xs truncate block">{r.tenant_id ?? '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.phone ?? '—'}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(r.scheduled_at).toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.sent_at ? new Date(r.sent_at).toLocaleString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate">{r.error_message ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
