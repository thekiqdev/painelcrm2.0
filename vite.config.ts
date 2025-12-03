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
    include: ['@/services/clients', 'buffer', 'socket.io-client'],
    exclude: ['@supabase/supabase-js'],
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
    rollupOptions: {
      output: {
        // Manter nomes de funções para evitar problemas com minificação
        manualChunks: {
          'socket.io': ['socket.io-client'],
        },
      },
    },
    commonjsOptions: {
      include: [/socket.io-client/, /node_modules/],
      transformMixedEsModules: true,
    },
  },
  define: {
    global: 'globalThis',
    // Não sobrescrever process completamente - apenas env
    'process.env': 'import.meta.env',
  },
}));
