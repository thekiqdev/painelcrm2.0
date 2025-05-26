
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
      console.log("Conversas retornadas da API:", chats);
      
      // Verificar se chats é válido e é um array
      if (!chats || !Array.isArray(chats)) {
        console.log("Nenhuma conversa válida retornada");
        return [];
      }
      
      // Filtrar chats inválidos e adicionar verificações de segurança
      return chats.filter(chat => chat && typeof chat === 'object' && chat.remoteJid).map(chat => {
        return {
          id: chat.id || chat.remoteJid || `chat_${Date.now()}_${Math.random()}`,
          remoteJid: chat.remoteJid,
          pushName: chat.pushName || chat.remoteJid,
          profilePictureUrl: chat.profilePictureUrl,
          unreadMessages: chat.unreadMessages || 0
        };
      });
    } catch (error) {
      console.error("Erro ao obter conversas Evolution:", error);
      throw error;
    }
  },

  getEvolutionMessages: async (instanceName: string, remoteJid: string, instanceApiKey?: string) => {
    try {
      console.log("Obtendo mensagens Evolution API:", instanceName, remoteJid);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.getMessages(instanceName, remoteJid, 50, instanceApiKey);
    } catch (error) {
      console.error("Erro ao obter mensagens Evolution:", error);
      throw error;
    }
  },

  sendEvolutionMessage: async (instanceName: string, remoteJid: string, message: string, instanceApiKey?: string) => {
    try {
      console.log("Enviando mensagem Evolution API:", instanceName, remoteJid);
      
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
