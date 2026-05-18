import { LifeBuoy } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { TicketCategoriesManager } from '@/components/tickets/TicketCategoriesManager';
import { PublicSupportPortalSettingsSection } from '@/components/settings/PublicSupportPortalSettingsSection';

export function SupportSettingsSection() {
  const { canEdit } = useModulePermissions();
  const canManage = canEdit('tickets') || canEdit('settings');

  return (
    <div className="space-y-6">
      <Card className="border-primary/15 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            Suporte
          </CardTitle>
          <CardDescription>
            Configure categorias de chamados e o portal público usado pelos clientes para abrir tickets.
          </CardDescription>
        </CardHeader>
      </Card>

      <TicketCategoriesManager canManage={canManage} ensureSupportCategory />
      <PublicSupportPortalSettingsSection />
    </div>
  );
}
