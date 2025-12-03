import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Polyfill para Buffer (necessário para socket.io-client no navegador)
// Deve ser carregado ANTES de qualquer import do socket.io-client
import { Buffer } from "buffer";

// Garantir que Buffer está disponível globalmente antes de qualquer código usar
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
  (globalThis as any).Buffer = Buffer;
  // Também definir no global para compatibilidade
  if (typeof global !== "undefined") {
    (global as any).Buffer = Buffer;
  }
}

// Verificar se Buffer está disponível
if (typeof Buffer === "undefined") {
  console.error("[main.tsx] Buffer polyfill failed to load!");
} else {
  console.log("[main.tsx] Buffer polyfill loaded successfully");
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

