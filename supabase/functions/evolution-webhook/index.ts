
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
    const connectionName = url.pathname.split("/").pop();
    
    console.log(`Webhook chamado para conexão: ${connectionName}`);
    
    // Processar dados do webhook
    let webhookData;
    try {
      webhookData = await req.json();
    } catch (e) {
      webhookData = { error: "Não foi possível processar o corpo da requisição" };
    }
    
    console.log("Dados do webhook recebidos:", JSON.stringify(webhookData).substring(0, 200) + "...");
    
    // Armazenar eventos webhook para análise futura
    await supabaseClient.from("whatsapp_webhook_events")
      .insert({
        connection_name: connectionName,
        event_data: webhookData,
        created_at: new Date().toISOString()
      });
    
    // Aqui você processaria eventos específicos da Evolution API
    // Por exemplo, novas mensagens, alterações de status, etc.
    
    return new Response(JSON.stringify({ 
      success: true,
      message: "Webhook recebido com sucesso" 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Erro ao processar webhook:", error);
    
    return new Response(JSON.stringify({ 
      error: "Falha ao processar webhook",
      details: error instanceof Error ? error.message : "Erro desconhecido" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
