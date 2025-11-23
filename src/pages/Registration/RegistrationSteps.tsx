
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const REGISTRATION_STEPS = ['personal_info', 'company_info'];

const RegistrationSteps = () => {
  const { user, profile, updateProfile, updateRegistrationStep, registrationComplete } = useAuth();
  const [currentStep, setCurrentStep] = useState('personal_info');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  
  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    // Verificar se o cadastro já está completo
    if (user && profile && profile.registration_complete) {
      console.log('Registration already complete, redirecting to dashboard');
      toast.success('Seu cadastro já está completo!');
      navigate('/dashboard');
      return;
    }
  }, [user, profile, navigate]);
  
  useEffect(() => {
    // Se o usuário não estiver autenticado, redireciona para a página inicial
    if (!user) {
      return;
    }
    
    // Load saved profile data
    if (profile) {
      console.log('Loading profile data:', profile);
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setCompanyName(profile.company_name || '');
    }
  }, [profile, user]);

  // Switch to next step
  const goToNextStep = () => {
    const currentIndex = REGISTRATION_STEPS.indexOf(currentStep);
    if (currentIndex < REGISTRATION_STEPS.length - 1) {
      setCurrentStep(REGISTRATION_STEPS[currentIndex + 1]);
    } else {
      // Finish registration
      navigate('/dashboard');
    }
  };

  // Handle personal info step submission
  const handlePersonalInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      if (!firstName || !lastName) {
        toast.error('Por favor, preencha seu nome e sobrenome');
        setIsLoading(false);
        return;
      }
      
      if (!user) {
        toast.error('Usuário não autenticado');
        navigate('/');
        return;
      }
      
      console.log('Updating personal info:', { first_name: firstName, last_name: lastName });
      await updateProfile({ 
        first_name: firstName,
        last_name: lastName
      });
      await updateRegistrationStep('personal_info', true);
      goToNextStep();
    } catch (error) {
      console.error('Error saving personal info:', error);
      toast.error('Erro ao salvar informações pessoais');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle company info step submission
  const handleCompanyInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      if (!companyName) {
        toast.error('Por favor, informe o nome da empresa');
        setIsLoading(false);
        return;
      }
      
      if (!user) {
        toast.error('Usuário não autenticado');
        navigate('/');
        return;
      }
      
      console.log('Updating company info:', { company_name: companyName, registration_complete: true });
      await updateProfile({ 
        company_name: companyName,
        registration_complete: true
      });
      await updateRegistrationStep('company_info', true);
      toast.success('Cadastro concluído com sucesso!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving company info:', error);
      toast.error('Erro ao salvar informações da empresa');
    } finally {
      setIsLoading(false);
    }
  };

  // Se o usuário não estiver autenticado, mostra mensagem para fazer login
  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card>
          <CardHeader>
            <CardTitle>Acesso não permitido</CardTitle>
            <CardDescription>
              Você precisa estar autenticado para acessar essa página.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/login')}>Ir para o login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Complete seu cadastro</CardTitle>
          <CardDescription>
            Preencha as informações para finalizar seu cadastro
          </CardDescription>
          <div className="text-sm text-muted-foreground">
            Usuário: {user.email}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={currentStep} onValueChange={setCurrentStep}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="personal_info">Dados Pessoais</TabsTrigger>
              <TabsTrigger value="company_info">Empresa</TabsTrigger>
            </TabsList>
            
            {/* Personal Information */}
            <TabsContent value="personal_info">
              <form onSubmit={handlePersonalInfoSubmit} className="space-y-4 pt-4">
                <div className="grid gap-4 grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Nome</Label>
                    <Input 
                      id="firstName" 
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Seu nome" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Sobrenome</Label>
                    <Input 
                      id="lastName" 
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Seu sobrenome" 
                      required 
                    />
                  </div>
                </div>
                
                <div className="pt-4 flex justify-end">
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Salvando...' : 'Próximo'}
                  </Button>
                </div>
              </form>
            </TabsContent>
            
            {/* Company Information */}
            <TabsContent value="company_info">
              <form onSubmit={handleCompanyInfoSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome da Empresa</Label>
                  <Input 
                    id="companyName" 
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Nome da sua empresa" 
                    required 
                  />
                </div>
                
                <div className="pt-4 flex justify-between">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setCurrentStep('personal_info')}
                  >
                    Voltar
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Salvando...' : 'Concluir Cadastro'}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegistrationSteps;
