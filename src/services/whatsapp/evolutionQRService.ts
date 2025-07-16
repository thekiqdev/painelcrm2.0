
import { evolutionApi } from "../evolutionApi";
import { connectionDatabaseService } from "./connectionDatabaseService";

interface QRCodeResponse {
  success: boolean;
  status?: string;
  qrcode?: {
    base64?: string;
    code?: string;
  } | string;
  pairingCode?: string;
  message?: string;
  error?: string;
}

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
        const instances = await evolutionApi.fetchInstances();
        console.log("evolutionQRService: Instâncias disponíveis:", instances);
        
        // Melhor lógica de busca com mais opções de estrutura
        instanceData = instances.find((instance: any) => {
          console.log("evolutionQRService: Verificando instância:", instance);
          
          // Verificar diferentes possíveis estruturas da resposta
          const possibleNames = [
            instance.instance?.instanceName,
            instance.instanceName,
            instance.name,
            instance.instance?.name,
            instance.instanceId,
            instance.instance?.instanceId
          ].filter(Boolean); // Remove valores undefined/null
          
          console.log("evolutionQRService: Nomes possíveis encontrados:", possibleNames);
          
          return possibleNames.some(name => name === instanceName);
        });
        
        instanceExists = !!instanceData;
        
        if (instanceExists) {
          console.log("evolutionQRService: Instância encontrada na lista:", instanceData);
          
          // Verificar diferentes campos de estado
          const possibleStates = [
            instanceData?.instance?.state,
            instanceData?.state,
            instanceData?.status,
            instanceData?.instance?.status
          ].filter(Boolean);
          
          console.log("evolutionQRService: Estados possíveis:", possibleStates);
          
          // Se qualquer um dos estados é "open", já está conectada
          if (possibleStates.some(state => state === "open" || state === "connected")) {
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
        } else {
          console.log("evolutionQRService: Instância não encontrada. Verificando estruturas disponíveis...");
          
          // Log detalhado das estruturas para debug
          instances.forEach((instance: any, index: number) => {
            console.log(`evolutionQRService: Instância ${index}:`, {
              estrutura: Object.keys(instance),
              instanceName: instance.instanceName,
              nestedInstanceName: instance.instance?.instanceName,
              name: instance.name,
              nestedName: instance.instance?.name,
              instanceId: instance.instanceId,
              nestedInstanceId: instance.instance?.instanceId,
              fullObject: instance
            });
          });
        }
      } catch (listError) {
        console.log("evolutionQRService: Erro ao listar instâncias:", listError);
      }
      
      // Se não encontrou na lista, ainda assim tentar obter QR code diretamente
      if (!instanceExists) {
        console.log("evolutionQRService: Instância não encontrada na lista, mas tentando obter QR code diretamente...");
      }
      
      // Etapa 3: Tentar obter QR code usando o endpoint correto /instance/connect/{instance}
      console.log("evolutionQRService: Tentando obter QR Code com endpoint /instance/connect para:", instanceName);
      
      try {
        const qrResult = await evolutionApi.getQRCode(instanceName) as QRCodeResponse;
        console.log("evolutionQRService: Resultado completo do QR Code:", qrResult);
        
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
          let qrCodeData: string | null = null;
          
          // Verificar diferentes formatos de retorno do QR code
          console.log("evolutionQRService: Estrutura do qrcode:", qrResult.qrcode);
          
          if (typeof qrResult.qrcode === 'object' && qrResult.qrcode !== null) {
            // Se é objeto, verificar propriedades base64 e code
            if ('base64' in qrResult.qrcode && qrResult.qrcode.base64) {
              qrCodeData = qrResult.qrcode.base64;
              console.log("evolutionQRService: QR Code encontrado em qrcode.base64");
            } else if ('code' in qrResult.qrcode && qrResult.qrcode.code) {
              qrCodeData = qrResult.qrcode.code;
              console.log("evolutionQRService: QR Code encontrado em qrcode.code");
            }
          } else if (typeof qrResult.qrcode === 'string') {
            // Se é string direta
            qrCodeData = qrResult.qrcode;
            console.log("evolutionQRService: QR Code é string direta");
          }
          
          console.log("evolutionQRService: QR Code extraído:", qrCodeData?.substring(0, 100) + "...");
          
          if (qrCodeData) {
            console.log("evolutionQRService: QR Code obtido com sucesso, tamanho:", qrCodeData.length);
            
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
              message: "QR Code gerado com sucesso!",
              pairingCode: qrResult.pairingCode // Incluir o pairingCode para uso alternativo
            };
          } else {
            console.error("evolutionQRService: QR Code não encontrado na resposta:", qrResult);
            throw new Error("QR Code não foi encontrado na resposta da API");
          }
        } else {
          console.error("evolutionQRService: Resposta não contém qrcode:", qrResult);
          throw new Error("Resposta da API não contém dados do QR Code");
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
      
      // Se chegou aqui, QR code foi gerado com sucesso mesmo que a instância não apareça na lista
      console.log("evolutionQRService: QR Code obtido com sucesso mesmo com instância não listada");
      
      return {
        success: true,
        qrCode: null,
        status: "created",
        message: `A instância '${instanceName}' está funcional (QR Code foi gerado) mas não aparece na listagem da API.

Isso pode indicar:
• Sincronização pendente entre a criação e a listagem
• Versão específica da Evolution API com comportamento diferente
• A instância foi criada mas ainda não está totalmente indexada

A funcionalidade não é afetada - prossiga com a conexão.`
      };
      
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
