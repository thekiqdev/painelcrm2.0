import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Plugin para injetar polyfill de process de forma agressiva
const processPolyfillPlugin = () => ({
  name: 'process-polyfill',
  // Injetar polyfill no HTML - deve ser o PRIMEIRO script a executar
  transformIndexHtml: {
    enforce: 'pre' as const,
    transform(html: string) {
      // Polyfill minificado e otimizado - executa IMEDIATAMENTE
      const polyfillScript = `<script>(function(){var p={env:{},browser:!0,version:"",versions:{},type:"browser",nextTick:function(f){setTimeout(f,0)},cwd:function(){return"/"}};try{typeof window!="undefined"&&(window.process=p),typeof globalThis!="undefined"&&(globalThis.process=p),typeof global!="undefined"&&(global.process=p)}catch(e){}typeof process=="undefined"&&(process=p)})();</script>`;
      // Inserir ANTES de qualquer outro script ou link
      if (html.includes('<head')) {
        return html.replace(/(<head[^>]*>)/i, `$1${polyfillScript}`);
      }
      // Se não tiver head, inserir no início do body
      if (html.includes('<body')) {
        return html.replace(/(<body[^>]*>)/i, `$1${polyfillScript}`);
      }
      // Último recurso: inserir no início do documento
      return polyfillScript + html;
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
