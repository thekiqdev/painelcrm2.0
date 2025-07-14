
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
      
      // Primeiro, tentar obter informações da instância usando um endpoint diferente
      console.log("evolutionQRService: Verificando se a instância existe:", instanceName);
      
      try {
        // Tentar endpoint de lista de instâncias para verificar se existe
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
          
          // Verificar se nossa instância está na lista
          const instanceExists = instances.some((instance: any) => 
            instance.instance?.instanceName === instanceName || 
            instance.instanceName === instanceName
          );
          
          if (!instanceExists) {
            console.log("evolutionQRService: Instância não encontrada na lista de instâncias");
          } else {
            console.log("evolutionQRService: Instância encontrada na lista");
          }
        }
      } catch (listError) {
        console.log("evolutionQRService: Erro ao listar instâncias:", listError);
      }
      
      // Verificar status da instância usando endpoint de info
      try {
        console.log("evolutionQRService: Verificando status da instância:", instanceName);
        const status = await evolutionApi.getInstanceStatus(instanceName);
        console.log("evolutionQRService: Status atual da instância:", status);
        
        // Se já está conectada, retornar sucesso
        if (status?.instance?.state === "open") {
          console.log("evolutionQRService: Instância já conectada");
          
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
        
        // Se erro 404, tentar outros endpoints antes de falhar
        if (statusError instanceof Error && statusError.message.includes("404")) {
          console.log("evolutionQRService: Erro 404 no status, tentando endpoint de connect diretamente");
        } else {
          console.error("evolutionQRService: Erro inesperado no status:", statusError);
        }
      }
      
      // Tentar obter QR code diretamente, mesmo se houve erro no status
      console.log("evolutionQRService: Tentando obter QR Code diretamente para:", instanceName);
      
      try {
        const qrResult = await evolutionApi.getQRCode(instanceName);
        console.log("evolutionQRService: Resultado do QR Code:", qrResult);
        
        if (qrResult && qrResult.success && qrResult.status === "connected") {
          console.log("evolutionQRService: Instância conectada durante obtenção do QR");
          
          // Atualizar conexão existente
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
        
        // Se chegou aqui mas não conseguiu obter QR code, pode ser erro de estado
        console.log("evolutionQRService: QR Code não disponível, tentando reiniciar instância");
        
        // Tentar reiniciar a instância
        try {
          const restartResponse = await fetch(`${config.api_url}/instance/restart/${instanceName}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'apikey': config.global_key || ''
            }
          });
          
          if (restartResponse.ok) {
            console.log("evolutionQRService: Instância reiniciada, tentando QR code novamente");
            
            // Aguardar um pouco antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const retryQrResult = await evolutionApi.getQRCode(instanceName);
            
            if (retryQrResult && retryQrResult.qrcode) {
              let qrCodeData = null;
              
              if (retryQrResult.qrcode.base64) {
                qrCodeData = retryQrResult.qrcode.base64;
              } else if (typeof retryQrResult.qrcode === 'string') {
                qrCodeData = retryQrResult.qrcode;
              }
              
              if (qrCodeData) {
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
                  message: "QR Code gerado após reiniciar a instância!"
                };
              }
            }
          }
        } catch (restartError) {
          console.log("evolutionQRService: Erro ao reiniciar instância:", restartError);
        }
        
      } catch (qrError) {
        console.error("evolutionQRService: Erro ao obter QR code:", qrError);
        
        // Se for erro 404, dar mensagem mais específica
        if (qrError instanceof Error && qrError.message.includes("404")) {
          throw new Error(`A instância '${instanceName}' existe na Evolution API mas não está respondendo aos comandos. Isso pode acontecer quando:
          
1. A instância está em processo de inicialização
2. A instância precisa ser reiniciada
3. Há um problema temporário na API

Tente:
- Aguardar alguns minutos e tentar novamente
- Verificar se a instância está ativa no painel da Evolution API
- Reiniciar a instância no painel da Evolution API`);
        }
        
        throw qrError;
      }
      
      // Se chegou aqui, não conseguiu obter QR code
      console.error("evolutionQRService: Não foi possível gerar QR Code");
      throw new Error(`Não foi possível gerar o QR Code para a instância '${instanceName}'. 

A instância existe mas pode estar em um estado que impede a geração do QR Code. Verifique:
- Se a instância está ativa no painel da Evolution API
- Se não há outra sessão WhatsApp conectada
- Tente reiniciar a instância no painel da Evolution API`);
      
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
