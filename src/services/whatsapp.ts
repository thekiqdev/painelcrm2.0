
import { connectionService } from "./whatsapp/connectionService";
import { evolutionService } from "./whatsapp/evolutionService";
import { chatService } from "./whatsapp/chatService";

export const whatsappService = {
  // Métodos de conexão básica
  ...connectionService,
  
  // Métodos Evolution API
  ...evolutionService,
  
  // Métodos de chat
  ...chatService
};
