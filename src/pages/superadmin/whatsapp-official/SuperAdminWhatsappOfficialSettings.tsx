import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { whatsappOfficialAdminService } from '@/services/whatsappOfficialAdmin';
import { connectionsService } from '@/services/connections';
import { toast } from '@/hooks/use-toast';

export default function SuperAdminWhatsappOfficialSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [encOk, setEncOk] = useState(false);
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [displayPhone, setDisplayPhone] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);

  const apiOrigin =
    typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : '';
  const webhookGet = `${apiOrigin}/api/webhooks/whatsapp-official`;
  const webhookPost = webhookGet;

  const load = () => {
    whatsappOfficialAdminService
      .getAccount()
      .then((d) => {
        setEncOk(d.encryption_configured);
        if (d.account) {
          setBusinessAccountId(d.account.business_account_id);
          setPhoneNumberId(d.account.phone_number_id);
          setAppId(d.account.app_id || '');
          setStatus(d.account.status);
          setDisplayPhone(d.account.display_phone_number);
        }
      })
      .catch((e) => toast({ title: 'Erro', description: String(e.message), variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      const r = await whatsappOfficialAdminService.saveAccount({
        business_account_id: businessAccountId.trim(),
        phone_number_id: phoneNumberId.trim(),
        access_token: accessToken.trim(),
        webhook_verify_token: verifyToken.trim(),
        app_id: appId.trim() || null,
        app_secret: appSecret.trim() || null,
      });
      if (r.webhook_verify_token_generated) {
        toast({
          title: 'Verify token gerado pelo servidor',
          description: `Copie este valor para o campo Verify token no Meta Developer Hub (Webhook): ${r.webhook_verify_token_generated}`,
          duration: 90_000,
        });
      }
      toast({
        title: 'Guardado',
        description:
          r.validation === 'connected'
            ? 'Credenciais guardadas e token validado na Meta.'
            : r.graph_error
              ? `Guardado; validação Meta: ${r.graph_error}`
              : 'Credenciais guardadas. Verifique o access token ou o Phone number ID na Meta.',
      });
      load();
    } catch (e) {
      toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!phoneNumberId.trim()) {
      toast({ title: 'Phone number ID', description: 'Indique o Phone number ID.', variant: 'destructive' });
      return;
    }
    try {
      setTesting(true);
      const r = await whatsappOfficialAdminService.validate({
        access_token: accessToken.trim(),
        phone_number_id: phoneNumberId.trim(),
      });
      if (r.ok) {
        toast({
          title: 'Conexão com a Meta OK',
          description: [r.display_phone_number, r.verified_name].filter(Boolean).join(' · ') || 'Token válido.',
        });
      } else {
        toast({
          title: 'Falha no teste',
          description: r.error || 'Resposta inválida',
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({ title: 'Falha no teste', description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Desligar o número oficial na API? Poderá voltar a ligar ao guardar novas credenciais.')) {
      return;
    }
    try {
      setDisconnecting(true);
      await connectionsService.disconnectWhatsappOfficial();
      toast({ title: 'Conexão desligada' });
      await load();
    } catch (e) {
      toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conexão (Meta Cloud API)</CardTitle>
        <CardDescription>
          O access token permanece neste formulário após guardar (sessão do browser). Na base de dados fica apenas
          cifrado. Configure o mesmo «Verify token» e URL de webhook no Meta Developer Hub.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        {!encOk ? (
          <p className="text-sm text-muted-foreground">
            A chave de cifra é gerida automaticamente pelo servidor (persistida em{' '}
            <code className="text-xs">superadmin_settings</code>). Se esta mensagem persistir, confirme migrações da base
            de dados ou defina temporariamente <code className="text-xs">WHATSAPP_OFFICIAL_ENCRYPTION_KEY</code> no
            ambiente.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Cifra ativa: segredos dos tokens são derivados de material guardado na base de dados (sem necessidade de env
            para funcionamento normal).
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/chat?channel=official">Abrir chat unificado</Link>
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={disconnecting} onClick={() => void disconnect()}>
            {disconnecting ? 'A desligar…' : 'Desligar número'}
          </Button>
        </div>
        <div className="rounded-md border bg-muted/40 p-3 text-xs font-mono space-y-1 break-all">
          <div>
            <span className="text-muted-foreground">Webhook GET/POST (callback URL):</span> {webhookPost}
          </div>
        </div>
        {status ? (
          <p className="text-sm">
            Estado: <strong>{status}</strong>
            {displayPhone ? ` · ${displayPhone}` : null}
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="waba">WhatsApp Business Account ID (WABA)</Label>
          <Input id="waba" value={businessAccountId} onChange={(e) => setBusinessAccountId(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pnid">Phone number ID</Label>
          <Input id="pnid" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tok">Access token (permanente do sistema)</Label>
          <div className="flex gap-2">
            <Input
              id="tok"
              type={showAccessToken ? 'text' : 'password'}
              autoComplete="off"
              placeholder="Deixe em branco para manter o guardado; cole para substituir"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              title={showAccessToken ? 'Ocultar token' : 'Mostrar token'}
              onClick={() => setShowAccessToken((v) => !v)}
            >
              {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="vt">Verify token (webhook)</Label>
          <Input
            id="vt"
            value={verifyToken}
            onChange={(e) => setVerifyToken(e.target.value)}
            placeholder="Opcional: deixe vazio para manter ou para o servidor gerar um novo (mostrado após guardar)"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="app">App ID (opcional)</Label>
          <Input id="app" value={appId} onChange={(e) => setAppId(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="aps">App Secret (assinatura webhook X-Hub-Signature-256)</Label>
          <Input
            id="aps"
            type="password"
            autoComplete="off"
            placeholder="Novo secret substitui o anterior"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={testing || saving} onClick={() => void testConnection()}>
            {testing ? 'A testar…' : 'Testar conexão'}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar e validar (reconectar)'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
