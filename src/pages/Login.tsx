
import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getPostAuthHomePath } from "@/utils/superAdminRedirect";

const Login = () => {
  const navigate = useNavigate();
  const { user, signIn } = useAuth();
  const [loginType, setLoginType] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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

  useEffect(() => {
    if (user) {
      navigate(getPostAuthHomePath(user), { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!identifier || !password) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }
    
    setIsLoading(true);
    
    try {
      const dest = await signIn(identifier, password);
      if (dest && dest !== "/login") {
        navigate(dest, { replace: true });
      }
    } catch (error: any) {
      console.error("Erro ao fazer login:", error);
      toast.error(error.message || "Ocorreu um erro desconhecido");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
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
            {isLoading ? "Processando..." : "Entrar"}
          </Button>
        </form>
        
        <div className="mt-6 text-center">
          <span className="text-sm text-muted-foreground">
            Ainda não tem uma conta?{" "}
            <Link to="/checkout" className="text-crm-primary font-medium hover:underline">
              Cadastrar
            </Link>
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default Login;
