import LandingLayout from "./components/LandingLayout";
import Hero from "./components/Hero";
import Features from "./components/Features";
import HowItWorks from "./components/HowItWorks";
import Pricing from "./components/Pricing";
import CtaSection from "./components/CtaSection";

/**
 * Landing page (layout do flowcrm-suite).
 * Rota: /landing — usa LandingLayout (Navbar + Footer) compartilhado com checkout.
 */
const LandingPage = () => {
  return (
    <LandingLayout>
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <CtaSection />
    </LandingLayout>
  );
};

export default LandingPage;
