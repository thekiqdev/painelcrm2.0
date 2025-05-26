import { supabase } from '@/integrations/supabase/client';

export interface EvolutionServerConfig {
  id: string;
  name: string;
  server_url: string;
  api_key: string;
  is_active: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}

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
  private apiKey: string = '';

  setCredentials(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.apiKey,
    };
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.apiUrl}${endpoint}`;
    console.log(`[Evolution API] Fazendo requisição para: ${url}`);
    console.log(`[Evolution API] Headers:`, this.getHeaders());
    console.log(`[Evolution API] Payload:`, options.body);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    console.log(`[Evolution API] Status da resposta: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Evolution API] Erro na requisição: ${response.status} - ${errorText}`);
      throw new Error(`Erro na API: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[Evolution API] Resposta da API:', data);
    return data;
  }

  private getWebhookUrl(instanceName: string): string {
    const projectUrl = 'https://meoatixglqaxnzzovuez.supabase.co';
    return `${projectUrl}/functions/v1/evolution-webhook/${instanceName}`;
  }

  // Métodos para gerenciar servidores Evolution
  async getAllServers(): Promise<EvolutionServerConfig[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('Usuário não autenticado:', userError);
        return [];
      }

      const { data, error } = await supabase
        .from('evolution_servers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao buscar servidores:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Erro ao obter servidores:', error);
      return [];
    }
  }

  async getActiveServer(): Promise<EvolutionServerConfig | null> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('Usuário não autenticado:', userError);
        return null;
      }

      const { data, error } = await supabase
        .from('evolution_servers')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Erro ao buscar servidor ativo:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Erro ao obter servidor ativo:', error);
      return null;
    }
  }

  async saveServer(name: string, serverUrl: string, apiKey: string): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Usuário não autenticado');
      }

      // Verificar se é o primeiro servidor
      const { data: existingServers } = await supabase
        .from('evolution_servers')
        .select('id')
        .eq('user_id', user.id);

      const isFirstServer = !existingServers || existingServers.length === 0;

      const { error } = await supabase
        .from('evolution_servers')
        .insert({
          name,
          server_url: serverUrl,
          api_key: apiKey,
          user_id: user.id,
          is_active: isFirstServer
        });

      if (error) {
        throw new Error(`Erro ao salvar servidor: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao salvar servidor:', error);
      throw error;
    }
  }

  async setActiveServer(serverId: string): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Usuário não autenticado');
      }

      // Desativar todos os servidores do usuário
      await supabase
        .from('evolution_servers')
        .update({ is_active: false })
        .eq('user_id', user.id);

      // Ativar o servidor selecionado
      const { error } = await supabase
        .from('evolution_servers')
        .update({ is_active: true })
        .eq('id', serverId)
        .eq('user_id', user.id);

      if (error) {
        throw new Error(`Erro ao ativar servidor: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao ativar servidor:', error);
      throw error;
    }
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
    const webhookUrl = this.getWebhookUrl(instanceName);
    
    // Payload exato conforme a documentação da API fornecida
    const payload: any = {
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: webhookUrl,
      webhook_by_events: true,
      events: [
        "APPLICATION_STARTUP"
      ],
      reject_call: true,
      groups_ignore: true,
      always_online: true,
      read_messages: true,
      read_status: true,
      websocket_enabled: true,
      websocket_events: [
        "APPLICATION_STARTUP"
      ],
      rabbitmq_enabled: true,
      rabbitmq_events: [
        "APPLICATION_STARTUP"
      ],
      sqs_enabled: true,
      sqs_events: [
        "APPLICATION_STARTUP"
      ],
      typebot_listening_from_me: true
    };

    // Adicionar número se fornecido (apenas números)
    if (phoneNumber && phoneNumber.trim()) {
      payload.number = phoneNumber.replace(/\D/g, '');
    }

    console.log('[Evolution API] Criando instância com payload:', JSON.stringify(payload, null, 2));
    
    try {
      const response = await this.makeRequest('/instance/create', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      console.log('[Evolution API] Instância criada com sucesso:', response);
      return {
        instanceName,
        ...response
      };
    } catch (error) {
      console.error('[Evolution API] Erro ao criar instância:', error);
      
      // Se o erro for de instância já existente, tentar buscar informações da instância
      if (error instanceof Error && (
        error.message.includes('already exists') || 
        error.message.includes('já existe') ||
        error.message.includes('409')
      )) {
        console.log('[Evolution API] Instância já existe, verificando status...');
        try {
          const status = await this.getInstanceStatus(instanceName);
          return { 
            instanceName,
            status: status.instance.state 
          };
        } catch (statusError) {
          console.error('[Evolution API] Erro ao verificar status da instância existente:', statusError);
        }
        return { instanceName };
      }
      
      throw error;
    }
  }

  async connectInstance(instanceName: string): Promise<EvolutionQRResponse> {
    console.log(`[Evolution API] Conectando instância: ${instanceName}`);
    
    try {
      const response = await this.makeRequest(`/instance/connect/${instanceName}`, {
        method: 'GET',
      });

      console.log('[Evolution API] Resposta do connect:', response);
      return response;
      
    } catch (error) {
      console.error('[Evolution API] Erro ao conectar instância:', error);
      throw error;
    }
  }

  async getQRCode(instanceName: string): Promise<EvolutionQRResponse> {
    console.log(`[Evolution API] Obtendo QR code para instância: ${instanceName}`);
    
    try {
      // Primeiro verificar se a instância existe
      let instanceExists = false;
      try {
        await this.getInstanceStatus(instanceName);
        instanceExists = true;
        console.log('[Evolution API] Instância existe, prosseguindo...');
      } catch (statusError) {
        console.log('[Evolution API] Instância não existe, tentando criar...');
        
        // Se instância não existe, tentar criar
        try {
          await this.createInstance(instanceName);
          instanceExists = true;
          console.log('[Evolution API] Instância criada, aguardando inicialização...');
          // Aguardar um pouco para a instância inicializar
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (createError) {
          console.error('[Evolution API] Erro ao criar instância:', createError);
          throw new Error('Não foi possível criar a instância. Verifique a configuração da Evolution API.');
        }
      }

      if (!instanceExists) {
        throw new Error('Instância não pode ser criada ou acessada');
      }

      // Tentar conectar para gerar QR code
      try {
        const connectResponse = await this.connectInstance(instanceName);
        if (connectResponse?.qrcode?.base64) {
          return connectResponse;
        }
      } catch (connectError) {
        console.log('[Evolution API] Erro ao conectar, tentando endpoint direto do QR code:', connectError);
      }
      
      // Aguardar um pouco e tentar obter QR code diretamente
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Tentar endpoint direto do QR code
      try {
        const qrResponse = await this.makeRequest(`/instance/qrcode/${instanceName}`, {
          method: 'GET',
        });
        
        console.log('[Evolution API] Resposta do QR code:', qrResponse);
        
        if (qrResponse?.base64) {
          return {
            qrcode: {
              base64: qrResponse.base64,
              code: qrResponse.code || ''
            }
          };
        }
        
        if (qrResponse?.qrcode?.base64) {
          return qrResponse;
        }
      } catch (qrError) {
        console.log('[Evolution API] Erro no endpoint do QR code:', qrError);
      }
      
      // Verificar se a instância já está conectada
      const status = await this.getInstanceStatus(instanceName);
      if (status.instance.state === 'open') {
        throw new Error('Instância já está conectada');
      }
      
      throw new Error('QR Code não foi gerado. A instância pode estar em processo de inicialização. Tente novamente em alguns segundos.');
      
    } catch (error) {
      console.error('[Evolution API] Erro ao obter QR code:', error);
      throw error;
    }
  }

  async getInstanceStatus(instanceName: string): Promise<EvolutionInstanceStatus> {
    console.log(`[Evolution API] Verificando status da instância: ${instanceName}`);
    
    return await this.makeRequest(`/instance/connectionState/${instanceName}`);
  }

  async deleteInstance(instanceName: string): Promise<any> {
    console.log(`[Evolution API] Deletando instância: ${instanceName}`);
    
    return await this.makeRequest(`/instance/delete/${instanceName}`, {
      method: 'DELETE',
    });
  }

  async getChats(instanceName: string): Promise<EvolutionContact[]> {
    console.log(`[Evolution API] Obtendo conversas para instância: ${instanceName}`);
    
    const response = await this.makeRequest(`/chat/findChats/${instanceName}`);
    return response || [];
  }

  async getMessages(instanceName: string, remoteJid: string, limit: number = 20): Promise<EvolutionMessage[]> {
    console.log(`[Evolution API] Obtendo mensagens para ${remoteJid} na instância: ${instanceName}`);
    
    const response = await this.makeRequest(`/chat/findMessages/${instanceName}?remoteJid=${encodeURIComponent(remoteJid)}&limit=${limit}`);
    return response || [];
  }

  async sendMessage(instanceName: string, remoteJid: string, message: string): Promise<any> {
    console.log(`[Evolution API] Enviando mensagem para ${remoteJid} na instância: ${instanceName}`);
    
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
