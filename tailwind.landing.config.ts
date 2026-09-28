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
    "./src/landingpage/components/Hero.tsx",
    "./src/landingpage/components/Features.tsx",
    "./src/landingpage/components/HowItWorks.tsx",
    "./src/landingpage/components/Pricing.tsx",
    "./src/landingpage/components/CtaSection.tsx",
    "./src/landingpage/components/hero-mockup/**/*.{ts,tsx}",
    "./src/components/ui/**/*.{ts,tsx}",
    "./src/components/Logo.tsx",
    "./src/lib/utils.ts",
    "./src/lib/planCheckoutDisplay.ts",
    "./src/integrations/api/client.ts",
  ],
} satisfies Config;
