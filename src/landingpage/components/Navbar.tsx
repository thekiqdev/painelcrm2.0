import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Menu, X, Settings, CreditCard, ShieldCheck, LogOut, LayoutDashboard } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { platformSupportHref } from "@/lib/platformSupportNav";
import { useSignupEntry } from "@/hooks/useSignupEntry";
import { LandingLocaleCurrencyControls } from "./LandingLocaleCurrencyControls";

const Navbar = () => {
  const { t } = useTranslation("landing");
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { signupPath } = useSignupEntry();

  const goToSignup = () => {
    setOpen(false);
    navigate(signupPath);
  };

  const displayName =
    user?.first_name || user?.last_name
      ? [user.first_name, user.last_name].filter(Boolean).join(" ")
      : user?.email?.split("@")[0] || "Conta";
  const initials =
    user?.first_name && user?.last_name
      ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
      : displayName.slice(0, 2).toUpperCase();

  const goTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const isLoggedIn = !!user;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <Logo size="sm" />
          <span className="font-display truncate text-lg font-bold text-foreground">PainelCRM</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <a href="#recursos" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {t("nav_features")}
          </a>
          <a href="#como-funciona" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {t("nav_how")}
          </a>
          <a href="#planos" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {t("nav_plans")}
          </a>
          {isLoggedIn ? (
            <Link to="/suporte" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {t("nav_support")}
            </Link>
          ) : (
            <Link
              to={platformSupportHref(false)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("nav_support")}
            </Link>
          )}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <LandingLocaleCurrencyControls />
          {isLoggedIn ? (
            <>
              <Button size="sm" asChild>
                {t("nav_dashboard")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <div className="flex h-full w-full items-center justify-center bg-primary text-sm font-medium text-primary-foreground">
                        {initials}
                      </div>
                    </Avatar>
                    <span className="font-medium">{displayName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{t("nav_account")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => goTo("/dashboard")}>
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>{t("nav_dashboard")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => goTo("/settings")}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>{t("nav_settings")}</span>
                  </DropdownMenuItem>
                  {user?.can_manage_plan && (
                    <DropdownMenuItem onClick={() => goTo("/meu-plano")}>
                      <CreditCard className="mr-2 h-4 w-4" />
                      <span>{t("nav_plans_menu")}</span>
                    </DropdownMenuItem>
                  )}
                  {user?.is_super_admin && (
                    <DropdownMenuItem onClick={() => goTo("/superadmin")}>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      <span>{t("nav_superadmin")}</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t("nav_logout")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
                {t("nav_login")}
              </Button>
              <Button size="sm" onClick={goToSignup}>
                {t("nav_signup")}
              </Button>
            </>
          )}
        </div>

        {/* Mobile: seletor + CTA / menu */}
        <div className="flex items-center gap-2 md:hidden">
          <LandingLocaleCurrencyControls />
          {!isLoggedIn ? (
            <Button
              type="button"
              size="lg"
              className={cn(
                "h-11 min-w-[7.5rem] rounded-full px-6 text-sm font-semibold shadow-md shadow-primary/15",
              )}
              onClick={() => navigate("/login")}
            >
              {t("nav_login")}
            </Button>
          ) : (
            <button
              className="text-foreground"
              onClick={() => setOpen(!open)}
              type="button"
              aria-label={t("nav_menu")}
            >
              {open ? <X size={24} /> : <Menu size={24} />}
            </button>
          )}
        </div>
      </div>

      {open && isLoggedIn && (
        <div className="border-t border-border/50 bg-background/95 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Avatar className="h-9 w-9">
                <div className="flex h-full w-full items-center justify-center bg-primary text-sm font-medium text-primary-foreground">
                  {initials}
                </div>
              </Avatar>
              <span className="font-medium">{displayName}</span>
            </div>
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => goTo("/dashboard")}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              {t("nav_dashboard")}
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => goTo("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              {t("nav_settings")}
            </Button>
            {user?.can_manage_plan && (
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => goTo("/meu-plano")}>
                <CreditCard className="mr-2 h-4 w-4" />
                {t("nav_plans_menu")}
              </Button>
            )}
            {user?.is_super_admin && (
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => goTo("/superadmin")}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                {t("nav_superadmin")}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              {t("nav_logout")}
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
