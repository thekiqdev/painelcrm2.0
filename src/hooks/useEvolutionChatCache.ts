
import { useState, useEffect, useRef } from "react";
import { whatsappService } from "@/services/whatsapp";
import { EvolutionMessage, EvolutionContact } from "@/services/evolutionApi";
import { toast } from "sonner";

interface CachedChat extends EvolutionContact {
  messages?: EvolutionMessage[];
  lastFetched?: number;
}

interface UseEvolutionChatCacheProps {
  instanceName: string;
  enabled: boolean;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
const MESSAGE_CACHE_DURATION = 2 * 60 * 1000; // 2 minutos

export const useEvolutionChatCache = ({ instanceName, enabled }: UseEvolutionChatCacheProps) => {
  const [chats, setChats] = useState<CachedChat[]>([]);
  const [messages, setMessages] = useState<EvolutionMessage[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const chatsCache = useRef<Map<string, { data: CachedChat[], timestamp: number }>>(new Map());
  const messagesCache = useRef<Map<string, { data: EvolutionMessage[], timestamp: number }>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());

  const getCacheKey = (instanceName: string) => `chats_${instanceName}`;
  const getMessageCacheKey = (instanceName: string, remoteJid: string) => `messages_${instanceName}_${remoteJid}`;

  // Verificar se o cache ainda é válido
  const isCacheValid = (timestamp: number, duration: number) => {
    return Date.now() - timestamp < duration;
  };

  // Carregar conversas com cache
  const loadChats = async (forceRefresh = false) => {
    if (!enabled || !instanceName) return;
    
    const cacheKey = getCacheKey(instanceName);
    const cached = chatsCache.current.get(cacheKey);
    
    // Usar cache se válido e não forçar refresh
    if (!forceRefresh && cached && isCacheValid(cached.timestamp, CACHE_DURATION)) {
      console.log("Usando conversas do cache:", cached.data.length);
      setChats(cached.data);
      return;
    }

    // Evitar múltiplas requisições simultâneas
    if (loadingRef.current.has(cacheKey)) {
      console.log("Carregamento já em andamento para:", cacheKey);
      return;
    }
    
    try {
      setIsLoading(true);
      loadingRef.current.add(cacheKey);
      
      console.log("Carregando conversas da API:", instanceName);
      const chatData = await whatsappService.getEvolutionChats(instanceName);
      
      const cachedChats: CachedChat[] = chatData.map(chat => ({
        ...chat,
        lastFetched: Date.now()
      }));
      
      // Atualizar cache
      chatsCache.current.set(cacheKey, {
        data: cachedChats,
        timestamp: Date.now()
      });
      
      setChats(cachedChats);
      console.log("Conversas carregadas e armazenadas no cache:", cachedChats.length);
    } catch (error) {
      console.error("Erro ao carregar conversas:", error);
      toast.error("Erro ao carregar conversas", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsLoading(false);
      loadingRef.current.delete(cacheKey);
    }
  };

  // Carregar mensagens com cache
  const loadMessages = async (remoteJid: string, forceRefresh = false) => {
    if (!enabled || !instanceName) return;
    
    const cacheKey = getMessageCacheKey(instanceName, remoteJid);
    const cached = messagesCache.current.get(cacheKey);
    
    // Usar cache se válido e não forçar refresh
    if (!forceRefresh && cached && isCacheValid(cached.timestamp, MESSAGE_CACHE_DURATION)) {
      console.log("Usando mensagens do cache para:", remoteJid);
      setMessages(cached.data);
      setActiveChat(remoteJid);
      return;
    }

    // Evitar múltiplas requisições simultâneas
    if (loadingRef.current.has(cacheKey)) {
      console.log("Carregamento de mensagens já em andamento para:", remoteJid);
      return;
    }
    
    try {
      setIsLoading(true);
      loadingRef.current.add(cacheKey);
      
      console.log("Carregando mensagens da API:", instanceName, remoteJid);
      const messageData = await whatsappService.getEvolutionMessages(
        instanceName, 
        remoteJid
      );
      
      // Atualizar cache de mensagens
      messagesCache.current.set(cacheKey, {
        data: messageData,
        timestamp: Date.now()
      });
      
      setMessages(messageData);
      setActiveChat(remoteJid);
      console.log("Mensagens carregadas e armazenadas no cache:", messageData.length);
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
      toast.error("Erro ao carregar mensagens", {
        description: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      setIsLoading(false);
      loadingRef.current.delete(cacheKey);
    }
  };

  // Enviar mensagem e invalidar cache
  const sendMessage = async (remoteJid: string, message: string) => {
    if (!enabled || !instanceName) return;
    
    try {
      setIsSending(true);
      await whatsappService.sendEvolutionMessage(
        instanceName, 
        remoteJid, 
        message
      );
      
      // Invalidar cache de mensagens após envio
      const messageCacheKey = getMessageCacheKey(instanceName, remoteJid);
      messagesCache.current.delete(messageCacheKey);
      
      // Recarregar mensagens forçadamente
      await loadMessages(remoteJid, true);
      
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

  // Carregar conversas quando os parâmetros mudarem (apenas na primeira vez)
  useEffect(() => {
    if (enabled && instanceName) {
      loadChats();
    }
  }, [enabled, instanceName]);

  // Limpar cache quando não habilitado
  useEffect(() => {
    if (!enabled) {
      chatsCache.current.clear();
      messagesCache.current.clear();
      setChats([]);
      setMessages([]);
      setActiveChat(null);
    }
  }, [enabled]);

  return {
    chats,
    messages,
    activeChat,
    isLoading,
    isSending,
    loadChats,
    loadMessages,
    sendMessage,
    setActiveChat,
    refreshChats: () => loadChats(true),
    refreshMessages: (remoteJid: string) => loadMessages(remoteJid, true)
  };
};
