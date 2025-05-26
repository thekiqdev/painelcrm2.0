
import { connectionService } from "./whatsapp/connectionService";
import { evolutionService } from "./whatsapp/evolutionService";
import { chatService } from "./whatsapp/chatService";

export const whatsappService = {
  // Métodos de conexão básica
  ...connectionService,
  
  // Métodos Evolution API
  ...evolutionService,
  
  // Métodos de chat
  ...chatService,
  
  // Novos métodos do módulo Chat
  readMessages: chatService.readMessages || evolutionService.readMessages,
  markMessageAsUnread: chatService.markMessageAsUnread || evolutionService.markMessageAsUnread,
  updateMessage: chatService.updateMessage || evolutionService.updateMessage,
  archiveChat: chatService.archiveChat || evolutionService.archiveChat,
  checkIsWhatsApp: chatService.checkIsWhatsApp || evolutionService.checkIsWhatsApp,
  findContacts: chatService.findContacts || evolutionService.findContacts,
  fetchProfilePictureUrl: chatService.fetchProfilePictureUrl || evolutionService.fetchProfilePictureUrl
};
