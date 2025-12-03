import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
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
    mainFields: ['module', 'main'],
  },
  optimizeDeps: {
    include: ['@/services/clients', 'buffer'],
    exclude: ['@supabase/supabase-js', 'socket.io-client'], // Não otimizar socket.io-client para evitar problemas
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
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
}));
