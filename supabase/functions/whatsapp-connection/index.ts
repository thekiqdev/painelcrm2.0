import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.3";
import * as qrcode from "https://deno.land/x/qrcode@v2.0.0/mod.ts";

// Cache para conexões ativas por ID de usuário
const activeConnections: Record<string, boolean> = {};

// Gerar um QR code como base64
async function generateQRCode(text: string): Promise<string> {
  const qr = await qrcode.generate(text);
  return qr;
}

// Headers CORS para permitir requisições de qualquer origem
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // Tratar requisições OPTIONS (CORS preflight)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  const url = new URL(req.url);
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") as string,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
  );
  
  // Obter JWT da requisição
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Cabeçalho de autorização ausente" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401, 
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const userId = user.id;

  // Tratar diferentes operações com base no caminho
  const action = url.pathname.split("/").pop() || "";
  
  if (req.method === "POST") {
    // Nova rota para conexão via whatsapp-web.js
    if (action === "connect-webjs") {
      try {
        console.log(`Conectando via whatsapp-web.js para o usuário: ${userId}`);
        
        // Gerar um identificador de conexão único
        const connectionId = crypto.randomUUID();
        const connectionCode = `whatsapp-connection-webjs-${userId}-${connectionId}`;
        
        // Gerar QR code contendo o código de conexão
        const qrCodeData = await generateQRCode(connectionCode);
        
        // Armazenar status da conexão ativa
        activeConnections[userId] = true;
        
        // Salvar QR code e status no Supabase
        await supabaseClient.from("whatsapp_connections")
          .upsert({
            user_id: userId,
            qr_code: qrCodeData,
            status: "awaiting_scan",
            provider: "webjs",
            updated_at: new Date().toISOString()
          });
          
        return new Response(
          JSON.stringify({
            status: "connecting",
            qrCode: qrCodeData,
            provider: "webjs"
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
          }
        );
      } catch (err) {
        console.error("Erro ao gerar QR code via Web.js:", err);
        return new Response(
          JSON.stringify({ error: "Falha ao conectar com whatsapp-web.js" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500
          }
        );
      }
    } else if (action === "connect-evolution") {
      try {
        // Obter dados do corpo da requisição
        const requestData = await req.json();
        const { apiKey, instanceId } = requestData;
        
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "API Key da Evolution é obrigatória" }),
            { 
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400 
            }
          );
        }
        
        // Em uma implementação real, você conectaria à Evolution API aqui
        console.log(`Conectando via Evolution API com chave: ${apiKey.substring(0, 3)}***`);
        
        // Armazenar status da conexão
        activeConnections[userId] = true;
        
        // Atualizar perfil do usuário
        await supabaseClient.from("profiles")
          .update({ whatsapp_connected: true })
          .eq("id", userId);
          
        // Atualizar status da conexão
        await supabaseClient.from("whatsapp_connections")
          .upsert({
            user_id: userId,
            status: "connected",
            provider: "evolution",
            updated_at: new Date().toISOString()
          });
          
        return new Response(
          JSON.stringify({
            status: "connected",
            provider: "evolution"
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
          }
        );
      } catch (err) {
        console.error("Erro ao conectar com Evolution API:", err);
        return new Response(
          JSON.stringify({ error: "Falha ao conectar com Evolution API" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500
          }
        );
      }
    } else if (action === "connect") {
      try {
        // Verificar se a requisição especifica um provedor
        let requestData = {};
        let provider = "default";
        
        try {
          requestData = await req.json();
          provider = (requestData as any).provider || "default";
        } catch (e) {
          // Continuar com o provedor padrão se não houver corpo JSON
        }
        
        if (provider === "evolution") {
          const apiKey = (requestData as any).apiKey;
          
          if (!apiKey) {
            return new Response(
              JSON.stringify({ error: "API Key da Evolution é obrigatória" }),
              { 
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400 
              }
            );
          }
          
          // Em uma implementação real, você conectaria à Evolution API aqui
          console.log(`Conectando via Evolution API com chave: ${apiKey.substring(0, 3)}***`);
          
          // Armazenar status da conexão
          activeConnections[userId] = true;
          
          // Atualizar perfil do usuário
          await supabaseClient.from("profiles")
            .update({ whatsapp_connected: true })
            .eq("id", userId);
            
          // Atualizar status da conexão
          await supabaseClient.from("whatsapp_connections")
            .upsert({
              user_id: userId,
              status: "connected",
              provider: "evolution",
              updated_at: new Date().toISOString()
            });
            
          return new Response(
            JSON.stringify({
              status: "connected",
              provider: "evolution"
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200
            }
          );
        } else if (provider === "webjs") {
          // Conexão via whatsapp-web.js
          console.log(`Conectando via whatsapp-web.js para o usuário: ${userId}`);
        
          // Gerar um identificador de conexão único
          const connectionId = crypto.randomUUID();
          const connectionCode = `whatsapp-connection-webjs-${userId}-${connectionId}`;
          
          // Gerar QR code contendo o código de conexão
          const qrCodeData = await generateQRCode(connectionCode);
          
          // Armazenar status da conexão ativa
          activeConnections[userId] = true;
          
          // Salvar QR code e status no Supabase
          await supabaseClient.from("whatsapp_connections")
            .upsert({
              user_id: userId,
              qr_code: qrCodeData,
              status: "awaiting_scan",
              provider: "webjs",
              updated_at: new Date().toISOString()
            });
            
          return new Response(
            JSON.stringify({
              status: "connecting",
              qrCode: qrCodeData,
              provider: "webjs"
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200
            }
          );
        }
        
        // Fluxo padrão via QR Code
        // Gerar um identificador de conexão único
        const connectionId = crypto.randomUUID();
        const connectionCode = `whatsapp-connection-${userId}-${connectionId}`;
        
        // Gerar QR code contendo o código de conexão
        const qrCodeData = await generateQRCode(connectionCode);
        
        // Armazenar status da conexão ativa
        activeConnections[userId] = true;
        
        // Salvar QR code e status no Supabase
        await supabaseClient.from("whatsapp_connections")
          .upsert({
            user_id: userId,
            qr_code: qrCodeData,
            status: "awaiting_scan",
            provider: "qrcode",
            updated_at: new Date().toISOString()
          });
          
        return new Response(
          JSON.stringify({
            status: "connecting",
            qrCode: qrCodeData
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
          }
        );
      } catch (err) {
        console.error("Erro ao gerar QR code:", err);
        return new Response(
          JSON.stringify({ error: "Falha ao gerar QR code" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500
          }
        );
      }
    } else if (action === "disconnect") {
      delete activeConnections[userId];
      
      // Atualizar perfil do usuário no Supabase
      await supabaseClient.from("profiles")
        .update({ whatsapp_connected: false })
        .eq("id", userId);
        
      // Atualizar status da conexão no Supabase
      await supabaseClient.from("whatsapp_connections")
        .update({
          status: "disconnected",
          qr_code: null,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);
        
      return new Response(
        JSON.stringify({ status: "disconnected" }), 
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        }
      );
    } else if (action === "confirm") {
      // Simular confirmação de conexão após escaneamento do QR code
      // Em uma implementação real, isso verificaria a conexão
      
      // Atualizar perfil do usuário no Supabase
      await supabaseClient.from("profiles")
        .update({ whatsapp_connected: true })
        .eq("id", userId);
        
      // Atualizar status da conexão no Supabase
      await supabaseClient.from("whatsapp_connections")
        .update({
          status: "connected",
          qr_code: null,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);
        
      return new Response(
        JSON.stringify({ status: "connected" }), 
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        }
      );
    }
  } else if (req.method === "GET" && action === "status") {
    // Verificar se há uma conexão ativa
    const isConnected = !!activeConnections[userId];
    
    // Obter qualquer QR code existente do banco de dados
    const { data: connectionData } = await supabaseClient
      .from("whatsapp_connections")
      .select("qr_code, status, provider")
      .eq("user_id", userId)
      .single();
    
    return new Response(
      JSON.stringify({
        connected: isConnected,
        status: connectionData?.status || "disconnected",
        provider: connectionData?.provider || "default",
        qrCode: connectionData?.qr_code || null
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );
  }
  
  return new Response(
    JSON.stringify({ error: "Requisição inválida" }), 
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    }
  );
});
