
import React, { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const Register = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [agreeTerms, setAgreeTerms] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Se o usuário já estiver autenticado, redireciona
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getSession();
      
      if (data.session) {
        console.log('User already authenticated, redirecting from Register page');
        navigate('/register/steps');
      }
    };
    
    checkUser();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação básica
    if (!name || !lastName || !company || !email || !password) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    
    if (!agreeTerms) {
      toast.error("Você precisa concordar com os termos de serviço");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      console.log('Registering new user with email:', email);
      
      // Registrar o usuário no Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            lastName,
            company
          }
        }
      });
      
      if (error) {
        console.error("Erro ao registrar:", error);
        
        // Verificar se o erro é de usuário já existente
        if (error.message.includes("already registered") || error.message.includes("already exists")) {
          toast.error("Este e-mail já está cadastrado. Por favor, tente fazer login.");
          setTimeout(() => navigate("/login"), 2000);
          return;
        }
        
        toast.error(error.message || "Ocorreu um erro ao criar sua conta");
        return;
      }
      
      // Verificar se o usuário foi criado corretamente
      if (!data.user || !data.user.id) {
        toast.error("Ocorreu um erro ao criar sua conta");
        return;
      }
      
      // Criar perfil para o usuário
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          whatsapp_number: 'temporário', // Valor temporário
          registration_complete: false,
          first_name: name,
          last_name: lastName,
          company_name: company
        });
        
      if (profileError) {
        console.error("Erro ao criar perfil:", profileError);
        toast.error("Conta criada, mas houve um erro ao configurar seu perfil");
      } else {
        toast.success("Conta criada com sucesso!");
      }
      
      // Redirecionar para o passo de registro completo
      navigate("/register/steps");
    } catch (error: any) {
      console.error("Erro ao registrar:", error);
      toast.error("Ocorreu um erro ao criar sua conta");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Criar uma conta</CardTitle>
        <CardDescription>
          Preencha os dados abaixo para criar sua conta MultiCRM
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company">Nome da Empresa</Label>
            <Input 
              id="company" 
              placeholder="Sua Empresa" 
              required 
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input 
                id="name" 
                placeholder="Seu nome" 
                required 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Sobrenome</Label>
              <Input 
                id="lastName" 
                placeholder="Seu sobrenome" 
                required 
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="seu@email.com" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <Input 
                id="confirmPassword" 
                type="password" 
                placeholder="••••••••" 
                required 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="terms" 
              required 
              checked={agreeTerms}
              onCheckedChange={(checked) => setAgreeTerms(checked === true)}
            />
            <Label htmlFor="terms" className="text-sm font-normal">
              Eu concordo com os{" "}
              <a href="#" className="text-crm-primary underline">
                termos de serviço
              </a>{" "}
              e{" "}
              <a href="#" className="text-crm-primary underline">
                política de privacidade
              </a>
            </Label>
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Criando Conta..." : "Criar Conta"}
          </Button>
        </form>
        
        <div className="mt-6 text-center">
          <span className="text-sm text-muted-foreground">
            Já tem uma conta?{" "}
            <Link to="/login" className="text-crm-primary font-medium hover:underline">
              Faça login
            </Link>
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default Register;
