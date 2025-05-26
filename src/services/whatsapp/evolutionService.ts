
import { evolutionInstanceService } from "./evolutionInstanceService";
import { evolutionQRService } from "./evolutionQRService";
import { evolutionConnectionService } from "./evolutionConnectionService";
import { evolutionChatService } from "./evolutionChatService";

export const evolutionService = {
  // Instance management
  ...evolutionInstanceService,
  
  // QR Code operations
  ...evolutionQRService,
  
  // Connection management
  ...evolutionConnectionService,
  
  // Chat operations
  ...evolutionChatService
};
