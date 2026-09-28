import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { publicApiPost } from '@/integrations/api/client';

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

/** Só parte nacional (DDD + número), até 11 dígitos; se colar com 55, remove o DDI. */
function toNationalBrazilDigits(raw: string): string {
  let d = onlyDigits(raw);
  if (d.startsWith('55') && d.length > 2) {
    d = d.slice(2);
  }
  return d.slice(0, 11);
}

/** Máscara (DD) NNNNN-NNNN — sem exigir +55. */
function formatBrazilMobileDisplay(nationalDigits: string): string {
  const d = nationalDigits.slice(0, 11);
  if (d.length === 0) return '';
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (d.length <= 2) return `(${ddd}`;
  if (rest.length <= 5) return `(${ddd}) ${rest}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

const MIN_NATIONAL_DIGITS = 10;

type Step = 1 | 2 | 3;

const ForgotPasswordWhatsapp: React.FC = () => {
  const [step, setStep] = useState<Step>(1);
  const [whatsappNationalDigits, setWhatsappNationalDigits] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const startResendCooldown = useCallback(() => {
    setResendCooldown(60);
    const t = window.setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          window.clearInterval(t);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  const sendCodeRequest = async (isResend: boolean) => {
    if (whatsappNationalDigits.length < MIN_NATIONAL_DIGITS) {
      toast.error('Informe DDD + número (ex.: (11) 99999-9999).');
      return;
    }
    setLoading(true);
    try {
      const res = await publicApiPost<{ ok: boolean; message?: string }>('/api/auth/password-reset/request', {
        whatsapp: whatsappNationalDigits,
      });
      if (res.error || !res.data?.ok) {
        toast.error(res.error || 'Não foi possível enviar o pedido.');
        return;
      }
      toast.success(res.data.message || 'Pedido registado.');
      setStep(2);
      if (isResend) startResendCooldown();
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = onlyDigits(code);
    if (c.length !== 6) {
      toast.error('Digite o código de 6 dígitos.');
      return;
    }
    setLoading(true);
    try {
      const res = await publicApiPost<{ ok: boolean; reset_token?: string }>('/api/auth/password-reset/verify-code', {
        whatsapp: whatsappNationalDigits,
        code: c,
      });
      if (res.error || !res.data?.ok || !res.data.reset_token) {
        toast.error(res.error || 'Código inválido ou expirado.');
        return;
      }
      setResetToken(res.data.reset_token);
      setStep(3);
      toast.success('Código confirmado. Defina a nova senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      const res = await publicApiPost<{ ok: boolean; message?: string }>('/api/auth/password-reset/complete', {
        reset_token: resetToken,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      if (res.error || !res.data?.ok) {
        toast.error(res.error || 'Não foi possível atualizar a senha.');
        return;
      }
      toast.success(res.data.message || 'Senha atualizada.');
      window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Recuperar senha</CardTitle>
        <CardDescription>
          {step === 1 && 'Enviaremos um código numérico por WhatsApp ao número da sua conta.'}
          {step === 2 && 'Digite o código de 6 dígitos recebido no WhatsApp.'}
          {step === 3 && 'Escolha uma nova senha para a sua conta.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 1 && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void sendCodeRequest(false);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="wa">WhatsApp</Label>
              <Input
                id="wa"
                type="tel"
                autoComplete="tel-national"
                placeholder="(11) 99999-9999"
                value={formatBrazilMobileDisplay(whatsappNationalDigits)}
                onChange={(e) => setWhatsappNationalDigits(toNationalBrazilDigits(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Informe apenas DDD + número, como no cadastro. Não é necessário colocar o código do país (55).
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'A enviar…' : 'Enviar código'}
            </Button>
          </form>
        )}

        {step === 2 && (
          <form className="space-y-4" onSubmit={handleVerifyCode}>
            <div className="space-y-2">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(onlyDigits(e.target.value).slice(0, 6))}
              />
              <p className="text-xs text-muted-foreground">O código expira em 60 minutos.</p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'A validar…' : 'Continuar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading || resendCooldown > 0}
              onClick={() => void sendCodeRequest(true)}
            >
              {resendCooldown > 0 ? `Reenviar código (${resendCooldown}s)` : 'Reenviar código'}
            </Button>
            <Button type="button" variant="link" className="w-full" onClick={() => setStep(1)}>
              Alterar número
            </Button>
          </form>
        )}

        {step === 3 && (
          <form className="space-y-4" onSubmit={handleComplete}>
            <div className="space-y-2">
              <Label htmlFor="np">Nova senha</Label>
              <Input
                id="np"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp">Confirmar senha</Label>
              <Input
                id="cp"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'A guardar…' : 'Definir nova senha'}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-crm-primary font-medium hover:underline">
            Voltar ao login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
};

export default ForgotPasswordWhatsapp;
