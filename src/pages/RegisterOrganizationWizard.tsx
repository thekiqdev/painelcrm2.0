import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiClient } from "@/integrations/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatPhoneBrDigits, formatCpfCnpjDigits } from "@/lib/brazilInputMasks";
import { isValidCpfOrCnpj } from "@/utils/cpfCnpj";
import {
  Building2,
  UserCircle2,
  ClipboardCheck,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface PublicPlan {
  id: string;
  name: string;
  description?: string | null;
  price_cents: number;
  is_free?: boolean;
  free_access_days?: number | null;
  is_default?: boolean;
}

const STEPS = [
  { id: 1, title: "Plano", icon: CreditCard },
  { id: 2, title: "Empresa", icon: Building2 },
  { id: 3, title: "Administrador", icon: UserCircle2 },
  { id: 4, title: "Dados para faturamento", icon: ClipboardCheck },
];

function formatMoneyCents(cents: number): string {
  if (cents === 0) return "Grátis";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export default function RegisterOrganizationWizard() {
  const navigate = useNavigate();
  const { user, setTokenAndUser, refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [planId, setPlanId] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [companyCpfCnpj, setCompanyCpfCnpj] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");

  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminWhatsapp, setAdminWhatsapp] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPassword2, setAdminPassword2] = useState("");

  const [billingPhone, setBillingPhone] = useState("");
  const [responsibleName, setResponsibleName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);

  useEffect(() => {
    if (user) {
      navigate("/register/steps", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get<PublicPlan[]>("/api/plans");
        if (cancelled) return;
        if (res.data?.length) {
          setPlans(res.data);
          const def = res.data.find((p) => p.is_default) ?? res.data[0];
          if (def) setPlanId(def.id);
        }
      } catch {
        toast.error("Não foi possível carregar os planos.");
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step === 4 && billingPhone === "" && companyPhone) {
      setBillingPhone(companyPhone);
    }
  }, [step, companyPhone, billingPhone]);

  useEffect(() => {
    if (step === 4 && !responsibleName.trim() && (adminFirstName || adminLastName)) {
      setResponsibleName([adminFirstName, adminLastName].filter(Boolean).join(" ").trim());
    }
  }, [step, adminFirstName, adminLastName, responsibleName]);

  const companyCpfCnpjDigits = companyCpfCnpj.replace(/\D/g, "");

  const validateStep2 = (): boolean => {
    if (!companyName.trim()) {
      toast.error("Informe o nome da empresa.");
      return false;
    }
    if (!isValidCpfOrCnpj(companyCpfCnpjDigits)) {
      toast.error("CPF ou CNPJ inválido.");
      return false;
    }
    if (!companyEmail.trim() || !companyEmail.includes("@")) {
      toast.error("Informe um e-mail válido da empresa.");
      return false;
    }
    const ph = companyPhone.replace(/\D/g, "");
    if (ph.length < 10) {
      toast.error("Informe o telefone da empresa com DDD.");
      return false;
    }
    return true;
  };

  const validateStep3 = (): boolean => {
    if (!adminFirstName.trim()) {
      toast.error("Informe o nome do administrador.");
      return false;
    }
    if (!adminEmail.trim() || !adminEmail.includes("@")) {
      toast.error("Informe o e-mail do administrador.");
      return false;
    }
    const wa = adminWhatsapp.replace(/\D/g, "");
    if (wa.length < 10) {
      toast.error("Informe o WhatsApp do administrador com DDD.");
      return false;
    }
    if (adminPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return false;
    }
    if (adminPassword !== adminPassword2) {
      toast.error("As senhas não coincidem.");
      return false;
    }
    return true;
  };

  const goNextFromStep3 = async () => {
    if (!validateStep3()) return;
    setCheckingAdmin(true);
    try {
      const res = await apiClient.post("/api/auth/register/check-admin", {
        admin_email: adminEmail.trim().toLowerCase(),
        admin_whatsapp: adminWhatsapp.replace(/\D/g, ""),
      });
      if (res.error) {
        toast.error(res.error);
        if (res.code === "EMAIL_ALREADY_REGISTERED_USE_LOGIN") {
          toast.info("Use a opção Entrar com esse e-mail.");
        }
        if (res.code === "WHATSAPP_ALREADY_REGISTERED_USE_LOGIN") {
          toast.info("Use a opção Entrar com esse número.");
        }
        return;
      }
      setStep(4);
    } finally {
      setCheckingAdmin(false);
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId) {
      toast.error("Selecione um plano.");
      return;
    }
    if (!validateStep2()) return;
    if (!validateStep3()) return;
    const bp = billingPhone.replace(/\D/g, "");
    if (bp.length < 10) {
      toast.error("Informe o telefone para faturamento.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post<{
        token: string;
        user: {
          id: string;
          email: string;
          whatsapp_number?: string | null;
          first_name?: string;
          last_name?: string;
          company_name?: string;
          registration_complete?: boolean;
          default_profile_id?: string | null;
          tenant_id?: string | null;
        };
      }>("/api/auth/register/organization", {
        plan_id: planId,
        company: {
          name: companyName.trim(),
          cpf_cnpj: companyCpfCnpjDigits,
          email: companyEmail.trim().toLowerCase(),
          phone: companyPhone.replace(/\D/g, ""),
        },
        admin: {
          first_name: adminFirstName.trim(),
          last_name: adminLastName.trim() || null,
          email: adminEmail.trim().toLowerCase(),
          whatsapp: adminWhatsapp.replace(/\D/g, ""),
          password: adminPassword,
        },
        billing_finalize: {
          billing_phone: bp,
          responsible_name: responsibleName.trim() || null,
        },
      });

      if (res.error) {
        toast.error(res.error);
        if (res.code === "EMAIL_ALREADY_REGISTERED_USE_LOGIN" || res.code === "WHATSAPP_ALREADY_REGISTERED_USE_LOGIN") {
          toast.info("Faça login em vez de criar nova conta.");
        }
        return;
      }
      if (res.data?.token && res.data.user) {
        await setTokenAndUser(res.data.token, {
          ...res.data.user,
          registration_complete: false,
        });
        await refreshUser();
        toast.success("Conta criada com sucesso!");
        navigate("/register/steps", { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (user) {
    return null;
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const active = step === s.id;
          const done = step > s.id;
          return (
            <div
              key={s.id}
              className={`flex items-center gap-1.5 text-xs sm:text-sm px-2 py-1 rounded-md border ${
                active ? "border-crm-primary bg-crm-primary/10 text-foreground" : done ? "border-muted text-muted-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{s.title}</span>
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Abrir conta no PainelCRM</CardTitle>
          <CardDescription>
            {step === 1 && "Escolha o plano para sua empresa."}
            {step === 2 && "Dados da empresa."}
            {step === 3 &&
              "Crie o usuário administrador da conta (você poderá adicionar mais usuários depois)."}
            {step === 4 && "Confira e edite os dados da empresa para faturamento e suporte."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && (
            <>
              {plansLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum plano disponível no momento.</p>
              ) : (
                <div className="space-y-3">
                  {plans.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlanId(p.id)}
                      className={`w-full text-left rounded-lg border p-4 transition-colors ${
                        planId === p.id ? "border-crm-primary ring-2 ring-crm-primary/20" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="font-medium">{p.name}</div>
                      {p.description && (
                        <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.description}</div>
                      )}
                      <div className="text-sm font-medium mt-2">{formatMoneyCents(p.price_cents)}</div>
                      {p.is_free && p.free_access_days != null && (
                        <div className="text-xs text-muted-foreground">Teste: {p.free_access_days} dias</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex justify-center pt-4">
                <Button
                  type="button"
                  disabled={!planId}
                  onClick={() => setStep(2)}
                >
                  Continuar
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (validateStep2()) setStep(3);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="coName">Nome da empresa *</Label>
                <Input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} id="coName" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coDoc">CPF ou CNPJ *</Label>
                <Input
                  id="coDoc"
                  value={companyCpfCnpj}
                  onChange={(e) => setCompanyCpfCnpj(formatCpfCnpjDigits(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coEmail">E-mail da empresa *</Label>
                <Input
                  id="coEmail"
                  type="email"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coPhone">Telefone *</Label>
                <Input
                  id="coPhone"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(formatPhoneBrDigits(e.target.value))}
                  placeholder="(11) 99999-9999"
                  required
                />
              </div>
              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Voltar
                </Button>
                <Button type="submit">
                  Próximo
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="admFn">Nome *</Label>
                  <Input id="admFn" value={adminFirstName} onChange={(e) => setAdminFirstName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admLn">Sobrenome</Label>
                  <Input id="admLn" value={adminLastName} onChange={(e) => setAdminLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admEmail">E-mail do administrador *</Label>
                <Input
                  id="admEmail"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admWa">WhatsApp *</Label>
                <Input
                  id="admWa"
                  value={adminWhatsapp}
                  onChange={(e) => setAdminWhatsapp(formatPhoneBrDigits(e.target.value))}
                  placeholder="(11) 99999-9999"
                  required
                />
                <p className="text-xs text-muted-foreground">Você poderá entrar com e-mail ou com este número.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admPw">Senha *</Label>
                <Input
                  id="admPw"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admPw2">Confirmar senha *</Label>
                <Input
                  id="admPw2"
                  type="password"
                  value={adminPassword2}
                  onChange={(e) => setAdminPassword2(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Voltar
                </Button>
                <Button type="button" disabled={checkingAdmin} onClick={goNextFromStep3}>
                  {checkingAdmin ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Próximo
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <form onSubmit={handleFinalSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da empresa</Label>
                <Input value={companyName} disabled className="bg-muted" readOnly />
              </div>
              <div className="space-y-2">
                <Label>E-mail da empresa (faturamento)</Label>
                <Input value={companyEmail} disabled className="bg-muted" readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billPhone">Telefone para faturamento e suporte *</Label>
                <Input
                  id="billPhone"
                  value={billingPhone}
                  onChange={(e) => setBillingPhone(formatPhoneBrDigits(e.target.value))}
                  placeholder="(11) 99999-9999"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="respName">Nome do responsável (opcional)</Label>
                <Input
                  id="respName"
                  value={responsibleName}
                  onChange={(e) => setResponsibleName(e.target.value)}
                  placeholder="Nome para contato no faturamento"
                />
              </div>
              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" onClick={() => setStep(3)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Voltar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Concluir cadastro
                </Button>
              </div>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/login" className="text-crm-primary font-medium hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
