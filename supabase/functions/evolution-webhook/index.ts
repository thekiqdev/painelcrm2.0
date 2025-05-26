
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.3";

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

  // Criar cliente Supabase para interagir com o banco de dados
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") as string,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
  );
  
  try {
    const url = new URL(req.url);
    const instanceName = url.pathname.split("/").pop();
    
    console.log(`[Evolution Webhook] Webhook chamado para instância: ${instanceName}`);
    
    // Processar dados do webhook
    let webhookData;
    try {
      webhookData = await req.json();
    } catch (e) {
      webhookData = { error: "Não foi possível processar o corpo da requisição" };
    }
    
    console.log("[Evolution Webhook] Dados recebidos:", JSON.stringify(webhookData, null, 2));
    
    // Armazenar eventos webhook para análise futura
    const { error: insertError } = await supabaseClient
      .from("whatsapp_webhook_events")
      .insert({
        connection_name: instanceName || 'unknown',
        event_data: webhookData,
        created_at: new Date().toISOString()
      });
    
    if (insertError) {
      console.error("[Evolution Webhook] Erro ao inserir evento:", insertError);
    }
    
    // Processar eventos específicos da Evolution API
    if (webhookData.event) {
      console.log(`[Evolution Webhook] Processando evento: ${webhookData.event}`);
      
      switch (webhookData.event) {
        case 'qrcode.updated':
          console.log("[Evolution Webhook] QR Code atualizado");
          // Aqui você pode processar atualizações do QR code se necessário
          break;
          
        case 'connection.update':
          console.log("[Evolution Webhook] Status de conexão atualizado:", webhookData.data);
          // Processar mudanças no status da conexão
          if (webhookData.data && webhookData.data.state === 'open') {
            console.log("[Evolution Webhook] Instância conectada com sucesso!");
          }
          break;
          
        case 'messages.upsert':
          console.log("[Evolution Webhook] Nova mensagem recebida");
          // Processar novas mensagens
          break;
          
        default:
          console.log(`[Evolution Webhook] Evento não tratado: ${webhookData.event}`);
      }
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      message: "Webhook processado com sucesso",
      instanceName: instanceName,
      event: webhookData.event || 'unknown'
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
    
  } catch (error) {
    console.error("[Evolution Webhook] Erro ao processar webhook:", error);
    
    return new Response(JSON.stringify({ 
      error: "Falha ao processar webhook",
      details: error instanceof Error ? error.message : "Erro desconhecido" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
