
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
  profilePictureUrl?: string;
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

  async getAllConfigs(): Promise<EvolutionApiConfig[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('Usuário não autenticado:', userError);
        return [];
      }

      const { data, error } = await supabase
        .from('evolution_api_configs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao buscar configurações:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Erro ao obter configurações:', error);
      return [];
    }
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

  async saveConfig(name: string, apiUrl: string, globalKey: string): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Usuário não autenticado');
      }

      // Desativar outras configurações se esta for a primeira
      const { data: existingConfigs } = await supabase
        .from('evolution_api_configs')
        .select('id')
        .eq('user_id', user.id);

      const isFirstConfig = !existingConfigs || existingConfigs.length === 0;

      const { error } = await supabase
        .from('evolution_api_configs')
        .insert({
          name,
          api_url: apiUrl,
          global_key: globalKey,
          user_id: user.id,
          is_active: isFirstConfig
        });

      if (error) {
        throw new Error(`Erro ao salvar configuração: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      throw error;
    }
  }

  async updateConfig(configId: string, updates: { name: string; api_url: string; global_key: string }): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Usuário não autenticado');
      }

      const { error } = await supabase
        .from('evolution_api_configs')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', configId)
        .eq('user_id', user.id);

      if (error) {
        throw new Error(`Erro ao atualizar configuração: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao atualizar configuração:', error);
      throw error;
    }
  }

  async setActiveConfig(configId: string): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Usuário não autenticado');
      }

      // Desativar todas as configurações do usuário
      await supabase
        .from('evolution_api_configs')
        .update({ is_active: false })
        .eq('user_id', user.id);

      // Ativar a configuração selecionada
      const { error } = await supabase
        .from('evolution_api_configs')
        .update({ is_active: true })
        .eq('id', configId)
        .eq('user_id', user.id);

      if (error) {
        throw new Error(`Erro ao ativar configuração: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao ativar configuração:', error);
      throw error;
    }
  }

  async deleteConfig(configId: string): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Usuário não autenticado');
      }

      const { error } = await supabase
        .from('evolution_api_configs')
        .delete()
        .eq('id', configId)
        .eq('user_id', user.id);

      if (error) {
        throw new Error(`Erro ao excluir configuração: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao excluir configuração:', error);
      throw error;
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

  async connectInstance(instanceName: string): Promise<EvolutionQRResponse> {
    console.log(`Conectando instância para obter QR code: ${instanceName}`);
    
    try {
      const response = await this.makeRequest(`/instance/connect/${instanceName}`, {
        method: 'GET',
      });

      console.log('Resposta do connect:', response);
      
      // A Evolution API pode retornar o QR code diretamente no connect
      if (response && response.base64) {
        return {
          qrcode: {
            base64: response.base64,
            code: response.code || ''
          }
        };
      }
      
      // Ou pode retornar na estrutura padrão
      if (response && response.qrcode && response.qrcode.base64) {
        return response;
      }
      
      // Se não retornou QR code, tentar endpoint específico
      console.log('QR code não encontrado no connect, tentando endpoint específico...');
      return await this.getQRCodeDirect(instanceName);
      
    } catch (error) {
      console.error('Erro ao conectar instância:', error);
      throw error;
    }
  }

  async getQRCodeDirect(instanceName: string): Promise<EvolutionQRResponse> {
    console.log(`Obtendo QR code diretamente para instância: ${instanceName}`);
    
    try {
      // Tentar múltiplos endpoints possíveis para QR code
      const endpoints = [
        `/instance/qrcode/${instanceName}`,
        `/instance/${instanceName}/qrcode`,
        `/qrcode/${instanceName}`
      ];
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Tentando endpoint: ${endpoint}`);
          const response = await this.makeRequest(endpoint);
          
          console.log('Resposta do QR code:', response);
          
          // Verificar diferentes formatos de resposta
          if (response && response.base64) {
            return {
              qrcode: {
                base64: response.base64,
                code: response.code || ''
              }
            };
          }
          
          if (response && response.qrcode && response.qrcode.base64) {
            return response;
          }
          
          if (response && response.qr && response.qr.base64) {
            return {
              qrcode: {
                base64: response.qr.base64,
                code: response.qr.code || ''
              }
            };
          }
          
        } catch (endpointError) {
          console.log(`Endpoint ${endpoint} falhou:`, endpointError);
          continue; // Tentar próximo endpoint
        }
      }
      
      throw new Error('Nenhum endpoint de QR code funcionou');
      
    } catch (error) {
      console.error('Erro ao obter QR code:', error);
      throw error;
    }
  }

  async getQRCode(instanceName: string): Promise<EvolutionQRResponse> {
    console.log(`Obtendo QR code para instância: ${instanceName}`);
    
    try {
      // Primeiro tentar conectar a instância
      const connectResult = await this.connectInstance(instanceName);
      
      if (connectResult && connectResult.qrcode && connectResult.qrcode.base64) {
        console.log('QR code obtido via connect');
        return connectResult;
      }
      
      // Se connect não retornou QR code, tentar endpoints diretos
      return await this.getQRCodeDirect(instanceName);
      
    } catch (error) {
      console.error('Erro ao obter QR code:', error);
      throw error;
    }
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
