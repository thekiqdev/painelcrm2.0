import type { Config } from "tailwindcss";
import appTailwind from "./tailwind.config";

/**
 * Tailwind só para a landing estática (purge restrito → CSS inicial menor).
 */
export default {
  ...appTailwind,
  content: [
    "./landing.html",
    "./src/landing/**/*.{ts,tsx}",
    "./src/landingpage/**/*.{ts,tsx}",
    "./src/components/ui/**/*.{ts,tsx}",
    "./src/components/Logo.tsx",
    "./src/lib/utils.ts",
    "./src/lib/planCheckoutDisplay.ts",
    "./src/integrations/api/client.ts",
  ],
} satisfies Config;
