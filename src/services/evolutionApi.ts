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
      console.info('🔍 fetchInstances: ===== INICIANDO BUSCA DE INSTÂNCIAS =====');
      const url = this.normalizeUrl(this.baseUrl, 'instance/fetchInstances');
      console.info('🔍 fetchInstances: URL:', url);
      console.info('🔍 fetchInstances: Headers:', {
        'Content-Type': 'application/json',
        'apikey': this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'N/A',
      });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        }
      });

      console.info('🔍 fetchInstances: Status da resposta:', response.status);
      console.info('🔍 fetchInstances: Headers da resposta:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ fetchInstances: Erro na resposta:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.info('🔍 fetchInstances: ===== ANÁLISE DA RESPOSTA =====');
      console.info('🔍 fetchInstances: Resposta completa:', JSON.stringify(data, null, 2));
      
      if (Array.isArray(data)) {
        console.info('🔍 fetchInstances: Total de instâncias encontradas:', data.length);
        data.forEach((instance, index) => {
          console.info(`🔍 fetchInstances: Instância ${index + 1}:`, {
            instanceName: instance.instanceName || instance.instance?.instanceName,
            name: instance.name,
            instanceId: instance.instanceId || instance.instance?.instanceId || instance.id,
            status: instance.connectionStatus || instance.status || instance.instance?.state,
            state: instance.instance?.state,
            objetoCompleto: instance
          });
        });
      } else {
        console.info('🔍 fetchInstances: Resposta não é array:', {
          type: typeof data,
          keys: Object.keys(data),
          data: data
        });
      }
      
      return data || [];
    } catch (error) {
      console.error("❌ fetchInstances: Erro ao listar instâncias:", error);
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
      console.info('🔍 evolutionApi.getQRCode: ===== CHAMADA GET QR CODE =====');
      console.info('🔍 evolutionApi.getQRCode: Nome da instância:', instanceName);
      console.info('🔍 evolutionApi.getQRCode: URL base:', this.baseUrl);
      console.info('🔍 evolutionApi.getQRCode: API Key:', this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'N/A');

      const url = this.normalizeUrl(this.baseUrl, `instance/connect/${instanceName}`);
      console.info('🔍 evolutionApi.getQRCode: URL completa:', url);

      const headers = {
        'Content-Type': 'application/json',
        'apikey': this.apiKey || '',
      };
      console.info('🔍 evolutionApi.getQRCode: Headers:', {
        'Content-Type': headers['Content-Type'],
        'apikey': this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'N/A'
      });

      const startTime = Date.now();
      
      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
      });

      const endTime = Date.now();
      console.info('🔍 evolutionApi.getQRCode: Tempo de resposta:', `${endTime - startTime}ms`);
      console.info('🔍 evolutionApi.getQRCode: Status da resposta:', response.status);
      console.info('🔍 evolutionApi.getQRCode: Status text:', response.statusText);
      console.info('🔍 evolutionApi.getQRCode: Headers da resposta:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ evolutionApi.getQRCode: Erro na resposta:', {
          status: response.status,
          statusText: response.statusText,
          url: url,
          body: errorText,
          instanceRequested: instanceName
        });
        
        // Detectar se é 404 e explicar o problema
        if (response.status === 404) {
          console.error('❌ evolutionApi.getQRCode: INSTÂNCIA NÃO ENCONTRADA!');
          console.error('❌ evolutionApi.getQRCode: Isso indica que:', {
            possibleCauses: [
              'O nome da instância está incorreto',
              'A instância não existe na API',
              'Há confusão entre ID e Nome da instância',
              'A instância foi deletada ou está inativa'
            ],
            suggestedAction: 'Verificar a lista de instâncias via fetchInstances'
          });
        }
        
        throw new Error(`Erro ao obter QR Code: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.info('🔍 evolutionApi.getQRCode: ===== ANÁLISE DA RESPOSTA =====');
      console.info('🔍 evolutionApi.getQRCode: Resposta JSON completa:', JSON.stringify(data, null, 2));
      console.info('🔍 evolutionApi.getQRCode: Tipo da resposta:', typeof data);
      console.info('🔍 evolutionApi.getQRCode: Chaves do objeto:', Object.keys(data));
      
      // Análise específica do QR Code
      if (data.qrcode) {
        console.info('🔍 evolutionApi.getQRCode: QR Code encontrado na resposta');
        console.info('🔍 evolutionApi.getQRCode: Tipo do qrcode:', typeof data.qrcode);
        console.info('🔍 evolutionApi.getQRCode: Chaves do qrcode:', Object.keys(data.qrcode));
        
        if (data.qrcode.base64) {
          const base64Data = data.qrcode.base64;
          console.info('🔍 evolutionApi.getQRCode: Base64 encontrado:');
          console.info('🔍 evolutionApi.getQRCode: - Tamanho:', base64Data.length);
          console.info('🔍 evolutionApi.getQRCode: - Primeiros 50 chars:', base64Data.substring(0, 50));
          console.info('🔍 evolutionApi.getQRCode: - Últimos 50 chars:', base64Data.substring(base64Data.length - 50));
          console.info('🔍 evolutionApi.getQRCode: - Contém caracteres inválidos?', !/^[A-Za-z0-9+/=,@]+$/.test(base64Data));
          
          // Verificar se já tem prefixo data:
          if (base64Data.startsWith('data:')) {
            console.info('🔍 evolutionApi.getQRCode: ✅ Base64 já tem prefixo data:');
          } else {
            console.info('🔍 evolutionApi.getQRCode: ⚠️ Base64 NÃO tem prefixo data:');
          }
        }
      } else if (data.code) {
        console.info('🔍 evolutionApi.getQRCode: Campo "code" encontrado na resposta');
        const codeData = data.code;
        console.info('🔍 evolutionApi.getQRCode: Code data:');
        console.info('🔍 evolutionApi.getQRCode: - Tamanho:', codeData.length);
        console.info('🔍 evolutionApi.getQRCode: - Primeiros 50 chars:', codeData.substring(0, 50));
        console.info('🔍 evolutionApi.getQRCode: - Últimos 50 chars:', codeData.substring(codeData.length - 50));
      } else {
        console.warn('⚠️ evolutionApi.getQRCode: Nenhum qrcode ou code encontrado na resposta!');
      }

      // Processar resposta conforme documentação Evolution API
      // Formato esperado: { "pairingCode": "WZYEH1YY", "code": "2@y8eK+bjtEjUWy9/FOM...", "count": 1 }
      
      if (data.code) {
        // O campo 'code' contém os dados Base64 do QR code
        console.info('✅ evolutionApi.getQRCode: QR Code extraído do campo "code"');
        return {
          success: true,
          qrcode: {
            base64: data.code // Usar diretamente o campo 'code'
          },
          pairingCode: data.pairingCode,
          count: data.count,
          status: "connecting"
        };
      }

      // Verificar se tem qrcode.base64
      if (data.qrcode?.base64) {
        console.info('✅ evolutionApi.getQRCode: QR Code extraído do campo "qrcode.base64"');
        return {
          success: true,
          qrcode: {
            base64: data.qrcode.base64
          },
          pairingCode: data.pairingCode,
          count: data.count,
          status: "connecting"
        };
      }

      // Se não tem código, verificar se já está conectado
      if (data.status === "open" || data.instance?.state === "open") {
        console.info('✅ evolutionApi.getQRCode: Instância já conectada');
        return {
          success: true,
          status: "connected",
          message: "Instância já conectada"
        };
      }

      // Resposta inesperada
      console.warn('⚠️ evolutionApi.getQRCode: Resposta inesperada da API:', data);
      return {
        success: false,
        error: "Formato de resposta inesperado da API - nenhum campo de QR code encontrado"
      };

    } catch (error) {
      console.error("❌ evolutionApi.getQRCode: Erro ao obter QR code:", error);
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
