
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const AuthWhatsApp = () => {
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Check if user is already authenticated
  useEffect(() => {
    if (user) {
      console.log('User already authenticated in AuthWhatsApp, redirecting');
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Simple WhatsApp number validation (Brazil format)
  const isValidWhatsApp = (number: string) => {
    return /^(\+55|55)?(\d{2})?(\d{8,9})$/.test(number.replace(/\D/g, ''));
  };

  // Format WhatsApp number as user types
  const formatWhatsApp = (input: string) => {
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

  const handleWhatsAppChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWhatsapp(formatWhatsApp(e.target.value));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const cleanWhatsApp = whatsapp.replace(/\D/g, '');
    
    if (!isValidWhatsApp(cleanWhatsApp)) {
      toast.error('Por favor, insira um número de WhatsApp válido');
      setIsLoading(false);
      return;
    }

    try {
      if (isLogin) {
        // For login, use email format based on WhatsApp number
        const email = `${cleanWhatsApp}@multicrm.app`;
        console.log('Attempting login with email:', email);
        
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) {
          console.error('Login error:', error);
          toast.error(error.message || 'Falha no login. Verifique suas credenciais.');
          setIsLoading(false);
          return;
        }
        
        toast.success('Login realizado com sucesso!');
        // Authenticated users are redirected by AuthGuard
      } else {
        // For registration, create email based on WhatsApp number
        const email = `${cleanWhatsApp}@multicrm.app`;
        console.log('Attempting registration with email:', email);
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              whatsapp_number: cleanWhatsApp,
            }
          }
        });
        
        if (error) {
          console.error('Registration error:', error);
          
          if (error.message.includes('already registered')) {
            toast.error('Este WhatsApp já está cadastrado. Tente fazer login.');
            setIsLogin(true);
          } else {
            toast.error(error.message || 'Falha no cadastro.');
          }
          
          setIsLoading(false);
          return;
        }
        
        if (!data.user) {
          toast.error('Ocorreu um erro ao criar sua conta.');
          setIsLoading(false);
          return;
        }
        
        toast.success('Cadastro realizado com sucesso!');
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
            ? 'Entre com seu WhatsApp e senha para acessar sua conta' 
            : 'Cadastre-se usando seu número de WhatsApp'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input
              id="whatsapp"
              type="tel"
              placeholder="(11) 98765-4321"
              value={whatsapp}
              onChange={handleWhatsAppChange}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              {isLogin && (
                <Button variant="link" className="p-0 h-auto text-sm">
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
              onClick={() => setIsLogin(!isLogin)}
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
