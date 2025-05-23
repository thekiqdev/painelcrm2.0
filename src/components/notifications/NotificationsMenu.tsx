
import React, { useState } from "react";
import { 
  Bell, 
  X, 
  MessageSquare, 
  FileText, 
  Check, 
  AlertTriangle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuTabs,
  DropdownMenuTab,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "system" | "payment" | "message" | "alert";
  read: boolean;
  date: Date;
}

const mockNotifications: Notification[] = [
  {
    id: "1",
    title: "Conexão de WhatsApp",
    message: "A API Evolution foi conectada com sucesso",
    type: "system",
    read: false,
    date: new Date()
  },
  {
    id: "2",
    title: "Fatura paga",
    message: "O cliente João Silva pagou a fatura #12345",
    type: "payment",
    read: true,
    date: new Date(Date.now() - 24 * 60 * 60 * 1000)
  },
  {
    id: "3",
    title: "Nova mensagem",
    message: "Você recebeu uma nova mensagem de Maria Oliveira",
    type: "message",
    read: false,
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  },
  {
    id: "4",
    title: "Alerta de segurança",
    message: "Login detectado de uma nova localização",
    type: "alert",
    read: false,
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  }
];

export function NotificationsMenu() {
  const [activeTab, setActiveTab] = useState<string>("system");
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  
  const unreadCount = notifications.filter(n => !n.read).length;
  
  const systemNotifications = notifications.filter(n => n.type === "system" || n.type === "alert");
  const otherNotifications = notifications.filter(n => n.type === "payment" || n.type === "message");
  
  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };
  
  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };
  
  const removeNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  const getNotificationIcon = (type: string) => {
    switch(type) {
      case "system": return <Bell className="h-4 w-4 text-blue-500" />;
      case "payment": return <FileText className="h-4 w-4 text-green-500" />;
      case "message": return <MessageSquare className="h-4 w-4 text-purple-500" />;
      case "alert": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 7) return `${diffDays}d atrás`;
    return date.toLocaleDateString();
  };

  const renderNotificationItem = (notification: Notification) => (
    <DropdownMenuItem key={notification.id} className="py-2 px-4 flex flex-col items-start gap-1">
      <div className="flex items-start justify-between w-full">
        <div className="flex gap-2 items-center">
          {getNotificationIcon(notification.type)}
          <span className={cn("text-sm font-medium", !notification.read && "font-bold")}>
            {notification.title}
          </span>
        </div>
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            removeNotification(notification.id); 
          }} 
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground ml-6">{notification.message}</p>
      <div className="flex justify-between w-full mt-1">
        <span className="text-xs text-muted-foreground ml-6">
          {formatDate(notification.date)}
        </span>
        {!notification.read && (
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              markAsRead(notification.id); 
            }} 
            className="text-xs text-primary hover:underline"
          >
            Marcar como lida
          </button>
        )}
      </div>
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 px-1 min-w-[18px] h-[18px] text-[10px]">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex justify-between items-center">
          <span>Notificações</span>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs"
              onClick={markAllAsRead}
            >
              Marcar todas como lidas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuTabs value={activeTab} onValueChange={setActiveTab}>
          <DropdownMenuGroup className="border-b">
            <div className="flex">
              <DropdownMenuTab value="system" className="flex-1 justify-center">
                Sistema
                {systemNotifications.some(n => !n.read) && (
                  <Badge variant="secondary" className="ml-1 px-1 min-w-[18px] h-[18px] text-[10px]">
                    {systemNotifications.filter(n => !n.read).length}
                  </Badge>
                )}
              </DropdownMenuTab>
              <DropdownMenuTab value="other" className="flex-1 justify-center">
                Outras
                {otherNotifications.some(n => !n.read) && (
                  <Badge variant="secondary" className="ml-1 px-1 min-w-[18px] h-[18px] text-[10px]">
                    {otherNotifications.filter(n => !n.read).length}
                  </Badge>
                )}
              </DropdownMenuTab>
            </div>
          </DropdownMenuGroup>

          <div className="max-h-[300px] overflow-y-auto">
            {activeTab === "system" ? (
              systemNotifications.length > 0 ? (
                systemNotifications.map(renderNotificationItem)
              ) : (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Nenhuma notificação do sistema
                </div>
              )
            ) : (
              otherNotifications.length > 0 ? (
                otherNotifications.map(renderNotificationItem)
              ) : (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Nenhuma notificação de pagamentos ou mensagens
                </div>
              )
            )}
          </div>
        </DropdownMenuTabs>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="justify-center text-center">
          <Button variant="ghost" size="sm" className="w-full text-primary">
            Ver todas notificações
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationsMenu;
