import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { Mail, Save, Send, Server } from 'lucide-react';

type SmtpSecureMode = 'none' | 'tls' | 'ssl';

type SmtpSettingsDto = {
  ok: true;
  smtp_enabled: boolean;
  smtp_host: string | null;
  smtp_port: number;
  smtp_username: string | null;
  smtp_secure_mode: SmtpSecureMode;
  smtp_from_name: string | null;
  smtp_from_email: string | null;
  smtp_reply_to_email: string | null;
  smtp_password_configured: boolean;
  smtp_password_encryption_configured: boolean;
};

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return EMAIL_RE.test(t);
}

export default function SuperAdminSmtpSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [secureMode, setSecureMode] = useState<SmtpSecureMode>('tls');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');

  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [encryptionConfigured, setEncryptionConfigured] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [testToEmail, setTestToEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const applyDto = useCallback((d: SmtpSettingsDto) => {
    setEnabled(d.smtp_enabled);
    setHost(d.smtp_host ?? '');
    setPort(d.smtp_port != null ? String(d.smtp_port) : '587');
    setUsername(d.smtp_username ?? '');
    setPasswordDraft('');
    setSecureMode(d.smtp_secure_mode);
    setFromName(d.smtp_from_name ?? '');
    setFromEmail(d.smtp_from_email ?? '');
    setReplyTo(d.smtp_reply_to_email ?? '');
    setPasswordConfigured(d.smtp_password_configured);
    setEncryptionConfigured(d.smtp_password_encryption_configured);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<SmtpSettingsDto>('/api/superadmin/smtp-settings');
    setLoading(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Não foi possível carregar a configuração SMTP.');
      return;
    }
    applyDto(res.data);
  }, [applyDto]);

  useEffect(() => {
    void load();
  }, [load]);

  const validate = (): boolean => {
    const err: Record<string, string> = {};
    if (enabled) {
      if (!host.trim()) err.host = 'Obrigatório quando SMTP está ativo.';
      const p = parseInt(port.trim(), 10);
      if (!port.trim() || Number.isNaN(p) || p < 1 || p > 65535) {
        err.port = 'Indique uma porta entre 1 e 65535.';
      }
      if (!isValidEmail(fromEmail)) {
        err.fromEmail = 'E-mail do remetente é obrigatório e deve ser válido quando SMTP está ativo.';
      }
    }
    if (replyTo.trim() && !isValidEmail(replyTo)) {
      err.replyTo = 'Formato de e-mail inválido.';
    }
    if (fromEmail.trim() && !isValidEmail(fromEmail)) {
      err.fromEmail = 'Formato de e-mail inválido.';
    }
    setFieldErrors(err);
    return Object.keys(err).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      toast.error('Corrija os campos indicados antes de guardar.');
      return;
    }

    const portNum = parseInt(port.trim(), 10);
    const body: Record<string, unknown> = {
      smtp_enabled: enabled,
      smtp_host: host.trim() || null,
      smtp_port: Number.isNaN(portNum) ? 587 : portNum,
      smtp_username: username.trim() || null,
      smtp_secure_mode: secureMode,
      smtp_from_name: fromName.trim() || null,
      smtp_from_email: fromEmail.trim() || null,
      smtp_reply_to_email: replyTo.trim() || null,
    };
    if (passwordDraft.trim().length > 0) {
      body.smtp_password = passwordDraft;
    }

    setSaving(true);
    const res = await apiClient.put<SmtpSettingsDto>('/api/superadmin/smtp-settings', body);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data) {
      applyDto(res.data);
    } else {
      void load();
    }
    toast.success('Configuração SMTP guardada.');
  };

  const sendTestEmail = async () => {
    const to = testToEmail.trim();
    if (!isValidEmail(to)) {
      toast.error('Indique um endereço de e-mail válido para o teste.');
      return;
    }
    setSendingTest(true);
    const res = await apiClient.post<{ ok?: boolean; message?: string }>('/api/superadmin/smtp-settings/test', { to });
    setSendingTest(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(res.data?.message ?? 'E-mail de teste enviado.');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-xs text-muted-foreground">
          Super Admin / <span className="text-foreground font-medium">Comunicação</span>
        </p>
        <h1 className="text-2xl font-bold text-foreground mt-1 flex items-center gap-2">
          <Mail className="h-7 w-7 text-crm-primary shrink-0" />
          SMTP
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure o servidor de envio de e-mail da plataforma. As credenciais são guardadas no servidor; a senha não é
          mostrada depois de gravada.
        </p>
      </div>

      <Alert className="border-border bg-card">
        <AlertTitle>Envio automático</AlertTitle>
        <AlertDescription>
          Esta configuração prepara o envio por e-mail, mas ainda não ativa notificações automáticas por SMTP.
        </AlertDescription>
      </Alert>

      {!encryptionConfigured ? (
        <Alert variant="destructive">
          <AlertTitle>Criptografia da senha</AlertTitle>
          <AlertDescription>
            Configure SMTP_SETTINGS_SECRET no servidor para permitir salvar senha SMTP.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Status</CardTitle>
          <CardDescription>Ligar ou desligar o uso da configuração SMTP na plataforma (sem alterar o motor de WhatsApp).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-base">SMTP ativo</Label>
                <p className="text-sm text-muted-foreground">
                  Quando ativo, os campos do servidor e remetente tornam-se obrigatórios para guardar com valores válidos.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Server className="h-5 w-5" />
            Servidor SMTP
          </CardTitle>
          <CardDescription>Parâmetros de ligação ao fornecedor de e-mail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="smtp-host">Host</Label>
                <Input
                  id="smtp-host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="smtp.exemplo.com"
                  autoComplete="off"
                />
                {fieldErrors.host ? <p className="text-sm text-destructive">{fieldErrors.host}</p> : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Porta</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="587"
                  />
                  {fieldErrors.port ? <p className="text-sm text-destructive">{fieldErrors.port}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label>Modo de segurança</Label>
                  <Select value={secureMode} onValueChange={(v) => setSecureMode(v as SmtpSecureMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      <SelectItem value="tls">TLS</SelectItem>
                      <SelectItem value="ssl">SSL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-user">Usuário</Label>
                <Input
                  id="smtp-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-pass">Senha</Label>
                <Input
                  id="smtp-pass"
                  type="password"
                  value={passwordDraft}
                  onChange={(e) => setPasswordDraft(e.target.value)}
                  autoComplete="new-password"
                />
                {passwordConfigured ? (
                  <p className="text-sm text-muted-foreground">Senha configurada</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Deixe em branco para não alterar. Preencha apenas para definir ou atualizar a senha.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Remetente</CardTitle>
          <CardDescription>Cabeçalhos apresentados aos destinatários quando o envio por SMTP estiver disponível.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="smtp-from-name">Nome do remetente</Label>
                <Input id="smtp-from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-from-email">E-mail do remetente</Label>
                <Input
                  id="smtp-from-email"
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                />
                {fieldErrors.fromEmail ? <p className="text-sm text-destructive">{fieldErrors.fromEmail}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-reply">E-mail de resposta (opcional)</Label>
                <Input
                  id="smtp-reply"
                  type="email"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                />
                {fieldErrors.replyTo ? <p className="text-sm text-destructive">{fieldErrors.replyTo}</p> : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Send className="h-5 w-5" />
            E-mail de teste
          </CardTitle>
          <CardDescription>
            Envia uma mensagem pontual usando a configuração SMTP <strong className="text-foreground">já guardada</strong>{' '}
            na base de dados (não usa valores apenas no formulário sem gravar). Não ativa notificações automáticas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2 flex-1 min-w-0">
            <Label htmlFor="smtp-test-to">Destinatário</Label>
            <Input
              id="smtp-test-to"
              type="email"
              value={testToEmail}
              onChange={(e) => setTestToEmail(e.target.value)}
              placeholder="email@exemplo.com"
              disabled={loading}
              autoComplete="off"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="gap-2 shrink-0"
            disabled={loading || sendingTest}
            onClick={() => void sendTestEmail()}
          >
            <Send className="h-4 w-4" />
            {sendingTest ? 'A enviar…' : 'Enviar e-mail de teste'}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void save()} disabled={saving || loading} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'A guardar…' : 'Salvar configurações'}
        </Button>
      </div>
    </div>
  );
}
