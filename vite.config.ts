import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Plugin para injetar polyfill de Url.parse no HTML
const injectUrlPolyfill = () => {
  return {
    name: 'inject-url-polyfill',
    transformIndexHtml(html: string) {
      const polyfillScript = `
<script>
(function() {
  'use strict';
  if (typeof window !== 'undefined' && !window.Url) {
    const urlParse = function(urlStr, parseQueryString, slashesDenoteHost) {
      try {
        const url = new URL(urlStr, window.location.origin);
        const parsed = {
          protocol: url.protocol.replace(':', ''),
          slashes: true,
          auth: url.username && url.password ? url.username + ':' + url.password : (url.username || ''),
          host: url.host,
          hostname: url.hostname,
          hash: url.hash.replace('#', ''),
          search: url.search.replace('?', ''),
          query: parseQueryString ? (function() {
            const params = {};
            url.search.replace('?', '').split('&').forEach(function(param) {
              const parts = param.split('=');
              if (parts[0]) params[decodeURIComponent(parts[0])] = parts[1] ? decodeURIComponent(parts[1]) : '';
            });
            return params;
          }()) : url.search.replace('?', ''),
          pathname: url.pathname,
          path: url.pathname + url.search,
          href: url.href
        };
        if (url.port) parsed.port = url.port;
        return parsed;
      } catch (e) {
        const match = urlStr.match(/^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/);
        if (!match) throw new Error('Invalid URL');
        return {
          protocol: match[2] || '',
          slashes: !!match[3],
          auth: '',
          host: match[4] || '',
          hostname: match[4] ? match[4].split(':')[0] : '',
          port: match[4] && match[4].includes(':') ? match[4].split(':')[1] : '',
          hash: match[8] || '',
          search: match[6] || '',
          query: parseQueryString ? (function() {
            const params = {};
            (match[6] || '').replace('?', '').split('&').forEach(function(param) {
              const parts = param.split('=');
              if (parts[0]) params[decodeURIComponent(parts[0])] = parts[1] ? decodeURIComponent(parts[1]) : '';
            });
            return params;
          }()) : (match[6] || ''),
          pathname: match[5] || '/',
          path: (match[5] || '/') + (match[6] || ''),
          href: urlStr
        };
      }
    };
    window.Url = { parse: urlParse };
    globalThis.Url = { parse: urlParse };
    window.url = { parse: urlParse, Url: { parse: urlParse } };
    globalThis.url = { parse: urlParse, Url: { parse: urlParse } };
    
    // Configurar require para compatibilidade com socket.io-client
    if (!window.require) {
      window.require = function(id) {
        if (id === 'url') {
          return { parse: urlParse, Url: { parse: urlParse } };
        }
        throw new Error('Cannot find module \'' + id + '\'');
      };
      window.require.cache = {};
      window.require.cache['url'] = { parse: urlParse, Url: { parse: urlParse } };
    } else if (window.require.cache) {
      window.require.cache['url'] = { parse: urlParse, Url: { parse: urlParse } };
    }
    
    console.log('[Polyfill] Url.parse injected successfully');
  }
})();
</script>`;
      // Injetar antes do primeiro script tag
      return html.replace('<script', polyfillScript + '\n    <script');
    }
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    injectUrlPolyfill(),
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
      // Polyfill para url (usado por socket.io-client) - usar nosso polyfill customizado
      "url": path.resolve(__dirname, "./src/polyfills/url-polyfill.ts"),
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
}));
