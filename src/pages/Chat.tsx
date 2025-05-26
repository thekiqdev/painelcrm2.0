import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserCheck, Clock, Send, Phone, Filter, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import EvolutionChatPanel from "@/components/whatsapp/EvolutionChatPanel";

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
  status: "active" | "pending" | "closed";
  attendant?: string;
}

type ProfileWithConnection = {
  whatsapp_connected: boolean | null;
};

interface Connection {
  id: string;
  name: string;
  type: string;
  status: string;
  configData?: {
    apiKey?: string;
    instanceName?: string;
    serverUrl?: string;
    phoneNumber?: string;
  };
}

const Chat = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [activeEvolutionConnection, setActiveEvolutionConnection] = useState<Connection | null>(null);
  const [contactFilter, setContactFilter] = useState("");
  const [connectedNumber, setConnectedNumber] = useState<string>("");

  useEffect(() => {
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
        
        const profile = data as unknown as ProfileWithConnection;
        
        if (profile && profile.whatsapp_connected === true) {
          setConnectionStatus("connected");
          
          // Check for Evolution API connections
          const savedConnections = localStorage.getItem('whatsapp_connections');
          if (savedConnections) {
            try {
              const connections: Connection[] = JSON.parse(savedConnections);
              const evolutionConnection = connections.find(c => 
                c.type === "evolution" && c.status === "connected"
              );
              
              if (evolutionConnection) {
                setActiveEvolutionConnection(evolutionConnection);
                setConnectedNumber(evolutionConnection.configData?.phoneNumber || "Número não identificado");
              }
            } catch (error) {
              console.error("Error loading connections:", error);
            }
          }
          
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
          updatedAt: new Date(Date.now() - 1000 * 60 * 5),
          status: "active",
          attendant: user?.email || "Você"
        },
        {
          id: "2",
          customer: {
            name: "Maria Oliveira",
            phone: "+5511912345678",
            avatar: "",
          },
          lastMessage: "Preciso de ajuda urgente!",
          unreadCount: 2,
          updatedAt: new Date(Date.now() - 1000 * 60 * 10),
          status: "pending"
        },
        {
          id: "3",
          customer: {
            name: "Carlos Santos",
            phone: "+5521998765432",
            avatar: "",
          },
          lastMessage: "Obrigado pelo atendimento!",
          unreadCount: 0,
          updatedAt: new Date(Date.now() - 1000 * 60 * 30),
          status: "active",
          attendant: user?.email || "Você"
        },
        {
          id: "4",
          customer: {
            name: "Ana Costa",
            phone: "+5511999887766",
            avatar: "",
          },
          lastMessage: "Olá, preciso de informações sobre produtos",
          unreadCount: 1,
          updatedAt: new Date(Date.now() - 1000 * 60 * 15),
          status: "pending"
        }
      ];
      
      setConversations(mockConversations);
    };

    if (user) {
      checkConnectionStatus();
    }
  }, [user]);

  useEffect(() => {
    if (activeConversation) {
      const mockMessages: Message[] = [
        {
          id: "1",
          content: "Olá, como posso ajudar?",
          sender: "user",
          timestamp: new Date(Date.now() - 1000 * 60 * 60),
        },
        {
          id: "2",
          content: "Estou com um problema no meu pedido",
          sender: "customer",
          timestamp: new Date(Date.now() - 1000 * 60 * 59),
        },
        {
          id: "3",
          content: "Qual é o número do seu pedido?",
          sender: "user",
          timestamp: new Date(Date.now() - 1000 * 60 * 55),
        },
        {
          id: "4",
          content: "O número é #12345",
          sender: "customer",
          timestamp: new Date(Date.now() - 1000 * 60 * 50),
        },
        {
          id: "5",
          content: "Vou verificar para você agora mesmo.",
          sender: "user",
          timestamp: new Date(Date.now() - 1000 * 60 * 45),
        },
      ];
      
      setMessages(mockMessages);
      
      setConversations(prev =>
        prev.map(conv =>
          conv.id === activeConversation
            ? { ...conv, unreadCount: 0 }
            : conv
        )
      );
    }
  }, [activeConversation]);

  const handleAttendConversation = (conversationId: string) => {
    setConversations(prev => 
      prev.map(conv => 
        conv.id === conversationId 
          ? { ...conv, status: "active", attendant: user?.email || "Você" }
          : conv
      )
    );
    
    setActiveConversation(conversationId);
    
    toast.success("Conversa atendida!", {
      description: "Você agora está atendendo esta conversa"
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;
    
    const newMsg: Message = {
      id: `new-${Date.now()}`,
      content: newMessage,
      sender: "user",
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, newMsg]);
    setNewMessage("");
    
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

  const filteredConversations = conversations.filter(conv =>
    conv.customer.name.toLowerCase().includes(contactFilter.toLowerCase()) ||
    conv.customer.phone.includes(contactFilter)
  );

  const pendingConversations = filteredConversations.filter(conv => conv.status === "pending");
  const activeConversations = filteredConversations.filter(conv => conv.status === "active");

  const handleNavigateToSettings = () => {
    navigate("/settings?tab=whatsapp");
  };

  const renderConversationItem = (conversation: Conversation, showAttendButton = false) => (
    <li 
      key={conversation.id}
      className={`px-4 py-3 hover:bg-muted cursor-pointer ${
        activeConversation === conversation.id ? "bg-muted" : ""
      }`}
      onClick={() => !showAttendButton && setActiveConversation(conversation.id)}
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
          <div className="flex items-center gap-2 mt-1">
            {conversation.status === "pending" && (
              <Badge variant="destructive" className="text-xs">
                Não atendido
              </Badge>
            )}
            {conversation.attendant && conversation.status === "active" && (
              <Badge variant="secondary" className="text-xs">
                {conversation.attendant}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {conversation.unreadCount > 0 && (
            <span className="bg-primary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {conversation.unreadCount}
            </span>
          )}
          {showAttendButton && conversation.status === "pending" && (
            <Button 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleAttendConversation(conversation.id);
              }}
              className="h-6 text-xs px-2"
            >
              Atender
            </Button>
          )}
        </div>
      </div>
    </li>
  );

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
                onClick={handleNavigateToSettings}
                className="px-8"
              >
                Ir para Configurações
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Cabeçalho com número conectado */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-full">
                    <Phone className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">WhatsApp Conectado</h3>
                    <p className="text-sm text-muted-foreground">
                      {connectedNumber}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Online
                </Badge>
              </div>
              
              {/* Filtro de contatos */}
              <div className="mt-4">
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar por nome ou telefone..."
                    value={contactFilter}
                    onChange={(e) => setContactFilter(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="mock" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="mock">Conversas</TabsTrigger>
              <TabsTrigger value="pending">
                Não atendidos
                {pendingConversations.length > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 text-xs">
                    {pendingConversations.length}
                  </Badge>
                )}
              </TabsTrigger>
              {activeEvolutionConnection && (
                <TabsTrigger value="evolution">Evolution API</TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="mock">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-16rem)]">
                <Card className="md:col-span-1 flex flex-col">
                  <CardHeader className="px-4 py-3 border-b">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Conversas Ativas ({activeConversations.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 flex-grow overflow-hidden">
                    <ScrollArea className="flex-grow">
                      {activeConversations.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          Nenhuma conversa ativa
                        </div>
                      ) : (
                        <ul className="divide-y">
                          {activeConversations.map((conversation) => 
                            renderConversationItem(conversation, false)
                          )}
                        </ul>
                      )}
                    </ScrollArea>
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
            </TabsContent>
            
            <TabsContent value="pending">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-16rem)]">
                <Card className="md:col-span-1 flex flex-col">
                  <CardHeader className="px-4 py-3 border-b">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Não Atendidos ({pendingConversations.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 flex-grow overflow-hidden">
                    <ScrollArea className="flex-grow">
                      {pendingConversations.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          Nenhuma conversa não atendida
                        </div>
                      ) : (
                        <ul className="divide-y">
                          {pendingConversations.map((conversation) => 
                            renderConversationItem(conversation, true)
                          )}
                        </ul>
                      )}
                    </ScrollArea>
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
            </TabsContent>
            
            {activeEvolutionConnection && (
              <TabsContent value="evolution">
                <EvolutionChatPanel
                  instanceName={activeEvolutionConnection.configData?.instanceName || ""}
                  enabled={true}
                />
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
};

export default Chat;
