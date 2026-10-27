import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('auth');
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
      toast.error(t('forgot_invalid_phone'));
      return;
    }
    setLoading(true);
    try {
      const res = await publicApiPost<{ ok: boolean; message?: string }>('/api/auth/password-reset/request', {
        whatsapp: whatsappNationalDigits,
      });
      if (res.error || !res.data?.ok) {
        toast.error(res.error || t('forgot_send_fail'));
        return;
      }
      toast.success(res.data.message || t('forgot_sent'));
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
      toast.error(t('forgot_code_invalid'));
      return;
    }
    setLoading(true);
    try {
      const res = await publicApiPost<{ ok: boolean; reset_token?: string }>('/api/auth/password-reset/verify-code', {
        whatsapp: whatsappNationalDigits,
        code: c,
      });
      if (res.error || !res.data?.ok || !res.data.reset_token) {
        toast.error(res.error || t('forgot_code_bad'));
        return;
      }
      setResetToken(res.data.reset_token);
      setStep(3);
      toast.success(t('forgot_code_ok'));
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error(t('forgot_short'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('forgot_mismatch'));
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
        toast.error(res.error || t('forgot_save_fail'));
        return;
      }
      toast.success(res.data.message || t('forgot_saved'));
      window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">{t('forgot_title')}</CardTitle>
        <CardDescription>
          {step === 1 && t('forgot_step1')}
          {step === 2 && t('forgot_step2')}
          {step === 3 && t('forgot_step3')}
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
                {t('forgot_hint')}
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('forgot_sending') : t('forgot_send')}
            </Button>
          </form>
        )}

        {step === 2 && (
          <form className="space-y-4" onSubmit={handleVerifyCode}>
            <div className="space-y-2">
              <Label htmlFor="code">{t('forgot_code')}</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(onlyDigits(e.target.value).slice(0, 6))}
              />
              <p className="text-xs text-muted-foreground">{t('forgot_code_hint')}</p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('forgot_validating') : t('forgot_continue')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading || resendCooldown > 0}
              onClick={() => void sendCodeRequest(true)}
            >
              {resendCooldown > 0 ? t('forgot_resend_wait', { seconds: resendCooldown }) : t('forgot_resend')}
            </Button>
            <Button type="button" variant="link" className="w-full" onClick={() => setStep(1)}>
              {t('forgot_change_number')}
            </Button>
          </form>
        )}

        {step === 3 && (
          <form className="space-y-4" onSubmit={handleComplete}>
            <div className="space-y-2">
              <Label htmlFor="np">{t('forgot_new_password')}</Label>
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
              <Label htmlFor="cp">{t('forgot_confirm')}</Label>
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
              {loading ? t('forgot_saving') : t('forgot_save')}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-crm-primary font-medium hover:underline">
            {t('forgot_back')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
};

export default ForgotPasswordWhatsapp;
