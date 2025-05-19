
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FileEdit, Trash2, UserPlus } from "lucide-react";
import { SettingsSectionProps } from "./types";

export const UsersSection: React.FC<SettingsSectionProps> = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuários & Permissões</CardTitle>
        <CardDescription>Gerencie os usuários do sistema e suas permissões</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Usuários</h3>
            <Button size="sm">
              <UserPlus className="mr-2 h-4 w-4" />
              Novo Usuário
            </Button>
          </div>
          
          <div className="border rounded-md">
            <div className="grid grid-cols-12 gap-4 p-4 border-b font-medium text-sm">
              <div className="col-span-3">Nome</div>
              <div className="col-span-4">Email</div>
              <div className="col-span-3">Tipo de Acesso</div>
              <div className="col-span-2">Ações</div>
            </div>
            
            <div className="grid grid-cols-12 gap-4 p-4 border-b text-sm">
              <div className="col-span-3 flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>AD</AvatarFallback>
                </Avatar>
                <span>Admin</span>
              </div>
              <div className="col-span-4 flex items-center">admin@example.com</div>
              <div className="col-span-3 flex items-center">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  Administrador
                </span>
              </div>
              <div className="col-span-2 flex items-center gap-1">
                <Button variant="ghost" size="icon">
                  <FileEdit className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-12 gap-4 p-4 text-sm">
              <div className="col-span-3 flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>US</AvatarFallback>
                </Avatar>
                <span>Usuário Padrão</span>
              </div>
              <div className="col-span-4 flex items-center">usuario@example.com</div>
              <div className="col-span-3 flex items-center">
                <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">
                  Padrão
                </span>
              </div>
              <div className="col-span-2 flex items-center gap-1">
                <Button variant="ghost" size="icon">
                  <FileEdit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
