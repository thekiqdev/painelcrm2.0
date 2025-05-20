
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.3";
import * as qrcode from "https://deno.land/x/qrcode@v2.0.0/mod.ts";

// Cache for active connections by user ID
const activeConnections: Record<string, boolean> = {};

// Generate a QR code as base64
async function generateQRCode(text: string): Promise<string> {
  const qr = await qrcode.generate(text);
  return qr;
}

serve(async (req) => {
  const url = new URL(req.url);
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") as string,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
  );
  
  // Get JWT from request
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, 
      headers: { "Content-Type": "application/json" }
    });
  }

  const userId = user.id;

  // Handle different operations based on path
  const action = url.pathname.split("/").pop() || "";
  
  if (req.method === "POST") {
    if (action === "connect") {
      try {
        // Generate a unique connection identifier
        const connectionId = crypto.randomUUID();
        const connectionCode = `whatsapp-connection-${userId}-${connectionId}`;
        
        // Generate QR code containing the connection code
        const qrCodeData = await generateQRCode(connectionCode);
        
        // Store active connection status
        activeConnections[userId] = true;
        
        // Save QR code and status in Supabase
        await supabaseClient.from("whatsapp_connections")
          .upsert({
            user_id: userId,
            qr_code: qrCodeData,
            status: "awaiting_scan",
            updated_at: new Date().toISOString()
          });
          
        return new Response(
          JSON.stringify({
            status: "connecting",
            qrCode: qrCodeData
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200
          }
        );
      } catch (err) {
        console.error("Error generating QR code:", err);
        return new Response(
          JSON.stringify({ error: "Failed to generate QR code" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500
          }
        );
      }
    } else if (action === "disconnect") {
      delete activeConnections[userId];
      
      // Update user profile in Supabase
      await supabaseClient.from("profiles")
        .update({ whatsapp_connected: false })
        .eq("id", userId);
        
      // Update connection status in Supabase
      await supabaseClient.from("whatsapp_connections")
        .update({
          status: "disconnected",
          qr_code: null,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);
        
      return new Response(JSON.stringify({ status: "disconnected" }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    } else if (action === "confirm") {
      // Simulate confirming a connection after QR code scan
      // In a real implementation, this would verify the connection
      
      // Update user profile in Supabase
      await supabaseClient.from("profiles")
        .update({ whatsapp_connected: true })
        .eq("id", userId);
        
      // Update connection status in Supabase
      await supabaseClient.from("whatsapp_connections")
        .update({
          status: "connected",
          qr_code: null,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);
        
      return new Response(JSON.stringify({ status: "connected" }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    }
  } else if (req.method === "GET" && action === "status") {
    // Check if there's an active connection
    const isConnected = !!activeConnections[userId];
    
    // Get any existing QR code from database
    const { data: connectionData } = await supabaseClient
      .from("whatsapp_connections")
      .select("qr_code, status")
      .eq("user_id", userId)
      .single();
    
    return new Response(
      JSON.stringify({
        connected: isConnected,
        status: connectionData?.status || "disconnected",
        qrCode: connectionData?.qr_code || null
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200
      }
    );
  }
  
  return new Response(JSON.stringify({ error: "Invalid request" }), {
    headers: { "Content-Type": "application/json" },
    status: 400
  });
});
