import React, { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const Register = () => {
  const navigate = useNavigate();
  const { user, signUp } = useAuth();
  const [name, setName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [agreeTerms, setAgreeTerms] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Se o usuário já estiver autenticado, redireciona
  useEffect(() => {
    if (user) {
      navigate('/register/steps');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação básica
    if (!name || !lastName || !company || !whatsapp || !password) {
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
      console.log('Registering new user with WhatsApp:', whatsapp);
      
      // Registrar o usuário
      await signUp({
        identifier: whatsapp,
        password,
        firstName: name,
        lastName,
        companyName: company,
        whatsapp,
      });
      
      toast.success("Conta criada com sucesso!");
      
      // Redirecionar para o passo de registro completo
      navigate("/register/steps");
    } catch (error: any) {
      console.error("Erro ao registrar:", error);
      toast.error(error.message || "Ocorreu um erro ao criar sua conta");
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
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input 
              id="whatsapp" 
              type="text" 
              placeholder="5511999999999" 
              required 
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
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
