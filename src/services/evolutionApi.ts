
import { supabase } from "@/integrations/supabase/client";

export interface EvolutionInstance {
  instanceName: string;
  instanceId: string;
  status: "open" | "close" | "connecting";
  qrcode?: {
    base64: string;
    code: string;
  };
  serverUrl: string;
  apiKey: string;
}

export interface EvolutionMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: number;
  status: string;
  pushName: string;
}

export interface EvolutionContact {
  id: string;
  pushName: string;
  remoteJid: string;
  profilePictureUrl?: string;
}

class EvolutionApiService {
  private baseUrl: string = "";
  private apiKey: string = "";

  setCredentials(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = apiKey;
  }

  private getHeaders() {
    return {
      "Content-Type": "application/json",
      "apikey": this.apiKey,
    };
  }

  // Criar uma nova instância
  async createInstance(instanceName: string, webhookUrl?: string): Promise<EvolutionInstance> {
    const response = await fetch(`${this.baseUrl}/instance/create`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        instanceName,
        token: this.apiKey,
        qrcode: true,
        number: "",
        webhook: webhookUrl,
        webhook_by_events: false,
        events: [
          "APPLICATION_STARTUP",
          "QRCODE_UPDATED",
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "SEND_MESSAGE",
          "CONTACTS_UPDATE",
          "PRESENCE_UPDATE",
          "CHATS_UPDATE",
          "CONNECTION_UPDATE"
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao criar instância: ${errorText}`);
    }

    const data = await response.json();
    return {
      instanceName,
      instanceId: data.instance?.instanceId || instanceName,
      status: "close",
      serverUrl: this.baseUrl,
      apiKey: this.apiKey,
      ...data
    };
  }

  // Conectar instância (gerar QR code)
  async connectInstance(instanceName: string): Promise<{ qrcode?: { base64: string; code: string }; status: string }> {
    const response = await fetch(`${this.baseUrl}/instance/connect/${instanceName}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao conectar instância: ${errorText}`);
    }

    return await response.json();
  }

  // Obter status da instância
  async getInstanceStatus(instanceName: string): Promise<{ instance: { state: string; status: string } }> {
    const response = await fetch(`${this.baseUrl}/instance/connectionState/${instanceName}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao obter status da instância: ${errorText}`);
    }

    return await response.json();
  }

  // Obter QR code da instância
  async getQRCode(instanceName: string): Promise<{ qrcode: { base64: string; code: string } }> {
    const response = await fetch(`${this.baseUrl}/instance/qrcode/${instanceName}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao obter QR code: ${errorText}`);
    }

    return await response.json();
  }

  // Listar conversas
  async getChats(instanceName: string): Promise<EvolutionContact[]> {
    const response = await fetch(`${this.baseUrl}/chat/findChats/${instanceName}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao obter conversas: ${errorText}`);
    }

    return await response.json();
  }

  // Obter mensagens de uma conversa
  async getMessages(instanceName: string, remoteJid: string, limit: number = 50): Promise<EvolutionMessage[]> {
    const response = await fetch(`${this.baseUrl}/chat/findMessages/${instanceName}`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        where: {
          owner: remoteJid
        },
        limit
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao obter mensagens: ${errorText}`);
    }

    const data = await response.json();
    return data.messages || [];
  }

  // Enviar mensagem
  async sendMessage(instanceName: string, remoteJid: string, message: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        number: remoteJid,
        textMessage: {
          text: message
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao enviar mensagem: ${errorText}`);
    }

    return await response.json();
  }

  // Deletar instância
  async deleteInstance(instanceName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/instance/delete/${instanceName}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao deletar instância: ${errorText}`);
    }
  }

  // Logout da instância
  async logoutInstance(instanceName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/instance/logout/${instanceName}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao fazer logout da instância: ${errorText}`);
    }
  }
}

export const evolutionApi = new EvolutionApiService();
