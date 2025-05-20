
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.3";
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "npm:@adiwajshing/baileys@5.0.0";
import { Boom } from "npm:@hapi/boom";

// Cache for active connections by user ID
const activeConnections: Record<string, any> = {};

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
      // If a connection already exists for this user, disconnect it first
      if (activeConnections[userId]) {
        try {
          await activeConnections[userId].logout();
          delete activeConnections[userId];
        } catch (err) {
          console.error(`Error disconnecting existing socket:`, err);
        }
      }

      // Setup auth state in a user-specific folder
      const { state, saveCreds } = await useMultiFileAuthState(`./whatsapp-auth-${userId}`);
      const { version } = await fetchLatestBaileysVersion();
      
      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
      });

      // Store the socket in our active connections
      activeConnections[userId] = sock;
      
      let qrCode: string | null = null;
      let connectionStatus = "connecting";
      
      // Handle connection events
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
          // New QR code received - save it
          qrCode = qr;
          
          // Update Supabase with new QR code
          await supabaseClient.from("whatsapp_connections")
            .upsert({
              user_id: userId,
              qr_code: qr,
              status: "awaiting_scan",
              updated_at: new Date().toISOString()
            });
        }
        
        if (connection === 'open') {
          // Successfully connected
          connectionStatus = "connected";
          
          // Update user profile in Supabase
          await supabaseClient.from("profiles")
            .update({ whatsapp_connected: true })
            .eq("id", userId);
            
          // Update connection status in Supabase
          await supabaseClient.from("whatsapp_connections")
            .upsert({
              user_id: userId,
              status: "connected",
              qr_code: null,
              updated_at: new Date().toISOString()
            });
            
          // Save credentials after successful connection
          await saveCreds();
        }
        
        if (connection === 'close') {
          connectionStatus = "disconnected";
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          
          // Update connection status in Supabase
          await supabaseClient.from("profiles")
            .update({ whatsapp_connected: false })
            .eq("id", userId);
            
          if (statusCode !== DisconnectReason.loggedOut) {
            // Reconnect if the connection was not intentionally closed
            delete activeConnections[userId];
          }
        }
      });
      
      // Wait for QR code for up to 30 seconds
      let attempts = 0;
      while (!qrCode && attempts < 30 && connectionStatus === "connecting") {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      return new Response(
        JSON.stringify({
          status: connectionStatus,
          qrCode: qrCode
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200
        }
      );
    } else if (action === "disconnect") {
      if (activeConnections[userId]) {
        try {
          await activeConnections[userId].logout();
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
        } catch (err) {
          console.error(`Error disconnecting:`, err);
          return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
            headers: { "Content-Type": "application/json" },
            status: 500
          });
        }
      } else {
        return new Response(JSON.stringify({ status: "disconnected", message: "No active connection" }), {
          headers: { "Content-Type": "application/json" },
          status: 200
        });
      }
    }
  } else if (req.method === "GET" && action === "status") {
    // Check connection status
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
