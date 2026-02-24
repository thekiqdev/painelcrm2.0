
import React from 'react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="flex min-h-screen bg-crm-light">
      <div className="hidden lg:block lg:w-1/2 bg-gradient-to-r from-crm-primary to-crm-accent">
        <div className="flex items-center justify-center h-full p-12">
          <div className="text-white">
            <h1 className="text-4xl font-bold mb-6">PainelCRM</h1>
            <p className="text-xl opacity-80 mb-8">Sistema completo de gestão para vendas e relacionamento com clientes.</p>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col items-center p-6 bg-white bg-opacity-10 rounded-lg">
                <div className="text-3xl font-bold mb-2">+ 50%</div>
                <div className="text-sm opacity-80">Aumento em conversões</div>
              </div>
              <div className="flex flex-col items-center p-6 bg-white bg-opacity-10 rounded-lg">
                <div className="text-3xl font-bold mb-2">- 30%</div>
                <div className="text-sm opacity-80">Redução no ciclo de vendas</div>
              </div>
              <div className="flex flex-col items-center p-6 bg-white bg-opacity-10 rounded-lg">
                <div className="text-3xl font-bold mb-2">+ 45%</div>
                <div className="text-sm opacity-80">Eficiência em processos</div>
              </div>
              <div className="flex flex-col items-center p-6 bg-white bg-opacity-10 rounded-lg">
                <div className="text-3xl font-bold mb-2">+ 200%</div>
                <div className="text-sm opacity-80">ROI no primeiro ano</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
