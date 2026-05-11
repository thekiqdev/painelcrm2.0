import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import {
  superadminPlatformSupportService,
  type SuperadminPlatformSupportSettings,
} from '@/services/platformSupport';
import {
  platformSupportCategoryLabels,
  platformSupportPriorityColors,
  platformSupportPriorityLabels,
  platformSupportStatusColors,
  platformSupportStatusLabels,
  type PlatformSupportTicket,
} from '@/types/platformSupport';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function SuperAdminPlatformSupport() {
  const [settings, setSettings] = useState<SuperadminPlatformSupportSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tickets, setTickets] = useState<PlatformSupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const data = await superadminPlatformSupportService.getSettings();
      setSettings(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar configurações');
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const data = await superadminPlatformSupportService.listTickets(params);
      setTickets(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao listar chamados');
    } finally {
      setTicketsLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await superadminPlatformSupportService.saveSettings(settings);
      setSettings(saved);
      toast.success('Configurações salvas');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Suporte da plataforma</h1>
        <p className="text-sm text-muted-foreground">WhatsApp e chamados dos clientes PainelCRM.</p>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
          <TabsTrigger value="tickets">Chamados</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp e disponibilidade</CardTitle>
              <CardDescription>Número exibido em /suporte e na landing para clientes logados.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading || !settings ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="ps-enabled">Suporte ativo</Label>
                    <Switch
                      id="ps-enabled"
                      checked={settings.support_enabled}
                      onCheckedChange={(v) => setSettings({ ...settings, support_enabled: v })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ps-wa">WhatsApp (BR)</Label>
                    <Input
                      id="ps-wa"
                      placeholder="+55 11 99999-9999"
                      value={settings.whatsapp_number ?? ''}
                      onChange={(e) => setSettings({ ...settings, whatsapp_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ps-template">Mensagem padrão</Label>
                    <Textarea
                      id="ps-template"
                      rows={3}
                      value={settings.whatsapp_message_template}
                      onChange={(e) => setSettings({ ...settings, whatsapp_message_template: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Use {'{{tenant_name}}'} para o nome da empresa.</p>
                  </div>
                  <Button type="button" onClick={saveSettings} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Buscar assunto ou empresa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(platformSupportStatusLabels).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => void loadTickets()}>
              Filtrar
            </Button>
          </div>

          {ticketsLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum chamado.</p>
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => (
                <Link
                  key={t.id}
                  to={`/superadmin/platform-support/tickets/${t.id}`}
                  className="flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/40 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.tenant_name ?? t.tenant_id} · {platformSupportCategoryLabels[t.category]} ·{' '}
                      {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={platformSupportStatusColors[t.status]}>{platformSupportStatusLabels[t.status]}</Badge>
                    <Badge variant="outline" className={platformSupportPriorityColors[t.priority]}>
                      {platformSupportPriorityLabels[t.priority]}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
