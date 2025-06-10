
export interface Config {
  id: string;
  name: string;
  api_url: string;
  global_key: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EvolutionApiConfig {
  id: string;
  name: string;
  api_url: string;
  global_key: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EvolutionContact {
  id: string;
  remoteJid: string;
  pushName?: string;
  profilePictureUrl?: string;
  profilePicUrl?: string;
  unreadMessages?: number;
  unreadCount?: number;
}

export interface EvolutionMessage {
  key: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text?: string;
    };
  };
  messageTimestamp: number;
}

export interface InstanceStatus {
  instance: {
    state: string;
  };
}
