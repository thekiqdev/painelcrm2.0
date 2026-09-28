import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { StepIndicator } from "./StepIndicator";
import { Step1SelectModel } from "./steps/Step1SelectModel";
import { Step2BasicConfig } from "./steps/Step2BasicConfig";
import { Step3SpecificConfig } from "./steps/Step3SpecificConfig";
import { Step4Review } from "./steps/Step4Review";
import { projectsService } from "@/services/projects";
import { clientsService } from "@/services/clients";
import { membersService } from "@/services/members";
import { teamsService } from "@/services/teams";
import type { Client } from "@/services/clients";
import type { Member } from "@/components/shared/types";
import type { Team } from "@/services/teams";
import {
  getInitialWizardState,
  type WizardState,
  type ProjectType,
  type WizardBasicConfig,
  type WizardSpecificConfig,
  WIZARD_STEP_LABELS,
} from "./types";
import { getProjectUrl } from "@/lib/projectRoutes";
import {
  saveWizardDraft,
  loadWizardDraft,
  clearWizardDraft,
} from "./wizardStorage";

export function ProjectWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillClientId =
    searchParams.get("client_id")?.trim() || searchParams.get("clientId")?.trim() || "";
  const [state, setState] = useState<WizardState>(getInitialWizardState);
  const clientPrefillAppliedRef = useRef(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const draftCheckedRef = useRef(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [clientsData, membersData, teamsData] = await Promise.all([
          clientsService.getClients(),
          membersService.getMembers(),
          teamsService.getTeams().catch(() => []),
        ]);
        setClients(clientsData || []);
        setMembers(membersData || []);
        setTeams(teamsData || []);
      } catch (e) {
        console.error("Erro ao carregar clientes/membros:", e);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (draftCheckedRef.current) return;
    draftCheckedRef.current = true;
    if (loadWizardDraft()) setShowDraftBanner(true);
  }, []);

  useEffect(() => {
    if (!prefillClientId || clientPrefillAppliedRef.current) return;
    clientPrefillAppliedRef.current = true;
    setState((prev) => ({
      ...prev,
      basicConfig: { ...prev.basicConfig, clientId: prefillClientId },
    }));
  }, [prefillClientId]);

  useEffect(() => {
    const hasData = state.step > 1 || state.projectType != null;
    if (hasData) saveWizardDraft(state);
  }, [state]);

  const setStep = useCallback((step: WizardState["step"]) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const setProjectType = useCallback((projectType: ProjectType | null) => {
    setState((prev) => ({
      ...prev,
      projectType,
      templateId: projectType === "template" ? prev.templateId : null,
    }));
  }, []);

  const setBasicConfig = useCallback((partial: Partial<WizardBasicConfig>) => {
    setState((prev) => ({
      ...prev,
      basicConfig: { ...prev.basicConfig, ...partial },
    }));
  }, []);

  const setSpecificConfig = useCallback((partial: Partial<WizardSpecificConfig>) => {
    setState((prev) => ({
      ...prev,
      specificConfig: { ...prev.specificConfig, ...partial },
    }));
  }, []);

  const setTemplateId = useCallback((templateId: string | null) => {
    setState((prev) => ({ ...prev, templateId }));
  }, []);

  const canGoNext = useCallback(() => {
    if (state.step === 1) return state.projectType !== null;
    if (state.step === 2) return state.basicConfig.name.trim().length > 0;
    if (state.step === 3) {
      if (state.projectType === "template") return !!state.templateId;
      if (
        state.projectType === "areas" ||
        state.projectType === "advanced"
      ) {
        const areas = state.specificConfig.areas ?? [];
        if (areas.length > 0) {
          const hasName = areas.some((a) => a.trim().length > 0);
          if (!hasName) return false;
        }
        if (
          state.projectType === "advanced" &&
          state.specificConfig.createFirstVersion
        ) {
          return !!(state.specificConfig.firstVersionName ?? "").trim();
        }
      }
      return true;
    }
    return true;
  }, [
    state.step,
    state.projectType,
    state.basicConfig.name,
    state.templateId,
    state.specificConfig,
  ]);

  const handleNext = useCallback(() => {
    if (state.step === 4) return;
    if (!canGoNext() && (state.step === 1 || state.step === 2 || state.step === 3))
      return;
    setStep((state.step + 1) as WizardState["step"]);
  }, [state.step, canGoNext, setStep]);

  const handleBack = useCallback(() => {
    if (state.step > 1) setStep((state.step - 1) as WizardState["step"]);
  }, [state.step, setStep]);

  const handleCancel = useCallback(() => {
    navigate("/projects");
  }, [navigate]);

  const handleStartFromZero = useCallback(() => {
    clearWizardDraft();
    setState(getInitialWizardState());
    setShowDraftBanner(false);
    setCreateError(null);
    toast.info("Rascunho descartado. Começando do zero.");
  }, []);

  const handleRestoreDraft = useCallback(() => {
    const draft = loadWizardDraft();
    if (draft) {
      setState(draft);
      setShowDraftBanner(false);
    }
  }, []);

  const handleDismissDraftBanner = useCallback(() => {
    setShowDraftBanner(false);
  }, []);

  const handleSaveDraft = useCallback(() => {
    saveWizardDraft(state);
    toast.success("Rascunho salvo. Você pode continuar depois.");
  }, [state]);

  const handleCreate = useCallback(async () => {
    if (state.step !== 4 || !state.projectType) return;
    setCreateError(null);
    setCreating(true);
    try {
      const payload: Parameters<typeof projectsService.createProject>[0] = {
        name: state.basicConfig.name.trim(),
        description: state.basicConfig.description.trim() || null,
        status: "active",
        due_date: state.basicConfig.endDate || null,
        tags: [],
        kanban_stage: null,
        project_type: state.projectType,
        client_id: state.basicConfig.clientId || null,
        start_date: state.basicConfig.startDate || null,
        end_date: state.basicConfig.endDate || null,
        responsible_ids: state.basicConfig.responsibleIds,
        team_ids: state.basicConfig.teamIds?.length ? state.basicConfig.teamIds : undefined,
        team_id: state.basicConfig.teamIds?.[0] ?? state.basicConfig.teamId ?? null,
      };
      if (state.projectType === "template" && state.templateId) {
        payload.template_id = state.templateId;
      }
      const areas = (state.specificConfig.areas ?? []).map((a) => a.trim()).filter(Boolean);
      if (areas.length > 0) {
        payload.initial_areas = areas;
      }
      if (
        state.projectType === "advanced" &&
        state.specificConfig.createFirstVersion &&
        (state.specificConfig.firstVersionName ?? "").trim()
      ) {
        payload.create_first_version = true;
        payload.first_version_name = state.specificConfig.firstVersionName?.trim() || null;
        payload.first_version_date =
          state.specificConfig.firstVersionDate || null;
      }
      const createdProject = await projectsService.createProject(payload);
      clearWizardDraft();
      toast.success("Projeto criado com sucesso!");
      navigate(getProjectUrl(createdProject.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao criar projeto";
      setCreateError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }, [state, navigate]);

  const isStep4 = state.step === 4;

  // Steps 1–4: para adicionar/alterar etapas, ver EXTENSIBILIDADE.md
  return (
    <div className="container mx-auto space-y-8">
      {showDraftBanner && (
        <div
          className="rounded-lg border bg-muted/50 px-4 py-3 flex flex-wrap items-center justify-between gap-2"
          role="alert"
        >
          <p className="text-sm font-medium">Você tem um rascunho deste projeto.</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleRestoreDraft}
            >
              Continuar rascunho
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleStartFromZero}
            >
              Começar do zero
            </Button>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold">Novo projeto</h1>
        <p className="mt-1 text-muted-foreground">
          Etapa {state.step} de 4 — {WIZARD_STEP_LABELS[state.step]}
        </p>
      </div>

      <StepIndicator currentStep={state.step} />

      <div className="min-h-[280px]">
        {state.step === 1 && (
          <Step1SelectModel
            selectedType={state.projectType}
            onSelect={setProjectType}
          />
        )}
        {state.step === 2 && (
          <Step2BasicConfig
            config={state.basicConfig}
            onChange={setBasicConfig}
            clients={clients}
            members={members}
            teams={teams}
            showNameError={!state.basicConfig.name.trim()}
            onClientCreated={(client) => {
              setClients((prev) => {
                if (prev.some((c) => c.id === client.id)) return prev;
                return [...prev, client];
              });
            }}
          />
        )}
        {state.step === 3 && (
          <Step3SpecificConfig
            projectType={state.projectType}
            specificConfig={state.specificConfig}
            templateId={state.templateId}
            onSpecificConfigChange={setSpecificConfig}
            onTemplateIdChange={setTemplateId}
          />
        )}
        {state.step === 4 && (
          <Step4Review state={state} clients={clients} members={members} teams={teams} />
        )}
      </div>

      {createError && (
        <p className="text-sm text-destructive" role="alert">
          {createError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          disabled={creating}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSaveDraft}
          disabled={creating}
        >
          Salvar rascunho
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline hover:text-foreground"
          onClick={handleStartFromZero}
        >
          Começar do zero
        </button>
        {state.step > 1 && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={creating}
            aria-label="Voltar etapa"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Voltar
          </Button>
        )}
        {isStep4 ? (
          <Button
            type="button"
            onClick={handleCreate}
            disabled={
              creating ||
              !state.basicConfig.name.trim() ||
              (state.projectType === "template" && !state.templateId)
            }
            aria-label="Criar projeto"
          >
            {creating ? "Criando…" : "Criar projeto"}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleNext}
            disabled={
              (state.step === 1 && !state.projectType) ||
              (state.step === 2 && !state.basicConfig.name.trim()) ||
              (state.step === 3 && !canGoNext())
            }
            aria-label="Próxima etapa"
          >
            Continuar
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>

    </div>
  );
}
