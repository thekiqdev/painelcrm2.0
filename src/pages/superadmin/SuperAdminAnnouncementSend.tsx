import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { announcementsAdminService } from '@/services/announcementsAdmin';
import { superadminLeadsService, type SuperadminLeadGroupForAnnouncement } from '@/services/superadminLeads';
import { toast } from '@/hooks/use-toast';

type Audience = 'tenant' | 'lead';

export default function SuperAdminAnnouncementSend() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tenantGroups, setTenantGroups] = useState<{ id: string; name: string; member_count: number }[]>([]);
  const [leadGroups, setLeadGroups] = useState<SuperadminLeadGroupForAnnouncement[]>([]);
  const [audience, setAudience] = useState<Audience>('tenant');
  const [tenantGroupId, setTenantGroupId] = useState('');
  const [leadGroupId, setLeadGroupId] = useState('');
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
    Promise.all([announcementsAdminService.listGroups(), superadminLeadsService.listGroupsForAnnouncements()])
      .then(([g, lg]) => {
        setTenantGroups(
          g.filter((x) => x.is_active).map((x) => ({ id: x.id, name: x.name, member_count: x.member_count })),
        );
        setLeadGroups(lg);
      })
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!id) return;
    if (audience === 'tenant' && !tenantGroupId) {
      toast({ title: 'Escolha um grupo de empresas', variant: 'destructive' });
      return;
    }
    if (audience === 'lead' && !leadGroupId) {
      toast({ title: 'Escolha um grupo de leads', variant: 'destructive' });
      return;
    }
    const delaySeconds = Math.max(0, parseInt(delay || '0', 10) || 0);
    try {
      setSending(true);
      const { send_id } = await announcementsAdminService.send(id, {
        ...(audience === 'tenant'
          ? { group_id: tenantGroupId }
          : { superadmin_lead_group_id: leadGroupId }),
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
            Instância WhatsApp da plataforma. Escolha grupo de empresas (tenants) ou grupo de leads importados no Super
            Admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Destino</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tenant">Empresas (tenants)</SelectItem>
                <SelectItem value="lead">Leads (plataforma)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {audience === 'tenant' ? (
            <div className="space-y-2">
              <Label>Grupo de empresas</Label>
              <Select value={tenantGroupId} onValueChange={setTenantGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {tenantGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({g.member_count} tenants)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Grupo de leads</Label>
              {leadGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-2">
                  Nenhum grupo com membros. Importe leads em Super Admin → Leads e configure grupos.
                </p>
              ) : (
                <Select value={leadGroupId} onValueChange={setLeadGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} ({g.reachable_count} com telefone válido)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                Gira grupos em «Leads» → «Grupos». Linhas sem telefone válido ficam como ignoradas na fila.
              </p>
            </div>
          )}

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
