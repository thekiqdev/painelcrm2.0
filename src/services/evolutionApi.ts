import { supabase } from "@/integrations/supabase/client";

// Types for Evolution API
export interface EvolutionMessage {
  key: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: number;
}

export interface EvolutionContact {
  id: string;
  remoteJid: string;
  pushName?: string;
  profilePictureUrl?: string;
  unreadMessages: number;
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

class EvolutionApi {
  private baseUrl: string = "";
  private apiKey: string | null = null;
  private activeConfig: EvolutionApiConfig | null = null;

  constructor() {
    // Carregar as credenciais do localStorage ao inicializar
    this.loadCredentials();
  }

  // Função para normalizar URL e evitar barras duplicadas
  private normalizeUrl(baseUrl: string, path: string): string {
    // Remove barras finais da baseUrl
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    // Remove barras iniciais do path
    const cleanPath = path.replace(/^\/+/, '');
    // Junta com uma única barra
    return `${cleanBaseUrl}/${cleanPath}`;
  }

  setCredentials(baseUrl: string, apiKey: string | null) {
    console.log("EvolutionApi: Definindo credenciais:", { baseUrl, apiKey });
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    
    // Salvar as credenciais no localStorage
    localStorage.setItem('evolutionApiBaseUrl', baseUrl);
    if (apiKey) {
      localStorage.setItem('evolutionApiKey', apiKey);
    } else {
      localStorage.removeItem('evolutionApiKey');
    }
  }

  loadCredentials() {
    const baseUrl = localStorage.getItem('evolutionApiBaseUrl');
    const apiKey = localStorage.getItem('evolutionApiKey');
    
    if (baseUrl) {
      console.log("EvolutionApi: Carregando credenciais do localStorage:", { baseUrl, apiKey });
      this.baseUrl = baseUrl;
      this.apiKey = apiKey;
    }
  }

  async setActiveConfig(config: EvolutionApiConfig) {
    this.activeConfig = config;
    this.setCredentials(config.api_url, config.global_key);
  }

  async getActiveConfig(): Promise<EvolutionApiConfig | null> {
    if (!this.activeConfig) {
      // Buscar configuração ativa do banco de dados
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return null;

      const { data, error } = await supabase
        .from('evolution_api_configs')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('is_active', true)
        .single();

      if (error || !data) return null;
      
      this.activeConfig = data;
      this.setCredentials(data.api_url, data.global_key);
    }
    
    return this.activeConfig;
  }

  async getAllConfigs(): Promise<EvolutionApiConfig[]> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("Usuário não autenticado");

    const { data, error } = await supabase
      .from('evolution_api_configs')
      .select('*')
      .eq('user_id', user.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async saveConfig(name: string, apiUrl: string, globalKey: string): Promise<EvolutionApiConfig> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("Usuário não autenticado");

    const { data, error } = await supabase
      .from('evolution_api_configs')
      .insert({
        name,
        api_url: apiUrl,
        global_key: globalKey,
        user_id: user.user.id,
        is_active: false
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateConfig(id: string, updates: Partial<EvolutionApiConfig>): Promise<EvolutionApiConfig> {
    const { data, error } = await supabase
      .from('evolution_api_configs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteConfig(id: string): Promise<void> {
    const { error } = await supabase
      .from('evolution_api_configs')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async setActiveConfigById(id: string): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("Usuário não autenticado");

    // Primeiro, desativar todas as configurações
    await supabase
      .from('evolution_api_configs')
      .update({ is_active: false })
      .eq('user_id', user.user.id);

    // Então ativar a configuração específica
    const { data, error } = await supabase
      .from('evolution_api_configs')
      .update({ is_active: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    
    this.activeConfig = data;
    this.setCredentials(data.api_url, data.global_key);
  }

  // Método para testar conectividade da API
  async testApiConnectivity(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = this.normalizeUrl(this.baseUrl, '');
      console.log("Testando conectividade da API:", url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Erro de conectividade: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      };
    }
  }

  // Método para listar instâncias
  async fetchInstances(): Promise<any[]> {
    try {
      const url = this.normalizeUrl(this.baseUrl, 'instance/fetchInstances');
      console.log("Listando instâncias na URL:", url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro HTTP ${response.status}:`, errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Instâncias encontradas:", data);
      return data || [];
    } catch (error) {
      console.error("Erro ao listar instâncias:", error);
      throw error;
    }
  }

  async createInstance(instanceName: string, token?: string): Promise<any> {
    try {
      console.log(`Criando instância: ${instanceName}`);
      const url = this.normalizeUrl(this.baseUrl, 'instance/create');
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        },
        body: JSON.stringify({
          instanceName,
          token: token || this.apiKey,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS"
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro HTTP ${response.status}:`, errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Instância criada:", data);
      return data;
    } catch (error) {
      console.error("Erro ao criar instância:", error);
      throw error;
    }
  }

  async getInstanceStatus(instanceName: string) {
    try {
      console.log(`Obtendo status da instância: ${instanceName}`);
      const url = this.normalizeUrl(this.baseUrl, `instance/info/${instanceName}`);
      console.log(`URL do status: ${url}`);
      console.log(`API Key presente: ${!!this.apiKey}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        }
      });

      console.log(`Status da resposta: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro HTTP ${response.status}:`, errorText);
        
        // Se for 404, verificar se é problema de nome ou se a instância realmente não existe
        if (response.status === 404) {
          throw new Error(`Instância '${instanceName}' não encontrada (404). Verifique:
          - Se o nome da instância está correto
          - Se a instância está ativa na Evolution API
          - Se a URL da API está correta`);
        }
        
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Resposta da API:", data);
      return data;
    } catch (error) {
      console.error("Erro ao obter status da instância:", error);
      throw error;
    }
  }

  async getQRCode(instanceName: string) {
    try {
      console.log(`Solicitando QR Code para instância: ${instanceName}`);
      const url = this.normalizeUrl(this.baseUrl, `instance/${instanceName}/qrcode`);
      console.log(`URL do QR Code: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        }
      });

      console.log(`Status da resposta QR Code: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro HTTP ${response.status}:`, errorText);
        
        if (response.status === 404) {
          throw new Error(`Erro 404 ao solicitar QR Code para '${instanceName}'. A instância pode estar em processo de inicialização ou inativa.`);
        }
        
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Resposta completa da API para QR Code:", data);

      // Verificar se a resposta contém o QR code em base64
      if (data.base64) {
        // Remover o prefixo data:image/png;base64, se existir para evitar duplicação
        const base64Data = data.base64.replace(/^data:image\/png;base64,/, '');
        
        return {
          success: true,
          qrcode: {
            base64: base64Data
          },
          status: data.status || "connecting"
        };
      }

      // Se não tem base64, mas tem qrcode
      if (data.qrcode) {
        return {
          success: true,
          qrcode: data.qrcode,
          status: data.status || "connecting"
        };
      }

      // Se já está conectado
      if (data.status === "open" || data.instance?.state === "open") {
        return {
          success: true,
          status: "connected",
          message: "Instância já conectada"
        };
      }

      // Resposta inesperada
      console.warn("Resposta inesperada da API:", data);
      return {
        success: false,
        error: "Formato de resposta inesperado da API"
      };

    } catch (error) {
      console.error("Erro ao obter QR code:", error);
      throw error;
    }
  }

  async findChats(instanceName: string): Promise<EvolutionContact[]> {
    try {
      console.log(`Buscando conversas para instância: ${instanceName}`);
      const url = this.normalizeUrl(this.baseUrl, `chat/findChats/${instanceName}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro HTTP ${response.status}:`, errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Conversas encontradas:", data);
      return data || [];
    } catch (error) {
      console.error("Erro ao buscar conversas:", error);
      throw error;
    }
  }

  async findMessages(instanceName: string, remoteJid: string): Promise<EvolutionMessage[]> {
    try {
      console.log(`Buscando mensagens para: ${instanceName}, ${remoteJid}`);
      const url = this.normalizeUrl(this.baseUrl, `chat/findMessages/${instanceName}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        },
        body: JSON.stringify({
          where: {
            key: {
              remoteJid: remoteJid
            }
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro HTTP ${response.status}:`, errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Mensagens encontradas:", data);
      return data || [];
    } catch (error) {
      console.error("Erro ao buscar mensagens:", error);
      throw error;
    }
  }

  async sendMessage(instanceName: string, remoteJid: string, message: string): Promise<any> {
    try {
      console.log(`Enviando mensagem para: ${instanceName}, ${remoteJid}`);
      const url = this.normalizeUrl(this.baseUrl, `message/sendText/${instanceName}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        },
        body: JSON.stringify({
          number: remoteJid,
          text: message
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro HTTP ${response.status}:`, errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Mensagem enviada:", data);
      return data;
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      throw error;
    }
  }

  async deleteInstance(instanceName: string) {
    try {
      console.log(`Deletando instância: ${instanceName}`);
      const url = this.normalizeUrl(this.baseUrl, `instance/delete/${instanceName}`);
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro HTTP ${response.status}:`, errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Resposta da API ao deletar instância:", data);
      return data;
    } catch (error) {
      console.error("Erro ao deletar instância:", error);
      throw error;
    }
  }
}

export const evolutionApi = new EvolutionApi();
