import "./landingpage.css";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Features from "./components/Features";
import HowItWorks from "./components/HowItWorks";
import Pricing from "./components/Pricing";
import CtaSection from "./components/CtaSection";
import Footer from "./components/Footer";

/**
 * Landing page (layout do flowcrm-suite).
 * Rota: /landingpage — não substitui o app atual.
 */
const LandingPage = () => {
  return (
    <div className="landing-page min-h-screen bg-background font-sans antialiased">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <CtaSection />
      <Footer />
    </div>
  );
};

export default LandingPage;
