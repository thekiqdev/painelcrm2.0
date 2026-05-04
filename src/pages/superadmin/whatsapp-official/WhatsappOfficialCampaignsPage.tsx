import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { whatsappOfficialAdminService } from '@/services/whatsappOfficialAdmin';
import { superadminLeadsService, type SuperadminLeadGroupRow } from '@/services/superadminLeads';
import { toast } from '@/hooks/use-toast';

type Camp = {
  id: string;
  name: string;
  template_name: string;
  language: string;
  status: string;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

type TemplateOpt = { template_name: string; language: string; status?: string | null };

export default function WhatsappOfficialCampaignsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<Camp[]>([]);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [groups, setGroups] = useState<SuperadminLeadGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [templatePick, setTemplatePick] = useState('');
  const [groupId, setGroupId] = useState('');
  const [creating, setCreating] = useState(false);
  const [dispatching, setDispatching] = useState<string | null>(null);

  const load = () => {
    Promise.all([
      whatsappOfficialAdminService.listCampaigns(),
      whatsappOfficialAdminService.listTemplates(),
      superadminLeadsService.listGroups(),
    ])
      .then(([c, tpl, g]) => {
        setCampaigns((c as Camp[]) ?? []);
        const raw = (tpl as TemplateOpt[]) ?? [];
        const approved = raw.filter(
          (t) => String(t.status ?? '').toUpperCase() === 'APPROVED',
        );
        setTemplates(approved);
        setGroups(g);
      })
      .catch((e) => toast({ title: 'Erro', description: String(e.message), variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (templates.length === 0) {
      setTemplatePick('');
      return;
    }
    const tn = searchParams.get('campaignTpl');
    const lang = searchParams.get('campaignLang');
    if (tn && lang) {
      const key = `${tn}|||${lang}`;
      const exists = templates.some((t) => `${t.template_name}|||${t.language}` === key);
      if (exists) {
        setTemplatePick(key);
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.delete('campaignTpl');
            p.delete('campaignLang');
            return p;
          },
          { replace: true },
        );
        return;
      }
    }
    setTemplatePick((prev) => {
      const ok = templates.some((t) => `${t.template_name}|||${t.language}` === prev);
      if (ok) return prev;
      return `${templates[0]!.template_name}|||${templates[0]!.language}`;
    });
  }, [templates, searchParams, setSearchParams]);

  const create = async () => {
    const [templateName, language] = templatePick.split('|||');
    if (!name.trim() || !templateName || !language || !groupId) {
      toast({ title: 'Preencha nome, template e grupo', variant: 'destructive' });
      return;
    }
    try {
      setCreating(true);
      await whatsappOfficialAdminService.createCampaign({
        name: name.trim(),
        template_name: templateName,
        language,
        audience_type: 'superadmin_lead_group',
        audience_group_id: groupId,
        template_components: [],
      });
      toast({ title: 'Campanha criada' });
      setName('');
      load();
    } catch (e) {
      toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const dispatch = async (id: string) => {
    try {
      setDispatching(id);
      const r = await whatsappOfficialAdminService.dispatchCampaign(id);
      toast({
        title: 'Disparo concluído',
        description: `Enviados: ${r.sent}, falhas: ${r.failed}${r.error ? ` · ${r.error}` : ''}`,
      });
      load();
    } catch (e) {
      toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setDispatching(null);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nova campanha (template)</CardTitle>
          <CardDescription>
            Público: grupo de leads da plataforma (Super Admin). Mensagens fora da janela de 24h exigem template aprovado.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 max-w-xl">
          <div className="space-y-2">
            <Label>Nome interno</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Template + idioma</Label>
            <Select value={templatePick} onValueChange={setTemplatePick}>
              <SelectTrigger>
                <SelectValue placeholder="Escolher template aprovado" />
              </SelectTrigger>
              <SelectContent>
                {templates.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    Nenhum modelo APPROVED — crie na página de modelos e sincronize após aprovação na Meta.
                  </div>
                ) : (
                  templates.map((t) => {
                    const v = `${t.template_name}|||${t.language}`;
                    return (
                      <SelectItem key={v} value={v}>
                        {t.template_name} ({t.language})
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Grupo de leads</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Grupo" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} ({g.member_count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={create} disabled={creating}>
            {creating ? 'A criar…' : 'Criar campanha'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campanhas</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma campanha.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Env./falh.</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className="text-sm">{c.template_name}</TableCell>
                      <TableCell>{c.status}</TableCell>
                      <TableCell>
                        {c.sent_count}/{c.failed_count}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={dispatching === c.id || c.status === 'completed'}
                          onClick={() => dispatch(c.id)}
                        >
                          {dispatching === c.id ? '…' : 'Disparar'}
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
