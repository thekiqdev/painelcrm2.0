
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";
import { SettingsSectionProps } from "./types";

export const DomainSection: React.FC<SettingsSectionProps> = ({ handleSave }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Domínio e URLs</CardTitle>
        <CardDescription>Configure seu domínio personalizado</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="domain">Domínio Personalizado</Label>
            <div className="flex gap-2">
              <Input id="domain" placeholder="example.com" />
              <Button>Verificar</Button>
            </div>
          </div>
          
          <div className="p-4 border rounded-md bg-yellow-50">
            <div className="flex items-center gap-2 font-medium text-amber-800">
              <div className="p-1 bg-amber-200 rounded-full">
                <Bell className="h-5 w-5 text-amber-800" />
              </div>
              Status do Domínio: Pendente
            </div>
            <p className="mt-2 text-sm text-amber-700">
              Aguardando propagação de DNS. Isso pode levar até 48 horas.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="url">URL do Painel</Label>
            <div className="flex items-center gap-2">
              <Input id="url" value="https://app.example.com/dashboard" readOnly />
              <Button variant="outline" size="icon">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave}>Salvar Alterações</Button>
      </CardFooter>
    </Card>
  );
};
