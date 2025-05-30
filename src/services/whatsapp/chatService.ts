
import { evolutionApi } from "../evolutionApi";

export const chatService = {
  getEvolutionChats: async (instanceName: string) => {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      return await evolutionApi.findChats(instanceName);
    } catch (error) {
      console.error("Erro ao obter conversas Evolution:", error);
      throw error;
    }
  },

  getEvolutionMessages: async (instanceName: string, remoteJid: string) => {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      return await evolutionApi.findMessages(instanceName, { remoteJid });
    } catch (error) {
      console.error("Erro ao obter mensagens Evolution:", error);
      throw error;
    }
  },

  sendEvolutionMessage: async (instanceName: string, remoteJid: string, message: string) => {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      return await evolutionApi.sendMessage(instanceName, remoteJid, message);
    } catch (error) {
      console.error("Erro ao enviar mensagem Evolution:", error);
      throw error;
    }
  },

  // Novos métodos do módulo Chat
  readMessages: async (instanceName: string, remoteJid: string, instanceApiKey?: string) => {
    try {
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
