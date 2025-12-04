import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Polyfills para socket.io-client no navegador
// Devem ser carregados ANTES de qualquer import do socket.io-client

// Polyfill para Buffer
import { Buffer } from "buffer";

// Garantir que Buffer está disponível globalmente
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
  (globalThis as any).Buffer = Buffer;
  // Também definir no global para compatibilidade
  if (typeof global !== "undefined") {
    (global as any).Buffer = Buffer;
  }
}

// Polyfill para Url.parse - garantir que está disponível mesmo se o script inline falhar
if (typeof window !== "undefined" && (!(window as any).Url || !(window as any).Url.parse)) {
  // Importar polyfill customizado
  import("./polyfills/url-polyfill").then(() => {
    console.log("[main.tsx] Url.parse polyfill loaded from module");
  }).catch((err) => {
    console.error("[main.tsx] Failed to load url polyfill module:", err);
    // Fallback: criar polyfill básico se o módulo falhar
    if (!(window as any).Url) {
      const urlParse = (urlStr: string) => {
        try {
          const url = new URL(urlStr, window.location.origin);
          return {
            protocol: url.protocol.replace(':', ''),
            slashes: true,
            auth: '',
            host: url.host,
            hostname: url.hostname,
            port: url.port || '',
            hash: url.hash.replace('#', ''),
            search: url.search.replace('?', ''),
            query: url.search.replace('?', ''),
            pathname: url.pathname,
            path: url.pathname + url.search,
            href: url.href,
          };
        } catch (e) {
          throw new Error('Invalid URL');
        }
      };
      (window as any).Url = { parse: urlParse };
      (globalThis as any).Url = { parse: urlParse };
      console.log("[main.tsx] Url.parse fallback polyfill created");
    }
  });
}

// Verificar se polyfills estão disponíveis
if (typeof Buffer === "undefined") {
  console.error("[main.tsx] Buffer polyfill failed to load!");
} else {
  console.log("[main.tsx] Buffer polyfill loaded successfully");
}

// Verificar se Url.parse está disponível
if (typeof window !== "undefined") {
  if ((window as any).Url && typeof (window as any).Url.parse === "function") {
    console.log("[main.tsx] Url.parse polyfill is available");
  } else {
    console.warn("[main.tsx] Url.parse polyfill may not be available - socket.io may fail");
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento #root não encontrado no DOM");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

