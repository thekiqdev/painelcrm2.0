import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Plugin para injetar polyfill de process no HTML (executa antes de qualquer script)
const processPolyfillPlugin = () => ({
  name: 'process-polyfill',
  transformIndexHtml: {
    enforce: 'pre' as const,
    transform(html: string) {
      // Injetar polyfill no início do HTML, antes de qualquer script
      const polyfillScript = `
    <script>
      (function() {
        'use strict';
        if (typeof process === 'undefined') {
          var processPolyfill = {
            env: {},
            browser: true,
            version: '',
            versions: {},
            type: 'browser',
            nextTick: function(fn) { setTimeout(fn, 0); },
            cwd: function() { return '/'; },
          };
          try {
            if (typeof window !== 'undefined') {
              window.process = processPolyfill;
            }
            if (typeof globalThis !== 'undefined') {
              globalThis.process = processPolyfill;
            }
            if (typeof global !== 'undefined') {
              global.process = processPolyfill;
            }
          } catch(e) {
            console.error('Error setting process polyfill:', e);
          }
        }
      })();
    </script>`;
      // Inserir logo após <head> para garantir execução antes de tudo
      return html.replace(/<head[^>]*>/i, `$&${polyfillScript}`);
    },
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    processPolyfillPlugin(),
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
      // Polyfills para socket.io-client
      "buffer": "buffer",
      // Redirecionar process para nosso polyfill (se importado como módulo)
      "process": path.resolve(__dirname, "./src/polyfills/process.ts"),
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
    // Substituir todas as referências a process por um objeto polyfill
    'process.env': '({})',
    'process.browser': 'true',
    'process.version': '"v"',
    'process.versions': '({})',
    'process.type': '"browser"',
    'process.nextTick': '(function(fn) { setTimeout(fn, 0); })',
    'process.cwd': '(function() { return "/"; })',
    // Garantir que typeof process retorne "object"
    'typeof process': '"object"',
  },
}));
