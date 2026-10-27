import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

const legalLinksEnabled = import.meta.env.VITE_ENABLE_LEGAL_PAGES !== "false";

const Footer = () => {
  const { t } = useTranslation("landing");
  return (
    <footer className="border-t border-border/50 bg-background py-12">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <Link to="/" className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="font-display text-lg font-bold text-foreground">PainelCRM</span>
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-6 font-sans text-sm text-muted-foreground">
            <a href="#recursos" className="transition-colors hover:text-foreground">{t("nav_features")}</a>
            <a href="#planos" className="transition-colors hover:text-foreground">{t("footer_pricing")}</a>
            <Link to="/login" className="transition-colors hover:text-foreground">{t("footer_contact")}</Link>
            {legalLinksEnabled ? (
              <>
                <Link to="/legal/terms-of-service" className="transition-colors hover:text-foreground">
                  {t("footer_terms")}
                </Link>
                <Link to="/legal/privacy-policy" className="transition-colors hover:text-foreground">
                  {t("footer_privacy")}
                </Link>
              </>
            ) : (
              <>
                <span className="text-muted-foreground/80">{t("footer_terms_short")}</span>
                <span className="text-muted-foreground/80">{t("footer_privacy_short")}</span>
              </>
            )}
          </nav>
        </div>

        <div className="mt-8 border-t border-border/50 pt-6 text-center font-sans text-sm text-muted-foreground">
          © {new Date().getFullYear()} PainelCRM. {t("footer_rights")}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
