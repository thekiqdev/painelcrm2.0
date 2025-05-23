import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import { Send, MessageSquare, Phone } from "lucide-react";
import { useEvolutionChat } from "@/hooks/useEvolutionChat";
import { EvolutionMessage } from "@/services/evolutionApi";

interface EvolutionChatPanelProps {
  instanceName: string;
  enabled: boolean;
}

const EvolutionChatPanel: React.FC<EvolutionChatPanelProps> = ({
  instanceName,
  enabled
}) => {
  const [newMessage, setNewMessage] = useState("");
  
  const {
    chats,
    messages,
    activeChat,
    isLoading,
    isSending,
    loadChats,
    loadMessages,
    sendMessage,
    setActiveChat
  } = useEvolutionChat({
    instanceName,
    enabled
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !activeChat) return;
    
    await sendMessage(activeChat, newMessage);
    setNewMessage("");
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && 
                    date.getMonth() === now.getMonth() && 
                    date.getFullYear() === now.getFullYear();
    
    if (isToday) {
      return formatTime(timestamp);
    }
    
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const getMessageText = (message: EvolutionMessage) => {
    return message.message?.conversation || 
           message.message?.extendedTextMessage?.text || 
           "Mensagem sem texto";
  };

  if (!enabled) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="mb-4">
            <div className="bg-orange-100 text-orange-800 p-3 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Evolution API não conectada</h2>
            <p className="text-muted-foreground mb-6">
              Conecte uma instância da Evolution API para usar o chat.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
      {/* Lista de Conversas */}
      <Card className="md:col-span-1 flex flex-col">
        <CardHeader className="px-4 py-3 border-b">
          <CardTitle className="text-base font-medium flex items-center justify-between">
            Conversas Evolution
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadChats}
              disabled={isLoading}
            >
              Atualizar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-grow overflow-hidden">
          <ScrollArea className="flex-grow">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Carregando conversas...
              </div>
            ) : chats.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                Nenhuma conversa encontrada
              </div>
            ) : (
              <ul className="divide-y">
                {chats.map((chat) => (
                  <li 
                    key={chat.id}
                    className={`px-4 py-3 hover:bg-muted cursor-pointer ${
                      activeChat === chat.remoteJid ? "bg-muted" : ""
                    }`}
                    onClick={() => loadMessages(chat.remoteJid)}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        {chat.profilePictureUrl ? (
                          <img src={chat.profilePictureUrl} alt={chat.pushName} />
                        ) : (
                          <div className="bg-primary text-white h-full w-full flex items-center justify-center font-medium">
                            {chat.pushName?.charAt(0) || chat.remoteJid.charAt(0)}
                          </div>
                        )}
                      </Avatar>
                      <div className="flex-grow min-w-0">
                        <h3 className="font-medium text-sm truncate">
                          {chat.pushName || chat.remoteJid}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {chat.remoteJid}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Área de Mensagens */}
      <Card className="md:col-span-2 flex flex-col">
        {activeChat ? (
          <>
            <CardHeader className="px-4 py-3 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <div className="bg-primary text-white h-full w-full flex items-center justify-center font-medium">
                      {chats.find(c => c.remoteJid === activeChat)?.pushName?.charAt(0) || activeChat.charAt(0)}
                    </div>
                  </Avatar>
                  <div>
                    <h3 className="font-medium text-sm">
                      {chats.find(c => c.remoteJid === activeChat)?.pushName || activeChat}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {activeChat}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    onClick={() => loadMessages(activeChat)}
                    disabled={isLoading}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Phone className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-grow overflow-hidden flex flex-col">
              <ScrollArea className="flex-grow p-4">
                {isLoading ? (
                  <div className="text-center text-muted-foreground">
                    Carregando mensagens...
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
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="font-medium mb-1">Nenhuma conversa selecionada</h3>
              <p className="text-sm text-muted-foreground">
                Selecione uma conversa da Evolution API para começar a responder
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default EvolutionChatPanel;
