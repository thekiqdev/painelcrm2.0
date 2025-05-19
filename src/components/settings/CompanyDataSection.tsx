
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsSectionProps } from "./types";

export const CompanyDataSection: React.FC<SettingsSectionProps> = ({ handleSave }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da Empresa</CardTitle>
        <CardDescription>Configure as informações da sua empresa</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Nome da Empresa</Label>
            <Input id="companyName" placeholder="Nome da sua empresa" />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ/CPF</Label>
            <Input id="cnpj" placeholder="XX.XXX.XXX/XXXX-XX" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" placeholder="(XX) XXXX-XXXX" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input id="whatsapp" placeholder="(XX) XXXXX-XXXX" />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" placeholder="Endereço completo" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" placeholder="Cidade" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">Estado</Label>
              <Input id="state" placeholder="Estado" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">CEP</Label>
              <Input id="zipCode" placeholder="XXXXX-XXX" />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Logotipo da Empresa</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Button variant="outline">Enviar logo</Button>
              <p className="text-sm text-muted-foreground mt-2">
                Formatos suportados: PNG, JPG, GIF (max. 2MB)
              </p>
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave}>Salvar Alterações</Button>
      </CardFooter>
    </Card>
  );
};
