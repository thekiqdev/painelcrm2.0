import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserCheck, Clock, Send, Phone, Filter, Users, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useEvolutionChatCache } from "@/hooks/useEvolutionChatCache";
import { EvolutionMessage } from "@/services/evolutionApi";
import { connectionDatabaseService } from "@/services/whatsapp/connectionDatabaseService";

interface ChatConversation {
  id: string;
  remoteJid: string;
  pushName?: string;
  profilePictureUrl?: string;
  lastMessage?: string;
  unreadCount?: number;
  updatedAt: Date;
  status: "active" | "pending" | "closed";
  attendant?: string;
}

type ProfileWithConnection = {
  whatsapp_connected: boolean | null;
};

const Chat = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [newMessage, setNewMessage] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [contactFilter, setContactFilter] = useState("");
  const [connectedNumber, setConnectedNumber] = useState<string>("");
  const [activeInstanceName, setActiveInstanceName] = useState<string>("");
  const [activeConnectionId, setActiveConnectionId] = useState<string>("");

  // Garantir que o connectionId seja válido antes de passar para o hook
  const validConnectionId = activeConnectionId && activeConnectionId.trim() !== "" ? activeConnectionId : undefined;

  console.log("Chat component state:", {
    activeInstanceName,
    activeConnectionId,
    validConnectionId,
    connectionStatus
  });

  const {
    chats,
    messages,
    activeChat,
    isLoading,
    isSending,
    sendMessage,
    loadMessages,
    attendConversation,
    getActiveChatInfo,
    refreshChats
  } = useEvolutionChatCache({
    instanceName: activeInstanceName,
    enabled: connectionStatus === "connected" && !!activeInstanceName,
    connectionId: validConnectionId
  });

  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        if (!user) return;
        
        console.log("Verificando status de conexão do usuário:", user.id);
        
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
          
          try {
            const connections = await connectionDatabaseService.getConnections();
            console.log("Conexões do banco de dados:", connections);
            
            const activeConnection = connections.find(c => c.status === "connected");
            
            if (activeConnection && activeConnection.instance_name) {
              console.log("Conexão ativa encontrada:", activeConnection);
              setActiveInstanceName(activeConnection.instance_name);
              setActiveConnectionId(activeConnection.id);
              setConnectedNumber(activeConnection.phone_number || "Número não identificado");
            } else {
              console.log("Nenhuma conexão ativa encontrada no banco");
              setConnectionStatus("disconnected");
            }
          } catch (dbError) {
            console.error("Erro ao buscar conexões do banco:", dbError);
            setConnectionStatus("disconnected");
          }
        } else {
          setConnectionStatus("disconnected");
        }
      } catch (error) {
        console.error("Error checking WhatsApp connection:", error);
        setConnectionStatus("disconnected");
      }
    };

    if (user) {
      checkConnectionStatus();
    }
  }, [user]);

  // Converter chats do cache para conversações com status persistido
  const conversations: ChatConversation[] = chats.map(chat => ({
    id: chat.id,
    remoteJid: chat.remoteJid,
    pushName: chat.pushName,
    profilePictureUrl: chat.profilePictureUrl,
    lastMessage: "Conversa ativa",
    unreadCount: chat.unreadMessages || 0,
    updatedAt: new Date(),
    status: chat.status === 'active' ? 'active' : 'pending',
    attendant: chat.attendant ? user?.email || "Atendente" : undefined
  }));

  const getMessageText = (message: EvolutionMessage) => {
    return message.message?.conversation || 
           message.message?.extendedTextMessage?.text || 
           "Mensagem sem texto";
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !activeChat || !activeInstanceName) return;
    
    try {
      await sendMessage(activeChat, newMessage);
      setNewMessage("");
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString('pt-BR', { 
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
      return date.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
      });
    }
    
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const handleAttendConversation = async (conversationId: string) => {
    const conversation = conversations.find(c => c.id === conversationId);
    if (!conversation) {
      toast.error("Conversa não encontrada");
      return;
    }

    if (!validConnectionId) {
      toast.error("ID da conexão não encontrado");
      return;
    }

    console.log("Atendendo conversa:", {
      conversationId,
      remoteJid: conversation.remoteJid,
      connectionId: validConnectionId
    });
    
    const success = await attendConversation(conversation.remoteJid);
    if (success) {
      console.log("Conversa atendida com sucesso, mensagens carregadas");
      // Recarregar as conversas para atualizar o status
      await refreshChats();
    } else {
      toast.error("Erro ao atender conversa");
    }
  };

  const handleSelectConversation = async (conversationId: string) => {
    const conversation = conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    console.log("Selecionando conversa:", conversation.remoteJid);
    await loadMessages(conversation.remoteJid);
  };

  const renderConversationItem = (conversation: ChatConversation, showAttendButton = false) => (
    <li 
      key={conversation.id}
      className={`px-4 py-3 hover:bg-muted cursor-pointer ${
        activeChat === conversation.remoteJid ? "bg-muted" : ""
      }`}
      onClick={() => handleSelectConversation(conversation.id)}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 flex-shrink-0">
          {conversation.profilePictureUrl ? (
            <img src={conversation.profilePictureUrl} alt={conversation.pushName || conversation.remoteJid} />
          ) : (
            <div className="bg-primary text-white h-full w-full flex items-center justify-center font-medium">
              {(conversation.pushName || conversation.remoteJid).charAt(0)}
            </div>
          )}
        </Avatar>
        <div className="flex-grow min-w-0">
          <div className="flex items-baseline justify-between">
            <h3 className="font-medium text-sm truncate">
              {conversation.pushName || conversation.remoteJid}
            </h3>
            <span className="text-xs text-muted-foreground whitespace-nowrap ml-1">
              {formatDate(conversation.updatedAt)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {conversation.remoteJid}
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
          {(conversation.unreadCount || 0) > 0 && (
            <span className="bg-primary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {conversation.unreadCount}
            </span>
          )}
          {showAttendButton && conversation.status === "pending" && validConnectionId && (
            <Button 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleAttendConversation(conversation.id);
              }}
              className="h-6 text-xs px-2"
              disabled={!validConnectionId}
            >
              Atender
            </Button>
          )}
        </div>
      </div>
    </li>
  );

  const filteredConversations = conversations.filter(conv =>
    (conv.pushName && conv.pushName.toLowerCase().includes(contactFilter.toLowerCase())) ||
    conv.remoteJid.includes(contactFilter)
  );

  const pendingConversations = filteredConversations.filter(conv => conv.status === "pending");
  const activeConversations = filteredConversations.filter(conv => conv.status === "active");

  const handleNavigateToSettings = () => {
    navigate("/settings?tab=whatsapp");
  };

  const activeChatInfo = getActiveChatInfo();

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
          {/* Cabeçalho compacto com número conectado */}
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="bg-green-100 p-1.5 rounded-full">
                <Phone className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <span className="text-sm font-medium text-green-800">WhatsApp Conectado:</span>
                <span className="text-sm text-green-700 ml-1">{connectedNumber}</span>
                {activeInstanceName && (
                  <span className="text-xs text-green-600 ml-2">({activeInstanceName})</span>
                )}
                {validConnectionId && (
                  <span className="text-xs text-green-500 ml-2">[ID: {validConnectionId.slice(0, 8)}...]</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
                Online
              </Badge>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={refreshChats}
                disabled={isLoading}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Filtro de contatos */}
          <Card>
            <CardContent className="pt-4">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filtrar por nome ou telefone..."
                  value={contactFilter}
                  onChange={(e) => setContactFilter(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="conversations" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="conversations">Conversas</TabsTrigger>
              <TabsTrigger value="pending">
                Não atendidos
                {pendingConversations.length > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 text-xs">
                    {pendingConversations.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="conversations">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-20rem)]">
                <Card className="md:col-span-1 flex flex-col">
                  <CardHeader className="px-4 py-3 border-b">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Conversas Ativas ({activeConversations.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 flex-grow overflow-hidden">
                    <ScrollArea className="flex-grow">
                      {isLoading && activeConversations.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Carregando conversas...
                          </div>
                        </div>
                      ) : activeConversations.length === 0 ? (
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
                  {activeChat && activeChatInfo ? (
                    <>
                      <CardHeader className="px-4 py-3 border-b flex-shrink-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              {activeChatInfo.profilePictureUrl ? (
                                <img src={activeChatInfo.profilePictureUrl} alt={activeChatInfo.pushName || activeChatInfo.remoteJid} />
                              ) : (
                                <div className="bg-primary text-white h-full w-full flex items-center justify-center font-medium">
                                  {(activeChatInfo.pushName || activeChatInfo.remoteJid).charAt(0)}
                                </div>
                              )}
                            </Avatar>
                            <div>
                              <h3 className="font-medium text-sm">
                                {activeChatInfo.pushName || activeChatInfo.remoteJid}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {activeChatInfo.remoteJid}
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
                          {isLoading && messages.length === 0 ? (
                            <div className="text-center text-muted-foreground">
                              <div className="flex items-center justify-center gap-2">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Carregando mensagens...
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {messages.map((message) => (
                                <div 
                                  key={message.key.id} 
                                  className={`flex ${message.key.fromMe ? 'justify-end' : 'justify-start'}`}
                                >
                                  <div 
                                    className={`max-w-[70%] rounded-lg p-3 ${
                                      message.key.fromMe 
                                        ? 'bg-primary text-primary-foreground' 
                                        : 'bg-muted'
                                    }`}
                                  >
                                    <p className="text-sm">{getMessageText(message)}</p>
                                    <div className={`text-xs mt-1 ${
                                      message.key.fromMe 
                                        ? 'text-primary-foreground/70' 
                                        : 'text-muted-foreground'
                                    }`}>
                                      {formatTime(message.messageTimestamp)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                        <div className="p-3 border-t">
                          <form onSubmit={handleSendMessage} className="flex gap-2">
                            <Input 
                              type="text"
                              placeholder="Digite sua mensagem..."
                              value={newMessage}
                              onChange={(e) => setNewMessage(e.target.value)}
                              disabled={isSending}
                              className="flex-grow"
                            />
                            <Button 
                              type="submit" 
                              size="icon"
                              disabled={isSending || !newMessage.trim()}
                            >
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-20rem)]">
                <Card className="md:col-span-1 flex flex-col">
                  <CardHeader className="px-4 py-3 border-b">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Não Atendidos ({pendingConversations.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 flex-grow overflow-hidden">
                    <ScrollArea className="flex-grow">
                      {isLoading && pendingConversations.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Carregando conversas...
                          </div>
                        </div>
                      ) : pendingConversations.length === 0 ? (
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
                  {activeChat && activeChatInfo ? (
                    <>
                      <CardHeader className="px-4 py-3 border-b flex-shrink-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              {activeChatInfo.profilePictureUrl ? (
                                <img src={activeChatInfo.profilePictureUrl} alt={activeChatInfo.pushName || activeChatInfo.remoteJid} />
                              ) : (
                                <div className="bg-primary text-white h-full w-full flex items-center justify-center font-medium">
                                  {(activeChatInfo.pushName || activeChatInfo.remoteJid).charAt(0)}
                                </div>
                              )}
                            </Avatar>
                            <div>
                              <h3 className="font-medium text-sm">
                                {activeChatInfo.pushName || activeChatInfo.remoteJid}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {activeChatInfo.remoteJid}
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
                          {isLoading && messages.length === 0 ? (
                            <div className="text-center text-muted-foreground">
                              <div className="flex items-center justify-center gap-2">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Carregando mensagens...
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {messages.map((message) => (
                                <div 
                                  key={message.key.id} 
                                  className={`flex ${message.key.fromMe ? 'justify-end' : 'justify-start'}`}
                                >
                                  <div 
                                    className={`max-w-[70%] rounded-lg p-3 ${
                                      message.key.fromMe 
                                        ? 'bg-primary text-primary-foreground' 
                                        : 'bg-muted'
                                    }`}
                                  >
                                    <p className="text-sm">{getMessageText(message)}</p>
                                    <div className={`text-xs mt-1 ${
                                      message.key.fromMe 
                                        ? 'text-primary-foreground/70' 
                                        : 'text-muted-foreground'
                                    }`}>
                                      {formatTime(message.messageTimestamp)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                        <div className="p-3 border-t">
                          <form onSubmit={handleSendMessage} className="flex gap-2">
                            <Input 
                              type="text"
                              placeholder="Digite sua mensagem..."
                              value={newMessage}
                              onChange={(e) => setNewMessage(e.target.value)}
                              disabled={isSending}
                              className="flex-grow"
                            />
                            <Button 
                              type="submit" 
                              size="icon"
                              disabled={isSending || !newMessage.trim()}
                            >
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
          </Tabs>
        </>
      )}
    </div>
  );
};

export default Chat;
