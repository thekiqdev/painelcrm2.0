
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getPostAuthHomePath } from '@/utils/superAdminRedirect';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormEvent } from 'react';
import { toast } from '@/components/ui/sonner';

/**
 * Rota /login — apenas autenticação. Nova empresa paga = /checkout (Fase 1).
 */
const AuthWhatsApp = () => {
  const [loginType, setLoginType] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user, signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate(getPostAuthHomePath(user), { replace: true });
    }
  }, [user, navigate]);

  const detectLoginType = (value: string): "email" | "phone" => {
    if (value.includes('@')) {
      return "email";
    }
    if (/^[\d\s\-\+\(\)]+$/.test(value) && value.replace(/\D/g, "").length >= 10) {
      return "phone";
    }
    return loginType;
  };

  const handleIdentifierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setIdentifier(value);

    if (value.length > 0) {
      const detectedType = detectLoginType(value);
      if (detectedType !== loginType) {
        setLoginType(detectedType);
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const dest = await signIn(identifier.trim(), password);
      if (dest && dest !== '/login') navigate(dest, { replace: true });
    } catch (error: unknown) {
      console.error('Auth error:', error);
      toast.error(error instanceof Error ? error.message : 'Ocorreu um erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Login</CardTitle>
        <CardDescription>
          Entre com seu e-mail ou telefone e senha para acessar sua conta
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="identifier">
              {loginType === "email" ? "E-mail" : "Telefone"}
            </Label>
            <div className="flex gap-2">
            <Input
                id="identifier"
                type={loginType === "email" ? "email" : "tel"}
                placeholder={loginType === "email" ? "seu@email.com" : "5511999999999"}
                value={identifier}
                onChange={handleIdentifierChange}
                className="flex-1"
              required
            />
              <Button
                type="button"
                variant="outline"
                size="default"
                className="whitespace-nowrap"
                onClick={() => {
                  setLoginType(loginType === "email" ? "phone" : "email");
                  setIdentifier("");
                }}
              >
                {loginType === "email" ? "📱 Telefone" : "✉️ E-mail"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ou use {loginType === "email" ? "telefone" : "e-mail"} para fazer login
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <Button variant="link" className="p-0 h-auto text-sm" type="button">
                Esqueceu sua senha?
              </Button>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Processando...' : 'Entrar'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <span className="text-sm text-muted-foreground">
            Ainda não tem uma conta?{' '}
            <Link to="/checkout" className="text-crm-primary font-medium hover:underline">
              Cadastrar
            </Link>
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default AuthWhatsApp;
