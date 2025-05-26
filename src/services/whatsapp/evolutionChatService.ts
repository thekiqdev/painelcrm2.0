
import { evolutionApi } from "../evolutionApi";
import { evolutionConnectionService } from "./evolutionConnectionService";

export const evolutionChatService = {
  getEvolutionChats: async (instanceName?: string) => {
    try {
      let targetInstanceName = instanceName;
      
      // Se não foi fornecido instanceName, buscar no banco
      if (!targetInstanceName) {
        const activeConnection = await evolutionConnectionService.findActiveConnection();
        if (!activeConnection?.instanceName) {
          throw new Error("Nenhuma conexão ativa encontrada");
        }
        targetInstanceName = activeConnection.instanceName;
      }
      
      console.log("Obtendo conversas Evolution API:", targetInstanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      const chats = await evolutionApi.getChats(targetInstanceName);
      console.log("Conversas retornadas da API (raw):", chats);
      
      // Verificar se chats é válido e é um array
      if (!chats || !Array.isArray(chats)) {
        console.log("Nenhuma conversa válida retornada");
        return [];
      }
      
      // Filtrar chats inválidos e adicionar verificações de segurança
      return chats
        .filter(chat => {
          // Verificar se o chat existe e tem as propriedades necessárias
          if (!chat || typeof chat !== 'object') {
            console.warn("Chat inválido encontrado:", chat);
            return false;
          }
          
          // Verificar se tem remoteJid (essencial para um chat)
          const remoteJid = chat.remoteJid || chat.id || (chat.chat && chat.chat.id);
          if (!remoteJid) {
            console.warn("Chat sem remoteJid encontrado:", chat);
            return false;
          }
          
          return true;
        })
        .map((chat, index) => {
          // Extrair remoteJid corretamente de diferentes formatos possíveis
          const remoteJid = chat.remoteJid || chat.id || (chat.chat && chat.chat.id);
          
          console.log("Processando chat:", {
            original: chat,
            extractedRemoteJid: remoteJid
          });
          
          // Gerar um ID único se não existir
          const chatId = chat.id || remoteJid || `chat_${Date.now()}_${index}`;
          
          return {
            id: chatId,
            remoteJid: remoteJid,
            pushName: chat.pushName || chat.name || remoteJid,
            profilePictureUrl: chat.profilePictureUrl || chat.profilePicUrl,
            unreadMessages: chat.unreadMessages || chat.unreadCount || (chat.chat && chat.chat.unreadCount) || 0
          };
        });
    } catch (error) {
      console.error("Erro ao obter conversas Evolution:", error);
      throw error;
    }
  },

  getEvolutionMessages: async (instanceName: string, remoteJid: string, instanceApiKey?: string) => {
    try {
      console.log("Obtendo mensagens Evolution API:", {
        instanceName,
        remoteJid,
        hasApiKey: !!instanceApiKey
      });
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      const messages = await evolutionApi.getMessages(instanceName, remoteJid, 50, instanceApiKey);
      
      console.log("Mensagens retornadas da API:", {
        count: Array.isArray(messages) ? messages.length : 0,
        firstMessage: Array.isArray(messages) && messages.length > 0 ? messages[0] : null
      });
      
      // Verificar se messages é válido e é um array
      if (!messages || !Array.isArray(messages)) {
        console.log("Nenhuma mensagem válida retornada");
        return [];
      }
      
      // Filtrar mensagens inválidas
      return messages.filter(message => {
        if (!message || typeof message !== 'object') {
          console.warn("Mensagem inválida encontrada:", message);
          return false;
        }
        
        if (!message.key || !message.key.id) {
          console.warn("Mensagem sem key.id encontrada:", message);
          return false;
        }
        
        return true;
      });
    } catch (error) {
      console.error("Erro ao obter mensagens Evolution:", error);
      throw error;
    }
  },

  sendEvolutionMessage: async (instanceName: string, remoteJid: string, message: string, instanceApiKey?: string) => {
    try {
      console.log("Enviando mensagem Evolution API:", {
        instanceName,
        remoteJid,
        message: message.substring(0, 50) + (message.length > 50 ? '...' : '')
      });
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.sendMessage(instanceName, remoteJid, message, instanceApiKey);
    } catch (error) {
      console.error("Erro ao enviar mensagem Evolution:", error);
      throw error;
    }
  }
};
