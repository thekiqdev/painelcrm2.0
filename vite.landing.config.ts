import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = parseInt(env.VITE_LANDING_DEV_PORT || "8082", 10);
  const apiProxyTarget = (env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3001").replace(/\/$/, "");

  return {
    server: {
      host: "::",
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
    plugins: [react()],
    css: {
      postcss: {
        plugins: [
          tailwindcss({ config: path.resolve(__dirname, "tailwind.landing.config.ts") }),
          autoprefixer(),
        ],
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@/integrations/supabase/client": path.resolve(__dirname, "./src/integrations/supabase/client-stub.ts"),
        "@supabase/supabase-js": path.resolve(__dirname, "./src/integrations/supabase/supabase-stub.js"),
        buffer: "buffer",
      },
      extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"],
      mainFields: ["browser", "module", "main"],
    },
    optimizeDeps: {
      include: ["buffer"],
      exclude: ["@supabase/supabase-js", "socket.io-client"],
      esbuildOptions: {
        define: {
          global: "globalThis",
        },
      },
    },
    build: {
      target: "esnext",
      outDir: "dist-landing",
      emptyOutDir: true,
      minify: "esbuild",
      sourcemap: false,
      rollupOptions: {
        input: path.resolve(__dirname, "landing.html"),
      },
    },
    define: {
      global: "globalThis",
      "process.env": "import.meta.env",
      process: JSON.stringify({ env: {} }),
      "import.meta.env.VITE_LANDING_STANDALONE": JSON.stringify("1"),
    },
  };
});
