
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormEvent } from 'react';
import { toast } from 'sonner';

const AuthWhatsApp = () => {
  const [loginType, setLoginType] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  // Check if user is already authenticated
  useEffect(() => {
    if (user) {
      console.log('User already authenticated in AuthWhatsApp, redirecting');
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Detectar automaticamente se é email ou telefone
  const detectLoginType = (value: string): "email" | "phone" => {
    if (value.includes("@")) {
      return "email";
    }
    // Se contém apenas números e caracteres de telefone, é telefone
    if (/^[\d\s\-\+\(\)]+$/.test(value) && value.replace(/\D/g, "").length >= 10) {
      return "phone";
    }
    return loginType; // Manter o tipo atual se não conseguir detectar
  };

  const handleIdentifierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setIdentifier(value);
    
    // Detectar automaticamente o tipo se o usuário não escolheu manualmente
    if (value.length > 0) {
      const detectedType = detectLoginType(value);
      if (detectedType !== loginType) {
        setLoginType(detectedType);
      }
    }
  };

  // Format WhatsApp number as user types (only if it's phone type)
  const formatWhatsApp = (input: string) => {
    if (loginType === "email") return input;
    
    // Remove non-numeric characters
    const numeric = input.replace(/\D/g, '');
    
    // Format according to Brazilian phone number standards
    if (numeric.length <= 2) {
      return numeric;
    } else if (numeric.length <= 11) {
      return `(${numeric.substring(0, 2)}) ${numeric.substring(2)}`;
    } else {
      return `+55 (${numeric.substring(2, 4)}) ${numeric.substring(4)}`;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        // Login
        await signIn(identifier.trim(), password);
        navigate('/dashboard');
      } else {
        // Registration
        await signUp({
          identifier: identifier.trim(),
          password,
          whatsapp: loginType === 'phone' ? identifier.replace(/\D/g, '') : undefined,
        });
        navigate('/register/steps');
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      toast.error(error.message || 'Ocorreu um erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">{isLogin ? 'Login' : 'Cadastro'}</CardTitle>
        <CardDescription>
          {isLogin 
            ? 'Entre com seu e-mail ou telefone e senha para acessar sua conta' 
            : 'Cadastre-se usando seu e-mail ou número de WhatsApp'}
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
              Ou use {loginType === "email" ? "telefone" : "e-mail"} para {isLogin ? "fazer login" : "cadastrar"}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              {isLogin && (
                <Button variant="link" className="p-0 h-auto text-sm" type="button">
                  Esqueceu sua senha?
                </Button>
              )}
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
            {isLoading 
              ? 'Processando...' 
              : isLogin ? 'Entrar' : 'Cadastrar'}
          </Button>
        </form>
        
        <div className="mt-6 text-center">
          <span className="text-sm text-muted-foreground">
            {isLogin 
              ? 'Ainda não tem uma conta? ' 
              : 'Já tem uma conta? '}
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={() => {
                setIsLogin(!isLogin);
                setIdentifier("");
                setPassword("");
              }}
            >
              {isLogin ? 'Cadastre-se' : 'Faça login'}
            </Button>
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default AuthWhatsApp;
