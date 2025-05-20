
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormEvent } from 'react';

const AuthWhatsApp = () => {
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

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
      alert('Por favor, insira um número de WhatsApp válido');
      setIsLoading(false);
      return;
    }

    try {
      if (isLogin) {
        await signIn(cleanWhatsApp, password);
        navigate('/register/steps');
      } else {
        await signUp(cleanWhatsApp, password);
        navigate('/register/steps');
      }
    } catch (error) {
      console.error('Auth error:', error);
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
