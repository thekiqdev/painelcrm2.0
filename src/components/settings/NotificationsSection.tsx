
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { SettingsSectionProps } from "./types";

export const NotificationsSection: React.FC<SettingsSectionProps> = ({ handleSave }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notificações</CardTitle>
        <CardDescription>Configure suas preferências de notificação</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Canais de Notificação</h3>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-notifications">E-mail</Label>
                <p className="text-sm text-muted-foreground">
                  Receba notificações no seu e-mail
                </p>
              </div>
              <Switch id="email-notifications" defaultChecked />
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="whatsapp-notifications">WhatsApp</Label>
                <p className="text-sm text-muted-foreground">
                  Receba notificações via WhatsApp
                </p>
              </div>
              <Switch id="whatsapp-notifications" />
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="app-notifications">Notificações no App</Label>
                <p className="text-sm text-muted-foreground">
                  Receba notificações dentro do aplicativo
                </p>
              </div>
              <Switch id="app-notifications" defaultChecked />
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Preferências de Notificação</h3>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="new-project">Novos Projetos</Label>
                <p className="text-sm text-muted-foreground">
                  Quando um novo projeto for criado
                </p>
              </div>
              <Switch id="new-project" defaultChecked />
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="project-updates">Atualizações de Projetos</Label>
                <p className="text-sm text-muted-foreground">
                  Quando um projeto for atualizado
                </p>
              </div>
              <Switch id="project-updates" defaultChecked />
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="invoice-notifications">Faturas e Pagamentos</Label>
                <p className="text-sm text-muted-foreground">
                  Notificações sobre faturas e pagamentos
                </p>
              </div>
              <Switch id="invoice-notifications" defaultChecked />
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="marketing-notifications">Marketing</Label>
                <p className="text-sm text-muted-foreground">
                  Receba novidades e ofertas especiais
                </p>
              </div>
              <Switch id="marketing-notifications" />
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave}>Salvar Preferências</Button>
      </CardFooter>
    </Card>
  );
};
