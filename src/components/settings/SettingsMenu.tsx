
import React from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { SettingsMenuItemProps } from "./types";

interface SettingsMenuProps {
  menuItems: SettingsMenuItemProps[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ 
  menuItems, 
  activeTab, 
  setActiveTab 
}) => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Menu className="h-4 w-4" />
          Menu de Configurações
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80">
        <div className="py-4">
          <h2 className="text-xl font-bold mb-6">Menu de Configurações</h2>
          <nav>
            <ul className="space-y-2">
              {menuItems.map((item) => (
                <li key={item.id}>
                  <Button 
                    variant={activeTab === item.id ? "default" : "ghost"} 
                    className="w-full justify-start"
                    onClick={() => setActiveTab(item.id)}
                  >
                    {item.icon}
                    {item.label}
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
};
