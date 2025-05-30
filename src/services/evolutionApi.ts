
const EVOLUTION_API_BASE_URL = 'https://api.evolution.com.br'; // URL base padrão

export class EvolutionAPI {
  private baseUrl: string = '';
  private globalKey: string = '';

  setCredentials(baseUrl: string, globalKey: string) {
    // Remover barra final se existir
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.globalKey = globalKey;
    console.log("Credenciais Evolution definidas:", { baseUrl: this.baseUrl });
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    if (!this.baseUrl || !this.globalKey) {
      throw new Error('Credenciais da Evolution API não configuradas');
    }

    const url = `${this.baseUrl}${endpoint}`;
    console.log("Fazendo requisição para:", url);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.globalKey,
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro na API Evolution:", { status: response.status, data });
      throw new Error(`Erro na API: ${response.status} - ${JSON.stringify(data)}`);
    }

    return data;
  }

  // Criar instância
  async createInstance(instanceName: string, phoneNumber?: string) {
    console.log("Criando instância:", { instanceName, phoneNumber });
    
    const payload: any = {
      instanceName,
      integration: "WHATSAPP-BAILEYS"
    };

    if (phoneNumber) {
      payload.number = phoneNumber;
    }

    return this.makeRequest('/instance/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Obter QR Code da instância
  async getQRCode(instanceName: string) {
    console.log("Obtendo QR Code para:", instanceName);
    return this.makeRequest(`/instance/connect/${instanceName}`);
  }

  // Verificar status da instância
  async getInstanceStatus(instanceName: string) {
    console.log("Verificando status da instância:", instanceName);
    return this.makeRequest(`/instance/connectionState/${instanceName}`);
  }

  // Deletar instância
  async deleteInstance(instanceName: string) {
    console.log("Deletando instância:", instanceName);
    return this.makeRequest(`/instance/delete/${instanceName}`, {
      method: 'DELETE',
    });
  }

  // Buscar conversas
  async findChats(instanceName: string) {
    console.log("Buscando conversas para:", instanceName);
    return this.makeRequest(`/chat/findChats/${instanceName}`);
  }

  // Buscar mensagens
  async findMessages(instanceName: string, remoteJid: string) {
    console.log("Buscando mensagens para:", { instanceName, remoteJid });
    return this.makeRequest(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        where: {
          key: {
            remoteJid: remoteJid
          }
        }
      }),
    });
  }

  // Enviar mensagem
  async sendMessage(instanceName: string, remoteJid: string, message: string) {
    console.log("Enviando mensagem:", { instanceName, remoteJid, message });
    return this.makeRequest(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number: remoteJid,
        text: message,
      }),
    });
  }

  // Métodos para configuração
  async getActiveConfig() {
    // Buscar configuração ativa do banco de dados ou localStorage
    const savedConfig = localStorage.getItem('evolution_config');
    if (savedConfig) {
      return JSON.parse(savedConfig);
    }
    return null;
  }

  async saveConfig(config: { api_url: string; global_key: string; name: string }) {
    // Salvar configuração no localStorage por enquanto
    localStorage.setItem('evolution_config', JSON.stringify(config));
    this.setCredentials(config.api_url, config.global_key);
  }
}

export const evolutionApi = new EvolutionAPI();
