
import { evolutionApi } from "../evolutionApi";
import { evolutionConnectionService } from "./evolutionConnectionService";

export const evolutionChatService = {
  getEvolutionChats: async (instanceName?: string) => {
    try {
      let targetInstanceName = instanceName;
      
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
      
      // Usar o novo método findChats
      const chats = await evolutionApi.findChats(targetInstanceName);
      console.log("Conversas retornadas da API (findChats):", chats);
      
      if (!chats || !Array.isArray(chats)) {
        console.log("Nenhuma conversa válida retornada");
        return [];
      }
      
      return chats
        .filter(chat => {
          if (!chat || typeof chat !== 'object') {
            console.warn("Chat inválido encontrado:", chat);
            return false;
          }
          
          const remoteJid = chat.remoteJid || chat.id;
          if (!remoteJid) {
            console.warn("Chat sem remoteJid encontrado:", chat);
            return false;
          }
          
          return true;
        })
        .map((chat, index) => {
          const remoteJid = chat.remoteJid || chat.id;
          const chatId = chat.id || remoteJid || `chat_${Date.now()}_${index}`;
          
          return {
            id: chatId,
            remoteJid: remoteJid,
            pushName: chat.pushName || remoteJid,
            profilePictureUrl: chat.profilePictureUrl || chat.profilePicUrl,
            unreadMessages: chat.unreadMessages || chat.unreadCount || 0
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
      
      // Usar o novo método findMessages
      const messages = await evolutionApi.findMessages(instanceName, {
        remoteJid,
        limit: 50
      }, instanceApiKey);
      
      console.log("Mensagens retornadas da API (findMessages):", {
        count: Array.isArray(messages) ? messages.length : 0,
        firstMessage: Array.isArray(messages) && messages.length > 0 ? messages[0] : null
      });
      
      if (!messages || !Array.isArray(messages)) {
        console.log("Nenhuma mensagem válida retornada");
        return [];
      }
      
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
  },

  // Novos métodos do módulo Chat
  readMessages: async (instanceName: string, remoteJid: string, instanceApiKey?: string) => {
    try {
      console.log("Marcando mensagens como lidas:", { instanceName, remoteJid });
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.readMessages(instanceName, { remoteJid }, instanceApiKey);
    } catch (error) {
      console.error("Erro ao marcar mensagens como lidas:", error);
      throw error;
    }
  },

  markMessageAsUnread: async (instanceName: string, remoteJid: string, instanceApiKey?: string) => {
    try {
      console.log("Marcando mensagens como não lidas:", { instanceName, remoteJid });
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.markMessageAsUnread(instanceName, { remoteJid }, instanceApiKey);
    } catch (error) {
      console.error("Erro ao marcar mensagens como não lidas:", error);
      throw error;
    }
  },

  updateMessage: async (instanceName: string, remoteJid: string, messageId: string, newContent: string, instanceApiKey?: string) => {
    try {
      console.log("Atualizando mensagem:", { instanceName, remoteJid, messageId });
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.updateMessage(instanceName, {
        remoteJid,
        messageId,
        newContent
      }, instanceApiKey);
    } catch (error) {
      console.error("Erro ao atualizar mensagem:", error);
      throw error;
    }
  },

  archiveChat: async (instanceName: string, remoteJid: string, archive: boolean = true, instanceApiKey?: string) => {
    try {
      console.log(`${archive ? 'Arquivando' : 'Desarquivando'} conversa:`, { instanceName, remoteJid });
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.archiveChat(instanceName, {
        remoteJid,
        archive
      }, instanceApiKey);
    } catch (error) {
      console.error("Erro ao arquivar/desarquivar conversa:", error);
      throw error;
    }
  },

  checkIsWhatsApp: async (instanceName: string, number: string, instanceApiKey?: string) => {
    try {
      console.log("Verificando se é WhatsApp:", { instanceName, number });
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.checkIsWhatsApp(instanceName, { number }, instanceApiKey);
    } catch (error) {
      console.error("Erro ao verificar se é WhatsApp:", error);
      throw error;
    }
  },

  findContacts: async (instanceName: string, instanceApiKey?: string) => {
    try {
      console.log("Buscando contatos:", { instanceName });
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.findContacts(instanceName, instanceApiKey);
    } catch (error) {
      console.error("Erro ao buscar contatos:", error);
      throw error;
    }
  },

  fetchProfilePictureUrl: async (instanceName: string, remoteJid: string, instanceApiKey?: string) => {
    try {
      console.log("Buscando foto de perfil:", { instanceName, remoteJid });
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.fetchProfilePictureUrl(instanceName, { remoteJid }, instanceApiKey);
    } catch (error) {
      console.error("Erro ao buscar foto de perfil:", error);
      throw error;
    }
  }
};
