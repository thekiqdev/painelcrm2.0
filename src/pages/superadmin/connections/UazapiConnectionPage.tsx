import SuperAdminPlatformWhatsAppPanel from '@/pages/superadmin/SuperAdminPlatformWhatsAppPanel';

export default function UazapiConnectionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp (UazAPI)</h1>
        <p className="text-sm text-muted-foreground">
          Instâncias ligadas ao Super Admin para notificações da plataforma e operações de chat (mesmo modelo que nos
          tenants).
        </p>
      </div>
      <SuperAdminPlatformWhatsAppPanel />
    </div>
  );
}
