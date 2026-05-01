import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = parseInt(env.VITE_DEV_PORT || "8080", 10);
  /** Destino real do backend em dev (não usar VITE_API_URL aqui — pode coincidir com a porta do Vite). */
  const apiProxyTarget = (env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3001").replace(/\/$/, "");

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
      "/socket.io": {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
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
    target: 'esnext',
    minify: false, // TEMPORÁRIO: Desabilitar minificação para testar se resolve o problema do parser
    sourcemap: false,
    // Configuração do esbuild para preservar código do socket.io-client
    esbuild: {
      keepNames: true, // Preservar nomes de funções
      legalComments: 'none',
    },
    rollupOptions: {
      output: {
        // Separar socket.io em chunk próprio
        manualChunks: (id) => {
          if (id.includes('socket.io-client') || id.includes('engine.io-client') || id.includes('socket.io-parser')) {
            return 'socket.io';
          }
        },
        // Preservar nomes de funções exportadas
        format: 'es',
      },
      // Plugin para não minificar socket.io-client
      plugins: [
        {
          name: 'preserve-socketio',
          generateBundle(options, bundle) {
            // Não fazer nada, apenas garantir que o código seja preservado
          },
        },
      ],
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
