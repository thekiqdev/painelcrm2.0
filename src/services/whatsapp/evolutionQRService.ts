
import { evolutionApi } from "../evolutionApi";
import { connectionDatabaseService } from "./connectionDatabaseService";

export const evolutionQRService = {
  getEvolutionQRCode: async (instanceName: string) => {
    try {
      console.log("evolutionQRService: Obtendo QR Code para instância:", instanceName);
      
      if (!instanceName) {
        throw new Error("Nome da instância é obrigatório");
      }
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Nenhuma configuração ativa da Evolution API encontrada");
      }
      
      console.log("evolutionQRService: Configuração encontrada:", { 
        api_url: config.api_url,
        hasGlobalKey: !!config.global_key 
      });
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      // Estratégia em múltiplas etapas para lidar com instâncias não responsivas
      
      // Etapa 1: Verificar se a instância existe na lista
      console.log("evolutionQRService: Verificando se a instância existe:", instanceName);
      
      let instanceExists = false;
      let instanceData = null;
      
      try {
        const listResponse = await fetch(`${config.api_url}/instance/fetchInstances`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.global_key || ''
          }
        });
        
        if (listResponse.ok) {
          const instances = await listResponse.json();
          console.log("evolutionQRService: Instâncias disponíveis:", instances);
          
          instanceData = instances.find((instance: any) => 
            instance.instance?.instanceName === instanceName || 
            instance.instanceName === instanceName
          );
          
          instanceExists = !!instanceData;
          
          if (instanceExists) {
            console.log("evolutionQRService: Instância encontrada na lista:", instanceData);
            
            // Se o estado é "open", já está conectada
            if (instanceData?.instance?.state === "open" || instanceData?.state === "open") {
              console.log("evolutionQRService: Instância já está conectada");
              
              const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
              if (existingConnection?.id) {
                await connectionDatabaseService.updateConnection(existingConnection.id, {
                  status: "connected",
                  qr_code: null
                });
              }
              
              return {
                success: true,
                status: "connected",
                qrCode: "already_connected",
                message: "Instância já está conectada!"
              };
            }
          }
        }
      } catch (listError) {
        console.log("evolutionQRService: Erro ao listar instâncias:", listError);
      }
      
      if (!instanceExists) {
        throw new Error(`A instância '${instanceName}' não foi encontrada na lista de instâncias da Evolution API. Verifique se o nome está correto e se a instância foi criada.`);
      }
      
      // Etapa 2: Verificar status específico da instância
      try {
        console.log("evolutionQRService: Verificando status específico da instância:", instanceName);
        const status = await evolutionApi.getInstanceStatus(instanceName);
        console.log("evolutionQRService: Status obtido:", status);
        
        // Se já está conectada
        if (status?.instance?.state === "open") {
          console.log("evolutionQRService: Instância já conectada via status");
          
          const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
          if (existingConnection?.id) {
            await connectionDatabaseService.updateConnection(existingConnection.id, {
              status: "connected",
              qr_code: null
            });
          }
          
          return {
            success: true,
            status: "connected",
            qrCode: "already_connected",
            message: "Instância já está conectada!"
          };
        }
        
      } catch (statusError) {
        console.log("evolutionQRService: Erro ao verificar status:", statusError);
        
        // Se for erro 404, a instância existe mas não responde
        if (statusError instanceof Error && statusError.message.includes("404")) {
          console.log("evolutionQRService: Instância não responde ao comando de status (404)");
          
          // Tentar "acordar" a instância fazendo uma tentativa de restart
          try {
            console.log("evolutionQRService: Tentando reiniciar instância não responsiva");
            
            const restartResponse = await fetch(`${config.api_url}/instance/restart/${instanceName}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'apikey': config.global_key || ''
              }
            });
            
            if (restartResponse.ok) {
              console.log("evolutionQRService: Instância reiniciada, aguardando inicialização");
              
              // Aguardar um pouco e tentar novamente
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          } catch (restartError) {
            console.log("evolutionQRService: Erro ao tentar reiniciar:", restartError);
          }
        }
      }
      
      // Etapa 3: Tentar obter QR code diretamente
      console.log("evolutionQRService: Tentando obter QR Code diretamente para:", instanceName);
      
      try {
        const qrResult = await evolutionApi.getQRCode(instanceName);
        console.log("evolutionQRService: Resultado do QR Code:", qrResult);
        
        if (qrResult && qrResult.success && qrResult.status === "connected") {
          console.log("evolutionQRService: Instância conectada durante obtenção do QR");
          
          const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
          if (existingConnection?.id) {
            await connectionDatabaseService.updateConnection(existingConnection.id, {
              status: "connected",
              qr_code: null
            });
          }
          
          return {
            success: true,
            status: "connected",
            qrCode: "already_connected",
            message: "Instância conectada com sucesso!"
          };
        }
        
        if (qrResult && qrResult.qrcode) {
          let qrCodeData = null;
          
          // Verificar se o QR code está em base64
          if (qrResult.qrcode.base64) {
            qrCodeData = qrResult.qrcode.base64;
          } else if (typeof qrResult.qrcode === 'string') {
            qrCodeData = qrResult.qrcode;
          } else if (qrResult.qrcode.code) {
            qrCodeData = qrResult.qrcode.code;
          }
          
          if (qrCodeData) {
            console.log("evolutionQRService: QR Code obtido com sucesso");
            
            // Atualizar conexão existente
            const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
            
            if (existingConnection?.id) {
              await connectionDatabaseService.updateConnection(existingConnection.id, {
                status: "awaiting_scan",
                qr_code: qrCodeData
              });
            }
            
            return {
              success: true,
              qrCode: qrCodeData,
              status: "awaiting_scan",
              message: "QR Code gerado com sucesso!"
            };
          }
        }
        
      } catch (qrError) {
        console.error("evolutionQRService: Erro ao obter QR code:", qrError);
        
        // Se for erro 404, instância existe mas não responde
        if (qrError instanceof Error && qrError.message.includes("404")) {
          throw new Error(`A instância '${instanceName}' existe na Evolution API mas não está respondendo aos comandos.

Isso pode acontecer quando:
• A instância está em processo de inicialização
• A instância precisa ser reiniciada  
• Há um problema temporário na API
• A instância está em um estado inconsistente

Soluções recomendadas:
1. Use o botão "Reiniciar Instância" no popup
2. Aguarde alguns minutos e tente novamente
3. Verifique o painel da Evolution API
4. Se o problema persistir, delete e recrie a instância`);
        }
        
        throw qrError;
      }
      
      // Se chegou aqui, não conseguiu obter QR code
      console.error("evolutionQRService: Instância encontrada mas QR Code não disponível");
      
      throw new Error(`A instância '${instanceName}' foi encontrada na Evolution API mas não conseguiu gerar o QR Code.

Estado atual: ${instanceData?.instance?.state || instanceData?.state || 'desconhecido'}

Possíveis causas:
• Instância em processo de inicialização
• Estado inconsistente da instância
• Problema temporário na API

Recomendações:
1. Use "Reiniciar Instância" 
2. Aguarde alguns minutos
3. Tente novamente`);
      
    } catch (error) {
      console.error("evolutionQRService: Erro ao obter QR code:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido ao obter QR code";
      
      return {
        success: false,
        qrCode: null,
        status: "error",
        message: errorMessage
      };
    }
  }
};
