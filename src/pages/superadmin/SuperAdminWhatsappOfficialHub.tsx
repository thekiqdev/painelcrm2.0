import { Link, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import SuperAdminWhatsappOfficialSettings from './whatsapp-official/SuperAdminWhatsappOfficialSettings';
import WhatsappOfficialTemplatesPage from './whatsapp-official/WhatsappOfficialTemplatesPage';
import WhatsappOfficialCampaignsPage from './whatsapp-official/WhatsappOfficialCampaignsPage';

const TAB_IDS = ['conn', 'tpl', 'camp', 'chat'] as const;
type TabId = (typeof TAB_IDS)[number];

function tabFromSearch(tabParam: string | null): TabId {
  if (tabParam && (TAB_IDS as readonly string[]).includes(tabParam)) return tabParam as TabId;
  return 'conn';
}

export default function SuperAdminWhatsappOfficialHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromSearch(searchParams.get('tab'));

  const setTab = (value: string) => {
    const next = tabFromSearch(value);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'conn') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp oficial (Meta)</h1>
        <p className="text-sm text-muted-foreground">
          Cloud API em paralelo à UazAPI. Visibilidade para tenants controlada na Central de conexões (flag global).
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="conn">Conexão</TabsTrigger>
          <TabsTrigger value="tpl">Templates</TabsTrigger>
          <TabsTrigger value="camp">Campanhas</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>
        <TabsContent value="conn" className="mt-4">
          <SuperAdminWhatsappOfficialSettings />
        </TabsContent>
        <TabsContent value="tpl" className="mt-4">
          <WhatsappOfficialTemplatesPage />
        </TabsContent>
        <TabsContent value="camp" className="mt-4">
          <WhatsappOfficialCampaignsPage />
        </TabsContent>
        <TabsContent value="chat" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Chat no mesmo inbox</CardTitle>
              <CardDescription>
                Utilize o Chat principal com o filtro «WhatsApp Oficial (Meta)» — mesmas bolhas, composer e tempo real.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/superadmin/chat?channel=official">Abrir chat</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
