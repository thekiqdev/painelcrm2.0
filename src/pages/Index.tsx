
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white p-4 border-b sticky top-0 z-10">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-crm-primary flex items-center justify-center text-white font-bold rounded mr-2">M</div>
            <span className="font-bold text-xl">MultiCRM</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/login")}>
              Login
            </Button>
            <Button onClick={() => navigate("/register")}>
              Começar Agora
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-crm-primary to-crm-accent py-20 lg:py-32 text-white">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            Plataforma Completa para Gestão de Relacionamento
          </h1>
          <p className="text-xl md:text-2xl mb-12 max-w-3xl mx-auto opacity-90">
            Aumente suas vendas, melhore o relacionamento com clientes e impulsione seu negócio com nossa solução completa de CRM
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white hover:bg-gray-100 text-crm-primary" onClick={() => navigate("/register")}>
              Comece Gratuitamente
            </Button>
            <Button size="lg" variant="outline" className="text-white border-white hover:bg-white/10" onClick={() => navigate("/login")}>
              Ver Demonstração
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-16">Tudo o que você precisa para impulsionar seus negócios</h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: "Múltiplos Funis de Vendas",
                description: "Crie e personalize diferentes funis para cada tipo de produto ou serviço que sua empresa oferece."
              },
              {
                title: "Gestão Completa de Clientes",
                description: "Cadastre, segmente e acompanhe todo o histórico de interação com seus clientes e leads."
              },
              {
                title: "Propostas e Contratos",
                description: "Gere propostas profissionais e controle seus contratos com facilidade e precisão."
              },
              {
                title: "Tarefas e Lembretes",
                description: "Nunca perca um prazo importante com nosso sistema de gestão de tarefas e notificações."
              },
              {
                title: "Gestão Financeira",
                description: "Controle faturas, pagamentos e tenha uma visão clara da saúde financeira do seu negócio."
              },
              {
                title: "Relatórios e Insights",
                description: "Tome decisões baseadas em dados com relatórios detalhados sobre seu desempenho."
              },
            ].map((feature, index) => (
              <div key={index} className="bg-crm-gray-light rounded-xl p-6 shadow-sm hover:shadow-md transition-all">
                <h3 className="text-xl font-semibold mb-3 text-crm-primary">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-crm-gray-light">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Planos que se adaptam ao seu crescimento</h2>
          <p className="text-xl text-center text-gray-600 mb-16 max-w-2xl mx-auto">
            Escolha o plano ideal para o tamanho e as necessidades da sua empresa
          </p>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                name: "Starter",
                price: "R$99",
                period: "/mês",
                features: ["1 usuário", "500 contatos", "1 funil de vendas", "Propostas básicas", "Suporte por e-mail"],
                cta: "Começar Agora",
                popular: false
              },
              {
                name: "Professional",
                price: "R$199",
                period: "/mês",
                features: ["5 usuários", "5.000 contatos", "Funis ilimitados", "Propostas e contratos", "Gestão financeira básica", "Suporte prioritário"],
                cta: "Escolher Plano",
                popular: true
              },
              {
                name: "Enterprise",
                price: "R$399",
                period: "/mês",
                features: ["Usuários ilimitados", "Contatos ilimitados", "Todas as funcionalidades", "Integrações avançadas", "API completa", "Gestor de conta dedicado"],
                cta: "Falar com Vendas",
                popular: false
              }
            ].map((plan, index) => (
              <div key={index} className={`rounded-xl overflow-hidden shadow-lg ${plan.popular ? 'ring-2 ring-crm-primary' : ''}`}>
                <div className={`p-6 ${plan.popular ? 'bg-gradient-to-br from-crm-primary to-crm-accent text-white' : 'bg-white'}`}>
                  {plan.popular && (
                    <div className="text-sm font-medium mb-2">Mais Popular</div>
                  )}
                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <div className="flex items-end mb-4">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className={`${plan.popular ? 'text-white/80' : 'text-gray-500'}`}>{plan.period}</span>
                  </div>
                  <Button 
                    className={`w-full ${plan.popular ? 'bg-white text-crm-primary hover:bg-gray-100' : ''}`}
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => navigate("/register")}
                  >
                    {plan.cta}
                  </Button>
                </div>
                <div className="bg-white p-6">
                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start">
                        <CheckCircle className="h-5 w-5 text-crm-success mr-2 flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-crm-dark text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6">
            Pronto para transformar seu processo de vendas?
          </h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto opacity-80">
            Junte-se a milhares de empresas que já estão crescendo com o MultiCRM
          </p>
          <Button 
            size="lg" 
            className="bg-crm-accent hover:bg-crm-accent/90"
            onClick={() => navigate("/register")}
          >
            Começar Gratuitamente
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-crm-dark text-white py-12 mt-auto">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-bold text-xl mb-4">MultiCRM</h4>
              <p className="text-gray-400">
                A plataforma completa para gestão de relacionamento com clientes.
              </p>
            </div>
            <div>
              <h5 className="font-semibold mb-4">Produto</h5>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white">Recursos</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Preços</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Integrações</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Roadmap</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-semibold mb-4">Empresa</h5>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white">Sobre</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Blog</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Carreiras</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Contato</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-semibold mb-4">Legal</h5>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white">Termos</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Privacidade</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Cookies</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
            <p>&copy; 2025 MultiCRM. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
