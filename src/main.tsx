import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Polyfills para socket.io-client no navegador
import { Buffer } from "buffer";
if (typeof window !== "undefined") {
  // Polyfill Buffer
  (window as any).Buffer = Buffer;
  (globalThis as any).Buffer = Buffer;
  
  // Polyfill process (necessário para socket.io-client)
  if (typeof (window as any).process === "undefined") {
    (window as any).process = {
      env: {},
      browser: true,
      version: "",
      versions: {},
      type: "browser",
    };
  }
  if (typeof (globalThis as any).process === "undefined") {
    (globalThis as any).process = (window as any).process;
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

