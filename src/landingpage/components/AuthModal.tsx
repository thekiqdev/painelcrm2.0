import React, { useState, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type AuthTab = "login" | "register";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Abre já na aba de cadastro */
  defaultTab?: AuthTab;
}

export default function AuthModal({ open, onOpenChange, defaultTab = "login" }: AuthModalProps) {
  const [tab, setTab] = useState<AuthTab>(defaultTab);
  const [loginType, setLoginType] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const isLogin = tab === "login";

  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, defaultTab]);

  const resetForm = () => {
    setIdentifier("");
    setPassword("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const detectLoginType = (value: string): "email" | "phone" => {
    if (value.includes("@")) return "email";
    if (/^[\d\s\-\+\(\)]+$/.test(value) && value.replace(/\D/g, "").length >= 10) return "phone";
    return loginType;
  };

  const handleIdentifierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setIdentifier(value);
    if (value.length > 0) {
      const detected = detectLoginType(value);
      if (detected !== loginType) setLoginType(detected);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isLogin) {
        await signIn(identifier.trim(), password);
        handleOpenChange(false);
        navigate("/dashboard");
      } else {
        await signUp({
          identifier: identifier.trim(),
          password,
          whatsapp: loginType === "phone" ? identifier.replace(/\D/g, "") : undefined,
        });
        handleOpenChange(false);
        navigate("/register/steps");
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Ocorreu um erro.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="landing-page sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isLogin ? "Entrar" : "Criar conta"}</DialogTitle>
          <DialogDescription>
            {isLogin
              ? "Use seu e-mail ou telefone e senha para acessar sua conta."
              : "Cadastre-se com e-mail ou número de WhatsApp."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="auth-identifier">
              {loginType === "email" ? "E-mail" : "Telefone"}
            </Label>
            <div className="flex gap-2">
              <Input
                id="auth-identifier"
                type={loginType === "email" ? "email" : "tel"}
                placeholder={loginType === "email" ? "seu@email.com" : "(11) 99999-9999"}
                value={identifier}
                onChange={handleIdentifierChange}
                className="flex-1"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="default"
                className="whitespace-nowrap shrink-0"
                onClick={() => {
                  setLoginType(loginType === "email" ? "phone" : "email");
                  setIdentifier("");
                }}
              >
                {loginType === "email" ? "📱" : "✉️"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth-password">Senha</Label>
            <Input
              id="auth-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Processando..." : isLogin ? "Entrar" : "Cadastrar"}
          </Button>
        </form>
        <div className="text-center pt-2 border-t border-border/50">
          <span className="text-sm text-muted-foreground">
            {isLogin ? "Ainda não tem conta? " : "Já tem conta? "}
            <Button
              type="button"
              variant="link"
              className="p-0 h-auto text-sm"
              onClick={() => {
                setTab(isLogin ? "register" : "login");
                resetForm();
              }}
            >
              {isLogin ? "Cadastre-se" : "Entrar"}
            </Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
