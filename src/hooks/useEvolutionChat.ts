
import { useState, useEffect } from "react";
import { whatsappService } from "@/services/whatsapp";
import { EvolutionMessage, EvolutionContact } from "@/services/evolutionApi";
import { toast } from "sonner";

interface UseEvolutionChatProps {
  instanceName: string;
  serverUrl: string;
  apiKey: string;
  enabled: boolean;
}

export const useEvolutionChat = ({ instanceName, serverUrl, apiKey, enabled }: UseEvolutionChatProps) => {
  const [chats, setChats] = useState<EvolutionContact[]>([]);
  const [messages, setMessages] = useState<EvolutionMessage[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Carregar conversas
  const loadChats = async () => {
    if (!enabled || !instanceName || !serverUrl || !apiKey) return;
    
    try {
      setIsLoading(true);
      const chatData = await whatsappService.getEvolutionChats(instanceName, serverUrl, apiKey);
      setChats(chatData);
    } catch (error) {
      console.error("Erro ao carregar conversas:", error);
      toast.error("Erro ao carregar conversas", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Carregar mensagens de uma conversa
  const loadMessages = async (remoteJid: string) => {
    if (!enabled || !instanceName || !serverUrl || !apiKey) return;
    
    try {
      setIsLoading(true);
      const messageData = await whatsappService.getEvolutionMessages(
        instanceName, 
        remoteJid, 
        serverUrl, 
        apiKey
      );
      setMessages(messageData);
      setActiveChat(remoteJid);
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
      toast.error("Erro ao carregar mensagens", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Enviar mensagem
  const sendMessage = async (remoteJid: string, message: string) => {
    if (!enabled || !instanceName || !serverUrl || !apiKey) return;
    
    try {
      setIsSending(true);
      await whatsappService.sendEvolutionMessage(
        instanceName, 
        remoteJid, 
        message, 
        serverUrl, 
        apiKey
      );
      
      // Recarregar mensagens após envio
      await loadMessages(remoteJid);
      
      toast.success("Mensagem enviada com sucesso!");
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      toast.error("Erro ao enviar mensagem", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsSending(false);
    }
  };

  // Carregar conversas quando os parâmetros mudarem
  useEffect(() => {
    if (enabled) {
      loadChats();
    }
  }, [enabled, instanceName, serverUrl, apiKey]);

  return {
    chats,
    messages,
    activeChat,
    isLoading,
    isSending,
    loadChats,
    loadMessages,
    sendMessage,
    setActiveChat
  };
};
