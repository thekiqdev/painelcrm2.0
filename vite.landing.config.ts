import { readFileSync } from "fs";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

/** Injeta CSS crítico e adia o stylesheet principal (PageSpeed / render-blocking). */
function landingCriticalAndDeferCss(): Plugin {
  const criticalPath = path.resolve(__dirname, "src/landing/critical.css");
  return {
    name: "landing-critical-defer-css",
    transformIndexHtml(html) {
      let critical = "";
      try {
        critical = readFileSync(criticalPath, "utf8");
      } catch {
        /* dev sem ficheiro */
      }
      let out = html;
      if (critical.trim()) {
        out = out.replace(
          /<meta charset="UTF-8" \/>/,
          `<meta charset="UTF-8" />\n<style>${critical}</style>`,
        );
      }
      out = out.replace(
        /<link rel="stylesheet"([^>]*?)href="(\/assets\/landing-[^"]+\.css)"([^>]*)>/g,
        (full, before, href, after) => {
          const rest = `${before}href="${href}"${after}`.trim();
          return (
            `<link rel="preload" as="style" ${rest} />\n` +
            `<link rel="stylesheet" ${rest} media="print" onload="this.media='all'" />\n` +
            `<noscript><link rel="stylesheet" ${rest} /></noscript>`
          );
        },
      );
      return out;
    },
  };
}

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
    plugins: [react(), landingCriticalAndDeferCss()],
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
