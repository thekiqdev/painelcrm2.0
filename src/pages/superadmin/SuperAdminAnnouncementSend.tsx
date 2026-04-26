import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { announcementsAdminService } from '@/services/announcementsAdmin';
import { toast } from '@/hooks/use-toast';

export default function SuperAdminAnnouncementSend() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<{ id: string; name: string; member_count: number }[]>([]);
  const [groupId, setGroupId] = useState('');
  const [delay, setDelay] = useState('5');
  const [scheduled, setScheduled] = useState('');
  const [previewMsg, setPreviewMsg] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id) return;
    announcementsAdminService
      .get(id)
      .then((a) => setPreviewMsg(a.whatsapp_message ?? ''))
      .catch((e) => toast({ title: 'Erro', description: String(e.message), variant: 'destructive' }));
  }, [id]);

  useEffect(() => {
    announcementsAdminService
      .listGroups()
      .then((g) =>
        setGroups(
          g
            .filter((x) => x.is_active)
            .map((x) => ({ id: x.id, name: x.name, member_count: x.member_count })),
        ),
      )
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!id) return;
    if (!groupId) {
      toast({ title: 'Escolha um grupo', variant: 'destructive' });
      return;
    }
    const delaySeconds = Math.max(0, parseInt(delay || '0', 10) || 0);
    try {
      setSending(true);
      const { send_id } = await announcementsAdminService.send(id, {
        group_id: groupId,
        delay_seconds: delaySeconds,
        scheduled_start_at: scheduled.trim() ? new Date(scheduled).toISOString() : null,
      });
      toast({ title: 'Envio enfileirado', description: `ID: ${send_id}` });
      navigate(`/superadmin/announcements/sends/${send_id}`);
    } catch (e) {
      toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  if (!id) return null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Enviar anúncio</h1>
        <Button variant="outline" onClick={() => navigate('/superadmin/announcements')}>
          Voltar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fila WhatsApp</CardTitle>
          <CardDescription>
            Usa a instância WhatsApp da plataforma (Motor de notificações). Delay entre cada cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Grupo destino</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} ({g.member_count} tenants)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="delay">Delay entre mensagens (segundos)</Label>
            <Input id="delay" inputMode="numeric" value={delay} onChange={(e) => setDelay(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched">Agendar início (opcional, datetime local)</Label>
            <Input id="sched" type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Pré-visualização</Label>
            <Textarea readOnly rows={6} value={previewMsg} className="bg-muted/40" />
          </div>
          <Button onClick={submit} disabled={sending}>
            {sending ? 'A enviar…' : 'Enfileirar envio'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
