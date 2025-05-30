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
  apikey?: string;
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
  unreadCount?: number;
  profilePictureUrl?: string;
  profilePicUrl?: string;
}

export interface EvolutionChat {
  chat: {
    id: string;
    conversationTimestamp: number;
    unreadCount: number;
  };
}

export class EvolutionApi {
  private apiUrl: string = '';
  private globalKey: string = '';
  private instanceApiKey: string = '';

  setCredentials(apiUrl: string, globalKey: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.globalKey = globalKey;
  }

  setInstanceApiKey(apiKey: string) {
    this.instanceApiKey = apiKey;
  }

  private getHeaders(useInstanceKey: boolean = false) {
    return {
      'Content-Type': 'application/json',
      'apikey': useInstanceKey ? this.instanceApiKey : this.globalKey,
    };
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}, useInstanceKey: boolean = false) {
    const url = `${this.apiUrl}${endpoint}`;
    console.log(`Fazendo requisição para: ${url}`);
    console.log(`Usando ${useInstanceKey ? 'instance apikey' : 'global key'}`);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(useInstanceKey),
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

      await supabase
        .from('evolution_api_configs')
        .update({ is_active: false })
        .eq('user_id', user.id);

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

  async getAllInstances(): Promise<EvolutionInstance[]> {
    console.log('Obtendo todas as instâncias disponíveis');
    
    try {
      const response = await this.makeRequest('/instance/fetchInstances', {
        method: 'GET',
      });

      console.log('Instâncias encontradas:', response);
      
      if (Array.isArray(response)) {
        return response.map((instance: any) => ({
          instanceName: instance.instance?.instanceName || instance.instanceName,
          phone: instance.instance?.phone || instance.phone,
          status: instance.instance?.state || instance.state,
          apikey: instance.apikey || instance.instance?.apikey
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Erro ao obter instâncias:', error);
      return [];
    }
  }

  async createInstance(instanceName: string, phoneNumber?: string): Promise<EvolutionInstance & { qrcode?: string }> {
    const sanitizedNumber = phoneNumber ? phoneNumber.replace(/[^\d]/g, '') : undefined;
    
    const payload: any = {
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS"
    };

    if (sanitizedNumber) {
      payload.number = sanitizedNumber;
    }

    console.log('Criando instância com payload:', payload);
    
    try {
      const response = await this.makeRequest('/instance/create', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      console.log('Instância criada com sucesso:', response);
      
      let qrCodeData = null;
      if (response.qrcode) {
        if (response.qrcode.base64) {
          qrCodeData = response.qrcode.base64.replace('data:image/png;base64,', '');
        } else if (typeof response.qrcode === 'string') {
          qrCodeData = response.qrcode.replace('data:image/png;base64,', '');
        }
      }
      
      return {
        instanceName,
        qrcode: qrCodeData
      };
    } catch (error) {
      console.error('Erro ao criar instância:', error);
      
      if (error instanceof Error && (
        error.message.includes('already exists') || 
        error.message.includes('já existe') ||
        error.message.includes('409')
      )) {
        console.log('Instância já existe, tentando obter QR code...');
        try {
          const qrResult = await this.connectInstance(instanceName);
          return {
            instanceName,
            qrcode: qrResult.qrcode?.base64
          };
        } catch (connectError) {
          console.error('Erro ao conectar instância existente:', connectError);
          return { instanceName };
        }
      }
      
      throw error;
    }
  }

  async getQRCode(instanceName: string): Promise<EvolutionQRResponse> {
    console.log(`Obtendo QR code para instância: ${instanceName}`);
    
    try {
      const response = await this.makeRequest(`/instance/qrcode/${instanceName}`, {
        method: 'GET',
      });

      console.log('Resposta do QR code:', response);
      
      if (response && response.base64) {
        return {
          qrcode: {
            base64: response.base64.replace('data:image/png;base64,', ''),
            code: response.code || ''
          }
        };
      }
      
      throw new Error('QR code não encontrado na resposta da API');
      
    } catch (error) {
      console.error('Erro ao obter QR code via endpoint específico:', error);
      
      console.log('Tentando obter QR code via connect...');
      try {
        return await this.connectInstance(instanceName);
      } catch (connectError) {
        console.error('Erro ao conectar instância:', connectError);
        throw error;
      }
    }
  }

  async connectInstance(instanceName: string): Promise<EvolutionQRResponse> {
    console.log(`Conectando instância: ${instanceName}`);
    
    try {
      const response = await this.makeRequest(`/instance/connect/${instanceName}`, {
        method: 'GET',
      });

      console.log('Resposta do connect:', response);
      
      if (response && response.qrcode) {
        if (response.qrcode.base64) {
          return {
            qrcode: {
              base64: response.qrcode.base64.replace('data:image/png;base64,', ''),
              code: response.qrcode.code || ''
            }
          };
        } else if (typeof response.qrcode === 'string') {
          return {
            qrcode: {
              base64: response.qrcode.replace('data:image/png;base64,', ''),
              code: response.code || ''
            }
          };
        }
      }
      
      if (response && response.base64) {
        return {
          qrcode: {
            base64: response.base64.replace('data:image/png;base64,', ''),
            code: response.code || ''
          }
        };
      }
      
      throw new Error('QR code não encontrado na resposta do connect');
      
    } catch (error) {
      console.error('Erro ao conectar instância:', error);
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

  async getChats(instanceName: string, instanceApiKey?: string): Promise<EvolutionContact[]> {
    console.log(`Obtendo conversas para instância: ${instanceName}`);
    
    const cleanInstanceName = instanceName.replace(/"/g, '');
    
    if (instanceApiKey) {
      this.setInstanceApiKey(instanceApiKey);
    }
    
    try {
      const response = await this.makeRequest(`/chat/findChats/${cleanInstanceName}`, {
        method: 'POST',
        body: JSON.stringify({})
      }, !!instanceApiKey);
      
      console.log('Resposta raw do findChats:', response);
      
      // Verificar se response é válido
      if (!response) {
        console.log('Resposta vazia da API');
        return [];
      }
      
      // Se é um array diretamente
      if (Array.isArray(response)) {
        return response
          .filter(item => {
            if (!item || typeof item !== 'object') {
              console.warn('Item inválido encontrado:', item);
              return false;
            }
            return true;
          })
          .map((item, index) => {
            // Verificar se tem a estrutura esperada da Evolution API
            const chatData = item.chat || item;
            
            // O remoteJid pode vir em diferentes propriedades dependendo da versão da API
            let remoteJid = chatData.id || item.id || item.remoteJid;
            
            // Se não tem formato @s.whatsapp.net ou @g.us, pode ser que precise ser construído
            if (remoteJid && !remoteJid.includes('@')) {
              // Para números individuais, adicionar @s.whatsapp.net
              if (/^\d+$/.test(remoteJid)) {
                remoteJid = `${remoteJid}@s.whatsapp.net`;
              }
            }
            
            console.log("Mapeando chat item:", {
              original: item,
              chatData,
              finalRemoteJid: remoteJid
            });
            
            return {
              id: chatData.id || item.id || remoteJid || `chat_${index}_${Date.now()}`,
              remoteJid: remoteJid || `unknown_${index}`,
              pushName: item.pushName || chatData.pushName || item.name || '',
              unreadMessages: chatData.unreadCount || item.unreadCount || 0,
              profilePictureUrl: item.profilePicUrl || item.profilePictureUrl
            };
          });
      }
      
      console.log('Formato de resposta inesperado:', response);
      return [];
      
    } catch (error) {
      console.error('Erro ao obter chats:', error);
      throw error;
    }
  }

  async getMessages(instanceName: string, remoteJid: string, limit: number = 10, instanceApiKey?: string): Promise<EvolutionMessage[]> {
    console.log(`Obtendo mensagens para ${remoteJid} na instância: ${instanceName}`);
    
    const cleanInstanceName = instanceName.replace(/"/g, '');
    
    if (instanceApiKey) {
      this.setInstanceApiKey(instanceApiKey);
    }
    
    // Garantir que o remoteJid está no formato correto
    let cleanRemoteJid = remoteJid;
    if (!cleanRemoteJid.includes('@') && /^\d+$/.test(cleanRemoteJid)) {
      cleanRemoteJid = `${cleanRemoteJid}@s.whatsapp.net`;
    }
    
    console.log("RemoteJid processado:", {
      original: remoteJid,
      processed: cleanRemoteJid
    });
    
    const payload = {
      where: {
        key: {
          remoteJid: cleanRemoteJid
        }
      },
      page: 1,
      offset: limit
    };
    
    try {
      const response = await this.makeRequest(`/chat/findMessages/${cleanInstanceName}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      }, !!instanceApiKey);
      
      console.log("Resposta de mensagens:", {
        type: typeof response,
        isArray: Array.isArray(response),
        keys: response ? Object.keys(response) : [],
        sample: response
      });
      
      if (Array.isArray(response)) {
        return response;
      } else if (response.messages && response.messages.records && Array.isArray(response.messages.records)) {
        return response.messages.records;
      } else if (response.messages && Array.isArray(response.messages)) {
        return response.messages;
      } else if (response.data && Array.isArray(response.data)) {
        return response.data;
      }
      
      console.log('Formato de resposta inesperado para mensagens:', response);
      return [];
      
    } catch (error) {
      console.error('Erro ao obter mensagens:', error);
      throw error;
    }
  }

  async sendMessage(instanceName: string, remoteJid: string, message: string, instanceApiKey?: string): Promise<any> {
    console.log(`Enviando mensagem para ${remoteJid} na instância: ${instanceName}`);
    
    const cleanInstanceName = instanceName.replace(/"/g, '');
    
    if (instanceApiKey) {
      this.setInstanceApiKey(instanceApiKey);
    }
    
    // Garantir que o remoteJid está no formato correto para envio
    let cleanRemoteJid = remoteJid;
    if (!cleanRemoteJid.includes('@') && /^\d+$/.test(cleanRemoteJid)) {
      cleanRemoteJid = `${cleanRemoteJid}@s.whatsapp.net`;
    }
    
    const payload = {
      number: cleanRemoteJid,
      text: message
    };

    console.log("Payload de envio:", payload);

    return await this.makeRequest(`/message/sendText/${cleanInstanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, !!instanceApiKey);
  }
}

export const evolutionApi = new EvolutionApi();
