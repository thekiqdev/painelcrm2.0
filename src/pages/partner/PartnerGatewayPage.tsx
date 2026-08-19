import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerEmptyState, PartnerSectionHeader } from './PartnerSectionHeader';

export default function PartnerGatewayPage() {
  const {
    gateway,
    apiKey,
    setApiKey,
    asaasEnv,
    setAsaasEnv,
    saving,
    saveGateway,
    testGateway,
  } = usePartnerPanel();
  const [open, setOpen] = useState(false);

  const connected = Boolean(gateway?.config?.hasCredentials);
  const ready = Boolean(gateway?.can_charge);
  const envLabel =
    gateway?.config?.environment === 'production'
      ? 'Produção'
      : gateway?.config?.environment === 'sandbox'
        ? 'Sandbox'
        : asaasEnv === 'production'
          ? 'Produção'
          : 'Sandbox';

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title="Gateway de pagamento"
        description="Conecte o Asaas da sua conta para cobrar os clientes do canal."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setOpen(true)}>
              Configurar
            </Button>
            <Button
              variant="secondary"
              disabled={saving || !connected}
              onClick={() => void testGateway()}
            >
              Testar conexão
            </Button>
          </div>
        }
      />

      {!connected ? (
        <PartnerEmptyState
          title="Configure um gateway para começar a cobrar seus clientes"
          description="As credenciais ficam criptografadas. A chave nunca é exibida por completo após salvar."
          action={<Button onClick={() => setOpen(true)}>Configurar Asaas</Button>}
        />
      ) : (
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Asaas</CardTitle>
                  <CardDescription>Gateway do canal Partner</CardDescription>
                </div>
              </div>
              <Badge variant={ready ? 'default' : 'outline'}>
                {ready ? 'Conectado' : gateway?.can_charge_reason || 'Pendente'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Ambiente</span>
              <span className="font-medium">{envLabel}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">API Key</span>
              <span className="font-mono text-xs">
                {gateway?.config?.api_key_masked || '••••••••'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Último teste</span>
              <span>{gateway?.config?.last_connection_status || '—'}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Asaas</DialogTitle>
            <DialogDescription>
              Informe a API Key da sua conta. Deixe em branco para manter a chave já salva.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={connected ? '•••• (deixe vazio para manter)' : '$aact_…'}
              />
            </div>
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <Select
                value={asaasEnv}
                onValueChange={(v) => setAsaasEnv(v as 'sandbox' | 'production')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                  <SelectItem value="production">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                const ok = await saveGateway();
                if (ok) setOpen(false);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
