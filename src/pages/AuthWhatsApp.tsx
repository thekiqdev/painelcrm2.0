import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getPostAuthHomePath } from '@/utils/superAdminRedirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { publicApiPost } from '@/integrations/api/client';
import { Eye, EyeOff, Loader2, ArrowLeft, MessageCircle } from 'lucide-react';
import { useSignupEntry } from '@/hooks/useSignupEntry';

const legalLinksEnabled = import.meta.env.VITE_ENABLE_LEGAL_PAGES !== 'false';

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

function toNationalBrazilDigits(raw: string): string {
  let d = onlyDigits(raw);
  if (d.startsWith('55') && d.length > 2) d = d.slice(2);
  return d.slice(0, 11);
}

function formatBrazilMobileDisplay(nationalDigits: string): string {
  const d = nationalDigits.slice(0, 11);
  if (d.length === 0) return '';
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (d.length <= 2) return `(${ddd}`;
  if (rest.length <= 5) return `(${ddd}) ${rest}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

const MIN_WA_DIGITS = 10;

type MainTab = 'login' | 'register';
type AuthPanel = 'main' | 'recover';
type RecoverStep = 1 | 2 | 3;

type LocationFrom = { from?: { pathname: string; search?: string } };

/**
 * Rota /login — hub de autenticação (mobile-first). Cadastro reutiliza /api/auth/register.
 */
const AuthWhatsApp = () => {
  const [mainTab, setMainTab] = useState<MainTab>('login');
  const [panel, setPanel] = useState<AuthPanel>('main');
  const [recoverStep, setRecoverStep] = useState<RecoverStep>(1);

  const [loginWithPhone, setLoginWithPhone] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [waNational, setWaNational] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { signupPath, showSignupOnLogin, isExclusiveSignup } = useSignupEntry();
  const redirectParam = searchParams.get('redirect');
  const fromState = (location.state as LocationFrom | null)?.from;

  const safeRedirectPath = (raw: string | null | undefined): string | null => {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
  };

  useEffect(() => {
    if (!user) return;
    if (location.pathname === '/signup-success') return;
    if (location.pathname === '/login' && mainTab === 'register') return;
    const fromQuery = safeRedirectPath(redirectParam);
    if (fromQuery) {
      navigate(fromQuery, { replace: true });
      return;
    }
    if (fromState?.pathname && fromState.pathname !== '/login') {
      navigate(`${fromState.pathname}${fromState.search || ''}`, { replace: true });
      return;
    }
    navigate(getPostAuthHomePath(user), { replace: true });
  }, [user, navigate, redirectParam, fromState, location.pathname, mainTab]);

  useEffect(() => {
    if (!showSignupOnLogin && mainTab === 'register') {
      setMainTab('login');
    }
  }, [showSignupOnLogin, mainTab]);

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

  const resolvePostLoginTarget = (dest: string) => {
    const fromQuery = safeRedirectPath(redirectParam);
    if (fromQuery) return fromQuery;
    if (fromState?.pathname && fromState.pathname !== '/login') {
      return `${fromState.pathname}${fromState.search || ''}`;
    }
    if (dest && dest !== '/login') return dest;
    return null;
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const dest = await signIn(loginIdentifier.trim(), password);
      const target = resolvePostLoginTarget(dest);
      if (target) navigate(target, { replace: true });
    } catch (error: unknown) {
      console.error('Auth error:', error);
      toast.error(error instanceof Error ? error.message : 'Ocorreu um erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  };

  const goToSignup = () => {
    navigate(signupPath);
  };

  const sendRecoverCode = async (isResend: boolean) => {
    if (waNational.length < MIN_WA_DIGITS) {
      toast.error('Informe DDD + número (ex.: (11) 99999-9999).');
      return;
    }
    setRecoverLoading(true);
    try {
      const res = await publicApiPost<{ ok: boolean; message?: string }>('/api/auth/password-reset/request', {
        whatsapp: waNational,
      });
      if (res.error || !res.data?.ok) {
        toast.error(res.error || 'Não foi possível enviar o pedido.');
        return;
      }
      toast.success(res.data.message || 'Pedido registado.');
      setRecoverStep(2);
      if (isResend) startResendCooldown();
    } finally {
      setRecoverLoading(false);
    }
  };

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    const c = onlyDigits(code);
    if (c.length !== 6) {
      toast.error('Digite o código de 6 dígitos.');
      return;
    }
    setRecoverLoading(true);
    try {
      const res = await publicApiPost<{ ok: boolean; reset_token?: string }>('/api/auth/password-reset/verify-code', {
        whatsapp: waNational,
        code: c,
      });
      if (res.error || !res.data?.ok || !res.data.reset_token) {
        toast.error(res.error || 'Código inválido ou expirado.');
        return;
      }
      setResetToken(res.data.reset_token);
      setRecoverStep(3);
      toast.success('Código confirmado. Defina a nova senha.');
    } finally {
      setRecoverLoading(false);
    }
  };

  const handleCompleteRecover = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }
    setRecoverLoading(true);
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
      setPanel('main');
      setRecoverStep(1);
      setMainTab('login');
      setPassword('');
    } finally {
      setRecoverLoading(false);
    }
  };

  const openRecover = () => {
    setPanel('recover');
    setRecoverStep(1);
    setWaNational('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setResetToken('');
  };

  const recoverPrimaryLabel =
    recoverStep === 1 ? 'Enviar código' : recoverStep === 2 ? 'Continuar' : 'Redefinir senha';

  const mobilePrimaryLabel =
    panel === 'recover'
      ? recoverPrimaryLabel
      : mainTab === 'login'
        ? 'Entrar no painel'
        : 'Continuar cadastro';

  const mobilePrimaryDisabled =
    panel === 'recover'
      ? recoverLoading ||
        (recoverStep === 1 && waNational.length < MIN_WA_DIGITS) ||
        (recoverStep === 2 && onlyDigits(code).length !== 6) ||
        (recoverStep === 3 && (newPassword.length < 6 || newPassword !== confirmPassword))
      : isLoading;

  const mobileFormId =
    panel === 'recover'
      ? `recover-form-${recoverStep}`
      : mainTab === 'login' || !showSignupOnLogin
        ? 'login-form'
        : null;

  return (
    <div className="relative flex w-full flex-1 flex-col">
      <header className="shrink-0 text-center lg:text-left">
        <div className="mx-auto mb-2 flex justify-center lg:mx-0 lg:justify-start">
          <Logo size="md" variant="crm" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">PainelCRM</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isExclusiveSignup
            ? 'Acesso exclusivo para contas autorizadas.'
            : 'Acesse seu CRM de qualquer lugar.'}
        </p>
      </header>

      <div
        className={cn(
          'mt-8 flex-1 transition-all duration-300 ease-out',
          panel === 'recover' ? 'animate-in fade-in slide-in-from-right-2' : '',
        )}
      >
        {panel === 'recover' ? (
          <div className="space-y-6">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                setPanel('main');
                setRecoverStep(1);
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </button>
            <div>
              <h2 className="text-lg font-semibold">Recuperar senha</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {recoverStep === 1 && 'Enviaremos um código por WhatsApp ao número da sua conta.'}
                {recoverStep === 2 && 'Digite o código de 6 dígitos recebido no WhatsApp.'}
                {recoverStep === 3 && 'Escolha uma nova senha para a sua conta.'}
              </p>
            </div>

            {recoverStep === 1 && (
              <form
                id="recover-form-1"
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendRecoverCode(false);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="wa-rec">WhatsApp</Label>
                  <Input
                    id="wa-rec"
                    type="tel"
                    autoComplete="tel-national"
                    placeholder="(11) 99999-9999"
                    value={formatBrazilMobileDisplay(waNational)}
                    onChange={(e) => setWaNational(toNationalBrazilDigits(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">DDD + número, como no cadastro (sem +55).</p>
                </div>
                <Button type="submit" className="hidden w-full lg:flex" disabled={recoverLoading}>
                  {recoverLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar código'}
                </Button>
              </form>
            )}

            {recoverStep === 2 && (
              <form id="recover-form-2" className="space-y-4" onSubmit={handleVerifyCode}>
                <div className="space-y-2">
                  <Label htmlFor="code-rec">Código</Label>
                  <Input
                    id="code-rec"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(onlyDigits(e.target.value).slice(0, 6))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Button type="submit" className="hidden w-full lg:flex" disabled={recoverLoading}>
                    {recoverLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continuar'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="hidden w-full lg:flex"
                    disabled={recoverLoading || resendCooldown > 0}
                    onClick={() => void sendRecoverCode(true)}
                  >
                    {resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : 'Reenviar código'}
                  </Button>
                </div>
              </form>
            )}

            {recoverStep === 3 && (
              <form id="recover-form-3" className="space-y-4" onSubmit={handleCompleteRecover}>
                <div className="space-y-2">
                  <Label htmlFor="np">Nova senha</Label>
                  <Input
                    id="np"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="np2">Confirmar senha</Label>
                  <Input
                    id="np2"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="hidden w-full lg:flex" disabled={recoverLoading}>
                  {recoverLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Redefinir senha'}
                </Button>
              </form>
            )}
          </div>
        ) : showSignupOnLogin ? (
          <Tabs
            value={mainTab}
            onValueChange={(v) => setMainTab(v as MainTab)}
            className="w-full animate-in fade-in duration-300"
          >
            <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-muted/60 p-1">
              <TabsTrigger value="login" className="rounded-lg text-sm font-semibold">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="register" className="rounded-lg text-sm font-semibold">
                Cadastro
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6 space-y-5 outline-none">
              <form id="login-form" className="space-y-4" onSubmit={handleLogin}>
                <div className="space-y-2">
                  <Label htmlFor="id-login">{loginWithPhone ? 'Telefone' : 'E-mail'}</Label>
                  <Input
                    id="id-login"
                    type={loginWithPhone ? 'tel' : 'email'}
                    autoComplete={loginWithPhone ? 'tel' : 'email'}
                    placeholder={loginWithPhone ? '5511999999999' : 'voce@empresa.com'}
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => {
                      setLoginWithPhone(!loginWithPhone);
                      setLoginIdentifier('');
                    }}
                  >
                    {loginWithPhone ? 'Entrar com e-mail' : 'Entrar com telefone'}
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="pw-login">Senha</Label>
                  </div>
                  <div className="relative">
                    <Input
                      id="pw-login"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="hidden h-12 w-full text-base font-semibold lg:flex" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar no painel'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-6 space-y-5 outline-none">
              <div className="rounded-xl border border-border bg-muted/30 p-5 text-center">
                <p className="text-sm text-muted-foreground">
                  Cadastre sua empresa e escolha o plano ideal para sua operação.
                </p>
                <Button className="mt-4 hidden h-12 w-full text-base font-semibold lg:flex" asChild>
                  <Link to={signupPath}>Continuar cadastro</Link>
                </Button>
                <p className="mt-4 text-xs text-muted-foreground">
                  Já tem conta?{' '}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setMainTab('login')}
                  >
                    Entrar
                  </button>
                </p>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="mt-6 w-full animate-in fade-in duration-300">
            <form id="login-form" className="space-y-4" onSubmit={handleLogin}>
              <div className="space-y-2">
                <Label htmlFor="id-login-exclusive">{loginWithPhone ? 'Telefone' : 'E-mail'}</Label>
                <Input
                  id="id-login-exclusive"
                  type={loginWithPhone ? 'tel' : 'email'}
                  autoComplete={loginWithPhone ? 'tel' : 'email'}
                  placeholder={loginWithPhone ? '5511999999999' : 'voce@empresa.com'}
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => {
                    setLoginWithPhone(!loginWithPhone);
                    setLoginIdentifier('');
                  }}
                >
                  {loginWithPhone ? 'Entrar com e-mail' : 'Entrar com telefone'}
                </button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw-login-exclusive">Senha</Label>
                <div className="relative">
                  <Input
                    id="pw-login-exclusive"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="hidden h-12 w-full text-base font-semibold lg:flex" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar no painel'}
              </Button>
            </form>
          </div>
        )}
      </div>

      <footer className="mt-auto shrink-0 border-t border-border/50 pt-6 text-center lg:mt-10 lg:border-0 lg:pt-0">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {panel === 'main' && mainTab === 'login' ? (
            <button type="button" className="font-medium hover:text-foreground" onClick={openRecover}>
              Esqueceu sua senha?
            </button>
          ) : null}
          {legalLinksEnabled ? (
            <>
              <Link to="/legal/terms-of-service" className="hover:text-foreground">
                Termos
              </Link>
              <Link to="/legal/privacy-policy" className="hover:text-foreground">
                Privacidade
              </Link>
            </>
          ) : null}
          <a href="mailto:suporte@painelcrm.com.br" className="inline-flex items-center gap-1 hover:text-foreground">
            <MessageCircle className="h-3.5 w-3.5" />
            Suporte
          </a>
        </div>
      </footer>

      {/* Mobile fixed CTA */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 lg:hidden">
        <div className="pointer-events-auto border-t border-border/60 bg-background/85 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          {panel === 'recover' && recoverStep === 2 ? (
            <div className="mb-2 flex gap-2">
              <Button
                type="submit"
                form="recover-form-2"
                className="h-12 flex-1 text-base font-semibold shadow-lg shadow-primary/10"
                disabled={recoverLoading || onlyDigits(code).length !== 6}
              >
                {recoverLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Continuar'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 shrink-0"
                disabled={recoverLoading || resendCooldown > 0}
                onClick={() => void sendRecoverCode(true)}
              >
                {resendCooldown > 0 ? `${resendCooldown}s` : 'Reenviar'}
              </Button>
            </div>
          ) : panel === 'main' && mainTab === 'register' && showSignupOnLogin ? (
            <Button
              type="button"
              className="h-12 w-full text-base font-semibold shadow-lg shadow-primary/10"
              onClick={goToSignup}
            >
              {mobilePrimaryLabel}
            </Button>
          ) : (
            <Button
              type="submit"
              form={mobileFormId ?? undefined}
              className="h-12 w-full text-base font-semibold shadow-lg shadow-primary/10"
              disabled={mobilePrimaryDisabled}
            >
              {panel === 'recover' && recoverLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : panel === 'recover' ? (
                recoverPrimaryLabel
              ) : isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                mobilePrimaryLabel
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthWhatsApp;
