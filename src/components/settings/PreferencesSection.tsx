
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSectionProps } from "./types";

export const PreferencesSection: React.FC<SettingsSectionProps> = ({ handleSave }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências Gerais</CardTitle>
        <CardDescription>Personalize sua experiência no sistema</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="language">Idioma do Sistema</Label>
            <Select defaultValue="pt-BR">
              <SelectTrigger>
                <SelectValue placeholder="Selecione um idioma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                <SelectItem value="en-US">English (US)</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="timezone">Fuso Horário</Label>
            <Select defaultValue="America/Sao_Paulo">
              <SelectTrigger>
                <SelectValue placeholder="Selecione um fuso horário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">Brasília (UTC-3)</SelectItem>
                <SelectItem value="America/Manaus">Manaus (UTC-4)</SelectItem>
                <SelectItem value="America/Belem">Belém (UTC-3)</SelectItem>
                <SelectItem value="America/Noronha">Fernando de Noronha (UTC-2)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="dateFormat">Formato de Data</Label>
            <Select defaultValue="DD/MM/YYYY">
              <SelectTrigger>
                <SelectValue placeholder="Selecione um formato de data" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave}>Salvar Preferências</Button>
      </CardFooter>
    </Card>
  );
};
