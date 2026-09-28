import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = parseInt(env.VITE_DEV_PORT || "8080", 10);
  /** Destino real do backend em dev (não usar VITE_API_URL aqui — pode coincidir com a porta do Vite). */
  const apiPort = env.API_PORT || "3001";
  const apiProxyTarget = (env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${apiPort}`).replace(
    /\/$/,
    "",
  );
  const analyze = process.env.ANALYZE === "1" || process.env.ANALYZE === "true";

  return {
  server: {
    host: "::",
    // Porta do frontend em dev; use VITE_DEV_PORT no .env para evitar conflito com outro projeto (ex.: 8081)
    port: devPort,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      "/webhooks": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      "/socket.io": {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    analyze &&
      visualizer({
        filename: "dist/stats.html",
        gzipSize: true,
        brotliSize: true,
        template: "treemap",
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Redirecionar Supabase para stub para evitar erros de build
      "@/integrations/supabase/client": path.resolve(__dirname, "./src/integrations/supabase/client-stub.ts"),
      "@supabase/supabase-js": path.resolve(__dirname, "./src/integrations/supabase/supabase-stub.js"),
      // Polyfill para Buffer (usado por socket.io-client)
      "buffer": "buffer",
    },
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    // IMPORTANTE: priorizar o bundle de browser das dependências
    // para evitar que o Vite escolha o build de Node (que depende de `Url.parse`, xmlhttprequest-ssl, etc.)
    // Isso é crítico para socket.io-client/engine.io-client funcionarem corretamente no navegador.
    mainFields: ['browser', 'module', 'main'],
  },
  optimizeDeps: {
    // Incluir apenas o que realmente precisamos pré-empacotar
    include: ['@/services/clients', 'buffer'],
    // Não otimizar socket.io-client para evitar problemas de escolha do build errado
    exclude: ['@supabase/supabase-js', 'socket.io-client'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    target: "esnext",
    minify: mode === "production" ? "esbuild" : false,
    sourcemap: false,
    esbuild: {
      keepNames: true,
      legalComments: "none",
    },
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (
            id.includes("socket.io-client") ||
            id.includes("engine.io-client") ||
            id.includes("socket.io-parser")
          ) {
            return "socket.io";
          }
          if (id.includes("node_modules")) {
            if (id.includes("node_modules/react-dom")) return "react-vendor";
            if (id.includes("node_modules/react/") && !id.includes("node_modules/react-router")) {
              return "react-vendor";
            }
            if (id.includes("react-router")) return "router";
          }
        },
        format: "es",
      },
    },
  },
  define: {
    global: 'globalThis',
    'process.env': 'import.meta.env',
    'process': JSON.stringify({
      env: {}
    }),
  },
};
});
