// vite.config.ts
import { defineConfig } from "file:///D:/AGENCIA/SITES/painelcrm.com/PROJETOS/painelcrm/node_modules/vite/dist/node/index.js";
import react from "file:///D:/AGENCIA/SITES/painelcrm.com/PROJETOS/painelcrm/node_modules/@vitejs/plugin-react-swc/index.mjs";
import path from "path";
import { componentTagger } from "file:///D:/AGENCIA/SITES/painelcrm.com/PROJETOS/painelcrm/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "D:\\AGENCIA\\SITES\\painelcrm.com\\PROJETOS\\painelcrm";
var vite_config_default = defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080
  },
  plugins: [
    react(),
    mode === "development" && componentTagger()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
      // Redirecionar Supabase para stub para evitar erros de build
      "@/integrations/supabase/client": path.resolve(__vite_injected_original_dirname, "./src/integrations/supabase/client-stub.ts"),
      "@supabase/supabase-js": path.resolve(__vite_injected_original_dirname, "./src/integrations/supabase/supabase-stub.js")
    },
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"],
    mainFields: ["module", "main"]
  },
  optimizeDeps: {
    include: ["@/services/clients"],
    exclude: ["@supabase/supabase-js"]
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom")) {
              return "vendor-react";
            }
            if (id.includes("@radix-ui")) {
              return "vendor-radix";
            }
            if (id.includes("recharts") || id.includes("date-fns")) {
              return "vendor-charts";
            }
            return "vendor";
          }
          if (id.includes("/pages/")) {
            const pageName = id.split("/pages/")[1]?.split("/")[0];
            if (pageName) {
              return `page-${pageName}`;
            }
          }
        }
      }
    }
  },
  define: {
    global: "globalThis"
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxBR0VOQ0lBXFxcXFNJVEVTXFxcXHBhaW5lbGNybS5jb21cXFxcUFJPSkVUT1NcXFxccGFpbmVsY3JtXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxBR0VOQ0lBXFxcXFNJVEVTXFxcXHBhaW5lbGNybS5jb21cXFxcUFJPSkVUT1NcXFxccGFpbmVsY3JtXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9BR0VOQ0lBL1NJVEVTL3BhaW5lbGNybS5jb20vUFJPSkVUT1MvcGFpbmVsY3JtL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djXCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgY29tcG9uZW50VGFnZ2VyIH0gZnJvbSBcImxvdmFibGUtdGFnZ2VyXCI7XG5cbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiAoe1xuICBzZXJ2ZXI6IHtcbiAgICBob3N0OiBcIjo6XCIsXG4gICAgcG9ydDogODA4MCxcbiAgfSxcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgbW9kZSA9PT0gJ2RldmVsb3BtZW50JyAmJlxuICAgIGNvbXBvbmVudFRhZ2dlcigpLFxuICBdLmZpbHRlcihCb29sZWFuKSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcbiAgICAgIC8vIFJlZGlyZWNpb25hciBTdXBhYmFzZSBwYXJhIHN0dWIgcGFyYSBldml0YXIgZXJyb3MgZGUgYnVpbGRcbiAgICAgIFwiQC9pbnRlZ3JhdGlvbnMvc3VwYWJhc2UvY2xpZW50XCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmMvaW50ZWdyYXRpb25zL3N1cGFiYXNlL2NsaWVudC1zdHViLnRzXCIpLFxuICAgICAgXCJAc3VwYWJhc2Uvc3VwYWJhc2UtanNcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyYy9pbnRlZ3JhdGlvbnMvc3VwYWJhc2Uvc3VwYWJhc2Utc3R1Yi5qc1wiKSxcbiAgICB9LFxuICAgIGV4dGVuc2lvbnM6IFsnLm1qcycsICcuanMnLCAnLm10cycsICcudHMnLCAnLmpzeCcsICcudHN4JywgJy5qc29uJ10sXG4gICAgbWFpbkZpZWxkczogWydtb2R1bGUnLCAnbWFpbiddLFxuICB9LFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBpbmNsdWRlOiBbJ0Avc2VydmljZXMvY2xpZW50cyddLFxuICAgIGV4Y2x1ZGU6IFsnQHN1cGFiYXNlL3N1cGFiYXNlLWpzJ10sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgdGFyZ2V0OiAnZXNuZXh0JyxcbiAgICBtaW5pZnk6ICdlc2J1aWxkJyxcbiAgICBzb3VyY2VtYXA6IGZhbHNlLFxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBtYW51YWxDaHVua3M6IChpZCkgPT4ge1xuICAgICAgICAgIC8vIFNlcGFyYXIgdmVuZG9yIGNodW5rcyBwYXJhIG1lbGhvciBjYWNoZVxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzJykpIHtcbiAgICAgICAgICAgIC8vIFJlYWN0IGUgUmVhY3QgRE9NIGp1bnRvc1xuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdyZWFjdCcpIHx8IGlkLmluY2x1ZGVzKCdyZWFjdC1kb20nKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3ZlbmRvci1yZWFjdCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBSYWRpeCBVSSBjb21wb25lbnRzXG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ0ByYWRpeC11aScpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAndmVuZG9yLXJhZGl4JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIE91dHJhcyBsaWJzIGdyYW5kZXNcbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygncmVjaGFydHMnKSB8fCBpZC5pbmNsdWRlcygnZGF0ZS1mbnMnKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3ZlbmRvci1jaGFydHMnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gUmVzdG8gZGFzIGRlcGVuZFx1MDBFQW5jaWFzXG4gICAgICAgICAgICByZXR1cm4gJ3ZlbmRvcic7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIENodW5rcyBwb3IgZmVhdHVyZS9wYWdlXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvcGFnZXMvJykpIHtcbiAgICAgICAgICAgIGNvbnN0IHBhZ2VOYW1lID0gaWQuc3BsaXQoJy9wYWdlcy8nKVsxXT8uc3BsaXQoJy8nKVswXTtcbiAgICAgICAgICAgIGlmIChwYWdlTmFtZSkge1xuICAgICAgICAgICAgICByZXR1cm4gYHBhZ2UtJHtwYWdlTmFtZX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbiAgZGVmaW5lOiB7XG4gICAgZ2xvYmFsOiAnZ2xvYmFsVGhpcycsXG4gIH0sXG59KSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQWlWLFNBQVMsb0JBQW9CO0FBQzlXLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyx1QkFBdUI7QUFIaEMsSUFBTSxtQ0FBbUM7QUFNekMsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE9BQU87QUFBQSxFQUN6QyxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsRUFDUjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sU0FBUyxpQkFDVCxnQkFBZ0I7QUFBQSxFQUNsQixFQUFFLE9BQU8sT0FBTztBQUFBLEVBQ2hCLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQTtBQUFBLE1BRXBDLGtDQUFrQyxLQUFLLFFBQVEsa0NBQVcsNENBQTRDO0FBQUEsTUFDdEcseUJBQXlCLEtBQUssUUFBUSxrQ0FBVyw4Q0FBOEM7QUFBQSxJQUNqRztBQUFBLElBQ0EsWUFBWSxDQUFDLFFBQVEsT0FBTyxRQUFRLE9BQU8sUUFBUSxRQUFRLE9BQU87QUFBQSxJQUNsRSxZQUFZLENBQUMsVUFBVSxNQUFNO0FBQUEsRUFDL0I7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNaLFNBQVMsQ0FBQyxvQkFBb0I7QUFBQSxJQUM5QixTQUFTLENBQUMsdUJBQXVCO0FBQUEsRUFDbkM7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxJQUNYLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQSxRQUNOLGNBQWMsQ0FBQyxPQUFPO0FBRXBCLGNBQUksR0FBRyxTQUFTLGNBQWMsR0FBRztBQUUvQixnQkFBSSxHQUFHLFNBQVMsT0FBTyxLQUFLLEdBQUcsU0FBUyxXQUFXLEdBQUc7QUFDcEQscUJBQU87QUFBQSxZQUNUO0FBRUEsZ0JBQUksR0FBRyxTQUFTLFdBQVcsR0FBRztBQUM1QixxQkFBTztBQUFBLFlBQ1Q7QUFFQSxnQkFBSSxHQUFHLFNBQVMsVUFBVSxLQUFLLEdBQUcsU0FBUyxVQUFVLEdBQUc7QUFDdEQscUJBQU87QUFBQSxZQUNUO0FBRUEsbUJBQU87QUFBQSxVQUNUO0FBRUEsY0FBSSxHQUFHLFNBQVMsU0FBUyxHQUFHO0FBQzFCLGtCQUFNLFdBQVcsR0FBRyxNQUFNLFNBQVMsRUFBRSxDQUFDLEdBQUcsTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUNyRCxnQkFBSSxVQUFVO0FBQ1oscUJBQU8sUUFBUSxRQUFRO0FBQUEsWUFDekI7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sUUFBUTtBQUFBLEVBQ1Y7QUFDRixFQUFFOyIsCiAgIm5hbWVzIjogW10KfQo=
