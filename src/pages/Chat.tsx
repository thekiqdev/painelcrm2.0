
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import { UserCheck, Clock, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

interface Message {
  id: string;
  content: string;
  sender: "user" | "customer";
  timestamp: Date;
}

interface Conversation {
  id: string;
  customer: {
    name: string;
    phone: string;
    avatar?: string;
  };
  lastMessage: string;
  unreadCount: number;
  updatedAt: Date;
}

type ProfileWithConnection = {
  whatsapp_connected: boolean | null;
};

const Chat = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");

  // Mock data for demonstration - in real app these would come from Baileys API
  useEffect(() => {
    // Check WhatsApp connection status from Supabase
    const checkConnectionStatus = async () => {
      try {
        if (!user) return;
        
        const { data, error } = await supabase
          .from('profiles')
          .select('whatsapp_connected')
          .eq('id', user.id)
          .single();
        
        if (error) {
          console.error("Error checking WhatsApp connection:", error);
          setConnectionStatus("disconnected");
          return;
        }
        
        // Cast the data to the correct type
        const profile = data as unknown as ProfileWithConnection;
        
        if (profile && profile.whatsapp_connected === true) {
          setConnectionStatus("connected");
          // Load mock conversations only if WhatsApp is connected
          loadMockData();
        } else {
          setConnectionStatus("disconnected");
        }
      } catch (error) {
        console.error("Error checking WhatsApp connection:", error);
        setConnectionStatus("disconnected");
      }
    };

    const loadMockData = () => {
      const mockConversations: Conversation[] = [
        {
          id: "1",
          customer: {
            name: "João Silva",
            phone: "+5511987654321",
            avatar: "",
          },
          lastMessage: "Quando meu pedido será enviado?",
          unreadCount: 3,
          updatedAt: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
        },
        {
          id: "2",
          customer: {
            name: "Maria Oliveira",
            phone: "+5511912345678",
            avatar: "",
          },
          lastMessage: "Obrigado pelo atendimento!",
          unreadCount: 0,
          updatedAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
        },
        {
          id: "3",
          customer: {
            name: "Carlos Santos",
            phone: "+5521998765432",
            avatar: "",
          },
          lastMessage: "Preciso de ajuda com meu produto",
          unreadCount: 1,
          updatedAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
        },
      ];
      
      setConversations(mockConversations);
    };

    if (user) {
      checkConnectionStatus();
    }
  }, [user]);

  // Load messages when selecting a conversation
  useEffect(() => {
    if (activeConversation) {
      const mockMessages: Message[] = [
        {
          id: "1",
          content: "Olá, como posso ajudar?",
          sender: "user",
          timestamp: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
        },
        {
          id: "2",
          content: "Estou com um problema no meu pedido",
          sender: "customer",
          timestamp: new Date(Date.now() - 1000 * 60 * 59), // 59 minutes ago
        },
        {
          id: "3",
          content: "Qual é o número do seu pedido?",
          sender: "user",
          timestamp: new Date(Date.now() - 1000 * 60 * 55), // 55 minutes ago
        },
        {
          id: "4",
          content: "O número é #12345",
          sender: "customer",
          timestamp: new Date(Date.now() - 1000 * 60 * 50), // 50 minutes ago
        },
        {
          id: "5",
          content: "Vou verificar para você agora mesmo.",
          sender: "user",
          timestamp: new Date(Date.now() - 1000 * 60 * 45), // 45 minutes ago
        },
      ];
      
      setMessages(mockMessages);
      
      // Mark conversation as read
      setConversations(prev =>
        prev.map(conv =>
          conv.id === activeConversation
            ? { ...conv, unreadCount: 0 }
            : conv
        )
      );
    }
  }, [activeConversation]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;
    
    // Add new message to the conversation
    const newMsg: Message = {
      id: `new-${Date.now()}`,
      content: newMessage,
      sender: "user",
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, newMsg]);
    setNewMessage("");
    
    // In a real app, you would send this via the Baileys API
    console.log("Message to send:", newMessage);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    });
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && 
                    date.getMonth() === now.getMonth() && 
                    date.getFullYear() === now.getFullYear();
    
    if (isToday) {
      return formatTime(date);
    }
    
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chat</h1>
      </div>

      {connectionStatus === "disconnected" ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="mb-4">
              <div className="bg-orange-100 text-orange-800 p-3 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2">WhatsApp não conectado</h2>
              <p className="text-muted-foreground mb-6">
                Você precisa conectar sua conta WhatsApp antes de poder usar o chat.
              </p>
              <Button 
                onClick={() => window.location.href = "/settings"}
                className="px-8"
              >
                Ir para Configurações
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
          <Card className="md:col-span-1 flex flex-col">
            <CardHeader className="px-4 py-3 border-b">
              <CardTitle className="text-base font-medium">Conversas</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-grow overflow-hidden">
              <Tabs defaultValue="all" className="w-full h-full flex flex-col">
                <TabsList className="grid grid-cols-3 mx-3 my-3">
                  <TabsTrigger value="all">Todas</TabsTrigger>
                  <TabsTrigger value="unread">Não lidas</TabsTrigger>
                  <TabsTrigger value="archived">Arquivadas</TabsTrigger>
                </TabsList>
                <ScrollArea className="flex-grow">
                  <TabsContent value="all" className="mt-0">
                    <ul className="divide-y">
                      {conversations.map((conversation) => (
                        <li 
                          key={conversation.id}
                          className={`px-4 py-3 hover:bg-muted cursor-pointer ${
                            activeConversation === conversation.id ? "bg-muted" : ""
                          }`}
                          onClick={() => setActiveConversation(conversation.id)}
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="h-10 w-10 flex-shrink-0">
                              <div className="bg-primary text-white h-full w-full flex items-center justify-center font-medium">
                                {conversation.customer.name.charAt(0)}
                              </div>
                            </Avatar>
                            <div className="flex-grow min-w-0">
                              <div className="flex items-baseline justify-between">
                                <h3 className="font-medium text-sm truncate">
                                  {conversation.customer.name}
                                </h3>
                                <span className="text-xs text-muted-foreground whitespace-nowrap ml-1">
                                  {formatDate(conversation.updatedAt)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {conversation.lastMessage}
                              </p>
                            </div>
                            {conversation.unreadCount > 0 && (
                              <div className="ml-1 flex-shrink-0">
                                <span className="bg-primary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                  {conversation.unreadCount}
                                </span>
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </TabsContent>
                  <TabsContent value="unread" className="mt-0">
                    <ul className="divide-y">
                      {conversations
                        .filter(conv => conv.unreadCount > 0)
                        .map((conversation) => (
                          <li 
                            key={conversation.id}
                            className="px-4 py-3 hover:bg-muted cursor-pointer"
                            onClick={() => setActiveConversation(conversation.id)}
                          >
                            {/* Same conversation item structure as above */}
                            <div className="flex items-start gap-3">
                              <Avatar className="h-10 w-10 flex-shrink-0">
                                <div className="bg-primary text-white h-full w-full flex items-center justify-center font-medium">
                                  {conversation.customer.name.charAt(0)}
                                </div>
                              </Avatar>
                              <div className="flex-grow min-w-0">
                                <div className="flex items-baseline justify-between">
                                  <h3 className="font-medium text-sm truncate">
                                    {conversation.customer.name}
                                  </h3>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-1">
                                    {formatDate(conversation.updatedAt)}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {conversation.lastMessage}
                                </p>
                              </div>
                              <div className="ml-1 flex-shrink-0">
                                <span className="bg-primary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                  {conversation.unreadCount}
                                </span>
                              </div>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </TabsContent>
                  <TabsContent value="archived" className="mt-0">
                    <div className="p-4 text-center text-muted-foreground">
                      Nenhuma conversa arquivada
                    </div>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 flex flex-col">
            {activeConversation ? (
              <>
                <CardHeader className="px-4 py-3 border-b flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <div className="bg-primary text-white h-full w-full flex items-center justify-center font-medium">
                          {conversations.find(c => c.id === activeConversation)?.customer.name.charAt(0)}
                        </div>
                      </Avatar>
                      <div>
                        <h3 className="font-medium text-sm">
                          {conversations.find(c => c.id === activeConversation)?.customer.name}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {conversations.find(c => c.id === activeConversation)?.customer.phone}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <UserCheck className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Clock className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-grow overflow-hidden flex flex-col">
                  <ScrollArea className="flex-grow p-4">
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div 
                          key={message.id} 
                          className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div 
                            className={`max-w-[70%] rounded-lg p-3 ${
                              message.sender === 'user' 
                                ? 'bg-primary text-primary-foreground' 
                                : 'bg-muted'
                            }`}
                          >
                            <p className="text-sm">{message.content}</p>
                            <div className={`text-xs mt-1 ${
                              message.sender === 'user' 
                                ? 'text-primary-foreground/70' 
                                : 'text-muted-foreground'
                            }`}>
                              {formatTime(message.timestamp)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="p-3 border-t">
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                      <Input 
                        type="text"
                        placeholder="Digite sua mensagem..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="flex-grow"
                      />
                      <Button type="submit" size="icon">
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </>
            ) : (
              <div className="flex items-center justify-center h-full p-6 text-center">
                <div>
                  <div className="bg-muted rounded-full p-6 mx-auto mb-4 w-20 h-20 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3 className="font-medium mb-1">Nenhuma conversa selecionada</h3>
                  <p className="text-sm text-muted-foreground">
                    Selecione uma conversa para começar a responder
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default Chat;
