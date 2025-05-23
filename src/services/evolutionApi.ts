
import { supabase } from '@/integrations/supabase/client';

export interface EvolutionApiConfig {
  id: string;
  name: string;
  api_url: string;
  global_key: string;
  is_active: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface EvolutionInstance {
  instanceName: string;
  phone?: string;
  status?: string;
}

export interface EvolutionQRResponse {
  qrcode?: {
    base64: string;
    code: string;
  };
  pairingCode?: string;
}

export interface EvolutionInstanceStatus {
  instance: {
    instanceName: string;
    state: string;
    status: string;
  };
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
  pushName?: string;
}

export interface EvolutionContact {
  id: string;
  pushName?: string;
  remoteJid: string;
  unreadMessages?: number;
}

class EvolutionApi {
  private apiUrl: string = '';
  private globalKey: string = '';

  setCredentials(apiUrl: string, globalKey: string) {
    this.apiUrl = apiUrl.replace(/\/$/, ''); // Remove trailing slash
    this.globalKey = globalKey;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.globalKey,
    };
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.apiUrl}${endpoint}`;
    console.log(`Fazendo requisição para: ${url}`);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    console.log(`Status da resposta: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro na requisição: ${response.status} - ${errorText}`);
      throw new Error(`Erro na API: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Resposta da API:', data);
    return data;
  }

  async getActiveConfig(): Promise<EvolutionApiConfig | null> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('Usuário não autenticado:', userError);
        return null;
      }

      const { data, error } = await supabase
        .from('evolution_api_configs')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Erro ao buscar configuração ativa:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Erro ao obter configuração ativa:', error);
      return null;
    }
  }

  async createInstance(instanceName: string, phoneNumber?: string): Promise<EvolutionInstance> {
    const payload: any = {
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS"
    };

    if (phoneNumber) {
      payload.number = phoneNumber;
    }

    console.log('Criando instância com payload:', payload);
    
    try {
      const response = await this.makeRequest('/instance/create', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      console.log('Instância criada com sucesso:', response);
      return response;
    } catch (error) {
      console.error('Erro ao criar instância:', error);
      
      // Se o erro for de instância já existente, não considerar como erro crítico
      if (error instanceof Error && (
        error.message.includes('already exists') || 
        error.message.includes('já existe') ||
        error.message.includes('409')
      )) {
        console.log('Instância já existe, retornando dados básicos');
        return { instanceName };
      }
      
      throw error;
    }
  }

  async getQRCode(instanceName: string): Promise<EvolutionQRResponse> {
    console.log(`Obtendo QR code para instância: ${instanceName}`);
    
    try {
      const response = await this.makeRequest(`/instance/connect/${instanceName}`);
      
      // Validar se a resposta contém QR code
      if (response && response.qrcode && response.qrcode.base64) {
        console.log('QR code obtido com sucesso');
        return response;
      } else {
        console.log('Resposta não contém QR code válido:', response);
        throw new Error('QR code não encontrado na resposta');
      }
    } catch (error) {
      console.error('Erro ao obter QR code:', error);
      
      // Se for erro 404, a instância pode não existir
      if (error instanceof Error && error.message.includes('404')) {
        throw new Error('Instância não encontrada. Crie a instância primeiro.');
      }
      
      throw error;
    }
  }

  async connectInstance(instanceName: string): Promise<EvolutionQRResponse> {
    console.log(`Conectando instância: ${instanceName}`);
    
    return await this.makeRequest(`/instance/connect/${instanceName}`, {
      method: 'GET',
    });
  }

  async getInstanceStatus(instanceName: string): Promise<EvolutionInstanceStatus> {
    console.log(`Verificando status da instância: ${instanceName}`);
    
    return await this.makeRequest(`/instance/connectionState/${instanceName}`);
  }

  async deleteInstance(instanceName: string): Promise<any> {
    console.log(`Deletando instância: ${instanceName}`);
    
    return await this.makeRequest(`/instance/delete/${instanceName}`, {
      method: 'DELETE',
    });
  }

  async getChats(instanceName: string): Promise<EvolutionContact[]> {
    console.log(`Obtendo conversas para instância: ${instanceName}`);
    
    const response = await this.makeRequest(`/chat/findChats/${instanceName}`);
    return response || [];
  }

  async getMessages(instanceName: string, remoteJid: string, limit: number = 20): Promise<EvolutionMessage[]> {
    console.log(`Obtendo mensagens para ${remoteJid} na instância: ${instanceName}`);
    
    const response = await this.makeRequest(`/chat/findMessages/${instanceName}?remoteJid=${encodeURIComponent(remoteJid)}&limit=${limit}`);
    return response || [];
  }

  async sendMessage(instanceName: string, remoteJid: string, message: string): Promise<any> {
    console.log(`Enviando mensagem para ${remoteJid} na instância: ${instanceName}`);
    
    const payload = {
      number: remoteJid,
      text: message
    };

    return await this.makeRequest(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export const evolutionApi = new EvolutionApi();
