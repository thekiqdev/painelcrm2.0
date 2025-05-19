
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export const SecuritySection: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Segurança</CardTitle>
        <CardDescription>Configure as opções de segurança da sua conta</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Alterar Senha</h3>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Senha Atual</Label>
              <Input id="currentPassword" type="password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <Input id="newPassword" type="password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <Input id="confirmPassword" type="password" />
            </div>
            <Button>Atualizar Senha</Button>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Autenticação em Dois Fatores</h3>
                <p className="text-sm text-muted-foreground">
                  Aumente a segurança da sua conta com autenticação em dois fatores
                </p>
              </div>
              <Switch id="2fa" />
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Sessões Ativas</h3>
            <div className="space-y-2">
              <div className="p-4 border rounded-md">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">Chrome - Windows 10</p>
                    <p className="text-xs text-muted-foreground">São Paulo, Brasil · Ativo agora</p>
                  </div>
                  <p className="text-xs text-green-600">Sessão Atual</p>
                </div>
              </div>
              
              <div className="p-4 border rounded-md">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">Safari - iPhone</p>
                    <p className="text-xs text-muted-foreground">São Paulo, Brasil · Último acesso: 2 dias atrás</p>
                  </div>
                  <Button variant="ghost" size="sm">Encerrar</Button>
                </div>
              </div>
            </div>
            <Button variant="outline">Encerrar Todas as Outras Sessões</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
